/**
 * RevenueCat Payment Service
 * Uses @revenuecat/purchases-capacitor for native iOS/Android
 * Falls back to mock for web testing (dev only)
 *
 * SETUP:
 * 1. npm install @revenuecat/purchases-capacitor @revenuecat/purchases-capacitor-ui
 * 2. Set VITE_REVENUECAT_API_KEY in environment
 * 3. Configure products in RevenueCat dashboard
 * 4. Set entitlement ID to 'premium'
 */

import { createLogger } from './logger';

const log = createLogger('Payments');

// RevenueCat Configuration
const REVENUECAT_API_KEY = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_REVENUECAT_API_KEY) || '';

// Entitlement identifier — must match the RevenueCat dashboard AND the
// server-side receipt gate (api/create-code.js checks entitlements.premium)
const ENTITLEMENT_ID = 'premium';

// Check if running on native platform
const isNativePlatform = (): boolean => {
  try {
    const capacitor = (window as any).Capacitor;
    if (capacitor) {
      const platform = capacitor.getPlatform();
      return platform === 'ios' || platform === 'android';
    }
  } catch {}
  return false;
};

// Dynamic import of RevenueCat modules (only loaded on native platforms).
// Cache the NORMALIZED shape — caching the raw modules and returning them as
// `Purchases`/`RevenueCatUI` made every call after the first silently fail.
interface RevenueCatModules {
  Purchases: any;
  RevenueCatUI: any;
  PAYWALL_RESULT: any;
  LOG_LEVEL: any;
}
let _modules: RevenueCatModules | null = null;
let _initialized = false;

const loadRevenueCatModules = async (): Promise<RevenueCatModules | null> => {
  if (_modules) return _modules;
  if (!isNativePlatform()) return null;

  try {
    const [purchasesMod, uiMod] = await Promise.all([
      import('@revenuecat/purchases-capacitor').catch(() => null),
      import('@revenuecat/purchases-capacitor-ui').catch(() => null),
    ]);

    if (purchasesMod && uiMod) {
      _modules = {
        Purchases: purchasesMod.Purchases,
        RevenueCatUI: uiMod.RevenueCatUI,
        PAYWALL_RESULT: uiMod.PAYWALL_RESULT,
        LOG_LEVEL: purchasesMod.LOG_LEVEL,
      };
      return _modules;
    }
  } catch {}
  return null;
};

// Check if RevenueCat is configured
export const isRevenueCatConfigured = (): boolean => {
  return !!REVENUECAT_API_KEY && isNativePlatform();
};

/**
 * Initialize RevenueCat SDK
 * Call this once when app starts (App.tsx useEffect)
 */
export const initializePurchases = async (): Promise<void> => {
  if (!isNativePlatform() || !REVENUECAT_API_KEY || _initialized) return;

  const modules = await loadRevenueCatModules();
  if (!modules) return;

  try {
    const { Purchases, LOG_LEVEL } = modules;

    // Debug logging in dev, error-only in prod
    const isDev = import.meta.env?.DEV;
    await Purchases.setLogLevel({ level: isDev ? LOG_LEVEL.DEBUG : LOG_LEVEL.ERROR });

    await Purchases.configure({
      apiKey: REVENUECAT_API_KEY,
      // No appUserID = anonymous user (Mullvad-style, RevenueCat generates $RCAnonymousID)
    });

    _initialized = true;
  } catch (error) {
    log.error('RevenueCat init failed', error);
  }
};

/**
 * The RevenueCat app user id for the current (anonymous) customer.
 * Sent with create-code so the server can verify the purchase receipt
 * (REQUIRE_PURCHASE_RECEIPT gate) before minting an activation code.
 */
export const getAppUserId = async (): Promise<string | null> => {
  if (!isNativePlatform() || !_initialized) return null;

  const modules = await loadRevenueCatModules();
  if (!modules) return null;

  try {
    const { appUserID } = await modules.Purchases.getAppUserID();
    return appUserID || null;
  } catch (error) {
    log.error('Failed to get app user id', error);
    return null;
  }
};

/**
 * Set the activation code as RevenueCat subscriber attribute
 * Links the anonymous RevenueCat customer to our activation code
 * This is essential for the webhook to know which code to extend
 */
export const setActivationCodeAttribute = async (code: string): Promise<void> => {
  if (!isNativePlatform() || !_initialized) return;

  const modules = await loadRevenueCatModules();
  if (!modules) return;

  try {
    await modules.Purchases.setAttributes({
      attributes: { activation_code: { value: code } },
    });
  } catch (error) {
    log.error('Failed to set activation code attribute', error);
  }
};

/**
 * Get available subscription offerings
 * Returns the actual App Store/Play Store price via RevenueCat
 * Falls back to locale-based estimate on web
 */
export const getOfferings = async (): Promise<{
  monthly: { price: string; priceNumber: number; product?: any } | null;
}> => {
  // Try RevenueCat first (native only)
  if (isNativePlatform() && _initialized) {
    const modules = await loadRevenueCatModules();
    if (modules) {
      try {
        const { offerings } = await modules.Purchases.getOfferings();
        const monthly = offerings?.current?.monthly;
        if (monthly) {
          return {
            monthly: {
              price: monthly.product.priceString,
              priceNumber: monthly.product.price,
              product: monthly,
            },
          };
        }
      } catch (error) {
        log.error('Failed to get offerings', error);
      }
    }
  }

  // Fallback: locale-based price estimate (web / RevenueCat unavailable)
  const locale = navigator.language || 'en-US';
  const country = locale.split('-')[1] || 'US';

  const currencyMap: Record<string, { currency: string; amount: number }> = {
    'US': { currency: 'USD', amount: 5 },
    'GB': { currency: 'GBP', amount: 4 },
    'AU': { currency: 'AUD', amount: 8 },
    'CA': { currency: 'CAD', amount: 7 },
    'JP': { currency: 'JPY', amount: 750 },
    'CH': { currency: 'CHF', amount: 5 },
  };

  const euroCountries = ['DE', 'FR', 'ES', 'IT', 'NL', 'BE', 'AT', 'PT', 'IE', 'FI', 'GR'];
  const isEuro = euroCountries.includes(country);
  const { currency, amount } = currencyMap[country] || (isEuro ? { currency: 'EUR', amount: 5 } : { currency: 'USD', amount: 5 });

  const price = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);

  return { monthly: { price, priceNumber: amount } };
};

/**
 * Purchase monthly subscription
 * On native: presents RevenueCat Paywall UI (handles Apple/Google payment)
 * On web: simulates successful purchase for development testing only
 */
export const purchaseMonthly = async (): Promise<{
  success: boolean;
  error?: string;
}> => {
  if (!isNativePlatform()) {
    // Web mode - simulate for development only
    if (import.meta.env?.DEV) {
      return { success: true };
    }
    return { success: false, error: 'Purchases only available in the app' };
  }

  const modules = await loadRevenueCatModules();
  if (!modules) {
    return { success: false, error: 'Payment system not available' };
  }

  try {
    const { RevenueCatUI, PAYWALL_RESULT } = modules;
    const { result } = await RevenueCatUI.presentPaywall();

    if (result === PAYWALL_RESULT.PURCHASED || result === PAYWALL_RESULT.RESTORED) {
      return { success: true };
    }

    if (result === PAYWALL_RESULT.CANCELLED) {
      return { success: false, error: 'cancelled' };
    }

    return { success: false, error: 'Purchase was not completed' };
  } catch (error: any) {
    log.error('Purchase failed', error);

    // RevenueCat error codes for common scenarios
    if (error?.code === 1) {
      return { success: false, error: 'cancelled' };
    }

    return { success: false, error: error?.message || 'Payment failed' };
  }
};

/**
 * Check if user has active premium entitlement
 * Use this to verify subscription status server-side via RevenueCat
 */
export const checkEntitlement = async (): Promise<boolean> => {
  if (!isNativePlatform() || !_initialized) return false;

  const modules = await loadRevenueCatModules();
  if (!modules) return false;

  try {
    const { customerInfo } = await modules.Purchases.getCustomerInfo();
    return customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
  } catch (error) {
    log.error('Entitlement check failed', error);
    return false;
  }
};

/**
 * Restore previous purchases
 * Required by Apple App Store Review Guidelines (3.1.1)
 * Must be accessible and functional
 */
export const restorePurchases = async (): Promise<{
  success: boolean;
  isSubscribed: boolean;
  error?: string;
}> => {
  if (!isNativePlatform()) {
    return { success: true, isSubscribed: false };
  }

  const modules = await loadRevenueCatModules();
  if (!modules) {
    return { success: false, isSubscribed: false, error: 'Payment system not available' };
  }

  try {
    const { customerInfo } = await modules.Purchases.restorePurchases();
    const isSubscribed = customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
    return { success: true, isSubscribed };
  } catch (error: any) {
    log.error('Restore failed', error);
    return { success: false, isSubscribed: false, error: error?.message || 'Restore failed' };
  }
};

/**
 * Get customer info from RevenueCat
 * Includes subscription status, entitlements, and management URL
 */
export const getCustomerInfo = async () => {
  if (!isNativePlatform() || !_initialized) return null;

  const modules = await loadRevenueCatModules();
  if (!modules) return null;

  try {
    const { customerInfo } = await modules.Purchases.getCustomerInfo();
    return customerInfo;
  } catch (error) {
    log.error('Failed to get customer info', error);
    return null;
  }
};

/**
 * Get subscription management URL
 * Apple: opens App Store subscription settings
 * Google: opens Play Store subscription settings
 * Required by Apple for subscription apps
 */
export const getManagementURL = async (): Promise<string | null> => {
  if (!isNativePlatform() || !_initialized) return null;

  const modules = await loadRevenueCatModules();
  if (!modules) return null;

  try {
    const { customerInfo } = await modules.Purchases.getCustomerInfo();
    return customerInfo.managementURL || null;
  } catch {
    return null;
  }
};

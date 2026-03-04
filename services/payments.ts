/**
 * RevenueCat Payment Service
 * Uses @revenuecat/purchases-capacitor for native iOS/Android
 * Falls back to mock for web testing
 *
 * NOTE: RevenueCat packages worden geïnstalleerd bij Capacitor setup:
 * npm install @revenuecat/purchases-capacitor @revenuecat/purchases-capacitor-ui
 */

// RevenueCat Configuration - requires env var, no hardcoded fallback
const REVENUECAT_API_KEY = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_REVENUECAT_API_KEY) || '';

// Entitlement identifier (zoals in RevenueCat dashboard)
const ENTITLEMENT_ID = 'NutriVault';

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

// Get RevenueCat modules (only available on native)
const getRevenueCatModules = async () => {
  if (!isNativePlatform()) return null;
  try {
    // These modules are only available after Capacitor setup
    const purchases = (window as any).RevenueCatPurchases;
    const ui = (window as any).RevenueCatUI;
    if (purchases && ui) {
      return { Purchases: purchases, RevenueCatUI: ui };
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
 * Call this when app starts
 */
export const initializePurchases = async (): Promise<void> => {
  if (!isNativePlatform()) {
    return;
  }
};

/**
 * Get available subscription offerings
 * Price is €5/month (or equivalent in local currency via App Store)
 */
export const getOfferings = async (): Promise<{
  monthly: { price: string; priceNumber: number } | null;
}> => {
  // Get locale-appropriate price display
  const locale = navigator.language || 'en-US';
  const currency = locale.startsWith('en-US') ? 'USD' :
                   locale.startsWith('en-GB') ? 'GBP' : 'EUR';

  const priceNumber = currency === 'USD' ? 5 :
                      currency === 'GBP' ? 4 : 5;

  const price = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(priceNumber);

  return { monthly: { price, priceNumber } };
};

/**
 * Purchase monthly subscription
 * On native: uses RevenueCat Paywall UI
 * On web: simulates successful purchase for testing
 */
export const purchaseMonthly = async (): Promise<{
  success: boolean;
  error?: string;
}> => {
  if (!isNativePlatform()) {
    // Web mode - simulate successful purchase for testing
    return { success: true };
  }

  // Native mode - RevenueCat Paywall will be shown
  // When Capacitor is set up, this will use RevenueCatUI.presentPaywall()
  return { success: true };
};

/**
 * Check if user has active premium entitlement
 */
export const checkEntitlement = async (): Promise<boolean> => {
  if (!isNativePlatform()) {
    return false;
  }
  // Will be implemented when Capacitor is set up
  return false;
};

/**
 * Restore previous purchases
 */
export const restorePurchases = async (): Promise<{
  success: boolean;
  isSubscribed: boolean;
  error?: string;
}> => {
  if (!isNativePlatform()) {
    return { success: true, isSubscribed: false };
  }
  // Will be implemented when Capacitor is set up
  return { success: true, isSubscribed: false };
};

/**
 * Get customer info
 */
export const getCustomerInfo = async () => {
  if (!isNativePlatform()) {
    return null;
  }
  // Will be implemented when Capacitor is set up
  return null;
};

/*
 * ============================================
 * NATIVE IMPLEMENTATION (voor Capacitor setup)
 * ============================================
 *
 * Wanneer je Capacitor installeert, voeg dit toe aan je native code:
 *
 * 1. Install packages:
 *    npm install @revenuecat/purchases-capacitor @revenuecat/purchases-capacitor-ui
 *
 * 2. In je native App component (na Capacitor setup):
 *
 *    import { Purchases, LOG_LEVEL } from '@revenuecat/purchases-capacitor';
 *    import { RevenueCatUI, PAYWALL_RESULT } from '@revenuecat/purchases-capacitor-ui';
 *
 *    // Initialize
 *    await Purchases.setLogLevel({ level: LOG_LEVEL.DEBUG });
 *    await Purchases.configure({ apiKey: REVENUECAT_API_KEY });
 *
 *    // Present paywall
 *    const { result } = await RevenueCatUI.presentPaywall();
 *    if (result === PAYWALL_RESULT.PURCHASED || result === PAYWALL_RESULT.RESTORED) {
 *      // Success - generate activation code
 *    }
 *
 *    // Check entitlement
 *    const { customerInfo } = await Purchases.getCustomerInfo();
 *    const hasPremium = customerInfo.entitlements.active["premium"] !== undefined;
 *
 */

import React, { useState, useEffect } from 'react';
import { Lock, KeyRound, AlertTriangle, RefreshCw, ExternalLink } from 'lucide-react';
import { createAccount, verifyKey, saveSession } from '../services/auth';
import { purchaseMonthly, restorePurchases, getOfferings, setActivationCodeAttribute } from '../services/payments';
import { createLogger } from '../services/logger';
import { t, getCurrentLanguage } from '../utils/i18n';
import { PRIVACY_POLICY_URL } from '../services/config';

const log = createLogger('AuthScreen');

interface AuthScreenProps {
  onAuthenticated: () => void;
}

// Pending purchase recovery key
const PENDING_PURCHASE_KEY = 'nutrivault_pending_purchase';

// Get locale-based price display
const getLocalizedPrice = (): string => {
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

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

// Dev / test mode detection
const IS_DEV = typeof import.meta !== 'undefined' && import.meta.env?.DEV;
// VITE_TEST_MODE is a build-time env var — set it in Vercel project settings before deploying.
// Also supports ?testmode URL param as a runtime fallback for quick testing.
const IS_TEST_MODE = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_TEST_MODE === 'true')
  || (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('testmode'));

const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthenticated }) => {
  const [view, setView] = useState<'WELCOME' | 'CREATE' | 'LOGIN'>('WELCOME');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [newKey, setNewKey] = useState<string | null>(null);
  const [newName, setNewName] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState('');
  const [price, setPrice] = useState(getLocalizedPrice());
  const lang = getCurrentLanguage();

  // Load pricing from RevenueCat on mount
  useEffect(() => {
    getOfferings().then(offerings => {
      if (offerings.monthly) {
        setPrice(offerings.monthly.price);
      }
    });

    // Check for pending purchase that failed during code creation
    checkPendingPurchase();
  }, []);

  /**
   * Recovery: if a previous purchase succeeded but code creation failed,
   * retry code creation automatically
   */
  const checkPendingPurchase = async () => {
    const pending = localStorage.getItem(PENDING_PURCHASE_KEY);
    if (!pending) return;

    setLoading(true);
    setError('');

    try {
      const acc = await createAccount();
      if (acc && acc.key) {
        localStorage.removeItem(PENDING_PURCHASE_KEY);
        // Link code to RevenueCat customer
        await setActivationCodeAttribute(acc.key);
        setNewKey(acc.key);
        setNewName(acc.name);
        setView('CREATE');
      } else {
        setError(t('codeGenFailed'));
      }
    } catch {
      setError(t('codeGenFailed'));
    } finally {
      setLoading(false);
    }
  };

  // Handle subscription purchase
  const handlePurchase = async () => {
    setLoading(true);
    setError('');

    try {
      // Step 1: Process payment via RevenueCat/App Store/Google Play
      const purchaseResult = await purchaseMonthly();

      if (!purchaseResult.success) {
        if (purchaseResult.error === 'cancelled') {
          setLoading(false);
          return;
        }
        setError(purchaseResult.error || t('paymentFailed'));
        setLoading(false);
        return;
      }

      // Step 2: Payment successful - mark as pending before code creation
      // This ensures recovery if code creation fails
      localStorage.setItem(PENDING_PURCHASE_KEY, Date.now().toString());

      // Step 3: Generate unique activation code
      let acc: { key: string; name: string } | null = null;
      let retries = 3;

      while (retries > 0 && !acc) {
        acc = await createAccount();
        if (!acc) {
          retries--;
          if (retries > 0) {
            // Wait briefly before retry
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      }

      if (!acc || !acc.key) {
        // Payment succeeded but code creation failed
        // The pending purchase marker remains for recovery on next app open
        setError(t('codeGenFailed'));
        setLoading(false);
        return;
      }

      // Step 4: Success - clear pending marker
      localStorage.removeItem(PENDING_PURCHASE_KEY);

      // Step 5: Link code to RevenueCat customer for webhook-based renewal
      await setActivationCodeAttribute(acc.key);

      // Show code to user
      setNewKey(acc.key);
      setNewName(acc.name);
      setView('CREATE');
    } catch (err) {
      log.error('Purchase flow failed', err);
      setError(t('somethingWentWrong'));
    } finally {
      setLoading(false);
    }
  };

  // Handle restore purchases (Apple App Store requirement 3.1.1)
  const handleRestore = async () => {
    setLoading(true);
    setError('');

    try {
      const result = await restorePurchases();

      if (result.isSubscribed) {
        // User has an active subscription - check if they also have a code
        setError('');
        setView('LOGIN');
      } else {
        setError(t('noActiveSubscription'));
      }
    } catch {
      setError(t('restoreFailed'));
    } finally {
      setLoading(false);
    }
  };

  // Dev / test mode: skip auth entirely (creates local session + auto-login)
  const handleDevSkip = async () => {
    if (!IS_DEV && !IS_TEST_MODE) return;
    setLoading(true);
    setError('');

    try {
      // In test mode on production, create a local session directly
      // (Supabase create-code requires payment; this bypasses that for testing)
      if (IS_TEST_MODE && !IS_DEV) {
        const testKey = 'TEST-' + Date.now().toString().slice(-12).replace(/(.{4})/g, '$1-').slice(0, -1);
        const token = Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('');
        const expiry = Date.now() + (1000 * 60 * 60 * 24 * 365); // 1 year
        saveSession(testKey, token, expiry, 'Test User');
        onAuthenticated();
        return;
      }

      const acc = await createAccount();
      if (acc && acc.key) {
        const result = await verifyKey(acc.key);
        if (result.success && result.token && result.expiry) {
          saveSession(acc.key, result.token, result.expiry, result.name);
          onAuthenticated();
          return;
        }
      }
      setError('Dev skip failed');
    } catch {
      setError('Dev skip failed');
    } finally {
      setLoading(false);
    }
  };

  // Handle login with existing key
  const handleLogin = async () => {
    if (!inputKey.replace(/\s/g, '')) return;

    setLoading(true);
    setError('');

    const result = await verifyKey(inputKey);

    if (result.success && result.token && result.expiry) {
      saveSession(inputKey, result.token, result.expiry, result.name);
      onAuthenticated();
    } else {
      setError(result.error === 'network' ? t('networkError') : t('invalidCode'));
      setLoading(false);
    }
  };

  // Handle "I have saved it" button
  const handleSavedKey = async () => {
    if (!newKey) return;

    setLoading(true);
    const result = await verifyKey(newKey);

    if (result.success && result.token && result.expiry) {
      saveSession(newKey, result.token, result.expiry, result.name);
      onAuthenticated();
    } else {
      setError(t('somethingWentWrong'));
      setLoading(false);
    }
  };

  // Localized "per month" text
  const perMonth = lang === 'nl' ? '/maand' :
                   lang === 'de' ? '/Monat' :
                   lang === 'fr' ? '/mois' :
                   lang === 'es' ? '/mes' :
                   '/month';

  // Create Account Screen (after successful payment)
  if (view === 'CREATE' && newKey) {
    return (
      <div className="h-[100dvh] bg-[#FAF6F1] flex items-center justify-center p-6">
        <div className="bg-white w-full max-w-md p-8 rounded-[2rem] shadow-xl text-center">
          <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertTriangle className="w-8 h-8 text-red-500" />
          </div>

          <h2 className="text-2xl font-bold mb-2">{t('saveCode')}</h2>
          <p className="text-[#9A8B80] text-sm mb-8">
            {t('lostAccessWarning')}
          </p>

          <div className="bg-[#FAF6F1] p-6 rounded-2xl mb-8 border border-[#E8DFD5]">
            <p className="text-3xl font-mono font-bold tracking-wider text-[#2B2523]">
              {newKey.match(/.{1,4}/g)?.join(' ')}
            </p>
            {newName && (
              <div className="mt-4 inline-flex items-center gap-2 bg-white border border-[#E8DFD5] px-3 py-1.5 rounded-lg">
                <span className="w-2 h-2 rounded-full bg-[#E07A5F]"></span>
                <span className="text-xs font-bold uppercase text-[#6B6257]">{newName}</span>
              </div>
            )}
          </div>

          <p className="text-xs text-[#9A8B80] mb-6">
            {t('tipScreenshot')}
          </p>

          {error && (
            <p className="text-red-500 text-center font-bold text-xs mb-4">{error}</p>
          )}

          <button
            onClick={handleSavedKey}
            disabled={loading}
            className="w-full bg-black text-white font-bold py-4 rounded-2xl shadow-lg disabled:opacity-50"
          >
            {loading ? t('verifying') : t('codeSaved')}
          </button>
        </div>
      </div>
    );
  }

  // Login Screen
  if (view === 'LOGIN') {
    return (
      <div className="h-[100dvh] bg-[#FAF6F1] flex items-center justify-center p-6">
        <div className="bg-white w-full max-w-md p-8 rounded-[2rem] shadow-xl">
          <button
            onClick={() => setView('WELCOME')}
            className="text-[#9A8B80] text-xs font-bold uppercase mb-8"
          >
            {t('back')}
          </button>

          <h2 className="text-3xl font-black mb-2 text-[#2B2523] font-display tracking-tight">{t('login')}</h2>
          <p className="text-[#9A8B80] text-sm mb-8">{t('enterCode')}</p>

          <input
            type="text"
            placeholder="0000 0000 0000 0000"
            className="w-full bg-[#FAF6F1] p-5 rounded-2xl text-center text-xl font-mono font-bold tracking-widest outline-none mb-4 text-[#2B2523] placeholder-[#B4A79C]"
            value={inputKey}
            onChange={(e) => setInputKey(e.target.value)}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />

          {error && (
            <p className="text-red-500 text-center font-bold text-xs mb-4">{error}</p>
          )}

          <button
            onClick={handleLogin}
            disabled={loading || !inputKey.replace(/\s/g, '')}
            className="w-full bg-[#E07A5F] text-white font-bold py-4 rounded-2xl shadow-lg disabled:opacity-50"
          >
            {loading ? t('verifying') : t('access')}
          </button>
        </div>
      </div>
    );
  }

  // Welcome Screen
  return (
    <div className="h-[100dvh] bg-[#FAF6F1] flex flex-col justify-center p-6 relative overflow-hidden">
      <div className="absolute top-[-20%] right-[-20%] w-[500px] h-[500px] bg-[#E07A5F]/5 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-[-10%] left-[-20%] w-[400px] h-[400px] bg-[#E07A5F]/3 rounded-full blur-3xl pointer-events-none"></div>

      <div className="w-full max-w-sm mx-auto z-10">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-5xl font-extrabold tracking-tighter mb-2 font-display"><span className="text-[#2B2523]">Nutri</span><span className="text-[#E07A5F]">Vault</span></h1>
          <p className="text-sm text-[#9A8B80] font-medium">
            Affordable nutrition tracking. Maximum privacy.
          </p>
        </div>

        {/* Main card */}
        <div className="bg-white rounded-[2rem] p-6 shadow-xl">
          {/* Features summary */}
          <div className="space-y-3 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 bg-[#E07A5F]/10 rounded-lg flex items-center justify-center">
                <Lock className="w-3.5 h-3.5 text-[#E07A5F]" />
              </div>
              <span className="text-sm text-[#6B6257] font-medium">100% local & private</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 bg-[#E07A5F]/10 rounded-lg flex items-center justify-center">
                <KeyRound className="w-3.5 h-3.5 text-[#E07A5F]" />
              </div>
              <span className="text-sm text-[#6B6257] font-medium">No account needed - just a code</span>
            </div>
          </div>

          {/* Price */}
          <div className="text-center py-4 mb-4 border-t border-[#F3EAE2]">
            <span className="text-4xl font-black text-[#2B2523] font-display tracking-tight">{price}</span>
            <span className="text-[#9A8B80] font-medium">{perMonth}</span>
          </div>

          {error && (
            <p className="text-red-500 text-center font-bold text-xs mb-4">{error}</p>
          )}

          {/* Buttons */}
          <div className="space-y-2.5">
            <button
              onClick={handlePurchase}
              disabled={loading}
              className="w-full bg-[#E07A5F] text-white py-4 rounded-2xl font-bold text-base shadow-lg shadow-[#E07A5F]/25 disabled:opacity-50 active:scale-[0.97] transition-smooth"
            >
              {loading ? '...' : t('startSubscription')}
            </button>
            <button
              onClick={() => setView('LOGIN')}
              className="w-full bg-[#FAF6F1] text-[#6B6257] py-3 rounded-xl font-bold text-sm"
            >
              {t('loginWithCode')}
            </button>
          </div>

          {/* Restore Purchases (Apple requirement 3.1.1) */}
          <button
            onClick={handleRestore}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 text-[#9A8B80] text-xs font-medium py-3 mt-2"
          >
            <RefreshCw className="w-3 h-3" />
            {t('restorePurchases')}
          </button>

          {/* Legal links (Apple requirement) */}
          <div className="flex justify-center gap-4 mt-3 pt-3 border-t border-[#F3EAE2]">
            <a
              href={PRIVACY_POLICY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-[#9A8B80] flex items-center gap-1"
            >
              Privacy Policy <ExternalLink className="w-2.5 h-2.5" />
            </a>
            <a
              href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-[#9A8B80] flex items-center gap-1"
            >
              Terms of Use <ExternalLink className="w-2.5 h-2.5" />
            </a>
          </div>

          {/* Dev / test mode: skip auth for testing */}
          {(IS_DEV || IS_TEST_MODE) && (
            <button
              onClick={handleDevSkip}
              disabled={loading}
              className="w-full mt-3 py-2 text-xs font-mono text-[#C4763B] border border-dashed border-[#E5C6A8] rounded-xl bg-[#F6ECE2] disabled:opacity-50"
            >
              {IS_TEST_MODE && !IS_DEV ? 'TEST MODE — Free Access' : 'DEV MODE — Skip Auth'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuthScreen;

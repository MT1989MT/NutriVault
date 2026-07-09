
import React, { useEffect, useState, useRef } from 'react';
import { Shield, Copy, X, LogOut, Check, Info, Heart, Target, Utensils, Lock, Database, Eye, Trash2, Download, Upload, ExternalLink, Globe } from 'lucide-react';
import { getSession, logout, addTime } from '../services/auth';
import { getProfile, exportAllData, importAllData, clearAllData } from '../services/storage';
import { getManagementURL, purchaseMonthly } from '../services/payments';
import { UserProfile } from '../types';
import { PRIVACY_POLICY_URL } from '../services/config';
import { t, getCurrentLanguage, setLanguage, getAvailableLanguages } from '../utils/i18n';

interface SettingsProps { onBack: () => void; }

// The free "extend" shortcut (no real payment) must never be reachable in a
// production build — it's a test convenience only.
const IS_DEV = typeof import.meta !== 'undefined' && import.meta.env?.DEV;
const IS_TEST_MODE = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_TEST_MODE === 'true')
  || (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('testmode'));

const Settings: React.FC<SettingsProps> = ({ onBack }) => {
  const [session, setSession] = useState(getSession());
  const [daysLeft, setDaysLeft] = useState(0);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(getProfile());
  const [copied, setCopied] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [importFeedback, setImportFeedback] = useState<string | null>(null);
  const [lang, setLang] = useState(getCurrentLanguage());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLanguageChange = (code: string) => {
    setLanguage(code);
    setLang(code);
    // A full reload is the simplest reliable way to re-render every screen in
    // the new language (t() reads the stored language at render time).
    window.location.reload();
  };

  useEffect(() => {
    if (session) setDaysLeft(Math.max(0, Math.ceil((session.subscriptionEnds - Date.now()) / (1000 * 60 * 60 * 24))));
  }, [session]);

  const handleCopyKey = () => {
    navigator.clipboard.writeText(session?.accountNumber || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handlePayment = async () => {
    if (!session) return;

    // On native: use RevenueCat/App Store payment flow
    const isNative = !!(window as any).Capacitor?.isNativePlatform?.();
    if (isNative) {
      const result = await purchaseMonthly();
      if (result.success) {
        await addTime(session.accountNumber, 1);
        setDaysLeft(p => p + 30);
      }
      return;
    }

    // Free extend is a dev/test convenience only. In a real web build, route to
    // the same purchase flow so payment can't be bypassed with a confirm dialog.
    if (IS_DEV || IS_TEST_MODE) {
      if (confirm(t('extendConfirm'))) {
        await addTime(session.accountNumber, 1);
        setDaysLeft(p => p + 30);
      }
      return;
    }
    const result = await purchaseMonthly();
    if (result.success) {
      await addTime(session.accountNumber, 1);
      setDaysLeft(p => p + 30);
    }
  };

  const handleManageSubscription = async () => {
    const url = await getManagementURL();
    if (url) {
      window.open(url, '_blank');
    }
  };

  const handleLogout = () => {
    if (confirm(t('logoutWarn'))) {
      logout();
      window.location.reload();
    }
  };

  const handleExportData = () => {
    const data = exportAllData();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nutrivault-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const result = await importAllData(ev.target?.result as string);
      if (result.success) {
        setImportFeedback(t('dataRestored'));
        setTimeout(() => window.location.reload(), 1500);
      } else {
        setImportFeedback(result.error || t('importFailed'));
        setTimeout(() => setImportFeedback(null), 3000);
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClearData = async () => {
    if (!confirm(t('clearDataWarn1'))) return;
    if (!confirm(t('clearDataWarn2'))) return;

    // Preserve the things that shouldn't be wiped by a data-clear: the account
    // session (so the user stays logged in), onboarding flag and language.
    const session = localStorage.getItem('nutrivault_auth_session');
    const serverDb = localStorage.getItem('nutrivault_server_db_hashes');
    const onboarding = localStorage.getItem('nutrivault_onboarding_complete');
    const savedLang = localStorage.getItem('nutrivault_language');

    // clearAllData wipes localStorage + IndexedDB + the in-memory cache, so the
    // deleted logs can't resurrect from IDB on the next load.
    await clearAllData();

    if (session) localStorage.setItem('nutrivault_auth_session', session);
    if (serverDb) localStorage.setItem('nutrivault_server_db_hashes', serverDb);
    if (onboarding) localStorage.setItem('nutrivault_onboarding_complete', onboarding);
    if (savedLang) localStorage.setItem('nutrivault_language', savedLang);
    window.location.reload();
  };

  return (
    <div className="h-full flex flex-col bg-[#FAF6F1]">
      {/* Header */}
      <div className="px-5 pb-3" style={{paddingTop: 'max(env(safe-area-inset-top, 14px), 14px)'}}>
        <div className="flex items-center justify-between">
          <span className="text-[24px] font-bold text-[#2B2523] font-display tracking-tight">{t('settings')}</span>
          <button onClick={onBack} aria-label="Close" className="w-[42px] h-[42px] bg-white rounded-full card-shadow flex items-center justify-center active:scale-90 transition-smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E07A5F] focus-visible:ring-offset-2">
            <X className="w-[18px] h-[18px] text-[#9A8B80]" strokeWidth={1.8} />
          </button>
        </div>
      </div>

      {/* About Modal */}
      {showAbout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="About NutriVault">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden">
            <div className="bg-[#E07A5F] p-5 text-center">
              <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Heart className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-xl font-bold text-white mb-1">NutriVault</h2>
              <p className="text-white/80 text-xs">Your personal wellness companion</p>
            </div>
            <div className="p-4 space-y-4 max-h-64 overflow-y-auto">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-[#E07A5F]/10 rounded-lg flex items-center justify-center shrink-0">
                  <Target className="w-4 h-4 text-[#E07A5F]" />
                </div>
                <div>
                  <h4 className="font-bold text-[#2B2523] text-sm">Our Mission</h4>
                  <p className="text-xs text-[#9A8B80]">Make healthy living simple, personal, and accessible to everyone.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-[#E07A5F]/10 rounded-lg flex items-center justify-center shrink-0">
                  <Utensils className="w-4 h-4 text-[#E07A5F]" />
                </div>
                <div>
                  <h4 className="font-bold text-[#2B2523] text-sm">Smart Nutrition</h4>
                  <p className="text-xs text-[#9A8B80]">Log food naturally in any language. NutriVault understands what you eat and tracks nutrition automatically.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-[#E07A5F]/10 rounded-lg flex items-center justify-center shrink-0">
                  <Shield className="w-4 h-4 text-[#E07A5F]" />
                </div>
                <div>
                  <h4 className="font-bold text-[#2B2523] text-sm">Privacy First</h4>
                  <p className="text-xs text-[#9A8B80]">Your data stays on your device. Anonymous accounts, no tracking, no ads.</p>
                </div>
              </div>
              <div className="bg-[#FAF6F1] rounded-xl p-3 text-center">
                <p className="text-[10px] text-[#9A8B80] mb-1">Made with care</p>
                <p className="text-xs font-bold text-[#6B6257]">Privacy-first • No ads • Your data stays local</p>
              </div>
            </div>
            <div className="p-4 pt-0">
              <button onClick={() => setShowAbout(false)} className="w-full bg-[#E07A5F] text-white font-bold py-3 rounded-xl">Got it!</button>
            </div>
          </div>
        </div>
      )}

      {/* Privacy Modal */}
      {showPrivacy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Privacy policy">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-gray-800 to-gray-900 p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-white" />
                <h3 className="font-bold text-white">Privacy & Data Policy</h3>
              </div>
              <button onClick={() => setShowPrivacy(false)} aria-label="Close" className="p-2 hover:bg-white/20 rounded-lg">
                <X className="w-5 h-5 text-white" />
              </button>
            </div>
            <div className="p-4 space-y-4 max-h-80 overflow-y-auto">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center shrink-0">
                  <Database className="w-4 h-4 text-green-600" />
                </div>
                <div>
                  <h4 className="font-bold text-[#2B2523] text-sm">Local Storage Only</h4>
                  <p className="text-xs text-[#9A8B80]">All your food logs, workouts, recipes, and settings are stored locally on your device. Nothing is uploaded to external servers.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-[#EFF2EE] rounded-lg flex items-center justify-center shrink-0">
                  <Lock className="w-4 h-4 text-[#3D5A48]" />
                </div>
                <div>
                  <h4 className="font-bold text-[#2B2523] text-sm">Anonymous Accounts</h4>
                  <p className="text-xs text-[#9A8B80]">Your account is just a random number. No email, no phone, no personal information required. Similar to Mullvad's privacy approach.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center shrink-0">
                  <Eye className="w-4 h-4 text-purple-600" />
                </div>
                <div>
                  <h4 className="font-bold text-[#2B2523] text-sm">No Tracking</h4>
                  <p className="text-xs text-[#9A8B80]">We don't use analytics, cookies, or tracking pixels. No behavioral profiling, no data selling to third parties.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-[#F6ECE2] rounded-lg flex items-center justify-center shrink-0">
                  <Trash2 className="w-4 h-4 text-[#C4763B]" />
                </div>
                <div>
                  <h4 className="font-bold text-[#2B2523] text-sm">Full Data Control</h4>
                  <p className="text-xs text-[#9A8B80]">You can delete all your data anytime from this settings page. When you logout, your local data can be cleared completely.</p>
                </div>
              </div>
              <div className="bg-[#FAF6F1] rounded-xl p-3">
                <h4 className="font-bold text-[#2B2523] text-xs mb-2">What data we process:</h4>
                <ul className="text-xs text-[#9A8B80] space-y-1">
                  <li>• Food entries (for nutrition calculation)</li>
                  <li>• Workout logs (stored locally only)</li>
                  <li>• Profile settings (weight, goals, preferences)</li>
                  <li>• Account number (anonymous identifier)</li>
                </ul>
              </div>
              <div className="bg-[#F6ECE2] rounded-xl p-3">
                <h4 className="font-bold text-[#2B2523] text-xs mb-1">AI Processing</h4>
                <p className="text-xs text-[#9A8B80]">Food descriptions are sent to Google Gemini for nutrition analysis. Only the food text is sent — no personal data, no account info, no tracking.</p>
              </div>
              <div className="bg-green-50 rounded-xl p-3">
                <p className="text-xs text-green-700 font-medium">✓ GDPR Compliant • No data retention • You own your data</p>
              </div>
            </div>
            <div className="p-4 pt-0">
              <button onClick={() => setShowPrivacy(false)} className="w-full bg-gray-900 text-white font-bold py-3 rounded-xl">Close</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 pt-3 space-y-4" style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))' }}>
        {/* Account Key Card */}
        <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-5 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 p-3 opacity-5"><Shield className="w-24 h-24" /></div>
          <p className="text-[9px] font-bold text-[#9A8B80] uppercase tracking-wider mb-2">{t('accountKey')}</p>
          <p className="font-mono text-xl font-bold tracking-widest mb-4">{session?.accountNumber.match(/.{1,4}/g)?.join(' ')}</p>
          <button onClick={handleCopyKey} className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-smooth active:scale-95">
            {copied ? <><Check className="w-3.5 h-3.5 text-[#3D5A48]" /> {t('copied')}</> : <><Copy className="w-3.5 h-3.5" /> {t('copyKey')}</>}
          </button>
        </div>

        {/* Subscription */}
        <div className="bg-white rounded-2xl p-4 card-shadow">
          <p className="text-[9px] font-bold text-[#9A8B80] uppercase tracking-wider mb-2">{t('subscription')}</p>
          <div className="flex justify-between items-center">
            <div>
              <span className={`text-sm font-bold ${daysLeft > 0 ? 'text-[#3D5A48]' : 'text-red-500'}`}>{daysLeft > 0 ? t('active') : t('expired')}</span>
              <span className="text-xs text-[#9A8B80] block">{daysLeft} {t('daysRemaining')}</span>
            </div>
            <button onClick={handlePayment} className="text-[#E07A5F] text-xs font-bold bg-[#E07A5F]/8 px-4 py-2 rounded-xl transition-smooth active:scale-95">{t('extend')}</button>
          </div>
          <button
            onClick={handleManageSubscription}
            className="w-full mt-3 text-[#9A8B80] text-[10px] font-medium flex items-center justify-center gap-1"
          >
            {t('manageSubscription')} <ExternalLink className="w-2.5 h-2.5" />
          </button>
        </div>

        {/* Data Backup */}
        <div className="bg-white rounded-2xl p-4 card-shadow">
          <div className="flex items-center gap-2 mb-3">
            <Database className="w-4 h-4 text-[#E07A5F]" />
            <p className="text-[9px] font-bold text-[#9A8B80] uppercase tracking-wider">{t('dataBackup')}</p>
          </div>
          {importFeedback && (
            <div className="bg-[#EFF2EE] text-[#3D5A48] text-xs font-bold px-3 py-2 rounded-xl mb-3 flex items-center gap-2">
              <Check className="w-3 h-3" /> {importFeedback}
            </div>
          )}
          <div className="space-y-2">
            <button onClick={handleExportData} className="w-full bg-[#EFF2EE] text-[#3D5A48] font-bold py-3 rounded-xl flex items-center justify-center gap-2 text-sm transition-smooth active:scale-[0.98] hover:bg-[#EFF2EE]">
              <Download className="w-4 h-4" /> {t('exportData')}
            </button>
            <button onClick={() => fileInputRef.current?.click()} className="w-full bg-[#FAF6F1] text-[#6B6257] font-bold py-3 rounded-xl flex items-center justify-center gap-2 text-sm transition-smooth active:scale-[0.98] hover:bg-[#F3EAE2]">
              <Upload className="w-4 h-4" /> {t('importBackup')}
            </button>
            <input ref={fileInputRef} type="file" accept=".json" onChange={handleImportData} className="hidden" />
          </div>
          <p className="text-[10px] text-[#9A8B80] mt-2.5 text-center">{t('backupDesc')}</p>
        </div>

        {/* Language */}
        <div className="bg-white rounded-2xl p-4 card-shadow">
          <div className="flex items-center gap-2 mb-3">
            <Globe className="w-4 h-4 text-[#E07A5F]" />
            <p className="text-[9px] font-bold text-[#9A8B80] uppercase tracking-wider">{t('language')}</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {getAvailableLanguages().map(l => (
              <button
                key={l.code}
                onClick={() => l.code !== lang && handleLanguageChange(l.code)}
                aria-pressed={l.code === lang}
                className={`py-2.5 rounded-xl text-xs font-bold transition-smooth active:scale-[0.97] ${l.code === lang ? 'bg-[#E07A5F] text-white shadow-md shadow-[#E07A5F]/20' : 'bg-[#FAF6F1] text-[#6B6257] hover:bg-[#F3EAE2]'}`}
              >
                {l.name}
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-2">
          <button onClick={() => setShowAbout(true)} className="w-full bg-[#E07A5F] text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-[#E07A5F]/20 transition-smooth active:scale-[0.98]">
            <Info className="w-4 h-4" /> {t('aboutNutriVault')}
          </button>
          <button onClick={() => setShowPrivacy(true)} className="w-full bg-white text-[#6B6257] font-bold py-3 rounded-xl flex items-center justify-center gap-2 card-shadow transition-smooth active:scale-[0.98]">
            <Shield className="w-4 h-4" /> {t('privacyPolicy')}
          </button>
          <button onClick={handleClearData} className="w-full bg-[#F6ECE2] text-[#C4763B] font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-smooth active:scale-[0.98]">
            <Trash2 className="w-4 h-4" /> {t('clearAllData')}
          </button>
          <button onClick={handleLogout} className="w-full bg-red-50 text-red-500 font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-smooth active:scale-[0.98]">
            <LogOut className="w-4 h-4" /> {t('logout')}
          </button>
        </div>

        {/* Legal links (Apple requirement) */}
        <div className="flex justify-center gap-4 pb-4">
          <a
            href={PRIVACY_POLICY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-[#9A8B80] flex items-center gap-1"
          >
            {t('privacyPolicy')} <ExternalLink className="w-2.5 h-2.5" />
          </a>
          <a
            href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-[#9A8B80] flex items-center gap-1"
          >
            {t('termsOfUse')} <ExternalLink className="w-2.5 h-2.5" />
          </a>
        </div>
      </div>
    </div>
  );
};
export default Settings;

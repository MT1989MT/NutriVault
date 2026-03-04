
import React, { useEffect, useState, useRef } from 'react';
import { Shield, Copy, X, Settings as SettingsIcon, LogOut, Check, Info, Heart, Target, Utensils, Lock, Database, Eye, Trash2, Download, Upload } from 'lucide-react';
import { getSession, logout, addTime } from '../services/auth';
import { getProfile, exportAllData, importAllData } from '../services/storage';
import { UserProfile } from '../types';

interface SettingsProps { onBack: () => void; }

const Settings: React.FC<SettingsProps> = ({ onBack }) => {
  const [session, setSession] = useState(getSession());
  const [daysLeft, setDaysLeft] = useState(0);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(getProfile());
  const [copied, setCopied] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [importFeedback, setImportFeedback] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (session) setDaysLeft(Math.max(0, Math.ceil((session.subscriptionEnds - Date.now()) / (1000 * 60 * 60 * 24))));
  }, [session]);

  const handleCopyKey = () => {
    navigator.clipboard.writeText(session?.accountNumber || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handlePayment = async () => {
    if (session && confirm("Extend subscription by 30 days?")) {
      await addTime(session.accountNumber, 1);
      setDaysLeft(p => p + 30);
    }
  };

  const handleLogout = () => {
    if (confirm("Make sure you saved your key!")) {
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
    reader.onload = (ev) => {
      const result = importAllData(ev.target?.result as string);
      if (result.success) {
        setImportFeedback('Data restored successfully!');
        setTimeout(() => window.location.reload(), 1500);
      } else {
        setImportFeedback(result.error || 'Import failed');
        setTimeout(() => setImportFeedback(null), 3000);
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClearData = () => {
    if (!confirm("This will delete all your nutrition data (logs, recipes, etc). Your account key will still work. Are you sure?")) return;
    if (!confirm("This action cannot be undone. All food logs, workouts, and recipes will be permanently deleted. Continue?")) return;

    const session = localStorage.getItem('nutrivault_auth_session');
    const serverDb = localStorage.getItem('nutrivault_server_db_hashes');
    const onboarding = localStorage.getItem('nutrivault_onboarding_complete');
    const lang = localStorage.getItem('nutrivault_language');
    localStorage.clear();
    if (session) localStorage.setItem('nutrivault_auth_session', session);
    if (serverDb) localStorage.setItem('nutrivault_server_db_hashes', serverDb);
    if (onboarding) localStorage.setItem('nutrivault_onboarding_complete', onboarding);
    if (lang) localStorage.setItem('nutrivault_language', lang);
    window.location.reload();
  };

  return (
    <div className="h-full flex flex-col bg-[#FAFAF8]">
      {/* Header */}
      <div className="bg-white border-b border-gray-100/80 px-4 pb-2.5" style={{paddingTop: 'max(env(safe-area-inset-top, 12px), 12px)'}}>
        <div className="flex items-center justify-between">
          <div className="w-10" />
          <span className="text-[20px] font-extrabold text-gray-900 font-display tracking-tight">Settings</span>
          <button onClick={onBack} className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center active:scale-90 transition-smooth">
            <X className="w-[18px] h-[18px] text-gray-400" />
          </button>
        </div>
      </div>

      {/* About Modal */}
      {showAbout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-[#E07A5F] to-[#C85A40] p-5 text-center">
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
                  <h4 className="font-bold text-gray-900 text-sm">Our Mission</h4>
                  <p className="text-xs text-gray-500">Make healthy living simple, personal, and accessible to everyone.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-[#E07A5F]/10 rounded-lg flex items-center justify-center shrink-0">
                  <Utensils className="w-4 h-4 text-[#E07A5F]" />
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 text-sm">Smart Nutrition</h4>
                  <p className="text-xs text-gray-500">Log food naturally in any language. NutriVault understands what you eat and tracks nutrition automatically.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-[#E07A5F]/10 rounded-lg flex items-center justify-center shrink-0">
                  <Shield className="w-4 h-4 text-[#E07A5F]" />
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 text-sm">Privacy First</h4>
                  <p className="text-xs text-gray-500">Your data stays on your device. Anonymous accounts, no tracking, no ads.</p>
                </div>
              </div>
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-[10px] text-gray-400 mb-1">Made with care</p>
                <p className="text-xs font-bold text-gray-600">Privacy-first • No ads • Your data stays local</p>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-gray-800 to-gray-900 p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-white" />
                <h3 className="font-bold text-white">Privacy & Data Policy</h3>
              </div>
              <button onClick={() => setShowPrivacy(false)} className="p-1 hover:bg-white/20 rounded-lg">
                <X className="w-5 h-5 text-white" />
              </button>
            </div>
            <div className="p-4 space-y-4 max-h-80 overflow-y-auto">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center shrink-0">
                  <Database className="w-4 h-4 text-green-600" />
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 text-sm">Local Storage Only</h4>
                  <p className="text-xs text-gray-500">All your food logs, workouts, recipes, and settings are stored locally on your device. Nothing is uploaded to external servers.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center shrink-0">
                  <Lock className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 text-sm">Anonymous Accounts</h4>
                  <p className="text-xs text-gray-500">Your account is just a random number. No email, no phone, no personal information required. Similar to Mullvad's privacy approach.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center shrink-0">
                  <Eye className="w-4 h-4 text-purple-600" />
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 text-sm">No Tracking</h4>
                  <p className="text-xs text-gray-500">We don't use analytics, cookies, or tracking pixels. No behavioral profiling, no data selling to third parties.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center shrink-0">
                  <Trash2 className="w-4 h-4 text-orange-600" />
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 text-sm">Full Data Control</h4>
                  <p className="text-xs text-gray-500">You can delete all your data anytime from this settings page. When you logout, your local data can be cleared completely.</p>
                </div>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <h4 className="font-bold text-gray-900 text-xs mb-2">What data we process:</h4>
                <ul className="text-xs text-gray-500 space-y-1">
                  <li>• Food entries (for nutrition calculation)</li>
                  <li>• Workout logs (stored locally only)</li>
                  <li>• Profile settings (weight, goals, preferences)</li>
                  <li>• Account number (anonymous identifier)</li>
                </ul>
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
          <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-2">Account Key</p>
          <p className="font-mono text-xl font-bold tracking-widest mb-4">{session?.accountNumber.match(/.{1,4}/g)?.join(' ')}</p>
          <button onClick={handleCopyKey} className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-smooth active:scale-95">
            {copied ? <><Check className="w-3.5 h-3.5 text-emerald-400" /> Copied!</> : <><Copy className="w-3.5 h-3.5" /> Copy Key</>}
          </button>
        </div>

        {/* Subscription */}
        <div className="bg-white rounded-2xl p-4 card-shadow">
          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-2">Subscription</p>
          <div className="flex justify-between items-center">
            <div>
              <span className={`text-sm font-bold ${daysLeft > 0 ? 'text-emerald-600' : 'text-red-500'}`}>{daysLeft > 0 ? 'Active' : 'Expired'}</span>
              <span className="text-xs text-gray-400 block">{daysLeft} days remaining</span>
            </div>
            <button onClick={handlePayment} className="text-[#E07A5F] text-xs font-bold bg-[#E07A5F]/8 px-4 py-2 rounded-xl transition-smooth active:scale-95">Extend</button>
          </div>
        </div>

        {/* Data Backup */}
        <div className="bg-white rounded-2xl p-4 card-shadow">
          <div className="flex items-center gap-2 mb-3">
            <Database className="w-4 h-4 text-[#E07A5F]" />
            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Data Backup</p>
          </div>
          {importFeedback && (
            <div className="bg-emerald-50 text-emerald-700 text-xs font-bold px-3 py-2 rounded-xl mb-3 flex items-center gap-2">
              <Check className="w-3 h-3" /> {importFeedback}
            </div>
          )}
          <div className="space-y-2">
            <button onClick={handleExportData} className="w-full bg-blue-50 text-blue-600 font-bold py-3 rounded-xl flex items-center justify-center gap-2 text-sm transition-smooth active:scale-[0.98] hover:bg-blue-100">
              <Download className="w-4 h-4" /> Export Data
            </button>
            <button onClick={() => fileInputRef.current?.click()} className="w-full bg-gray-50 text-gray-600 font-bold py-3 rounded-xl flex items-center justify-center gap-2 text-sm transition-smooth active:scale-[0.98] hover:bg-gray-100">
              <Upload className="w-4 h-4" /> Import Backup
            </button>
            <input ref={fileInputRef} type="file" accept=".json" onChange={handleImportData} className="hidden" />
          </div>
          <p className="text-[10px] text-gray-400 mt-2.5 text-center">Your data stays local. Export to keep a backup.</p>
        </div>

        {/* Actions */}
        <div className="space-y-2">
          <button onClick={() => setShowAbout(true)} className="w-full bg-gradient-to-r from-[#E07A5F] to-[#C85A40] text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-[#E07A5F]/20 transition-smooth active:scale-[0.98]">
            <Info className="w-4 h-4" /> About NutriVault
          </button>
          <button onClick={() => setShowPrivacy(true)} className="w-full bg-white text-gray-600 font-bold py-3 rounded-xl flex items-center justify-center gap-2 card-shadow transition-smooth active:scale-[0.98]">
            <Shield className="w-4 h-4" /> Privacy Policy
          </button>
          <button onClick={handleClearData} className="w-full bg-orange-50 text-orange-600 font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-smooth active:scale-[0.98]">
            <Trash2 className="w-4 h-4" /> Clear All Data
          </button>
          <button onClick={handleLogout} className="w-full bg-red-50 text-red-500 font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-smooth active:scale-[0.98]">
            <LogOut className="w-4 h-4" /> Logout
          </button>
        </div>
      </div>
    </div>
  );
};
export default Settings;

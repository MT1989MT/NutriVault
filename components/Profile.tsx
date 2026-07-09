import React, { useState, useMemo, useCallback, useRef, lazy, Suspense } from 'react';
import { ActivityLevel, Gender, MacroPreset, MacroTargets, UserProfile } from '../types';
import { calculateBMR, calculateTDEE, MACRO_PRESETS, macroGramsFromTargets } from '../utils/calculations';
import { User, Flame, X, Check, HelpCircle, Sliders } from 'lucide-react';
import { t } from '../utils/i18n';

const PersonalSetup = lazy(() => import('./PersonalSetup'));

interface ProfileProps {
  existingProfile: UserProfile | null;
  onSave: (profile: UserProfile) => void;
  onCancel?: () => void;
}

const Profile: React.FC<ProfileProps> = ({ existingProfile, onSave, onCancel }) => {
  const [formData, setFormData] = useState<Partial<UserProfile>>(existingProfile || {
    name: '', age: undefined, heightCm: undefined, weightKg: undefined, gender: Gender.MALE,
    activityLevel: ActivityLevel.SEDENTARY, goal: 'MAINTAIN', customCalories: undefined,
    quickLog: false, ignoreWorkoutCalories: true, mentalConditions: [], habits: [], dietaryPreferences: [],
    weeklyWeightChangeKg: 0.5, macroPreset: 'BALANCED',
  });

  // Use string state for numeric fields to avoid lag from Number() conversion on every keystroke
  const [ageStr, setAgeStr] = useState(existingProfile?.age?.toString() || '');
  const [heightStr, setHeightStr] = useState(existingProfile?.heightCm?.toString() || '');
  const [weightStr, setWeightStr] = useState(existingProfile?.weightKg?.toString() || '');
  const [targetWeightStr, setTargetWeightStr] = useState(existingProfile?.targetWeightKg?.toString() || '');
  const [customCalStr, setCustomCalStr] = useState(existingProfile?.customCalories?.toString() || '');

  const formRef = useRef<HTMLFormElement>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync numeric values to formData on blur (not on every keystroke)
  const syncNumericField = useCallback((field: string, value: string) => {
    const num = Number(value) || undefined;
    setFormData(prev => ({ ...prev, [field]: num }));
  }, []);

  // Scroll focused input into view when iOS keyboard opens
  const handleInputFocus = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    setTimeout(() => {
      e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 300);
  }, []);

  const dynamicTDEE = useMemo(() => {
    const w = Number(weightStr) || 0;
    const h = Number(heightStr) || 0;
    const a = Number(ageStr) || 0;
    if (w && h && a) {
      const bmr = calculateBMR(w, h, a, formData.gender || Gender.MALE);
      return calculateTDEE(
        bmr,
        formData.activityLevel || ActivityLevel.SEDENTARY,
        formData.goal || 'MAINTAIN',
        formData.weeklyWeightChangeKg,
        formData.gender,
      );
    }
    return 0;
  }, [weightStr, heightStr, ageStr, formData.gender, formData.activityLevel, formData.goal, formData.weeklyWeightChangeKg]);

  const targetMacros = useMemo<MacroTargets>(() => {
    if (formData.macroPreset === 'CUSTOM' && formData.macroTargets) return formData.macroTargets;
    if (formData.macroPreset && formData.macroPreset !== 'CUSTOM') return MACRO_PRESETS[formData.macroPreset];
    return MACRO_PRESETS.BALANCED;
  }, [formData.macroPreset, formData.macroTargets]);

  const macroGrams = useMemo(() => {
    const total = Number(customCalStr) || dynamicTDEE;
    if (!total) return null;
    return macroGramsFromTargets(total, targetMacros);
  }, [customCalStr, dynamicTDEE, targetMacros]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const w = Number(weightStr) || 0;
    const h = Number(heightStr) || 0;
    const a = Number(ageStr) || 0;
    // Validate instead of silently doing nothing when a field is empty/invalid.
    if (!a || a < 13 || a > 120) { setError(t('invalidAge')); return; }
    if (!h || h < 100 || h > 250) { setError(t('invalidHeight')); return; }
    if (!w || w < 30 || w > 400) { setError(t('invalidWeight')); return; }
    setError(null);
    const bmr = calculateBMR(w, h, a, formData.gender || Gender.MALE);
    const finalData = {
      ...formData,
      age: a,
      heightCm: h,
      weightKg: w,
      targetWeightKg: Number(targetWeightStr) || undefined,
      customCalories: Number(customCalStr) || undefined,
      tdee: calculateTDEE(
        bmr,
        formData.activityLevel!,
        formData.goal!,
        formData.weeklyWeightChangeKg,
        formData.gender,
      ),
    };
    onSave(finalData as UserProfile);
  };

  if (showWizard) {
    return (
      <Suspense fallback={<div className="h-full w-full flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#E07A5F]" /></div>}>
        <PersonalSetup
          existingProfile={existingProfile}
          onComplete={(p) => { setShowWizard(false); onSave(p); }}
          onCancel={() => setShowWizard(false)}
        />
      </Suspense>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#FAFAF8]">
      {/* Header */}
      <div className="bg-white border-b border-gray-100/80 px-4 pb-2.5" style={{paddingTop: 'max(env(safe-area-inset-top, 12px), 12px)'}}>
        <div className="flex items-center justify-between">
          <button onClick={() => setShowHelp(true)} aria-label="Help" className="w-11 h-11 bg-gray-50 rounded-xl flex items-center justify-center active:scale-95 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E07A5F] focus-visible:ring-offset-2">
            <HelpCircle className="w-[18px] h-[18px] text-gray-400" />
          </button>
          <span className="text-[20px] font-extrabold text-gray-900 font-display tracking-tight">{t('profile')}</span>
          <div className="w-10" />
        </div>
      </div>

      {/* Form */}
      <form ref={formRef} onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-4 pt-3 space-y-3" style={{ paddingBottom: 'calc(260px + env(safe-area-inset-bottom, 0px))' }}>
        {/* Name */}
        <div className="bg-white p-2.5 rounded-xl shadow-sm">
          <label className="text-[9px] font-bold text-gray-400 uppercase block mb-0.5">{t('nickname')}</label>
          <input type="text" className="w-full bg-transparent outline-none font-bold text-gray-900 text-sm focus:ring-2 focus:ring-[#E07A5F]/30 rounded-md" placeholder={t('yourName')} value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} onFocus={handleInputFocus} />
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-1.5">
          <div className="bg-white p-2 rounded-lg shadow-sm text-center">
            <label className="text-[8px] font-bold text-gray-400 uppercase block mb-0.5">{t('age')}</label>
            <input type="text" inputMode="numeric" pattern="[0-9]*" className="w-full bg-transparent outline-none font-bold text-center text-base text-gray-900 focus:ring-2 focus:ring-[#E07A5F]/30 rounded-md" value={ageStr} onChange={(e) => setAgeStr(e.target.value.replace(/[^0-9]/g, ''))} onBlur={() => syncNumericField('age', ageStr)} onFocus={handleInputFocus} />
          </div>
          <div className="bg-white p-2 rounded-lg shadow-sm text-center">
            <label className="text-[8px] font-bold text-gray-400 uppercase block mb-0.5">{t('sex')}</label>
            <select className="w-full bg-transparent outline-none font-bold text-center text-base text-gray-900 focus:ring-2 focus:ring-[#E07A5F]/30 rounded-md" value={formData.gender} onChange={(e) => setFormData({ ...formData, gender: e.target.value as Gender })}>
              <option value={Gender.MALE}>M</option>
              <option value={Gender.FEMALE}>F</option>
            </select>
          </div>
          <div className="bg-white p-2 rounded-lg shadow-sm text-center">
            <label className="text-[8px] font-bold text-gray-400 uppercase block mb-0.5">cm</label>
            <input type="text" inputMode="numeric" pattern="[0-9]*" className="w-full bg-transparent outline-none font-bold text-center text-base text-gray-900 focus:ring-2 focus:ring-[#E07A5F]/30 rounded-md" value={heightStr} onChange={(e) => setHeightStr(e.target.value.replace(/[^0-9]/g, ''))} onBlur={() => syncNumericField('heightCm', heightStr)} onFocus={handleInputFocus} />
          </div>
          <div className="bg-white p-2 rounded-lg shadow-sm text-center">
            <label className="text-[8px] font-bold text-gray-400 uppercase block mb-0.5">kg</label>
            <input type="text" inputMode="decimal" className="w-full bg-transparent outline-none font-bold text-center text-base text-gray-900 focus:ring-2 focus:ring-[#E07A5F]/30 rounded-md" value={weightStr} onChange={(e) => setWeightStr(e.target.value.replace(/[^0-9.]/g, ''))} onBlur={() => syncNumericField('weightKg', weightStr)} onFocus={handleInputFocus} />
          </div>
        </div>

        {/* Target Weight (for goal tracking) */}
        {(formData.goal === 'LOSE' || formData.goal === 'GAIN') && (
          <div className="bg-white p-2.5 rounded-xl shadow-sm">
            <label className="text-[9px] font-bold text-gray-400 uppercase block mb-0.5">{t('targetWeight') || 'Target Weight'} (kg)</label>
            <input
              type="text"
              inputMode="decimal"
              placeholder={formData.goal === 'LOSE' ? String((Number(weightStr) || 70) - 5) : String((Number(weightStr) || 70) + 5)}
              className="w-full bg-transparent outline-none font-bold text-gray-900 text-sm"
              value={targetWeightStr}
              onChange={(e) => setTargetWeightStr(e.target.value.replace(/[^0-9.]/g, ''))}
              onBlur={() => syncNumericField('targetWeightKg', targetWeightStr)}
              onFocus={handleInputFocus}
            />
          </div>
        )}

        {/* Goal - Horizontal */}
        <div className="bg-white p-2.5 rounded-xl shadow-sm">
          <label className="text-[9px] font-bold text-gray-400 uppercase block mb-2">{t('goal')}</label>
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { val: 'LOSE', labelKey: 'lose' as const },
              { val: 'MAINTAIN', labelKey: 'maintain' as const },
              { val: 'GAIN', labelKey: 'gain' as const }
            ].map((opt) => (
              <button
                key={opt.val}
                type="button"
                onClick={() => setFormData({ ...formData, goal: opt.val as UserProfile['goal'] })}
                className={`py-2.5 px-2 rounded-lg text-center transition-all ${
                  formData.goal === opt.val
                    ? 'bg-[#E07A5F] text-white shadow-md'
                    : 'bg-gray-50 text-gray-700'
                }`}
              >
                <span className="font-bold text-xs block">{t(opt.labelKey)}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Activity Level */}
        <div className="bg-white p-2.5 rounded-xl shadow-sm">
          <label className="text-[9px] font-bold text-gray-400 uppercase block mb-2">Activity Level</label>
          <div className="grid grid-cols-2 gap-1.5">
            {[
              { val: ActivityLevel.SEDENTARY, label: 'Sedentary', desc: 'Office work' },
              { val: ActivityLevel.LIGHTLY_ACTIVE, label: 'Light', desc: '1-3x/week' },
              { val: ActivityLevel.MODERATELY_ACTIVE, label: 'Moderate', desc: '3-5x/week' },
              { val: ActivityLevel.VERY_ACTIVE, label: 'Active', desc: '6-7x/week' },
              { val: ActivityLevel.EXTRA_ACTIVE, label: 'Athlete', desc: '2x/day' },
            ].map((opt) => (
              <button
                key={opt.val}
                type="button"
                onClick={() => setFormData({ ...formData, activityLevel: opt.val })}
                className={`py-2 px-2 rounded-lg text-center transition-all ${
                  formData.activityLevel === opt.val
                    ? 'bg-[#E07A5F] text-white shadow-md'
                    : 'bg-gray-50 text-gray-700'
                }`}
              >
                <span className="font-bold text-xs block">{opt.label}</span>
                <span className={`text-[9px] ${formData.activityLevel === opt.val ? 'text-white/70' : 'text-gray-400'}`}>{opt.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Calories Row */}
        <div className="grid grid-cols-2 gap-1.5">
          <div className={`bg-white p-2.5 rounded-xl shadow-sm ${customCalStr ? 'ring-1 ring-[#E07A5F]' : ''}`}>
            <label className="text-[9px] font-bold text-gray-400 uppercase block mb-0.5">{t('targetKcal')}</label>
            <input
              type="text"
              inputMode="numeric"
              placeholder={dynamicTDEE > 0 ? String(dynamicTDEE) : t('auto')}
              className="w-full bg-transparent outline-none font-bold text-gray-900 text-sm"
              value={customCalStr}
              onChange={(e) => setCustomCalStr(e.target.value.replace(/[^0-9]/g, ''))}
              onBlur={() => syncNumericField('customCalories', customCalStr)}
              onFocus={handleInputFocus}
            />
          </div>
          <button
            type="button"
            className={`p-2.5 rounded-xl shadow-sm flex items-center justify-between ${formData.ignoreWorkoutCalories ? 'bg-green-50' : 'bg-white'}`}
            onClick={() => setFormData({ ...formData, ignoreWorkoutCalories: !formData.ignoreWorkoutCalories })}
          >
            <div>
              <label className="text-[9px] font-bold text-gray-400 uppercase block">{t('burnedCal')}</label>
              <span className="text-xs font-bold text-gray-700">{formData.ignoreWorkoutCalories ? t('ignored') : t('added')}</span>
            </div>
            <Flame className={`w-5 h-5 ${formData.ignoreWorkoutCalories ? 'text-green-500' : 'text-[#E07A5F]'}`} />
          </button>
        </div>

        {/* Calculated TDEE Display */}
        {dynamicTDEE > 0 && !customCalStr && (
          <div className="bg-gradient-to-r from-[#E07A5F]/10 to-[#C85A40]/10 p-3 rounded-xl flex items-center justify-between">
            <span className="text-xs text-gray-600 font-medium">{t('targetKcal')}</span>
            <span className="text-lg font-black text-[#E07A5F]">{dynamicTDEE} kcal</span>
          </div>
        )}

        {/* Pace - only for LOSE / GAIN */}
        {(formData.goal === 'LOSE' || formData.goal === 'GAIN') && (
          <div className="bg-white p-2.5 rounded-xl shadow-sm">
            <label className="text-[9px] font-bold text-gray-400 uppercase block mb-2">
              Weekly pace · kg/week
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {[0.25, 0.5, 0.75, 1].map((rate) => (
                <button
                  key={rate}
                  type="button"
                  onClick={() => setFormData({ ...formData, weeklyWeightChangeKg: rate })}
                  className={`py-2 rounded-lg text-center text-xs font-bold transition-all ${
                    Math.abs((formData.weeklyWeightChangeKg ?? 0.5) - rate) < 0.001
                      ? 'bg-[#E07A5F] text-white shadow-md'
                      : 'bg-gray-50 text-gray-700'
                  }`}
                >
                  {rate.toString().replace('.', ',')}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Macro split */}
        <div className="bg-white p-2.5 rounded-xl shadow-sm">
          <label className="text-[9px] font-bold text-gray-400 uppercase block mb-2">Macro split</label>
          <div className="grid grid-cols-2 gap-1.5">
            {[
              { val: 'BALANCED' as MacroPreset,     label: 'Balanced',  pct: '30/40/30' },
              { val: 'HIGH_PROTEIN' as MacroPreset, label: 'High Protein', pct: '40/35/25' },
              { val: 'LOW_CARB' as MacroPreset,     label: 'Low carb',  pct: '35/25/40' },
              { val: 'KETO' as MacroPreset,         label: 'Keto',      pct: '25/5/70' },
              // Show the wizard-made custom split as a selectable option, so a
              // CUSTOM profile is visible here (previously nothing highlighted)
              // and tapping a preset isn't a one-way door out of it.
              ...(existingProfile?.macroPreset === 'CUSTOM' && existingProfile.macroTargets
                ? [{
                    val: 'CUSTOM' as MacroPreset,
                    label: 'Custom',
                    pct: `${existingProfile.macroTargets.proteinPct}/${existingProfile.macroTargets.carbsPct}/${existingProfile.macroTargets.fatPct}`,
                  }]
                : []),
            ].map((opt) => (
              <button
                key={opt.val}
                type="button"
                onClick={() => setFormData({ ...formData, macroPreset: opt.val })}
                className={`py-2 px-2 rounded-lg text-center transition-all ${
                  formData.macroPreset === opt.val
                    ? 'bg-[#E07A5F] text-white shadow-md'
                    : 'bg-gray-50 text-gray-700'
                }`}
              >
                <span className="font-bold text-xs block">{opt.label}</span>
                <span className={`text-[9px] ${formData.macroPreset === opt.val ? 'text-white/70' : 'text-gray-400'}`}>{opt.pct}</span>
              </button>
            ))}
          </div>
          {macroGrams && (
            <div className="grid grid-cols-3 gap-2 mt-2.5 text-center">
              <div><span className="text-[14px] font-black text-emerald-600 tabular-nums">{macroGrams.protein}g</span><br/><span className="text-[8px] font-bold text-gray-400 uppercase">Protein</span></div>
              <div><span className="text-[14px] font-black text-amber-600 tabular-nums">{macroGrams.carbs}g</span><br/><span className="text-[8px] font-bold text-gray-400 uppercase">Carbs</span></div>
              <div><span className="text-[14px] font-black text-rose-600 tabular-nums">{macroGrams.fat}g</span><br/><span className="text-[8px] font-bold text-gray-400 uppercase">Fat</span></div>
            </div>
          )}
        </div>

        {/* Re-run wizard */}
        <button
          type="button"
          onClick={() => setShowWizard(true)}
          className="w-full bg-white p-3 rounded-xl shadow-sm flex items-center justify-center gap-2 text-sm font-bold text-[#E07A5F] active:scale-[0.98] transition-smooth"
        >
          <Sliders className="w-4 h-4" /> Re-run setup wizard
        </button>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Validation error */}
        {error && (
          <div className="bg-red-50 border border-red-100 text-red-600 text-sm font-medium px-4 py-3 rounded-xl flex items-center gap-2">
            <X className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}

        {/* Save */}
        <button type="submit" className="w-full bg-[#E07A5F] text-white font-bold py-3 rounded-xl shadow-lg flex items-center justify-center gap-2">
          <Check className="w-4 h-4" /> {t('saveProfile')}
        </button>
      </form>

      {/* Help Modal */}
      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-[#E07A5F] to-[#C85A40] p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-white" />
                <h3 className="font-bold text-white text-sm">{t('yourProfile')}</h3>
              </div>
              <button onClick={() => setShowHelp(false)} className="p-1 hover:bg-white/20 rounded-lg">
                <X className="w-4 h-4 text-white" />
              </button>
            </div>
            <div className="p-4 space-y-3 text-sm text-gray-600">
              <div className="flex items-start gap-3">
                <span className="w-5 h-5 bg-[#E07A5F]/10 rounded-full flex items-center justify-center shrink-0 text-[#E07A5F] font-bold text-[10px]">1</span>
                <p className="text-xs"><strong>{t('basicInfo')}</strong></p>
              </div>
              <div className="flex items-start gap-3">
                <span className="w-5 h-5 bg-[#E07A5F]/10 rounded-full flex items-center justify-center shrink-0 text-[#E07A5F] font-bold text-[10px]">2</span>
                <p className="text-xs"><strong>{t('goal')}</strong> - {t('lose')}, {t('maintain')}, {t('gain')}</p>
              </div>
              <div className="flex items-start gap-3">
                <span className="w-5 h-5 bg-[#E07A5F]/10 rounded-full flex items-center justify-center shrink-0 text-[#E07A5F] font-bold text-[10px]">3</span>
                <p className="text-xs"><strong>{t('targetKcal')}</strong> - {t('overrideCalories')}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3 mt-2">
                <p className="text-xs text-gray-500">{t('allDataLocal')}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Profile;

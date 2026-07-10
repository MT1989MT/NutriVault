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

const PRESET_LABELS: Record<MacroPreset, string> = {
  BALANCED: 'Balanced',
  HIGH_PROTEIN: 'High Protein',
  LOW_CARB: 'Low Carb',
  KETO: 'Keto',
  CUSTOM: 'Custom',
};

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

  const goalWord = formData.goal === 'LOSE' ? 'lose' : formData.goal === 'GAIN' ? 'gain' : 'maintain';
  const goalSummary = (formData.goal === 'LOSE' || formData.goal === 'GAIN')
    ? `Goal: ${goalWord} · ${formData.weeklyWeightChangeKg ?? 0.5} kg per week`
    : 'Goal: maintain weight';
  const displayCalories = Number(customCalStr) || dynamicTDEE;
  const presetLabel = PRESET_LABELS[formData.macroPreset || 'BALANCED'];
  const presetPct = `${targetMacros.proteinPct}/${targetMacros.carbsPct}/${targetMacros.fatPct}`;

  return (
    <div className="h-full flex flex-col bg-[#FAF6F1]">
      {/* Header — transparent on app bg */}
      <div className="px-5 pb-3" style={{ paddingTop: 'max(env(safe-area-inset-top, 14px), 14px)' }}>
        <div className="flex items-center justify-between">
          <h1 className="text-[24px] font-bold text-[#2B2523] font-display tracking-tight">{t('profile')}</h1>
          <button
            onClick={() => setShowHelp(true)}
            aria-label="Help"
            className="w-[42px] h-[42px] bg-white rounded-full card-shadow flex items-center justify-center active:scale-90 transition-smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E07A5F] focus-visible:ring-offset-2"
          >
            <HelpCircle className="w-[18px] h-[18px] text-[#9A8B80]" />
          </button>
        </div>
      </div>

      {/* Form */}
      <form ref={formRef} onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 space-y-3" style={{ paddingBottom: 'calc(260px + env(safe-area-inset-bottom, 0px))' }}>
        {/* Identity card */}
        <div className="bg-white rounded-[24px] card-shadow p-4 flex items-center gap-3">
          <div className="w-[60px] h-[60px] rounded-full bg-[#FBEBE4] flex items-center justify-center shrink-0">
            <User className="w-6 h-6 text-[#E07A5F]" />
          </div>
          <div className="flex-1 min-w-0">
            <input
              type="text"
              className="w-full bg-transparent outline-none text-[18px] font-bold font-display tracking-tight text-[#2B2523] placeholder:text-[#B4A79C] focus:ring-2 focus:ring-[#E07A5F]/30 rounded-md"
              placeholder={t('yourName')}
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              onFocus={handleInputFocus}
            />
            <p className="text-[12px] text-[#9A8B80] mt-0.5 truncate">{goalSummary}</p>
          </div>
          <button
            type="button"
            onClick={() => setShowWizard(true)}
            className="shrink-0 flex items-center gap-1 bg-[#FBEBE4] text-[#C85A40] text-[12px] font-bold rounded-full px-3 py-1.5 active:scale-95 transition-smooth"
          >
            <Sliders className="w-3 h-3" /> Wizard
          </button>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-4 gap-2">
          <div className="bg-white rounded-[16px] card-shadow p-3 text-center">
            <label className="text-[9px] font-semibold text-[#B4A79C] uppercase block mb-0.5">{t('age')}</label>
            <input type="text" inputMode="numeric" pattern="[0-9]*" className="w-full bg-transparent outline-none font-display font-bold text-center text-[16px] text-[#2B2523] focus:ring-2 focus:ring-[#E07A5F]/30 rounded-md" value={ageStr} onChange={(e) => setAgeStr(e.target.value.replace(/[^0-9]/g, ''))} onBlur={() => syncNumericField('age', ageStr)} onFocus={handleInputFocus} />
          </div>
          <div className="bg-white rounded-[16px] card-shadow p-3 text-center">
            <label className="text-[9px] font-semibold text-[#B4A79C] uppercase block mb-0.5">{t('sex')}</label>
            <select className="w-full bg-transparent outline-none font-display font-bold text-center text-[16px] text-[#2B2523] focus:ring-2 focus:ring-[#E07A5F]/30 rounded-md" value={formData.gender} onChange={(e) => setFormData({ ...formData, gender: e.target.value as Gender })}>
              <option value={Gender.MALE}>M</option>
              <option value={Gender.FEMALE}>F</option>
            </select>
          </div>
          <div className="bg-white rounded-[16px] card-shadow p-3 text-center">
            <label className="text-[9px] font-semibold text-[#B4A79C] uppercase block mb-0.5">Height</label>
            <input type="text" inputMode="numeric" pattern="[0-9]*" className="w-full bg-transparent outline-none font-display font-bold text-center text-[16px] text-[#2B2523] focus:ring-2 focus:ring-[#E07A5F]/30 rounded-md" value={heightStr} onChange={(e) => setHeightStr(e.target.value.replace(/[^0-9]/g, ''))} onBlur={() => syncNumericField('heightCm', heightStr)} onFocus={handleInputFocus} />
          </div>
          <div className="bg-white rounded-[16px] card-shadow p-3 text-center">
            <label className="text-[9px] font-semibold text-[#B4A79C] uppercase block mb-0.5">Weight</label>
            <input type="text" inputMode="decimal" className="w-full bg-transparent outline-none font-display font-bold text-center text-[16px] text-[#2B2523] focus:ring-2 focus:ring-[#E07A5F]/30 rounded-md" value={weightStr} onChange={(e) => setWeightStr(e.target.value.replace(/[^0-9.]/g, ''))} onBlur={() => syncNumericField('weightKg', weightStr)} onFocus={handleInputFocus} />
          </div>
        </div>

        {/* Goal card */}
        <div className="bg-white rounded-[20px] card-shadow p-4">
          <label className="text-[10px] font-semibold text-[#9A8B80] uppercase block mb-2">{t('goal')}</label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { val: 'LOSE', labelKey: 'lose' as const },
              { val: 'MAINTAIN', labelKey: 'maintain' as const },
              { val: 'GAIN', labelKey: 'gain' as const }
            ].map((opt) => (
              <button
                key={opt.val}
                type="button"
                onClick={() => setFormData({ ...formData, goal: opt.val as UserProfile['goal'] })}
                className={`py-2.5 px-2 rounded-[14px] text-center transition-smooth active:scale-95 ${
                  formData.goal === opt.val
                    ? 'bg-[#E07A5F] text-white terra-shadow'
                    : 'bg-[#FAF6F1] text-[#6B6257]'
                }`}
              >
                <span className="font-bold text-xs block">{t(opt.labelKey)}</span>
              </button>
            ))}
          </div>

          {/* Target weight + pace — only for LOSE / GAIN */}
          {(formData.goal === 'LOSE' || formData.goal === 'GAIN') && (
            <div className="border-t border-[#F3EAE2] mt-3 pt-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <label className="text-[12px] text-[#9A8B80] font-medium shrink-0">Target weight (kg)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder={formData.goal === 'LOSE' ? String((Number(weightStr) || 70) - 5) : String((Number(weightStr) || 70) + 5)}
                  className="w-24 bg-transparent outline-none font-display font-bold text-[#2B2523] text-right text-[15px] placeholder:text-[#B4A79C] focus:ring-2 focus:ring-[#E07A5F]/30 rounded-md"
                  value={targetWeightStr}
                  onChange={(e) => setTargetWeightStr(e.target.value.replace(/[^0-9.]/g, ''))}
                  onBlur={() => syncNumericField('targetWeightKg', targetWeightStr)}
                  onFocus={handleInputFocus}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <label className="text-[12px] text-[#9A8B80] font-medium shrink-0">Pace · kg/week</label>
                <div className="flex gap-1.5">
                  {[0.25, 0.5, 0.75, 1].map((rate) => (
                    <button
                      key={rate}
                      type="button"
                      onClick={() => setFormData({ ...formData, weeklyWeightChangeKg: rate })}
                      className={`px-2.5 py-1.5 rounded-full text-[11px] font-bold transition-smooth active:scale-95 tabular-nums ${
                        Math.abs((formData.weeklyWeightChangeKg ?? 0.5) - rate) < 0.001
                          ? 'bg-[#E07A5F] text-white terra-shadow'
                          : 'bg-[#FAF6F1] text-[#6B6257]'
                      }`}
                    >
                      {rate === 1 ? '1.0' : String(rate)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Activity level card */}
        <div className="bg-white rounded-[20px] card-shadow p-4">
          <label className="text-[10px] font-semibold text-[#9A8B80] uppercase block mb-2">Activity level</label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { val: ActivityLevel.SEDENTARY, label: 'Sedentary', desc: 'Office work' },
              { val: ActivityLevel.LIGHTLY_ACTIVE, label: 'Light', desc: '1-3x/week' },
              { val: ActivityLevel.MODERATELY_ACTIVE, label: 'Moderate', desc: '3-5x/week' },
            ].map((opt) => (
              <button
                key={opt.val}
                type="button"
                onClick={() => setFormData({ ...formData, activityLevel: opt.val })}
                className={`py-2 px-1 rounded-[12px] text-center transition-smooth active:scale-95 ${
                  formData.activityLevel === opt.val
                    ? 'bg-[#3D5A48] text-white'
                    : 'bg-[#FAF6F1] text-[#6B6257]'
                }`}
              >
                <span className="font-bold text-xs block">{opt.label}</span>
                <span className={`text-[9px] ${formData.activityLevel === opt.val ? 'text-white/70' : 'text-[#9A8B80]'}`}>{opt.desc}</span>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {[
              { val: ActivityLevel.VERY_ACTIVE, label: 'Active', desc: '6-7x/week' },
              { val: ActivityLevel.EXTRA_ACTIVE, label: 'Athlete', desc: '2x/day' },
            ].map((opt) => (
              <button
                key={opt.val}
                type="button"
                onClick={() => setFormData({ ...formData, activityLevel: opt.val })}
                className={`py-2 px-1 rounded-[12px] text-center transition-smooth active:scale-95 ${
                  formData.activityLevel === opt.val
                    ? 'bg-[#3D5A48] text-white'
                    : 'bg-[#FAF6F1] text-[#6B6257]'
                }`}
              >
                <span className="font-bold text-xs block">{opt.label}</span>
                <span className={`text-[9px] ${formData.activityLevel === opt.val ? 'text-white/70' : 'text-[#9A8B80]'}`}>{opt.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Daily target summary */}
        <div className="bg-[#2B2523] rounded-[20px] card-shadow p-4 flex items-center justify-between gap-3">
          <div>
            <span className="text-[11px] font-semibold text-white/60 uppercase block">Daily goal</span>
            <span className="text-[24px] font-extrabold font-display tracking-tight text-white tabular-nums">
              {displayCalories > 0 ? `${Math.round(displayCalories)} kcal` : '—'}
            </span>
          </div>
          <div className="text-right">
            <span className="text-[11px] font-semibold text-white/60 uppercase block">Macro split</span>
            <span className="text-[13px] font-bold text-white">{presetLabel} · {presetPct}</span>
          </div>
        </div>

        {/* Calories row: custom override + burned calories toggle */}
        <div className="grid grid-cols-2 gap-2">
          <div className={`bg-white rounded-[16px] card-shadow p-3 ${customCalStr ? 'ring-1 ring-[#E07A5F]' : ''}`}>
            <label className="text-[9px] font-semibold text-[#9A8B80] uppercase block mb-0.5">{t('targetKcal')}</label>
            <input
              type="text"
              inputMode="numeric"
              placeholder={dynamicTDEE > 0 ? String(dynamicTDEE) : t('auto')}
              className="w-full bg-transparent outline-none font-display font-bold text-[#2B2523] text-sm placeholder:text-[#B4A79C] focus:ring-2 focus:ring-[#E07A5F]/30 rounded-md"
              value={customCalStr}
              onChange={(e) => setCustomCalStr(e.target.value.replace(/[^0-9]/g, ''))}
              onBlur={() => syncNumericField('customCalories', customCalStr)}
              onFocus={handleInputFocus}
            />
          </div>
          <button
            type="button"
            className={`rounded-[16px] card-shadow p-3 flex items-center justify-between transition-smooth active:scale-95 ${formData.ignoreWorkoutCalories ? 'bg-[#EFF2EE]' : 'bg-white'}`}
            onClick={() => setFormData({ ...formData, ignoreWorkoutCalories: !formData.ignoreWorkoutCalories })}
          >
            <div className="text-left">
              <label className="text-[9px] font-semibold text-[#9A8B80] uppercase block">{t('burnedCal')}</label>
              <span className="text-xs font-bold text-[#6B6257]">{formData.ignoreWorkoutCalories ? t('ignored') : t('added')}</span>
            </div>
            <Flame className={`w-5 h-5 ${formData.ignoreWorkoutCalories ? 'text-[#3D5A48]' : 'text-[#E07A5F]'}`} />
          </button>
        </div>

        {/* Macro split */}
        <div className="bg-white rounded-[20px] card-shadow p-4">
          <label className="text-[10px] font-semibold text-[#9A8B80] uppercase block mb-2">Macro split</label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { val: 'BALANCED' as MacroPreset,     label: 'Balanced',  pct: '30/40/30' },
              { val: 'HIGH_PROTEIN' as MacroPreset, label: 'High Protein', pct: '40/35/25' },
              { val: 'LOW_CARB' as MacroPreset,     label: 'Low Carb',  pct: '35/25/40' },
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
                className={`py-2 px-2 rounded-[14px] text-center transition-smooth active:scale-95 ${
                  formData.macroPreset === opt.val
                    ? 'bg-[#E07A5F] text-white terra-shadow'
                    : 'bg-[#FAF6F1] text-[#6B6257]'
                }`}
              >
                <span className="font-bold text-xs block">{opt.label}</span>
                <span className={`text-[9px] ${formData.macroPreset === opt.val ? 'text-white/70' : 'text-[#9A8B80]'}`}>{opt.pct}</span>
              </button>
            ))}
          </div>
          {macroGrams && (
            <div className="grid grid-cols-3 gap-2 mt-3">
              <div className="bg-[#EFF2EE] rounded-[16px] p-3 text-center">
                <span className="text-[16px] font-extrabold font-display text-[#3D5A48] tabular-nums block">{macroGrams.protein}g</span>
                <span className="text-[9px] font-semibold text-[#9A8B80] uppercase">Protein</span>
              </div>
              <div className="bg-[#F6ECE2] rounded-[16px] p-3 text-center">
                <span className="text-[16px] font-extrabold font-display text-[#C4763B] tabular-nums block">{macroGrams.carbs}g</span>
                <span className="text-[9px] font-semibold text-[#9A8B80] uppercase">Carbs</span>
              </div>
              <div className="bg-[#FBEBE4] rounded-[16px] p-3 text-center">
                <span className="text-[16px] font-extrabold font-display text-[#C85A40] tabular-nums block">{macroGrams.fat}g</span>
                <span className="text-[9px] font-semibold text-[#9A8B80] uppercase">Fat</span>
              </div>
            </div>
          )}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Validation error */}
        {error && (
          <div className="bg-red-50 border border-red-100 text-red-600 text-sm font-medium px-4 py-3 rounded-[16px] flex items-center gap-2">
            <X className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}

        {/* Save */}
        <button type="submit" className="w-full bg-[#E07A5F] text-white font-display font-bold text-[15px] py-4 rounded-[18px] terra-shadow flex items-center justify-center gap-2 active:scale-95 transition-smooth">
          <Check className="w-4 h-4" /> {t('saveProfile')}
        </button>
      </form>

      {/* Help Modal */}
      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-[24px] card-shadow overflow-hidden">
            <div className="p-4 pb-0 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-[#FBEBE4] rounded-full flex items-center justify-center">
                  <User className="w-4 h-4 text-[#E07A5F]" />
                </div>
                <h3 className="font-display font-bold text-[#2B2523] text-[15px] tracking-tight">{t('yourProfile')}</h3>
              </div>
              <button onClick={() => setShowHelp(false)} aria-label="Close" className="w-8 h-8 rounded-full bg-[#FAF6F1] flex items-center justify-center active:scale-90 transition-smooth">
                <X className="w-4 h-4 text-[#9A8B80]" />
              </button>
            </div>
            <div className="p-4 space-y-3 text-sm text-[#6B6257]">
              <div className="flex items-start gap-3">
                <span className="w-5 h-5 bg-[#FBEBE4] rounded-full flex items-center justify-center shrink-0 text-[#C85A40] font-bold text-[10px]">1</span>
                <p className="text-xs"><strong>{t('basicInfo')}</strong></p>
              </div>
              <div className="flex items-start gap-3">
                <span className="w-5 h-5 bg-[#FBEBE4] rounded-full flex items-center justify-center shrink-0 text-[#C85A40] font-bold text-[10px]">2</span>
                <p className="text-xs"><strong>{t('goal')}</strong> - {t('lose')}, {t('maintain')}, {t('gain')}</p>
              </div>
              <div className="flex items-start gap-3">
                <span className="w-5 h-5 bg-[#FBEBE4] rounded-full flex items-center justify-center shrink-0 text-[#C85A40] font-bold text-[10px]">3</span>
                <p className="text-xs"><strong>{t('targetKcal')}</strong> - {t('overrideCalories')}</p>
              </div>
              <div className="bg-[#FAF6F1] rounded-[14px] p-3">
                <p className="text-xs text-[#9A8B80]">{t('allDataLocal')}</p>
              </div>
              <button
                onClick={() => setShowHelp(false)}
                className="w-full bg-[#E07A5F] text-white font-display font-bold text-sm py-3 rounded-[14px] terra-shadow active:scale-95 transition-smooth"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Profile;

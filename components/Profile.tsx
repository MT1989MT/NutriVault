import React, { useState, useMemo } from 'react';
import { ActivityLevel, Gender, UserProfile } from '../types';
import { calculateBMR, calculateTDEE } from '../utils/calculations';
import { User, Flame, X, Check, HelpCircle } from 'lucide-react';
import { t } from '../utils/i18n';

interface ProfileProps {
  existingProfile: UserProfile | null;
  onSave: (profile: UserProfile) => void;
  onCancel?: () => void;
}

const Profile: React.FC<ProfileProps> = ({ existingProfile, onSave, onCancel }) => {
  const [formData, setFormData] = useState<Partial<UserProfile>>(existingProfile || {
    name: '', age: undefined, heightCm: undefined, weightKg: undefined, gender: Gender.MALE,
    activityLevel: ActivityLevel.SEDENTARY, goal: 'MAINTAIN', customCalories: undefined,
    quickLog: false, ignoreWorkoutCalories: true, mentalConditions: [], habits: [], dietaryPreferences: []
  });

  const [showHelp, setShowHelp] = useState(false);

  const dynamicTDEE = useMemo(() => {
    if (formData.weightKg && formData.heightCm && formData.age) {
      const bmr = calculateBMR(Number(formData.weightKg), Number(formData.heightCm), Number(formData.age), formData.gender || Gender.MALE);
      return calculateTDEE(bmr, formData.activityLevel || ActivityLevel.SEDENTARY, formData.goal || 'MAINTAIN');
    }
    return 0;
  }, [formData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.weightKg && formData.heightCm && formData.age) {
      const bmr = calculateBMR(Number(formData.weightKg), Number(formData.heightCm), Number(formData.age), formData.gender || Gender.MALE);
      onSave({ ...formData, tdee: calculateTDEE(bmr, formData.activityLevel!, formData.goal!) } as UserProfile);
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#FAFAF8]">
      {/* Header */}
      <div className="bg-white border-b border-gray-100/80 px-4 pb-2.5" style={{paddingTop: 'max(env(safe-area-inset-top, 12px), 12px)'}}>
        <div className="flex items-center justify-between">
          <button onClick={() => setShowHelp(true)} className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center active:scale-95 transition-transform">
            <HelpCircle className="w-[18px] h-[18px] text-gray-400" />
          </button>
          <span className="text-[20px] font-extrabold text-gray-900 font-display tracking-tight">{t('profile')}</span>
          <div className="w-10" />
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-4 pt-3 space-y-3" style={{ paddingBottom: 'calc(90px + env(safe-area-inset-bottom, 0px))' }}>
        {/* Name */}
        <div className="bg-white p-2.5 rounded-xl shadow-sm">
          <label className="text-[9px] font-bold text-gray-400 uppercase block mb-0.5">{t('nickname')}</label>
          <input type="text" className="w-full bg-transparent outline-none font-bold text-gray-900 text-sm" placeholder={t('yourName')} value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-1.5">
          <div className="bg-white p-2 rounded-lg shadow-sm text-center">
            <label className="text-[8px] font-bold text-gray-400 uppercase block mb-0.5">{t('age')}</label>
            <input type="number" inputMode="numeric" pattern="[0-9]*" className="w-full bg-transparent outline-none font-bold text-center text-base text-gray-900" value={formData.age || ''} onChange={(e) => setFormData({ ...formData, age: Number(e.target.value) })} />
          </div>
          <div className="bg-white p-2 rounded-lg shadow-sm text-center">
            <label className="text-[8px] font-bold text-gray-400 uppercase block mb-0.5">{t('sex')}</label>
            <select className="w-full bg-transparent outline-none font-bold text-center text-base text-gray-900" value={formData.gender} onChange={(e) => setFormData({ ...formData, gender: e.target.value as Gender })}>
              <option value={Gender.MALE}>M</option>
              <option value={Gender.FEMALE}>F</option>
            </select>
          </div>
          <div className="bg-white p-2 rounded-lg shadow-sm text-center">
            <label className="text-[8px] font-bold text-gray-400 uppercase block mb-0.5">cm</label>
            <input type="number" inputMode="numeric" pattern="[0-9]*" className="w-full bg-transparent outline-none font-bold text-center text-base text-gray-900" value={formData.heightCm || ''} onChange={(e) => setFormData({ ...formData, heightCm: Number(e.target.value) })} />
          </div>
          <div className="bg-white p-2 rounded-lg shadow-sm text-center">
            <label className="text-[8px] font-bold text-gray-400 uppercase block mb-0.5">kg</label>
            <input type="number" inputMode="decimal" className="w-full bg-transparent outline-none font-bold text-center text-base text-gray-900" value={formData.weightKg || ''} onChange={(e) => setFormData({ ...formData, weightKg: Number(e.target.value) })} />
          </div>
        </div>

        {/* Target Weight (for goal tracking) */}
        {(formData.goal === 'LOSE' || formData.goal === 'GAIN') && (
          <div className="bg-white p-2.5 rounded-xl shadow-sm">
            <label className="text-[9px] font-bold text-gray-400 uppercase block mb-0.5">{t('targetWeight') || 'Target Weight'} (kg)</label>
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              placeholder={formData.goal === 'LOSE' ? String((formData.weightKg || 70) - 5) : String((formData.weightKg || 70) + 5)}
              className="w-full bg-transparent outline-none font-bold text-gray-900 text-sm"
              value={formData.targetWeightKg || ''}
              onChange={(e) => setFormData({ ...formData, targetWeightKg: Number(e.target.value) || undefined })}
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
          <div className={`bg-white p-2.5 rounded-xl shadow-sm ${formData.customCalories ? 'ring-1 ring-[#E07A5F]' : ''}`}>
            <label className="text-[9px] font-bold text-gray-400 uppercase block mb-0.5">{t('targetKcal')}</label>
            <input
              type="number"
              placeholder={dynamicTDEE > 0 ? String(dynamicTDEE) : t('auto')}
              className="w-full bg-transparent outline-none font-bold text-gray-900 text-sm"
              value={formData.customCalories || ''}
              onChange={(e) => setFormData({ ...formData, customCalories: Number(e.target.value) || undefined })}
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
        {dynamicTDEE > 0 && !formData.customCalories && (
          <div className="bg-gradient-to-r from-[#E07A5F]/10 to-[#C85A40]/10 p-3 rounded-xl flex items-center justify-between">
            <span className="text-xs text-gray-600 font-medium">{t('targetKcal')}</span>
            <span className="text-lg font-black text-[#E07A5F]">{dynamicTDEE} kcal</span>
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1" />

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

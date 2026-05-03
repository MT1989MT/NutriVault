
import { ActivityLevel, Gender, MacroPreset, MacroTargets, UserProfile } from '../types';

// 1 kg body fat ≈ 7700 kcal
export const KCAL_PER_KG = 7700;

// Floors so we never produce dangerous targets. MFP uses ~1200 (women) and ~1500 (men).
export const MIN_KCAL_FEMALE = 1200;
export const MIN_KCAL_MALE = 1500;

export const generateId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try { return crypto.randomUUID(); } catch (e) {}
  }
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
};

export const calculateBMR = (weight: number, height: number, age: number, gender: Gender): number => {
  let bmr = 10 * weight + 6.25 * height - 5 * age;
  if (gender === Gender.MALE) bmr += 5;
  else bmr -= 161;
  return bmr;
};

export const getActivityMultiplier = (activity: ActivityLevel): number => {
  switch (activity) {
    case ActivityLevel.SEDENTARY: return 1.2;
    case ActivityLevel.LIGHTLY_ACTIVE: return 1.375;
    case ActivityLevel.MODERATELY_ACTIVE: return 1.55;
    case ActivityLevel.VERY_ACTIVE: return 1.725;
    case ActivityLevel.EXTRA_ACTIVE: return 1.9;
    default: return 1.2;
  }
};

export const calculateMaintenance = (bmr: number, activity: ActivityLevel): number => {
  return Math.round(bmr * getActivityMultiplier(activity));
};

/**
 * Calculate daily calorie target.
 * If `weeklyWeightChangeKg` is provided it overrides the legacy fixed ±500 kcal default.
 * The value is signed via `goal`: LOSE subtracts, GAIN adds, MAINTAIN/FIT keeps maintenance.
 */
export const calculateTDEE = (
  bmr: number,
  activity: ActivityLevel,
  goal: UserProfile['goal'],
  weeklyWeightChangeKg?: number,
  gender?: Gender,
): number => {
  const maintenance = calculateMaintenance(bmr, activity);

  let dailyDelta = 0;
  if (goal === 'LOSE' || goal === 'GAIN') {
    const rate = typeof weeklyWeightChangeKg === 'number' && weeklyWeightChangeKg > 0
      ? weeklyWeightChangeKg
      : 0.5; // sensible default: 0.5 kg/week
    dailyDelta = Math.round((rate * KCAL_PER_KG) / 7);
  }

  let target = maintenance + (goal === 'LOSE' ? -dailyDelta : goal === 'GAIN' ? dailyDelta : 0);

  // Apply minimum healthy floor for cuts
  if (goal === 'LOSE') {
    const floor = gender === Gender.MALE ? MIN_KCAL_MALE : MIN_KCAL_FEMALE;
    if (target < floor) target = floor;
  }
  return Math.round(target);
};

export const MACRO_PRESETS: Record<Exclude<MacroPreset, 'CUSTOM'>, MacroTargets> = {
  BALANCED:      { proteinPct: 30, carbsPct: 40, fatPct: 30 },
  HIGH_PROTEIN:  { proteinPct: 40, carbsPct: 35, fatPct: 25 },
  LOW_CARB:      { proteinPct: 35, carbsPct: 25, fatPct: 40 },
  KETO:          { proteinPct: 25, carbsPct: 5,  fatPct: 70 },
};

export const getMacroTargets = (profile: Pick<UserProfile, 'macroPreset' | 'macroTargets'>): MacroTargets => {
  if (profile.macroPreset === 'CUSTOM' && profile.macroTargets) return profile.macroTargets;
  if (profile.macroPreset && profile.macroPreset !== 'CUSTOM') return MACRO_PRESETS[profile.macroPreset];
  return MACRO_PRESETS.BALANCED;
};

/**
 * Convert macro percentages + total kcal into target grams.
 * Protein/Carbs = 4 kcal/g, Fat = 9 kcal/g.
 */
export const macroGramsFromTargets = (kcal: number, targets: MacroTargets) => ({
  protein: Math.round((kcal * targets.proteinPct / 100) / 4),
  carbs:   Math.round((kcal * targets.carbsPct   / 100) / 4),
  fat:     Math.round((kcal * targets.fatPct     / 100) / 9),
});

export const calculateStreak = (logs: Record<string, { items?: any[] }>): number => {
  let count = 0;
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const checkDate = new Date(today);
    checkDate.setDate(today.getDate() - i);
    const dateStr = checkDate.toISOString().split('T')[0];
    if (logs[dateStr] && logs[dateStr].items && logs[dateStr].items.length > 0) {
      count++;
    } else if (i > 0) break;
  }
  return count;
};

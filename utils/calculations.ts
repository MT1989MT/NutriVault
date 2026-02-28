
import { ActivityLevel, Gender, UserProfile } from '../types';

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

export const calculateTDEE = (bmr: number, activity: ActivityLevel, goal: UserProfile['goal']): number => {
  let multiplier = 1.2;
  switch (activity) {
    case ActivityLevel.SEDENTARY: multiplier = 1.2; break;
    case ActivityLevel.LIGHTLY_ACTIVE: multiplier = 1.375; break;
    case ActivityLevel.MODERATELY_ACTIVE: multiplier = 1.55; break;
    case ActivityLevel.VERY_ACTIVE: multiplier = 1.725; break;
    case ActivityLevel.EXTRA_ACTIVE: multiplier = 1.9; break;
  }
  const maintenance = bmr * multiplier;
  switch (goal) {
    case 'LOSE': return Math.round(maintenance - 500);
    case 'GAIN': return Math.round(maintenance + 500);
    default: return Math.round(maintenance);
  }
};

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

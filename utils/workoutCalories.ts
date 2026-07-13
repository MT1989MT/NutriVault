import { WorkoutLog } from '../types';

// MET-based calorie estimation (the same method fitness apps and trackers
// use): kcal/min = MET × 3.5 × weightKg / 200. Activity METs from the
// Compendium of Physical Activities, matched on Dutch + English keywords.

interface Activity {
  keywords: string[];
  met: number;
}

const ACTIVITIES: Activity[] = [
  { keywords: ['hardlopen', 'rennen', 'running', 'run', 'jog', 'joggen', 'sprint'], met: 9.8 },
  { keywords: ['hiit', 'interval', 'crossfit', 'bootcamp', 'circuit'], met: 8.5 },
  { keywords: ['voetbal', 'football', 'soccer', 'basketbal', 'basketball', 'hockey', 'squash', 'padel'], met: 8 },
  { keywords: ['zwemmen', 'swimming', 'swim', 'baantjes'], met: 7 },
  { keywords: ['fietsen', 'wielrennen', 'cycling', 'bike', 'biking', 'spinning', 'spin'], met: 7.5 },
  { keywords: ['roeien', 'rowing', 'row'], met: 7 },
  { keywords: ['tennis', 'badminton', 'volleybal', 'volleyball'], met: 6.5 },
  { keywords: ['boksen', 'boxing', 'kickboks', 'kickboxing', 'mma', 'vechtsport', 'martial'], met: 7.8 },
  { keywords: ['dansen', 'dancing', 'dance', 'zumba', 'aerobics', 'aerobic'], met: 6 },
  { keywords: ['skiën', 'ski', 'snowboard', 'schaatsen', 'skating', 'skeeleren'], met: 6.5 },
  { keywords: ['klimmen', 'climbing', 'boulderen', 'bouldering'], met: 7 },
  { keywords: ['wandelen', 'lopen', 'walking', 'walk', 'hike', 'hiken', 'wandeling'], met: 3.5 },
  { keywords: ['yoga', 'pilates', 'stretchen', 'stretching', 'mobility'], met: 2.8 },
  { keywords: ['golf', 'golfen'], met: 4.3 },
  { keywords: ['paardrijden', 'horse'], met: 5.5 },
  // Strength/gym — the default bucket for generated sessions & most gym work
  { keywords: ['kracht', 'krachttraining', 'strength', 'weight', 'gewichten', 'lifting', 'gym', 'fitness', 'push', 'pull', 'leg', 'upper', 'lower', 'chest', 'back', 'arm', 'shoulder', 'squat', 'deadlift', 'bench', 'core', 'abs', 'full body', 'workout', 'training'], met: 5 },
];

const DEFAULT_MET = 5; // unknown activity → assume moderate gym work
const DEFAULT_WEIGHT_KG = 75;

const metForType = (type: string): number => {
  const lower = (type || '').toLowerCase();
  for (const a of ACTIVITIES) {
    if (a.keywords.some(k => lower.includes(k))) return a.met;
  }
  return DEFAULT_MET;
};

const INTENSITY_FACTOR: Record<NonNullable<WorkoutLog['intensity']>, number> = {
  LOW: 0.8,
  MODERATE: 1,
  HIGH: 1.2,
};

/**
 * Estimate calories burned for an activity.
 * kcal = MET × 3.5 × kg / 200 per minute, scaled by intensity.
 */
export const estimateWorkoutCalories = (
  type: string,
  durationMinutes: number,
  weightKg?: number,
  intensity: WorkoutLog['intensity'] = 'MODERATE',
): number => {
  const kg = weightKg && weightKg > 0 ? weightKg : DEFAULT_WEIGHT_KG;
  const met = metForType(type);
  const factor = INTENSITY_FACTOR[intensity || 'MODERATE'] ?? 1;
  const minutes = Math.max(0, durationMinutes || 0);
  return Math.round((met * 3.5 * kg / 200) * minutes * factor);
};

/**
 * Calories burned for a logged workout: the stored value when the workout was
 * logged with one, otherwise a MET estimate — the ONE formula every screen
 * (Dashboard, Workouts, Overview) uses so numbers always match.
 */
export const workoutCalories = (w: WorkoutLog, weightKg?: number): number => {
  if (typeof w.caloriesBurned === 'number' && w.caloriesBurned > 0) return Math.round(w.caloriesBurned);
  const intensity = w.intensity || (w.elevatedHeartRate ? 'MODERATE' : 'LOW');
  return estimateWorkoutCalories(w.type, w.durationMinutes, weightKg, intensity);
};

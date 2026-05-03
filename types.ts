
export enum Gender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  OTHER = 'OTHER',
}

export enum ActivityLevel {
  SEDENTARY = 'SEDENTARY',
  LIGHTLY_ACTIVE = 'LIGHTLY_ACTIVE',
  MODERATELY_ACTIVE = 'MODERATELY_ACTIVE',
  VERY_ACTIVE = 'VERY_ACTIVE',
  EXTRA_ACTIVE = 'EXTRA_ACTIVE',
}

export type GoalType = 'LOSE' | 'MAINTAIN' | 'GAIN' | 'FIT';

export enum MealType {
  BREAKFAST = 'BREAKFAST',
  LUNCH = 'LUNCH',
  DINNER = 'DINNER',
  SNACK = 'SNACK',
}

export type CoachPersonality = 'FRIENDLY' | 'STOIC' | 'TOUGH_LOVE' | 'SCIENTIFIC' | 'HUMOROUS';

export interface MicroNutrient {
  name: string;
  amount?: number | string;
  unit?: string;
  percentageOfDailyNeeds: number;
  vibe?: string;
}

export type MacroPreset = 'BALANCED' | 'HIGH_PROTEIN' | 'LOW_CARB' | 'KETO' | 'CUSTOM';

export interface MacroTargets {
  proteinPct: number;
  carbsPct: number;
  fatPct: number;
}

export interface UserProfile {
  id: string;
  name: string;
  accountName?: string;
  age?: number;
  heightCm?: number;
  weightKg?: number;
  gender: Gender;
  activityLevel: ActivityLevel;
  goal: GoalType;
  tdee: number;
  customCalories?: number;
  targetWeightKg?: number;
  weeklyWeightChangeKg?: number;
  reasons?: string[];
  macroPreset?: MacroPreset;
  macroTargets?: MacroTargets;
  quickLog: boolean;
  ignoreWorkoutCalories?: boolean;
  mentalConditions?: string[];
  habits?: string[];
  dietaryPreferences?: string[];
  coachPersonality: CoachPersonality;
}

export interface FoodItem {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  amountDescription: string;
  quantity?: number;
  mealId?: string;
  mealType?: MealType;
  timestamp: number;
  micros?: MicroNutrient[];
  source?: 'AI_LOG' | 'MANUAL' | 'BARCODE' | 'RECIPE';
  photoUri?: string;
  groupName?: string; // Parent product name for grouped ingredients (e.g. "Big Mac")
}

export interface WorkoutLog {
  id: string;
  date: string;
  name?: string;           
  type: string;
  durationMinutes: number;
  caloriesBurned?: number; 
  elevatedHeartRate?: boolean;
  intensity?: 'LOW' | 'MODERATE' | 'HIGH';
  notes?: string;
  timestamp: number;
}

export interface MoodLog {
  id: string;
  timestamp: number;
  mood: string;
  advice?: string;
  rating?: number;
  tags?: string[];
  note?: string;
  energyLevel?: number;
}

export interface DayLog {
  date: string;
  items: FoodItem[];
  workouts?: WorkoutLog[];
  moods?: MoodLog[];
  waterIntakeMl?: number;
  weightLog?: number;     
  habitsCompleted?: string[];
  checkIn?: {
    mood: string;
    energy: number;
    stress: number;
    win: string;
  };
}

export interface Recipe {
  id: string;
  title: string;
  ingredients: string[];
  shoppingList?: string[]; // General items e.g. "Chicken" instead of "200g Chicken"
  instructions: string[];
  calories: number;
  macros: {
    protein: number;
    carbs: number;
    fat: number;
  };
  isSaved?: boolean;
}

export interface ShoppingItem {
  name: string;
  sources: string[]; // List of recipe titles this item is used for
  checked?: boolean;
}

export interface WorkoutSuggestion {
  title: string;
  duration: string;
  focus: string;
  warmup: string[];
  exercises: {
    name: string;
    sets: string;
    reps: string;
    notes?: string;
    instructions?: string;
  }[];
}

export interface TrainingWeek {
  weekNumber: number;
  focus: string;
  sessions: number;
}

export interface ScheduledWorkout {
  dayOfWeek: string;
  focus: string;
  durationMinutes: number;
}

export interface TrainingPlan {
  id: string;
  title: string;           
  goal: string;
  daysPerWeek: number;
  weeks: TrainingWeek[]; 
  schedule?: ScheduledWorkout[];
  startDate?: string;
  active?: boolean;
  durationWeeks?: number;
}

export interface WorkoutRoutine {
  id: string;
  name: string;
  exercises: {
    name: string;
    sets: string;
    reps: string;
    notes?: string;
    instructions?: string;
  }[];
  durationMinutes: number;
  focus: string;
}

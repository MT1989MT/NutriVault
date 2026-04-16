
import { DayLog, UserProfile, WorkoutLog, MoodLog, Recipe, FoodItem, TrainingPlan, WorkoutRoutine } from '../types';
import { generateId } from '../utils/calculations';
import { createLogger } from './logger';
import * as idb from './indexeddb';

const log = createLogger('Storage');

const PROFILE_KEY = 'nutrivault_profile';
const LOGS_KEY = 'nutrivault_logs';
const MOODS_KEY = 'nutrivault_moods';
const RECIPES_KEY = 'nutrivault_saved_recipes';
const SAVED_MEALS_KEY = 'nutrivault_saved_meals';
const TRAINING_PLAN_KEY = 'nutrivault_training_plan';
const SAVED_ROUTINES_KEY = 'nutrivault_saved_routines';
const IDB_MIGRATED_KEY = 'nutrivault_idb_migrated';

// In-memory cache to avoid repeated JSON.parse/stringify on every read
const cache = new Map<string, any>();

// IndexedDB state: once initialized, writes are synced to IDB in background
let idbReady = false;
let idbWriteTimer: ReturnType<typeof setTimeout> | null = null;

const cachedGet = <T>(key: string, fallback: T): T => {
  if (cache.has(key)) return cache.get(key);
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : fallback;
    cache.set(key, parsed);
    return parsed;
  } catch {
    return fallback;
  }
};

// Safe localStorage write with quota error handling
const safeSetItem = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    if (e instanceof DOMException && (e.code === 22 || e.name === 'QuotaExceededError')) {
      log.error(`Quota exceeded for key: ${key}`);
    }
    throw e;
  }
};

// Write an already-parsed object: caches it in memory and persists to localStorage + IDB
const cachedSet = <T>(key: string, data: T): void => {
  cache.set(key, data);
  safeSetItem(key, JSON.stringify(data));

  // Background-sync food logs to IndexedDB (debounced)
  if (key === LOGS_KEY && idbReady) {
    if (idbWriteTimer) clearTimeout(idbWriteTimer);
    idbWriteTimer = setTimeout(() => {
      idb.saveDayLogs(data as Record<string, DayLog>).catch(err =>
        log.warn('IDB write failed', err)
      );
    }, 300);
  }
};

/**
 * Initialize IndexedDB: migrate existing localStorage logs on first run,
 * then load all logs from IDB into memory for faster subsequent reads.
 * Call this once on app startup. Non-blocking — falls back to localStorage if IDB fails.
 */
export async function initializeStorage(): Promise<void> {
  try {
    const available = await idb.isIndexedDBAvailable();
    if (!available) return;

    const migrated = localStorage.getItem(IDB_MIGRATED_KEY);
    if (!migrated) {
      // One-time migration: copy localStorage logs into IndexedDB
      const logs = cachedGet<Record<string, DayLog>>(LOGS_KEY, {});
      if (Object.keys(logs).length > 0) {
        await idb.migrateLogsToIDB(logs);
      }
      localStorage.setItem(IDB_MIGRATED_KEY, '1');
    }

    // Load from IDB into memory cache (IDB is source of truth after migration)
    const idbLogs = await idb.getAllLogs();
    if (Object.keys(idbLogs).length > 0) {
      cache.set(LOGS_KEY, idbLogs);
    }
    idbReady = true;
  } catch (err) {
    log.warn('IndexedDB init failed, using localStorage only', err);
  }
}

export const saveProfile = (profile: UserProfile): void => cachedSet(PROFILE_KEY, profile);
export const getProfile = (): UserProfile | null => cachedGet<UserProfile | null>(PROFILE_KEY, null);

export const saveLogs = (logs: Record<string, DayLog>): void => cachedSet(LOGS_KEY, logs);
export const getLogs = (): Record<string, DayLog> => cachedGet<Record<string, DayLog>>(LOGS_KEY, {});

export const addFoodToLog = (date: string, item: FoodItem) => {
  const logs = getLogs();
  if (!logs[date]) logs[date] = { date, items: [] };
  logs[date].items.push(item);
  saveLogs(logs);
  return logs;
};

export const addFoodsToLog = (date: string, items: FoodItem[]) => {
  const logs = getLogs();
  if (!logs[date]) logs[date] = { date, items: [] };
  logs[date].items.push(...items);
  saveLogs(logs);
  return logs;
};

export const removeFoodFromLog = (date: string, itemId: string) => {
  const logs = getLogs();
  if (logs[date]) {
    logs[date].items = logs[date].items.filter(i => i.id !== itemId);
    saveLogs(logs);
  }
  return logs;
};

export const toggleHabit = (date: string, habit: string) => {
  const logs = getLogs();
  if (!logs[date]) logs[date] = { date, items: [] };
  const completed = logs[date].habitsCompleted || [];
  logs[date].habitsCompleted = completed.includes(habit) ? completed.filter(h => h !== habit) : [...completed, habit];
  saveLogs(logs);
  return logs;
};

export const saveDayCheckIn = (date: string, checkIn: DayLog['checkIn']) => {
  const logs = getLogs();
  if (!logs[date]) logs[date] = { date, items: [] };
  logs[date].checkIn = checkIn;
  saveLogs(logs);
  return logs;
};

export const getWorkouts = (): WorkoutLog[] => {
  const logs = getLogs();
  const workouts: WorkoutLog[] = [];
  Object.values(logs).forEach(log => { if (log.workouts) workouts.push(...log.workouts); });
  return workouts;
};

export const updateWaterIntake = (date: string, ml: number) => {
  const logs = getLogs();
  if (!logs[date]) logs[date] = { date, items: [] };
  logs[date].waterIntakeMl = Math.max(0, (logs[date].waterIntakeMl || 0) + ml);
  saveLogs(logs);
  return logs;
};

export const addWorkoutToLog = (date: string, workout: WorkoutLog) => {
  const logs = getLogs();
  if (!logs[date]) logs[date] = { date, items: [], workouts: [] };
  if (!logs[date].workouts) logs[date].workouts = [];
  logs[date].workouts!.push(workout);
  saveLogs(logs);
  return logs;
};

export const getTrainingPlan = (): TrainingPlan | null => cachedGet<TrainingPlan | null>(TRAINING_PLAN_KEY, null);
export const saveTrainingPlan = (plan: TrainingPlan) => {
  cachedSet(TRAINING_PLAN_KEY, plan);
  return plan;
};

export const getMoods = (): MoodLog[] => cachedGet<MoodLog[]>(MOODS_KEY, []);
export const saveMood = (mood: MoodLog) => {
  const moods = getMoods();
  moods.push(mood);
  if (moods.length > 50) moods.shift();
  cachedSet(MOODS_KEY, moods);
  return moods;
};

export const getSavedRecipes = (): Recipe[] => cachedGet<Recipe[]>(RECIPES_KEY, []);
export const saveRecipe = (recipe: Recipe) => {
  const recipes = getSavedRecipes();
  const index = recipes.findIndex(r => r.id === recipe.id);
  if (index >= 0) recipes[index] = recipe; else recipes.push(recipe);
  cachedSet(RECIPES_KEY, recipes);
  return recipes;
};
export const deleteRecipe = (id: string) => {
  const recipes = getSavedRecipes().filter(r => r.id !== id);
  cachedSet(RECIPES_KEY, recipes);
  return recipes;
};

export interface SavedMeal { id: string; name: string; items: FoodItem[]; }
export const getSavedMeals = (): SavedMeal[] => cachedGet<SavedMeal[]>(SAVED_MEALS_KEY, []);
export const saveCustomMeal = (name: string, items: FoodItem[]) => {
  const meals = getSavedMeals();
  const newMeal: SavedMeal = { id: generateId(), name, items: items.map(i => ({...i, id: generateId(), mealId: undefined, timestamp: Date.now() })) };
  meals.push(newMeal);
  cachedSet(SAVED_MEALS_KEY, meals);
  return meals;
};
export const deleteSavedMeal = (id: string) => {
  const meals = getSavedMeals().filter(m => m.id !== id);
  cachedSet(SAVED_MEALS_KEY, meals);
  return meals;
};

export const getSavedRoutines = (): WorkoutRoutine[] => cachedGet<WorkoutRoutine[]>(SAVED_ROUTINES_KEY, []);
export const saveRoutine = (routine: WorkoutRoutine) => {
  const routines = getSavedRoutines();
  const index = routines.findIndex(r => r.id === routine.id);
  if (index >= 0) routines[index] = routine; else routines.push(routine);
  cachedSet(SAVED_ROUTINES_KEY, routines);
  return routines;
};
export const deleteRoutine = (id: string) => {
  const routines = getSavedRoutines().filter(r => r.id !== id);
  cachedSet(SAVED_ROUTINES_KEY, routines);
  return routines;
};

// Favorite Foods - custom foods with known nutritional values
const FAVORITE_FOODS_KEY = 'nutrivault_favorite_foods';
const RECENT_FOODS_KEY = 'nutrivault_recent_foods';

export interface FavoriteFood {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  defaultAmount: string;
  caloriesPer100g?: number;
}

export const getFavoriteFoods = (): FavoriteFood[] => cachedGet<FavoriteFood[]>(FAVORITE_FOODS_KEY, []);

export const saveFavoriteFood = (food: FavoriteFood) => {
  const foods = getFavoriteFoods();
  const existing = foods.findIndex(f => f.id === food.id);
  if (existing >= 0) foods[existing] = food;
  else foods.unshift(food); // Add to beginning
  if (foods.length > 50) foods.pop(); // Limit to 50
  cachedSet(FAVORITE_FOODS_KEY, foods);
  return foods;
};

export const deleteFavoriteFood = (id: string) => {
  const foods = getFavoriteFoods().filter(f => f.id !== id);
  cachedSet(FAVORITE_FOODS_KEY, foods);
  return foods;
};

// Recent foods - automatically saved from logging
export const getRecentFoods = (): FoodItem[] => cachedGet<FoodItem[]>(RECENT_FOODS_KEY, []);

export const addToRecentFoods = (item: FoodItem) => {
  const recent = getRecentFoods();
  // Remove duplicate if exists (by name, case insensitive)
  const filtered = recent.filter(f => f.name.toLowerCase() !== item.name.toLowerCase());
  // Add to beginning
  filtered.unshift({ ...item, id: generateId(), timestamp: Date.now() });
  // Keep only last 20
  const limited = filtered.slice(0, 20);
  cachedSet(RECENT_FOODS_KEY, limited);
  return limited;
};

export const clearRecentFoods = () => {
  cachedSet(RECENT_FOODS_KEY, []);
  return [];
};

// Food frequency tracking - tracks how often each food is logged
const FOOD_FREQUENCY_KEY = 'nutrivault_food_frequency';

interface FoodFrequency {
  name: string;
  count: number;
  lastLogged: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  amountDescription: string;
  // Per-100g base values for cross-session consistency
  proteinPer100g?: number;
  carbsPer100g?: number;
  fatPer100g?: number;
}

export const getFoodFrequencies = (): FoodFrequency[] => cachedGet<FoodFrequency[]>(FOOD_FREQUENCY_KEY, []);

export const trackFoodFrequency = (item: FoodItem) => {
  const freqs = getFoodFrequencies();
  const key = item.name.toLowerCase().trim();

  // Extract per-100g values if the pipeline attached them (from AI per-100g response)
  const itemAny = item as any;
  const p100 = typeof itemAny.proteinPer100g === 'number' ? itemAny.proteinPer100g : undefined;
  const c100 = typeof itemAny.carbsPer100g === 'number' ? itemAny.carbsPer100g : undefined;
  const f100 = typeof itemAny.fatPer100g === 'number' ? itemAny.fatPer100g : undefined;
  const hasPer100g = p100 !== undefined;

  const existing = freqs.findIndex(f => f.name.toLowerCase().trim() === key);
  if (existing >= 0) {
    freqs[existing].count += 1;
    freqs[existing].lastLogged = Date.now();
    freqs[existing].calories = item.calories;
    freqs[existing].protein = item.protein;
    freqs[existing].carbs = item.carbs;
    freqs[existing].fat = item.fat;
    freqs[existing].amountDescription = item.amountDescription;
    if (hasPer100g) {
      freqs[existing].proteinPer100g = p100;
      freqs[existing].carbsPer100g = c100;
      freqs[existing].fatPer100g = f100;
    }
  } else {
    freqs.push({
      name: item.name,
      count: 1,
      lastLogged: Date.now(),
      calories: item.calories,
      protein: item.protein,
      carbs: item.carbs,
      fat: item.fat,
      amountDescription: item.amountDescription,
      ...(hasPer100g ? { proteinPer100g: p100, carbsPer100g: c100, fatPer100g: f100 } : {}),
    });
  }
  // Keep top 50 by frequency
  freqs.sort((a, b) => b.count - a.count);
  const limited = freqs.slice(0, 50);
  cachedSet(FOOD_FREQUENCY_KEY, limited);
  return limited;
};

/**
 * Look up stored per-100g nutritional values for a food by name.
 * Returns stored values if the food has been logged at least once before,
 * giving consistent macros across sessions for repeat foods.
 */
export const lookupFoodNutrition = (name: string): { p100: number; c100: number; f100: number } | null => {
  if (!name) return null;
  const key = name.toLowerCase().trim();

  const freqs = getFoodFrequencies();
  const match = freqs.find(f => f.name.toLowerCase().trim() === key);
  if (match && match.proteinPer100g !== undefined && match.carbsPer100g !== undefined && match.fatPer100g !== undefined) {
    return { p100: match.proteinPer100g, c100: match.carbsPer100g, f100: match.fatPer100g };
  }

  return null;
};

export const getMostUsedFoods = (limit: number = 6): FoodFrequency[] => {
  return getFoodFrequencies()
    .filter(f => f.count >= 2)  // Only show foods logged at least twice
    .sort((a, b) => b.count - a.count || b.lastLogged - a.lastLogged)
    .slice(0, limit);
};

// Data Export/Import for privacy backup
const ALL_KEYS = [
  PROFILE_KEY, LOGS_KEY, MOODS_KEY, RECIPES_KEY, SAVED_MEALS_KEY,
  TRAINING_PLAN_KEY, SAVED_ROUTINES_KEY, FAVORITE_FOODS_KEY, RECENT_FOODS_KEY,
  FOOD_FREQUENCY_KEY, 'nutrivault_shopping', 'nutrivault_language', 'nutrivault_chat_history'
];

export const exportAllData = (): string => {
  const data: Record<string, any> = { _exportVersion: 1, _exportDate: new Date().toISOString() };
  ALL_KEYS.forEach(key => {
    const val = localStorage.getItem(key);
    if (val) data[key] = val;
  });
  return JSON.stringify(data, null, 2);
};

export const importAllData = (jsonString: string): { success: boolean; error?: string } => {
  try {
    if (!jsonString || jsonString.length > 50_000_000) {
      return { success: false, error: 'File too large or empty' };
    }
    const data = JSON.parse(jsonString);
    if (!data._exportVersion || typeof data._exportVersion !== 'number') {
      return { success: false, error: 'Invalid backup file format' };
    }
    // Only import known keys, validate each is a string with valid JSON
    ALL_KEYS.forEach(key => {
      if (data[key] && typeof data[key] === 'string') {
        try {
          JSON.parse(data[key]);
          safeSetItem(key, data[key]);
        } catch {
          // Skip keys with invalid JSON
        }
      }
    });
    return { success: true };
  } catch {
    return { success: false, error: 'Could not parse backup file' };
  }
};

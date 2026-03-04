
import { DayLog, UserProfile, WorkoutLog, MoodLog, Recipe, FoodItem, TrainingPlan, WorkoutRoutine } from '../types';
import { generateId } from '../utils/calculations';

const PROFILE_KEY = 'nutrivault_profile';
const LOGS_KEY = 'nutrivault_logs';
const MOODS_KEY = 'nutrivault_moods';
const RECIPES_KEY = 'nutrivault_saved_recipes';
const SAVED_MEALS_KEY = 'nutrivault_saved_meals';
const TRAINING_PLAN_KEY = 'nutrivault_training_plan';
const SAVED_ROUTINES_KEY = 'nutrivault_saved_routines';

// Safe localStorage write with quota error handling
const safeSetItem = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    if (e instanceof DOMException && (e.code === 22 || e.name === 'QuotaExceededError')) {
      console.error('[Storage] Quota exceeded for key:', key);
    }
    throw e;
  }
};

export const saveProfile = (profile: UserProfile): void => safeSetItem(PROFILE_KEY, JSON.stringify(profile));
export const getProfile = (): UserProfile | null => {
  try { return JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null'); } catch { return null; }
};

export const saveLogs = (logs: Record<string, DayLog>): void => safeSetItem(LOGS_KEY, JSON.stringify(logs));
export const getLogs = (): Record<string, DayLog> => {
  try { return JSON.parse(localStorage.getItem(LOGS_KEY) || '{}'); } catch { return {}; }
};

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

export const getTrainingPlan = (): TrainingPlan | null => {
  try { return JSON.parse(localStorage.getItem(TRAINING_PLAN_KEY) || 'null'); } catch { return null; }
};
export const saveTrainingPlan = (plan: TrainingPlan) => {
  safeSetItem(TRAINING_PLAN_KEY, JSON.stringify(plan));
  return plan;
};

export const getMoods = (): MoodLog[] => {
  try { return JSON.parse(localStorage.getItem(MOODS_KEY) || '[]'); } catch { return []; }
};
export const saveMood = (mood: MoodLog) => {
  const moods = getMoods();
  moods.push(mood);
  if (moods.length > 50) moods.shift();
  safeSetItem(MOODS_KEY, JSON.stringify(moods));
  return moods;
};

export const getSavedRecipes = (): Recipe[] => {
  try { return JSON.parse(localStorage.getItem(RECIPES_KEY) || '[]'); } catch { return []; }
};
export const saveRecipe = (recipe: Recipe) => {
  const recipes = getSavedRecipes();
  const index = recipes.findIndex(r => r.id === recipe.id);
  if (index >= 0) recipes[index] = recipe; else recipes.push(recipe);
  safeSetItem(RECIPES_KEY, JSON.stringify(recipes));
  return recipes;
};
export const deleteRecipe = (id: string) => {
  const recipes = getSavedRecipes().filter(r => r.id !== id);
  safeSetItem(RECIPES_KEY, JSON.stringify(recipes));
  return recipes;
};

export interface SavedMeal { id: string; name: string; items: FoodItem[]; }
export const getSavedMeals = (): SavedMeal[] => {
  try { return JSON.parse(localStorage.getItem(SAVED_MEALS_KEY) || '[]'); } catch { return []; }
};
export const saveCustomMeal = (name: string, items: FoodItem[]) => {
  const meals = getSavedMeals();
  const newMeal: SavedMeal = { id: generateId(), name, items: items.map(i => ({...i, id: generateId(), mealId: undefined, timestamp: Date.now() })) };
  meals.push(newMeal);
  safeSetItem(SAVED_MEALS_KEY, JSON.stringify(meals));
  return meals;
};
export const deleteSavedMeal = (id: string) => {
  const meals = getSavedMeals().filter(m => m.id !== id);
  safeSetItem(SAVED_MEALS_KEY, JSON.stringify(meals));
  return meals;
};

export const getSavedRoutines = (): WorkoutRoutine[] => {
  try { return JSON.parse(localStorage.getItem(SAVED_ROUTINES_KEY) || '[]'); } catch { return []; }
};
export const saveRoutine = (routine: WorkoutRoutine) => {
  const routines = getSavedRoutines();
  const index = routines.findIndex(r => r.id === routine.id);
  if (index >= 0) routines[index] = routine; else routines.push(routine);
  safeSetItem(SAVED_ROUTINES_KEY, JSON.stringify(routines));
  return routines;
};
export const deleteRoutine = (id: string) => {
  const routines = getSavedRoutines().filter(r => r.id !== id);
  safeSetItem(SAVED_ROUTINES_KEY, JSON.stringify(routines));
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

export const getFavoriteFoods = (): FavoriteFood[] => {
  try { return JSON.parse(localStorage.getItem(FAVORITE_FOODS_KEY) || '[]'); } catch { return []; }
};

export const saveFavoriteFood = (food: FavoriteFood) => {
  const foods = getFavoriteFoods();
  const existing = foods.findIndex(f => f.id === food.id);
  if (existing >= 0) foods[existing] = food;
  else foods.unshift(food); // Add to beginning
  if (foods.length > 50) foods.pop(); // Limit to 50
  safeSetItem(FAVORITE_FOODS_KEY, JSON.stringify(foods));
  return foods;
};

export const deleteFavoriteFood = (id: string) => {
  const foods = getFavoriteFoods().filter(f => f.id !== id);
  safeSetItem(FAVORITE_FOODS_KEY, JSON.stringify(foods));
  return foods;
};

// Recent foods - automatically saved from logging
export const getRecentFoods = (): FoodItem[] => {
  try { return JSON.parse(localStorage.getItem(RECENT_FOODS_KEY) || '[]'); } catch { return []; }
};

export const addToRecentFoods = (item: FoodItem) => {
  const recent = getRecentFoods();
  // Remove duplicate if exists (by name, case insensitive)
  const filtered = recent.filter(f => f.name.toLowerCase() !== item.name.toLowerCase());
  // Add to beginning
  filtered.unshift({ ...item, id: generateId(), timestamp: Date.now() });
  // Keep only last 20
  const limited = filtered.slice(0, 20);
  safeSetItem(RECENT_FOODS_KEY, JSON.stringify(limited));
  return limited;
};

export const clearRecentFoods = () => {
  safeSetItem(RECENT_FOODS_KEY, '[]');
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
}

export const getFoodFrequencies = (): FoodFrequency[] => {
  try { return JSON.parse(localStorage.getItem(FOOD_FREQUENCY_KEY) || '[]'); } catch { return []; }
};

export const trackFoodFrequency = (item: FoodItem) => {
  const freqs = getFoodFrequencies();
  const key = item.name.toLowerCase().trim();
  const existing = freqs.findIndex(f => f.name.toLowerCase().trim() === key);
  if (existing >= 0) {
    freqs[existing].count += 1;
    freqs[existing].lastLogged = Date.now();
    // Update nutritional data to latest values
    freqs[existing].calories = item.calories;
    freqs[existing].protein = item.protein;
    freqs[existing].carbs = item.carbs;
    freqs[existing].fat = item.fat;
    freqs[existing].amountDescription = item.amountDescription;
  } else {
    freqs.push({
      name: item.name,
      count: 1,
      lastLogged: Date.now(),
      calories: item.calories,
      protein: item.protein,
      carbs: item.carbs,
      fat: item.fat,
      amountDescription: item.amountDescription
    });
  }
  // Keep top 50 by frequency
  freqs.sort((a, b) => b.count - a.count);
  const limited = freqs.slice(0, 50);
  safeSetItem(FOOD_FREQUENCY_KEY, JSON.stringify(limited));
  return limited;
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

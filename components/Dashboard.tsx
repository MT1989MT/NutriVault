import React, { useState, useMemo, useEffect, useCallback, memo } from 'react';
import { DayLog, UserProfile, FoodItem, MealType } from '../types';
import { Loader2, Trash2, Coffee, Sun, Moon, Cookie, Plus, X, Heart, Target, Brain, ChevronLeft, ChevronRight, ChevronDown, Flame, PenLine, User, Settings2, ArrowRight, Scale, Info, Droplets, Minus, Camera, TrendingUp, Copy } from 'lucide-react';
import { parseFoodInput, parseFoodFromPhoto } from '../services/gemini';
import { toggleHabit, updateWaterIntake, getRecentFoods, addToRecentFoods, FavoriteFood, getFavoriteFoods, saveFavoriteFood, trackFoodFrequency, getMostUsedFoods, getRecentMeals, addToRecentMeals, RecentMeal } from '../services/storage';
import { generateId, calculateStreak, getMacroTargets, macroGramsFromTargets } from '../utils/calculations';
import { todayStr, toDateStr, parseDateStr, dateStrOffset } from '../utils/date';
import { createLogger } from '../services/logger';
import AnalysisModal from './AnalysisModal';
import { t as tr, getCurrentLanguage } from '../utils/i18n';

const log = createLogger('Dashboard');

interface DashboardProps {
  profile: UserProfile;
  logs: Record<string, DayLog>;
  onItemsAdded: (items: FoodItem[], date?: string) => void;
  onRemoveItem: (item: FoodItem, date?: string) => void;
  onWaterUpdate?: (date: string, ml: number) => void;
  onSettingsClick: () => void;
  onCoachClick?: () => void;
  onRecipesClick?: () => void;
  /** Incremented by the nav FAB: open the Add Food sheet for the meal suggested by time of day. */
  fabSignal?: number;
  /** Called after the FAB signal is handled so App can reset the counter. */
  onFabConsumed?: () => void;
  isActive?: boolean;
}

/** Meal suggested by the current time of day (for the FAB quick-add). */
const suggestMealByTime = (): MealType => {
  const h = new Date().getHours();
  if (h < 11) return MealType.BREAKFAST;
  if (h < 15) return MealType.LUNCH;
  if (h < 21) return MealType.DINNER;
  return MealType.SNACK;
};

// Group meal items by groupName for display
const MealItemList: React.FC<{ items: FoodItem[], onItemClick: (item: FoodItem) => void }> = memo(({ items, onItemClick }) => {
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  // Build groups and ungrouped items preserving order
  const { groups, ungrouped } = useMemo(() => {
    const groups: { name: string; items: FoodItem[]; totalCal: number; totalP: number; totalC: number; totalF: number }[] = [];
    const ungrouped: FoodItem[] = [];
    const groupMap = new Map<string, number>();

    items.forEach(item => {
      if (item.groupName) {
        const existing = groupMap.get(item.groupName);
        if (existing !== undefined) {
          groups[existing].items.push(item);
          groups[existing].totalCal += item.calories;
          groups[existing].totalP += item.protein;
          groups[existing].totalC += item.carbs;
          groups[existing].totalF += item.fat;
        } else {
          groupMap.set(item.groupName, groups.length);
          groups.push({ name: item.groupName, items: [item], totalCal: item.calories, totalP: item.protein, totalC: item.carbs, totalF: item.fat });
        }
      } else {
        ungrouped.push(item);
      }
    });
    return { groups, ungrouped };
  }, [items]);

  const renderItem = (item: FoodItem, indented = false) => (
    <div
      key={item.id}
      onClick={() => onItemClick(item)}
      className={`flex items-center justify-between py-3 hover:bg-[#FAF6F1]/50 cursor-pointer active:bg-[#FAF6F1] transition-smooth min-h-[54px] ${indented ? 'pl-8 pr-4' : 'px-4'}`}
    >
      <div className="flex-1 min-w-0 pr-3 flex items-center gap-3">
        {item.photoUri && (
          <img src={item.photoUri} alt={item.name} className="w-10 h-10 rounded-lg object-cover shrink-0" />
        )}
        <div className="min-w-0">
          <p className={`font-medium text-[#2B2523] truncate ${indented ? 'text-[13px] text-[#6B6257]' : 'text-[15px]'}`}>{item.name}</p>
          <p className="text-[11px] text-[#9A8B80] mt-0.5">{item.amountDescription}</p>
        </div>
      </div>
      <div className="text-right">
        <p className={`font-bold tabular-nums ${indented ? 'text-[13px] text-[#6B6257]' : 'text-[15px] text-[#2B2523]'}`}>{Math.round(item.calories)}</p>
        <p className="text-[10px] text-[#9A8B80] tabular-nums">P{Math.round(item.protein)} C{Math.round(item.carbs)} F{Math.round(item.fat)}</p>
      </div>
    </div>
  );

  return (
    <div className="divide-y divide-gray-50/80">
      {groups.map((group) => {
        const isExpanded = expandedGroup === group.name;
        return (
          <div key={`group-${group.name}`}>
            <div
              onClick={() => setExpandedGroup(isExpanded ? null : group.name)}
              className="flex items-center justify-between px-4 py-3 hover:bg-[#FAF6F1]/50 cursor-pointer active:bg-[#FAF6F1] transition-smooth min-h-[54px]"
            >
              <div className="flex-1 min-w-0 pr-3 flex items-center gap-2">
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-[#E07A5F] shrink-0" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-[#E07A5F] shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="font-bold text-[#2B2523] text-[15px] truncate">{group.name}</p>
                  <p className="text-[11px] text-[#9A8B80] mt-0.5">{group.items.length} items</p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-bold text-[#2B2523] text-[15px] tabular-nums">{Math.round(group.totalCal)}</p>
                <p className="text-[10px] text-[#9A8B80] tabular-nums">P{Math.round(group.totalP)} C{Math.round(group.totalC)} F{Math.round(group.totalF)}</p>
              </div>
            </div>
            {isExpanded && (
              <div className="bg-[#FAF6F1]/30">
                {group.items.map(item => renderItem(item, true))}
              </div>
            )}
          </div>
        );
      })}
      {ungrouped.map(item => renderItem(item))}
    </div>
  );
});

const Dashboard: React.FC<DashboardProps> = ({ profile, logs, onItemsAdded, onRemoveItem, onWaterUpdate, onSettingsClick, onCoachClick, onRecipesClick, fabSignal = 0, onFabConsumed, isActive = true }) => {
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const todayDate = todayStr();
  const dayLog = logs[selectedDate] || { date: selectedDate, items: [] };

  const [input, setInput] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzedItems, setAnalyzedItems] = useState<Omit<FoodItem, 'id' | 'timestamp' | 'mealType'>[] | null>(null);
  const [itemToEdit, setItemToEdit] = useState<FoodItem | null>(null);
  const [editGrams, setEditGrams] = useState('');
  const [editUnit, setEditUnit] = useState<'multiplier' | 'grams' | 'pieces'>('multiplier');
  const [selectedMealType, setSelectedMealType] = useState<MealType | null>(null);
  // activeCalories is now a derived useMemo value (activeCaloriesComputed) — no state needed
  const [showAbout, setShowAbout] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [recentFoods, setRecentFoods] = useState<FoodItem[]>([]);
  const [recentMeals, setRecentMeals] = useState<RecentMeal[]>([]);
  const [favoriteFoods, setFavoriteFoods] = useState<FavoriteFood[]>([]);
  const [saveAsFavorite, setSaveAsFavorite] = useState(false);
  const [manualForm, setManualForm] = useState({
    name: '', brand: '', servingSize: '100', servingUnit: 'g', servings: '1',
    calories: '', protein: '', carbs: '', fat: ''
  });
  const [mostUsedFoods, setMostUsedFoods] = useState<ReturnType<typeof getMostUsedFoods>>([]);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const photoInputRef = React.useRef<HTMLInputElement>(null);

  // Stable callback for MealItemList — prevents memo() invalidation on every render
  const handleMealItemClick = useCallback((item: FoodItem) => {
    setItemToEdit(item);
    setEditGrams('1');
    setEditUnit('multiplier');
  }, []);

  // Calculate streak using shared utility
  const streak = useMemo(() => calculateStreak(logs), [logs]);

  // FAB in the tab bar: open the Add Food sheet for today's time-suggested
  // meal, then tell App the signal was consumed (App resets the counter to 0).
  // Without the reset, a stale counter re-opened the sheet on every Dashboard
  // remount after tab/Coach/Settings round-trips.
  useEffect(() => {
    if (fabSignal > 0) {
      setSelectedDate(todayStr());
      setSelectedMealType(suggestMealByTime());
      setShowManualEntry(false);
      onFabConsumed?.();
    }
  }, [fabSignal, onFabConsumed]);

  const navigateDate = useCallback((direction: number) => {
    const date = parseDateStr(selectedDate);
    date.setDate(date.getDate() + direction);
    const newDate = toDateStr(date);
    if (newDate <= todayDate) setSelectedDate(newDate);
  }, [selectedDate, todayDate]);

  const formatDateHeader = (dateStr: string) => {
    if (dateStr === todayDate) return tr('today');
    if (dateStr === dateStrOffset(-1)) return tr('yesterday');
    return parseDateStr(dateStr).toLocaleDateString(getCurrentLanguage(), { weekday: 'short', day: 'numeric', month: 'short' });
  };

  // Compute active calories directly from the day's workouts — no need to scan all logs
  const activeCaloriesComputed = useMemo(() => {
    const dayWorkouts = dayLog.workouts || [];
    return dayWorkouts.reduce((acc, w) => acc + (w.durationMinutes * (w.elevatedHeartRate ? 8 : 5)), 0);
  }, [dayLog.workouts]);

  useEffect(() => {
    setRecentFoods(getRecentFoods());
    setRecentMeals(getRecentMeals());
    setFavoriteFoods(getFavoriteFoods());
    setMostUsedFoods(getMostUsedFoods());
  }, []);

  // Handle photo capture - resize and store as base64
  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = document.createElement('img');
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxSize = 400;
        let w = img.width, h = img.height;
        if (w > h) { if (w > maxSize) { h = h * maxSize / w; w = maxSize; } }
        else { if (h > maxSize) { w = w * maxSize / h; h = maxSize; } }
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d')?.drawImage(img, 0, 0, w, h);
        setPhotoPreview(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
    // Reset input so same file can be selected again
    e.target.value = '';
  };

  const totals = useMemo(() => dayLog.items.reduce((acc, i) => ({ cal: acc.cal + i.calories, p: acc.p + i.protein, c: acc.c + i.carbs, f: acc.f + i.fat }), { cal: 0, p: 0, c: 0, f: 0 }), [dayLog.items]);

  const baseTarget = profile.customCalories || profile.tdee;
  const targetCalories = Math.max(1200, baseTarget + (profile.ignoreWorkoutCalories ? 0 : activeCaloriesComputed));
  const remaining = targetCalories - totals.cal;

  const totalMacroGrams = totals.p + totals.c + totals.f;
  const macroPercents = {
    p: totalMacroGrams > 0 ? Math.round((totals.p / totalMacroGrams) * 100) : 0,
    c: totalMacroGrams > 0 ? Math.round((totals.c / totalMacroGrams) * 100) : 0,
    f: totalMacroGrams > 0 ? Math.round((totals.f / totalMacroGrams) * 100) : 0,
  };

  const mealBudgets = {
    [MealType.BREAKFAST]: Math.round(targetCalories * 0.25),
    [MealType.LUNCH]: Math.round(targetCalories * 0.30),
    [MealType.DINNER]: Math.round(targetCalories * 0.35),
    [MealType.SNACK]: Math.round(targetCalories * 0.10),
  };

  const mealGroups = useMemo(() => {
    const groups: Record<MealType, FoodItem[]> = {
      [MealType.BREAKFAST]: [], [MealType.LUNCH]: [], [MealType.DINNER]: [], [MealType.SNACK]: [],
    };
    dayLog.items.forEach(item => { groups[item.mealType || MealType.SNACK].push(item); });
    return groups;
  }, [dayLog.items]);

  const getMealCalories = (type: MealType) => mealGroups[type].reduce((sum, i) => sum + i.calories, 0);

  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [expandedMeal, setExpandedMeal] = useState<MealType | null>(null);

  const handleAnalyze = async () => {
    if ((!input.trim() && !photoPreview) || !selectedMealType) return;
    setIsAnalyzing(true);
    setAnalyzeError(null);
    try {
      let result;
      if (photoPreview) {
        // Photo-based analysis — send full data URL (API extracts mime type + base64).
        // Pass any typed text as a hint so it isn't silently discarded.
        result = await parseFoodFromPhoto(photoPreview, input.trim() || undefined);
      } else {
        result = await parseFoodInput(input);
      }
      if (!result || result.length === 0) {
        setAnalyzeError(tr('couldNotIdentifyFood') || "Could not identify any food items. Please try again with more detail.");
        return;
      }
      // Always show review modal so user can adjust individual items before logging
      setAnalyzedItems(result);
    } catch (err: any) {
      const msg = err?.message || err?.toString?.() || 'unknown error';
      log.error('Food analysis failed', err);
      if (msg.includes('API key not configured')) {
        setAnalyzeError("Server API key is not configured.");
      } else if (msg.includes('timed out')) {
        setAnalyzeError(tr('requestTimedOut') || "Request timed out. Please try again.");
      } else if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        setAnalyzeError(tr('networkError') || "Could not reach the server. Check your connection.");
      } else {
        setAnalyzeError(msg);
      }
    }
    finally { setIsAnalyzing(false); }
  };

  const handleManualSubmit = useCallback(() => {
    if (!manualForm.name?.trim() || !manualForm.calories || !selectedMealType) return;
    const servings = Math.max(0.1, parseFloat(manualForm.servings) || 1);
    const servingSize = Math.max(1, parseFloat(manualForm.servingSize) || 100);
    const cal = Math.max(0, Math.min(10000, Number(manualForm.calories) || 0));
    const prot = Math.max(0, Math.min(1000, Number(manualForm.protein) || 0));
    const carb = Math.max(0, Math.min(1000, Number(manualForm.carbs) || 0));
    const fatVal = Math.max(0, Math.min(1000, Number(manualForm.fat) || 0));

    const newItem: FoodItem = {
      id: generateId(),
      name: manualForm.brand ? `${manualForm.name.trim()} (${manualForm.brand.trim()})` : manualForm.name.trim(),
      calories: Math.round(cal * servings),
      protein: Math.round(prot * servings),
      carbs: Math.round(carb * servings),
      fat: Math.round(fatVal * servings),
      amountDescription: `${servings > 1 ? servings + ' x ' : ''}${servingSize}${manualForm.servingUnit}`,
      mealType: selectedMealType,
      timestamp: Date.now(),
      source: 'MANUAL',
      micros: [],
      ...(photoPreview ? { photoUri: photoPreview } : {})
    };

    // Save as favorite if checkbox checked
    if (saveAsFavorite) {
      saveFavoriteFood({
        id: generateId(),
        name: manualForm.brand ? `${manualForm.name} (${manualForm.brand})` : manualForm.name,
        calories: Number(manualForm.calories) || 0,
        protein: Number(manualForm.protein) || 0,
        carbs: Number(manualForm.carbs) || 0,
        fat: Number(manualForm.fat) || 0,
        defaultAmount: `${servingSize}${manualForm.servingUnit}`,
      });
      setFavoriteFoods(getFavoriteFoods());
    }

    onItemsAdded([newItem], selectedDate);
    addToRecentFoods(newItem);
    trackFoodFrequency(newItem);
    setRecentFoods(getRecentFoods());
    setMostUsedFoods(getMostUsedFoods());
    setManualForm({ name: '', brand: '', servingSize: '100', servingUnit: 'g', servings: '1', calories: '', protein: '', carbs: '', fat: '' });
    setSaveAsFavorite(false);
    setShowManualEntry(false);
    setSelectedMealType(null);
    setPhotoPreview(null);
  }, [manualForm, selectedMealType, saveAsFavorite, selectedDate, onItemsAdded, photoPreview]);

  const handleQuickAdd = useCallback((item: FoodItem | FavoriteFood) => {
    if (!selectedMealType) return;
    const newItem: FoodItem = {
      id: generateId(),
      name: item.name,
      calories: item.calories,
      protein: item.protein,
      carbs: item.carbs,
      fat: item.fat,
      amountDescription: 'defaultAmount' in item ? item.defaultAmount : (item as FoodItem).amountDescription || '1 serving',
      mealType: selectedMealType,
      timestamp: Date.now()
    };
    onItemsAdded([newItem], selectedDate);
    addToRecentFoods(newItem);
    trackFoodFrequency(newItem);
    setRecentFoods(getRecentFoods());
    setMostUsedFoods(getMostUsedFoods());
    setSelectedMealType(null);
  }, [selectedMealType, selectedDate, onItemsAdded]);

  const getMealIcon = (type: MealType, size = 'w-5 h-5') => {
    const icons = { [MealType.BREAKFAST]: Coffee, [MealType.LUNCH]: Sun, [MealType.DINNER]: Moon, [MealType.SNACK]: Cookie };
    const Icon = icons[type];
    return <Icon className={`${size} text-[#C4763B]`} strokeWidth={1.8} />;
  };

  const getMealLabel = (type: MealType): string => {
    const keys: Record<MealType, string> = { [MealType.BREAKFAST]: 'breakfast', [MealType.LUNCH]: 'lunch', [MealType.DINNER]: 'dinner', [MealType.SNACK]: 'snack' };
    return tr(keys[type] as any);
  };

  // Warm Terra ring gauge: terracotta fill on a soft track; switches to
  // terra-dark (never red) when over budget.
  const CalorieGauge = memo(({ calories, target, remainingCal }: { calories: number; target: number; remainingCal: number }) => {
    const size = 124, radius = 53, stroke = 12;
    const circumference = 2 * Math.PI * radius;
    const progress = Math.min(1, target > 0 ? calories / target : 0);
    const isOver = remainingCal < 0;

    return (
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="#F6E4DB" strokeWidth={stroke} />
          <circle cx={size/2} cy={size/2} r={radius} fill="none"
            stroke={isOver ? '#C85A40' : '#E07A5F'}
            strokeWidth={stroke}
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - progress)}
            strokeLinecap="round"
            className="anim-ring"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-[30px] font-extrabold tracking-tight font-display leading-none ${isOver ? 'text-[#C85A40]' : 'text-[#2B2523]'}`}>
            {Math.abs(Math.round(remainingCal))}
          </span>
          <span className="text-[11px] text-[#9A8B80] font-medium mt-1">
            {isOver ? tr('kcalTooMany') : `kcal ${tr('left').toLowerCase()}`}
          </span>
        </div>
      </div>
    );
  });

  // Macro targets in grams for the three labelled progress bars
  const macroTargetGrams = useMemo(
    () => macroGramsFromTargets(targetCalories, getMacroTargets(profile)),
    [targetCalories, profile]
  );

  // Week strip: current week, Monday-based, future days disabled
  const weekDays = useMemo(() => {
    const now = new Date();
    const dow = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() + (dow === 0 ? -6 : 1 - dow));
    const lang = getCurrentLanguage();
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const ds = toDateStr(d);
      return {
        date: ds,
        abbrev: d.toLocaleDateString(lang, { weekday: 'short' }).replace('.', '').slice(0, 2),
        num: d.getDate(),
        isFuture: ds > todayDate,
      };
    });
  }, [todayDate]);

  const greetingKey = (() => {
    const h = new Date().getHours();
    return h < 12 ? 'goodMorning' : h < 18 ? 'goodAfternoon' : 'goodEvening';
  })() as 'goodMorning' | 'goodAfternoon' | 'goodEvening';


  const MacroBar: React.FC<{ label: string; value: number; target: number; fill: string; track: string }> = ({ label, value, target, fill, track }) => {
    const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
    const over = target > 0 && value > target;
    return (
      <div className="flex-1 min-w-0">
        {/* Label on its own line so long labels never truncate at 390px */}
        <span className="text-[11px] font-semibold text-[#6B6257] block leading-tight">{label}</span>
        <span className={`text-[10px] font-semibold tabular-nums block mb-1.5 ${over ? 'text-[#C85A40]' : 'text-[#9A8B80]'}`}>{Math.round(value)}/{target}g</span>
        <div className="h-[6px] rounded-full overflow-hidden" style={{ background: track }}>
          <div className="h-full rounded-full anim-bar" style={{ width: `${pct}%`, background: fill }} />
        </div>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-[#FAF6F1]">
      {/* Greeting header */}
      <div className="px-5 pb-3" style={{paddingTop: 'max(env(safe-area-inset-top, 14px), 14px)'}}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-[46px] h-[46px] rounded-full bg-[#FBEBE4] flex items-center justify-center shrink-0">
              <User className="w-5 h-5 text-[#E07A5F]" strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <p className="text-[13px] text-[#9A8B80] leading-tight">{tr(greetingKey)}</p>
              <p className="text-[19px] font-bold text-[#2B2523] font-display tracking-tight leading-tight truncate">{profile.name || 'NutriVault'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {streak > 0 && (
              <div className="h-[42px] px-3 bg-white rounded-full card-shadow flex items-center gap-1.5" aria-label={`${streak} day streak`}>
                <Flame className="w-4 h-4 text-[#E07A5F]" fill="#E07A5F" />
                <span className="text-[14px] font-bold text-[#2B2523] font-display tabular-nums">{streak}</span>
              </div>
            )}
            <button onClick={onCoachClick} aria-label="AI Coach" className="w-[42px] h-[42px] bg-white rounded-full card-shadow flex items-center justify-center active:scale-90 transition-smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E07A5F] focus-visible:ring-offset-2">
              <Brain className="w-[18px] h-[18px] text-[#9A8B80]" strokeWidth={1.8} />
            </button>
            <button onClick={onSettingsClick} aria-label="Settings" className="w-[42px] h-[42px] bg-white rounded-full card-shadow flex items-center justify-center active:scale-90 transition-smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E07A5F] focus-visible:ring-offset-2">
              <Settings2 className="w-[18px] h-[18px] text-[#9A8B80]" strokeWidth={1.8} />
            </button>
          </div>
        </div>

        {/* Week strip */}
        <div className="grid grid-cols-7 gap-1.5 mt-4">
          {weekDays.map(d => {
            const selected = d.date === selectedDate;
            return (
              <button
                key={d.date}
                onClick={() => !d.isFuture && setSelectedDate(d.date)}
                disabled={d.isFuture}
                aria-label={d.date}
                aria-current={selected ? 'date' : undefined}
                className={`flex flex-col items-center py-2 rounded-[14px] transition-smooth active:scale-95 ${
                  selected ? 'bg-[#E07A5F] terra-shadow' : 'bg-white card-shadow'
                } ${d.isFuture ? 'opacity-55' : ''}`}
              >
                <span className={`text-[10px] font-medium capitalize ${selected ? 'text-white/80' : 'text-[#B4A79C]'}`}>{d.abbrev}</span>
                <span className={`text-[14px] font-bold font-display tabular-nums ${selected ? 'text-white' : 'text-[#2B2523]'}`}>{d.num}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content - Scrollable with padding for nav + FAB */}
      <div className="flex-1 overflow-y-auto px-5 pt-1" style={{ paddingBottom: 'calc(140px + env(safe-area-inset-bottom, 0px))' }}>

        {/* Hero card: ring gauge + eaten/burned/goal + macro bars */}
        <div className="bg-white rounded-[24px] p-5 hero-shadow mb-3">
          <div className="flex items-center gap-5">
            <CalorieGauge calories={totals.cal} target={targetCalories} remainingCal={remaining} />
            <div className="flex-1 min-w-0">
              {[
                { label: tr('eaten'), value: Math.round(totals.cal) },
                { label: tr('burnedCal'), value: activeCaloriesComputed },
                { label: tr('goal'), value: targetCalories },
              ].map((row, i) => (
                <div key={row.label} className={`flex items-center justify-between py-2 ${i > 0 ? 'border-t border-[#F3EAE2]' : ''}`}>
                  {/* Plain digits (no locale separators) to match the ring gauge number */}
                  <span className="text-[12px] text-[#9A8B80] capitalize">{row.label}</span>
                  <span className="text-[15px] font-bold text-[#2B2523] font-display tabular-nums">{Math.round(row.value)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex gap-4 mt-4">
            <MacroBar label={tr('protein')} value={totals.p} target={macroTargetGrams.protein} fill="#3D5A48" track="#EDF0EC" />
            <MacroBar label={tr('carbs')} value={totals.c} target={macroTargetGrams.carbs} fill="#D9964F" track="#F6ECE2" />
            <MacroBar label={tr('fat')} value={totals.f} target={macroTargetGrams.fat} fill="#E07A5F" track="#F6E4DB" />
          </div>
        </div>

        {/* Section header */}
        <div className="flex items-center justify-between px-1 pt-1 pb-2">
          <span className="text-[15px] font-bold text-[#2B2523] font-display">{selectedDate === todayDate ? tr('today') : formatDateHeader(selectedDate)}</span>
          <button onClick={onRecipesClick} className="text-[12px] font-semibold text-[#C4763B] active:scale-95 transition-smooth py-1 px-1">
            {tr('viewAll')}
          </button>
        </div>

        {/* Meal rows */}
        {[MealType.BREAKFAST, MealType.LUNCH, MealType.DINNER, MealType.SNACK].map((mealType) => {
          const items = mealGroups[mealType];
          const mealCals = getMealCalories(mealType);
          const budget = mealBudgets[mealType];
          const lastPhoto = [...items].reverse().find(i => i.photoUri)?.photoUri;
          const expanded = expandedMeal === mealType && items.length > 0;
          const itemNames = items.map(i => i.name).join(' · ');

          return (
            <div key={mealType} className="bg-white rounded-[20px] card-shadow mb-3 overflow-hidden">
              <div
                role="button"
                tabIndex={0}
                onClick={() => items.length > 0 && setExpandedMeal(expanded ? null : mealType)}
                onKeyDown={(e) => { if (e.key === 'Enter' && items.length > 0) setExpandedMeal(expanded ? null : mealType); }}
                className="w-full flex items-center gap-3 p-3.5 text-left active:scale-[0.99] transition-smooth cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E07A5F]"
                aria-expanded={expanded}
                aria-label={getMealLabel(mealType)}
              >
                {/* Meal thumb: last logged photo, else tinted placeholder with meal icon */}
                <div className="w-[46px] h-[46px] rounded-[14px] shrink-0 overflow-hidden bg-[#F6ECE2] flex items-center justify-center">
                  {lastPhoto
                    ? <img src={lastPhoto} alt="" className="w-full h-full object-cover" />
                    : getMealIcon(mealType, 'w-5 h-5')}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[14px] font-bold text-[#2B2523] font-display truncate">{getMealLabel(mealType)}</span>
                    <span className="shrink-0">
                      {items.length > 0
                        ? <><span className="text-[13px] font-bold text-[#2B2523] font-display tabular-nums">{Math.round(mealCals)}</span><span className="text-[10px] text-[#B4A79C] tabular-nums"> / {budget} kcal</span></>
                        : <span className="text-[10px] text-[#B4A79C] tabular-nums">{budget} kcal {tr('left').toLowerCase()}</span>}
                    </span>
                  </div>
                  <p className={`text-[12px] truncate ${items.length > 0 ? 'text-[#9A8B80]' : 'text-[#C9BBAF]'}`}>
                    {items.length > 0 ? itemNames : tr('nothingLoggedHint')}
                  </p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); setSelectedMealType(mealType); }}
                  aria-label={`Add food to ${getMealLabel(mealType).toLowerCase()}`}
                  className="w-[44px] h-[44px] -m-[5px] shrink-0 flex items-center justify-center active:scale-90 transition-smooth"
                >
                  <span className="w-[34px] h-[34px] bg-[#FBEBE4] rounded-full flex items-center justify-center">
                    <Plus className="w-4 h-4 text-[#E07A5F]" strokeWidth={2.4} />
                  </span>
                </button>
              </div>

              {/* Expanded items */}
              {expanded && <MealItemList items={items} onItemClick={handleMealItemClick} />}
            </div>
          );
        })}

        {/* Water card (Warm Terra green) */}
        <div className="bg-[#EFF2EE] rounded-[20px] p-3.5 mb-3">
          <div className="flex items-center gap-3">
            <div className="w-[46px] h-[46px] bg-white rounded-[14px] flex items-center justify-center shrink-0">
              <Droplets className="w-5 h-5 text-[#3D5A48]" strokeWidth={1.8} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between">
                <span className="text-[13px] font-bold text-[#3D5A48] font-display">Water</span>
                <span className="text-[13px] font-bold text-[#3D5A48] font-display tabular-nums">{((dayLog.waterIntakeMl || 0) / 1000).toFixed(1).replace('.', ',')} / 2,5L</span>
              </div>
              <div className="w-full h-[6px] bg-white rounded-full mt-2 overflow-hidden">
                <div className="h-full bg-[#3D5A48] rounded-full anim-bar" style={{ width: `${Math.min(100, ((dayLog.waterIntakeMl || 0) / 2500) * 100)}%` }} />
              </div>
            </div>
            <button onClick={() => onWaterUpdate?.(selectedDate, 250)} aria-label="Add 250ml water" className="shrink-0 bg-white text-[#3D5A48] px-3.5 py-2.5 rounded-full text-[12px] font-bold active:scale-90 transition-smooth">
              +250
            </button>
          </div>
          <div className="flex items-center gap-2 mt-2.5">
            <button onClick={() => onWaterUpdate?.(selectedDate, -250)} aria-label="Remove 250ml water" className="flex-1 bg-white/60 text-[#3D5A48] py-2 rounded-full text-[11px] font-bold active:scale-95 transition-smooth min-h-[36px]">
              −250
            </button>
            <button onClick={() => onWaterUpdate?.(selectedDate, 500)} aria-label="Add 500ml water" className="flex-1 bg-white/60 text-[#3D5A48] py-2 rounded-full text-[11px] font-bold active:scale-95 transition-smooth min-h-[36px]">
              +500
            </button>
          </div>
        </div>

        {/* Habits */}
        {profile.habits && profile.habits.length > 0 && (
          <div className="bg-white rounded-2xl p-4 card-shadow mb-3">
            <span className="text-[10px] font-bold text-[#9A8B80] uppercase tracking-wider">{tr('dailyHabits')}</span>
            <div className="flex flex-wrap gap-2 mt-3">
              {profile.habits.map(h => (
                <button
                  key={h}
                  onClick={() => toggleHabit(selectedDate, h)}
                  className={`px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-smooth active:scale-90 min-h-[44px] ${dayLog.habitsCompleted?.includes(h) ? 'bg-[#EFF2EE] text-[#3D5A48] ring-1 ring-[#3D5A48]/30' : 'bg-[#FAF6F1] text-[#9A8B80]'}`}
                >
                  {h}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Add Food Modal */}
      {selectedMealType && !showManualEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => { setSelectedMealType(null); setAnalyzeError(null); setInput(''); setPhotoPreview(null); }} role="dialog" aria-modal="true" aria-label="Add food">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-[#F3EAE2]">
              <button onClick={() => { setSelectedMealType(null); setAnalyzeError(null); setInput(''); setPhotoPreview(null); }} className="text-[#9A8B80] text-sm font-medium">
                {tr('cancel')}
              </button>
              <div className="flex items-center gap-2">
                {getMealIcon(selectedMealType, 'w-5 h-5')}
                <span className="font-bold text-[#2B2523]">{getMealLabel(selectedMealType)}</span>
              </div>
              <div className="w-12" />
            </div>

            <div className="p-4">
              <div className="relative">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={tr('whatDidYouEat')}
                  maxLength={500}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  className="w-full bg-[#FAF6F1] rounded-xl py-4 px-4 pr-16 outline-none text-base text-[#2B2523] placeholder-[#B4A79C] focus:ring-2 focus:ring-[#E07A5F]/30"
                  onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
                  autoFocus
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2">
                  <button onClick={handleAnalyze} disabled={(!input.trim() && !photoPreview) || isAnalyzing} className="p-3 rounded-xl bg-[#E07A5F] text-white disabled:opacity-50 active:scale-95 transition-transform">
                    {isAnalyzing ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="px-4 pb-4 max-h-[40vh] overflow-y-auto">
              {/* Error message */}
              {analyzeError && (
                <div className="mb-3 p-3 bg-red-50 border border-red-100 rounded-xl flex items-start gap-2" role="alert">
                  <span className="text-red-500 text-sm">{analyzeError}</span>
                  <button onClick={() => setAnalyzeError(null)} aria-label="Dismiss error" className="shrink-0 text-red-300 hover:text-red-500 p-1">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Photo preview */}
              {photoPreview && (
                <div className="mb-4 relative">
                  <img src={photoPreview} alt="Food" className="w-full h-32 object-cover rounded-xl" />
                  <button onClick={() => setPhotoPreview(null)} aria-label="Remove photo" className="absolute top-2 right-2 w-9 h-9 bg-black/50 rounded-full flex items-center justify-center">
                    <X className="w-4 h-4 text-white" />
                  </button>
                </div>
              )}

              {/* Photo + Manual action row */}
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => photoInputRef.current?.click()}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#FAF6F1] rounded-xl text-sm font-medium text-[#6B6257] hover:bg-[#F3EAE2] transition-colors active:scale-[0.98]"
                >
                  <Camera className="w-4 h-4" />
                  {tr('addPhoto')}
                </button>
                <button
                  onClick={() => setShowManualEntry(true)}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#FAF6F1] rounded-xl text-sm font-medium text-[#6B6257] hover:bg-[#F3EAE2] transition-colors active:scale-[0.98]"
                >
                  <PenLine className="w-4 h-4" />
                  {tr('addManually')}
                </button>
              </div>

              {/* Copy from previous day */}
              {(() => {
                const prevDate = parseDateStr(selectedDate);
                prevDate.setDate(prevDate.getDate() - 1);
                const prevDateStr = toDateStr(prevDate);
                const prevItems = logs[prevDateStr]?.items?.filter(i => i.mealType === selectedMealType) || [];
                if (prevItems.length === 0) return null;
                const prevCals = prevItems.reduce((sum, i) => sum + i.calories, 0);
                return (
                  <button
                    onClick={() => {
                      const copied = prevItems.map(i => ({ ...i, id: generateId(), timestamp: Date.now() }));
                      onItemsAdded(copied, selectedDate);
                      copied.forEach(item => trackFoodFrequency(item));
                      setMostUsedFoods(getMostUsedFoods());
                      setSelectedMealType(null);
                    }}
                    className="w-full flex items-center gap-3 p-3.5 mb-4 bg-[#EFF2EE] border border-[#DDE5DB] rounded-xl hover:bg-[#E3E9E1] transition-colors active:scale-[0.98]"
                  >
                    <Copy className="w-4 h-4 text-[#3D5A48] shrink-0" />
                    <div className="text-left flex-1">
                      <p className="text-sm font-semibold text-[#3D5A48]">{tr('copyYesterday') || 'Copy yesterday\'s'} {getMealLabel(selectedMealType).toLowerCase()}</p>
                      <p className="text-xs text-[#6B6257] mt-0.5">{prevItems.length} item{prevItems.length !== 1 ? 's' : ''} • {Math.round(prevCals)} kcal</p>
                    </div>
                  </button>
                );
              })()}

              {/* Most Used foods - quick log */}
              {mostUsedFoods.length > 0 && (
                <div className="mb-4">
                  <div className="flex items-center gap-1.5 mb-2.5">
                    <TrendingUp className="w-3.5 h-3.5 text-[#E07A5F]" />
                    <span className="text-xs font-bold text-[#9A8B80] uppercase">{tr('mostUsed')}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {mostUsedFoods.map((item, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleQuickAdd({ id: generateId(), name: item.name, calories: item.calories, protein: item.protein, carbs: item.carbs, fat: item.fat, amountDescription: item.amountDescription, timestamp: Date.now() } as FoodItem)}
                        className="flex items-center gap-2 px-3 py-2.5 bg-[#E07A5F]/5 border border-[#E07A5F]/10 rounded-xl hover:bg-[#E07A5F]/10 transition-colors active:scale-[0.97]"
                      >
                        <span className="text-sm font-medium text-[#6B6257]">{item.name}</span>
                        <span className="text-[10px] text-[#9A8B80] font-bold">{item.calories}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* My Foods (favorites) */}
              {favoriteFoods.length > 0 && (
                <div className="mb-4">
                  <span className="text-xs font-bold text-[#9A8B80] uppercase">{tr('myFoods')}</span>
                  <div className="mt-2.5 space-y-2">
                    {favoriteFoods.slice(0, 3).map((item) => (
                      <button
                        key={item.id}
                        onClick={() => handleQuickAdd(item)}
                        className="w-full flex items-center justify-between p-3.5 bg-[#E07A5F]/5 rounded-xl hover:bg-[#E07A5F]/10 transition-colors active:scale-[0.98] min-h-[52px]"
                      >
                        <div className="text-left">
                          <p className="font-medium text-[#2B2523] text-[15px]">{item.name}</p>
                          <p className="text-xs text-[#9A8B80] mt-0.5">{item.defaultAmount}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[15px] font-bold text-[#6B6257]">{item.calories}</span>
                          <Plus className="w-4.5 h-4.5 text-[#E07A5F]" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent meals (grouped) + individual recent foods */}
              {(recentMeals.length > 0 || recentFoods.length > 0) && (
                <div className="mb-4">
                  <span className="text-xs font-bold text-[#9A8B80] uppercase">{tr('recent')}</span>
                  <div className="mt-2.5 space-y-2">
                    {recentMeals.slice(0, 3).map((meal) => (
                      <button
                        key={meal.id}
                        onClick={() => {
                          if (!selectedMealType) return;
                          const items = meal.items.map(i => ({
                            ...i,
                            id: generateId(),
                            mealType: selectedMealType,
                            timestamp: Date.now(),
                          }));
                          onItemsAdded(items, selectedDate);
                          items.forEach(i => trackFoodFrequency(i));
                          setMostUsedFoods(getMostUsedFoods());
                          setSelectedMealType(null);
                        }}
                        className="w-full flex items-center justify-between p-3.5 bg-[#E07A5F]/5 border border-[#E07A5F]/10 rounded-xl hover:bg-[#E07A5F]/10 transition-colors active:scale-[0.98] min-h-[52px]"
                      >
                        <div className="text-left">
                          <p className="font-medium text-[#2B2523] text-[15px]">{meal.name}</p>
                          <p className="text-xs text-[#9A8B80] mt-0.5">{meal.items.length} items</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <span className="text-[15px] font-bold text-[#6B6257]">{meal.totalCalories}</span>
                            <p className="text-[10px] text-[#9A8B80]">P{meal.totalProtein} C{meal.totalCarbs} F{meal.totalFat}</p>
                          </div>
                          <Plus className="w-4.5 h-4.5 text-[#E07A5F]" />
                        </div>
                      </button>
                    ))}
                    {recentFoods.slice(0, 4).map((item) => (
                      <button
                        key={item.id}
                        onClick={() => handleQuickAdd(item)}
                        className="w-full flex items-center justify-between p-3.5 bg-[#FAF6F1] rounded-xl hover:bg-[#F3EAE2] transition-colors active:scale-[0.98] min-h-[52px]"
                      >
                        <div className="text-left flex items-center gap-3">
                          {item.photoUri && (
                            <img src={item.photoUri} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                          )}
                          <div>
                            <p className="font-medium text-[#2B2523] text-[15px]">{item.name}</p>
                            <p className="text-xs text-[#9A8B80] mt-0.5">{item.amountDescription}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[15px] font-bold text-[#6B6257]">{item.calories}</span>
                          <Plus className="w-4.5 h-4.5 text-[#E07A5F]" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Manual Entry Modal (Centered) */}
      {showManualEntry && selectedMealType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => { setShowManualEntry(false); setSelectedMealType(null); setPhotoPreview(null); setInput(''); }} role="dialog" aria-modal="true" aria-label="Add food manually">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl max-h-[85vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-[#F3EAE2]">
              <button onClick={() => setShowManualEntry(false)} className="text-[#9A8B80] text-sm font-medium">{tr('back')}</button>
              <span className="font-bold text-[#2B2523]">{tr('addFood')}</span>
              <button onClick={handleManualSubmit} disabled={!manualForm.name || !manualForm.calories} className="text-[#E07A5F] text-sm font-bold disabled:opacity-40">{tr('save')}</button>
            </div>

            <div className="p-4 space-y-4 overflow-y-auto max-h-[calc(85vh-120px)]">
              {/* Photo preview in manual entry */}
              {photoPreview ? (
                <div className="relative">
                  <img src={photoPreview} alt="Food" className="w-full h-36 object-cover rounded-xl" />
                  <button onClick={() => setPhotoPreview(null)} aria-label="Remove photo" className="absolute top-2 right-2 w-9 h-9 bg-black/50 rounded-full flex items-center justify-center">
                    <X className="w-4 h-4 text-white" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => photoInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 py-4 border-2 border-dashed border-[#E8DFD5] rounded-xl text-sm font-medium text-[#9A8B80] hover:border-gray-300 hover:text-[#9A8B80] transition-colors active:scale-[0.98]"
                >
                  <Camera className="w-5 h-5" />
                  {tr('addPhoto')}
                </button>
              )}

              <input type="text" value={manualForm.name} onChange={(e) => setManualForm({ ...manualForm, name: e.target.value })} placeholder={tr('foodName')} autoComplete="off" className="w-full bg-[#F3EAE2] rounded-xl py-4 px-4 outline-none text-base text-[#2B2523] placeholder-[#B4A79C] font-medium focus:ring-2 focus:ring-[#E07A5F]/30" autoFocus />

              <div className="bg-[#FAF6F1] rounded-xl p-4">
                <p className="text-sm font-bold text-[#9A8B80] mb-3">{tr('servingSize')}</p>
                <div className="flex gap-2">
                  <input type="number" value={manualForm.servingSize} onChange={(e) => setManualForm({ ...manualForm, servingSize: e.target.value })} className="flex-1 bg-white rounded-xl py-3.5 px-4 outline-none text-base text-center font-bold border border-[#E8DFD5]" />
                  <select value={manualForm.servingUnit} onChange={(e) => setManualForm({ ...manualForm, servingUnit: e.target.value })} className="bg-white rounded-xl py-3.5 px-4 outline-none text-base font-medium border border-[#E8DFD5] min-w-[70px]">
                    <option value="g">g</option>
                    <option value="ml">ml</option>
                    <option value="pcs">pcs</option>
                  </select>
                </div>
                <div className="flex items-center justify-between mt-4">
                  <span className="text-sm text-[#9A8B80]">{tr('numberOfServings')}</span>
                  <div className="flex items-center gap-3">
                    <button onClick={() => setManualForm({ ...manualForm, servings: String(Math.max(0.5, (parseFloat(manualForm.servings) || 1) - 0.5)) })} className="w-11 h-11 bg-[#E8DFD5] rounded-xl text-[#6B6257] font-bold text-xl active:scale-95 transition-transform">-</button>
                    <span className="w-12 text-center font-bold text-lg">{manualForm.servings}</span>
                    <button onClick={() => setManualForm({ ...manualForm, servings: String((parseFloat(manualForm.servings) || 1) + 0.5) })} className="w-11 h-11 bg-[#E8DFD5] rounded-xl text-[#6B6257] font-bold text-xl active:scale-95 transition-transform">+</button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[#9A8B80] font-medium mb-1.5 block">{tr('calories')} *</label>
                  <input type="number" value={manualForm.calories} onChange={(e) => setManualForm({ ...manualForm, calories: e.target.value })} placeholder="0" className="w-full bg-[#F3EAE2] rounded-xl py-3.5 px-4 outline-none text-base font-bold focus:ring-2 focus:ring-[#E07A5F]/30" />
                </div>
                <div>
                  <label className="text-xs text-[#9A8B80] font-medium mb-1.5 block">{tr('protein')} (g)</label>
                  <input type="number" value={manualForm.protein} onChange={(e) => {
                    const p = e.target.value;
                    const newForm = { ...manualForm, protein: p };
                    // Auto-calc calories from macros if user hasn't manually set calories
                    const autoCalc = (Number(p) || 0) * 4 + (Number(manualForm.carbs) || 0) * 4 + (Number(manualForm.fat) || 0) * 9;
                    if (autoCalc > 0 && !manualForm.calories) newForm.calories = String(Math.round(autoCalc));
                    setManualForm(newForm);
                  }} placeholder="0" className="w-full bg-[#F3EAE2] rounded-xl py-3.5 px-4 outline-none text-base font-bold focus:ring-2 focus:ring-[#E07A5F]/30" />
                </div>
                <div>
                  <label className="text-xs text-[#9A8B80] font-medium mb-1.5 block">{tr('carbs')} (g)</label>
                  <input type="number" value={manualForm.carbs} onChange={(e) => {
                    const c = e.target.value;
                    const newForm = { ...manualForm, carbs: c };
                    const autoCalc = (Number(manualForm.protein) || 0) * 4 + (Number(c) || 0) * 4 + (Number(manualForm.fat) || 0) * 9;
                    if (autoCalc > 0 && !manualForm.calories) newForm.calories = String(Math.round(autoCalc));
                    setManualForm(newForm);
                  }} placeholder="0" className="w-full bg-[#F3EAE2] rounded-xl py-3.5 px-4 outline-none text-base font-bold focus:ring-2 focus:ring-[#E07A5F]/30" />
                </div>
                <div>
                  <label className="text-xs text-[#9A8B80] font-medium mb-1.5 block">{tr('fat')} (g)</label>
                  <input type="number" value={manualForm.fat} onChange={(e) => {
                    const f = e.target.value;
                    const newForm = { ...manualForm, fat: f };
                    const autoCalc = (Number(manualForm.protein) || 0) * 4 + (Number(manualForm.carbs) || 0) * 4 + (Number(f) || 0) * 9;
                    if (autoCalc > 0 && !manualForm.calories) newForm.calories = String(Math.round(autoCalc));
                    setManualForm(newForm);
                  }} placeholder="0" className="w-full bg-[#F3EAE2] rounded-xl py-3.5 px-4 outline-none text-base font-bold focus:ring-2 focus:ring-[#E07A5F]/30" />
                </div>
              </div>

              {manualForm.calories && (
                <div className="bg-[#E07A5F]/10 rounded-xl p-4 text-center">
                  <p className="text-xs text-[#E07A5F] font-medium mb-1">{tr('total')}</p>
                  <span className="text-3xl font-black text-[#2B2523]">{Math.round((parseFloat(manualForm.calories) || 0) * (parseFloat(manualForm.servings) || 1))}</span>
                  <span className="text-sm text-[#9A8B80] ml-1">kcal</span>
                </div>
              )}

              {/* Save to My Foods checkbox */}
              <label className="flex items-center gap-3 py-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={saveAsFavorite}
                  onChange={(e) => setSaveAsFavorite(e.target.checked)}
                  className="w-5 h-5 rounded-md border-gray-300 text-[#E07A5F] focus:ring-[#E07A5F]"
                />
                <span className="text-sm text-[#6B6257]">{tr('saveToMyFoods')}</span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Edit Item Modal (Centered) */}
      {itemToEdit && (() => {
        // The gram weight the item's CURRENT macros correspond to. Prefer the
        // stored basis; otherwise parse a value out of the amount description
        // (e.g. "150g", "~200 g"). 0 = unknown → grams-scaling is not possible.
        const parsedGrams = (() => {
          const m = itemToEdit.amountDescription?.match(/(\d+(?:\.\d+)?)\s*g\b/i);
          return m ? parseFloat(m[1]) : 0;
        })();
        const baseGrams = itemToEdit.grams && itemToEdit.grams > 0 ? itemToEdit.grams : parsedGrams;
        const gramsScalable = baseGrams > 0;

        // Returns both the scale factor and the resulting gram basis, so we can
        // persist the new basis and keep repeat edits consistent.
        const computeEdit = () => {
          let mult = 1;
          let newGrams = baseGrams || undefined;
          if (editUnit === 'multiplier' && editGrams) {
            mult = parseFloat(editGrams) || 1;
            if (baseGrams > 0) newGrams = baseGrams * mult;
          } else if (editUnit === 'grams' && editGrams && gramsScalable) {
            const g = parseFloat(editGrams) || baseGrams;
            mult = g / baseGrams;
            newGrams = g;
          } else if (editUnit === 'pieces' && editGrams) {
            mult = parseFloat(editGrams) || 1;
            if (baseGrams > 0) newGrams = baseGrams * mult;
          }
          // grams mode with no known basis: mult stays 1 (don't silently produce
          // wrong macros); only the label changes.
          return {
            mult,
            newGrams,
            macros: {
              calories: Math.round(itemToEdit.calories * mult),
              protein: Math.round(itemToEdit.protein * mult),
              carbs: Math.round(itemToEdit.carbs * mult),
              fat: Math.round(itemToEdit.fat * mult),
            },
          };
        };
        const edit = computeEdit();
        const preview = edit.macros;

        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setItemToEdit(null)} role="dialog" aria-modal="true" aria-label="Edit portion">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-[#F3EAE2]">
              <button onClick={() => setItemToEdit(null)} className="text-[#9A8B80] text-sm font-medium">{tr('cancel')}</button>
              <h3 className="font-bold text-[#2B2523]">{tr('editPortion')}</h3>
              <button onClick={() => {
                let newDesc = itemToEdit.amountDescription;
                if (editUnit === 'multiplier' && editGrams) {
                  const mult = parseFloat(editGrams) || 1;
                  newDesc = mult === 1 ? itemToEdit.amountDescription : `${mult}x portion`;
                } else if (editUnit === 'grams' && editGrams) {
                  newDesc = `~${editGrams}g`;
                } else if (editUnit === 'pieces' && editGrams) {
                  newDesc = `${editGrams} pcs`;
                }
                onRemoveItem(itemToEdit, selectedDate);
                onItemsAdded([{
                  ...itemToEdit,
                  id: generateId(),
                  amountDescription: newDesc,
                  grams: edit.newGrams, // persist the new basis so repeat edits scale correctly
                  ...preview,
                }], selectedDate);
                setItemToEdit(null);
                setEditGrams(''); setEditUnit('multiplier');
              }} className="text-[#E07A5F] text-sm font-bold">{tr('save')}</button>
            </div>

            <div className="p-4">
              <p className="font-medium text-[#2B2523] mb-1">{itemToEdit.name}</p>
              <p className="text-xs text-[#9A8B80] mb-4">{tr('current')}: {itemToEdit.amountDescription} • {Math.round(itemToEdit.calories)} kcal</p>

              <div className="flex bg-[#F3EAE2] rounded-xl p-1.5 mb-4">
                {(['multiplier', 'grams', 'pieces'] as const).map(unit => (
                  <button key={unit} onClick={() => { setEditUnit(unit); setEditGrams(unit === 'multiplier' ? '1' : unit === 'grams' && baseGrams > 0 ? String(baseGrams) : ''); }}
                    className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all active:scale-95 ${editUnit === unit ? 'bg-white shadow-sm text-[#2B2523]' : 'text-[#9A8B80]'}`}>
                    {unit === 'multiplier' ? tr('portion') : unit === 'grams' ? tr('grams') : tr('pieces')}
                  </button>
                ))}
              </div>

              {/* Quick select buttons */}
              {editUnit === 'multiplier' && (
                <div className="grid grid-cols-4 gap-2.5 mb-4">
                  {['0.5', '1', '1.5', '2'].map(m => (
                    <button key={m} onClick={() => setEditGrams(m)} className={`py-3.5 rounded-xl text-base font-bold transition-all active:scale-95 min-h-[48px] ${editGrams === m ? 'bg-[#E07A5F] text-white' : 'bg-[#F3EAE2] text-[#6B6257]'}`}>{m}x</button>
                  ))}
                </div>
              )}
              {editUnit === 'grams' && (
                <div className="grid grid-cols-4 gap-2.5 mb-4">
                  {[50, 100, 150, 200].map(g => (
                    <button key={g} onClick={() => setEditGrams(String(g))} className={`py-3.5 rounded-xl text-base font-bold transition-all active:scale-95 min-h-[48px] ${editGrams === String(g) ? 'bg-[#E07A5F] text-white' : 'bg-[#F3EAE2] text-[#6B6257]'}`}>{g}g</button>
                  ))}
                </div>
              )}
              {editUnit === 'pieces' && (
                <div className="grid grid-cols-4 gap-2.5 mb-4">
                  {['1', '2', '3', '4'].map(p => (
                    <button key={p} onClick={() => setEditGrams(p)} className={`py-3.5 rounded-xl text-base font-bold transition-all active:scale-95 min-h-[48px] ${editGrams === p ? 'bg-[#E07A5F] text-white' : 'bg-[#F3EAE2] text-[#6B6257]'}`}>{p}</button>
                  ))}
                </div>
              )}

              {/* Custom input */}
              <div className="flex gap-2.5 mb-4">
                <input
                  type="number"
                  placeholder={editUnit === 'multiplier' ? '1' : editUnit === 'grams' ? String(baseGrams || 100) : '1'}
                  className="flex-1 bg-[#F3EAE2] rounded-xl px-4 py-4 outline-none text-base font-bold text-center focus:ring-2 focus:ring-[#E07A5F]/30"
                  value={editGrams}
                  onChange={(e) => setEditGrams(e.target.value)}
                />
                <span className="flex items-center px-5 bg-[#F3EAE2] rounded-xl text-base font-bold text-[#9A8B80]">
                  {editUnit === 'multiplier' ? 'x' : editUnit === 'grams' ? 'g' : 'pcs'}
                </span>
              </div>

              {/* Preview */}
              {editGrams && (
                <div className="bg-[#E07A5F]/10 rounded-xl p-3 mb-4">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-[#E07A5F] font-medium">{tr('total')}</span>
                    <span className="text-lg font-black text-[#2B2523]">{preview.calories} kcal</span>
                  </div>
                  <div className="flex gap-3 mt-1.5">
                    <span className="text-[10px] font-bold text-[#9A8B80]">P {preview.protein}g</span>
                    <span className="text-[10px] font-bold text-[#9A8B80]">C {preview.carbs}g</span>
                    <span className="text-[10px] font-bold text-[#9A8B80]">F {preview.fat}g</span>
                  </div>
                </div>
              )}

              <button onClick={() => { onRemoveItem(itemToEdit, selectedDate); setItemToEdit(null); }} className="w-full py-4 bg-red-50 text-red-500 rounded-xl font-semibold text-base active:scale-[0.98] transition-transform min-h-[52px]">
                <Trash2 className="w-5 h-5 inline mr-2" />
                {tr('delete')}
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Analysis Modal */}
      {analyzedItems && selectedMealType && (
        <AnalysisModal
          items={analyzedItems}
          onConfirm={(editedItems) => {
            const itemsToAdd = editedItems.map(i => ({ ...i, id: generateId(), mealType: selectedMealType, timestamp: Date.now(), source: 'AI_LOG' as const, ...(photoPreview ? { photoUri: photoPreview } : {}) }));
            onItemsAdded(itemsToAdd, selectedDate);
            // Save grouped items as recent meals, ungrouped as individual recent foods
            const grouped = new Map<string, FoodItem[]>();
            itemsToAdd.forEach(item => {
              if (item.groupName) {
                const arr = grouped.get(item.groupName) || [];
                arr.push(item);
                grouped.set(item.groupName, arr);
              } else {
                addToRecentFoods(item);
              }
              trackFoodFrequency(item);
            });
            grouped.forEach((items, groupName) => addToRecentMeals(groupName, items));
            setRecentFoods(getRecentFoods());
            setRecentMeals(getRecentMeals());
            setMostUsedFoods(getMostUsedFoods());
            setInput('');
            setPhotoPreview(null);
            setAnalyzeError(null);
            setAnalyzedItems(null);
            setSelectedMealType(null);
          }}
          onCancel={() => setAnalyzedItems(null)}
        />
      )}

      {/* About Modal */}
      {showAbout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setShowAbout(false)} role="dialog" aria-modal="true" aria-label="About NutriVault">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="bg-[#E07A5F] p-5 text-center">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center mx-auto mb-2">
                <Heart className="w-6 h-6 text-white" />
              </div>
              <h2 className="text-lg font-bold text-white">NutriVault</h2>
              <p className="text-white/80 text-xs mt-1">{tr('appTagline')}</p>
            </div>
            <div className="p-4 space-y-3">
              <div className="bg-[#E07A5F]/5 rounded-xl p-3">
                <span className="font-bold text-[#2B2523] text-sm block mb-1">{tr('whyWeBuiltThis')}</span>
                <p className="text-xs text-[#6B6257] leading-relaxed">{tr('aboutDescription')}</p>
              </div>
              <div className="bg-[#EFF2EE] rounded-xl p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Scale className="w-4 h-4 text-[#3D5A48]" />
                  <span className="font-bold text-[#2B2523] text-sm">{tr('smartEstimation')}</span>
                </div>
                <p className="text-xs text-[#6B6257]">{tr('smartEstimationDesc')}</p>
              </div>
              <div className="bg-[#F6ECE2] rounded-xl p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Target className="w-4 h-4 text-amber-500" />
                  <span className="font-bold text-[#2B2523] text-sm">{tr('consistencyOverPerfection')}</span>
                </div>
                <p className="text-xs text-[#6B6257]">{tr('consistencyOverPerfectionDesc')}</p>
              </div>
              <div className="bg-green-50 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Heart className="w-4 h-4 text-green-500" />
                  <span className="font-bold text-[#2B2523] text-sm">{tr('noJudgment')}</span>
                </div>
                <p className="text-xs text-[#6B6257]">{tr('noJudgmentDesc')}</p>
              </div>
              <div className="bg-[#FAF6F1] rounded-xl p-3 text-center">
                <p className="text-[10px] text-[#9A8B80]">{tr('dataStaysLocalPhone')} 🔒</p>
              </div>
            </div>
            <div className="p-4 pt-0">
              <button onClick={() => setShowAbout(false)} className="w-full bg-[#E07A5F] text-white font-bold py-3 rounded-xl">{tr('gotIt')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden file input */}
      <input ref={photoInputRef} type="file" accept="image/*" capture="environment" onChange={handlePhotoCapture} className="hidden" />
    </div>
  );
};

export default Dashboard;

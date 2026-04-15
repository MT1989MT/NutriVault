import React, { useState, useMemo, useEffect, useCallback, memo } from 'react';
import { DayLog, UserProfile, FoodItem, MealType } from '../types';
import { Loader2, Trash2, Coffee, Sun, Moon, Cookie, Plus, X, Heart, Target, Brain, ChevronLeft, ChevronRight, ChevronDown, Flame, PenLine, User, Settings, ArrowRight, Scale, Info, Droplets, Minus, Camera, TrendingUp, Copy } from 'lucide-react';
import { parseFoodInput, parseFoodFromPhoto } from '../services/gemini';
import { toggleHabit, updateWaterIntake, getRecentFoods, addToRecentFoods, FavoriteFood, getFavoriteFoods, saveFavoriteFood, trackFoodFrequency, getMostUsedFoods } from '../services/storage';
import { generateId, calculateStreak } from '../utils/calculations';
import AnalysisModal from './AnalysisModal';
import { t as tr, getCurrentLanguage } from '../utils/i18n';

interface DashboardProps {
  profile: UserProfile;
  logs: Record<string, DayLog>;
  onItemsAdded: (items: FoodItem[], date?: string) => void;
  onRemoveItem: (item: FoodItem, date?: string) => void;
  onWaterUpdate?: (date: string, ml: number) => void;
  onSettingsClick: () => void;
  onCoachClick?: () => void;
  isActive?: boolean;
}

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
      className={`flex items-center justify-between py-3 hover:bg-gray-50/50 cursor-pointer active:bg-gray-50 transition-smooth min-h-[54px] ${indented ? 'pl-8 pr-4' : 'px-4'}`}
    >
      <div className="flex-1 min-w-0 pr-3 flex items-center gap-3">
        {item.photoUri && (
          <img src={item.photoUri} alt={item.name} className="w-10 h-10 rounded-lg object-cover shrink-0" />
        )}
        <div className="min-w-0">
          <p className={`font-medium text-gray-800 truncate ${indented ? 'text-[13px] text-gray-600' : 'text-[15px]'}`}>{item.name}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">{item.amountDescription}</p>
        </div>
      </div>
      <div className="text-right">
        <p className={`font-bold tabular-nums ${indented ? 'text-[13px] text-gray-700' : 'text-[15px] text-gray-900'}`}>{Math.round(item.calories)}</p>
        <p className="text-[10px] text-gray-400 tabular-nums">P{Math.round(item.protein)} C{Math.round(item.carbs)} F{Math.round(item.fat)}</p>
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
              className="flex items-center justify-between px-4 py-3 hover:bg-gray-50/50 cursor-pointer active:bg-gray-50 transition-smooth min-h-[54px]"
            >
              <div className="flex-1 min-w-0 pr-3 flex items-center gap-2">
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-[#E07A5F] shrink-0" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-[#E07A5F] shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="font-bold text-gray-900 text-[15px] truncate">{group.name}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{group.items.length} items</p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-bold text-gray-900 text-[15px] tabular-nums">{Math.round(group.totalCal)}</p>
                <p className="text-[10px] text-gray-400 tabular-nums">P{Math.round(group.totalP)} C{Math.round(group.totalC)} F{Math.round(group.totalF)}</p>
              </div>
            </div>
            {isExpanded && (
              <div className="bg-gray-50/30">
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

const Dashboard: React.FC<DashboardProps> = ({ profile, logs, onItemsAdded, onRemoveItem, onWaterUpdate, onSettingsClick, onCoachClick, isActive = true }) => {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const todayDate = new Date().toISOString().split('T')[0];
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

  const navigateDate = useCallback((direction: number) => {
    const date = new Date(selectedDate);
    date.setDate(date.getDate() + direction);
    const newDate = date.toISOString().split('T')[0];
    if (newDate <= todayDate) setSelectedDate(newDate);
  }, [selectedDate, todayDate]);

  const formatDateHeader = (dateStr: string) => {
    if (dateStr === todayDate) return tr('today');
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (dateStr === yesterday.toISOString().split('T')[0]) return 'Yesterday';
    return new Date(dateStr).toLocaleDateString(getCurrentLanguage(), { weekday: 'short', day: 'numeric', month: 'short' });
  };

  // Compute active calories directly from the day's workouts — no need to scan all logs
  const activeCaloriesComputed = useMemo(() => {
    const dayWorkouts = dayLog.workouts || [];
    return dayWorkouts.reduce((acc, w) => acc + (w.durationMinutes * (w.elevatedHeartRate ? 8 : 5)), 0);
  }, [dayLog.workouts]);

  useEffect(() => {
    setRecentFoods(getRecentFoods());
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

  const handleAnalyze = async () => {
    if ((!input.trim() && !photoPreview) || !selectedMealType) return;
    setIsAnalyzing(true);
    setAnalyzeError(null);
    try {
      let result;
      if (photoPreview) {
        // Photo-based analysis — extract base64 data from data URL
        const base64Data = photoPreview.split(',')[1] || photoPreview;
        result = await parseFoodFromPhoto(base64Data);
      } else {
        result = await parseFoodInput(input);
      }
      if (!result || result.length === 0) {
        setAnalyzeError(tr('couldNotIdentifyFood') || "Could not identify any food items. Please try again with more detail.");
        return;
      }
      // Always show review modal so user can adjust individual items before logging
      setAnalyzedItems(result);
      setInput('');
    } catch (err: any) {
      const msg = err?.message || err?.toString?.() || 'unknown error';
      console.error('Food analysis error:', msg);
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
    const colors = { [MealType.BREAKFAST]: 'text-orange-500', [MealType.LUNCH]: 'text-amber-500', [MealType.DINNER]: 'text-indigo-500', [MealType.SNACK]: 'text-pink-500' };
    const icons = { [MealType.BREAKFAST]: Coffee, [MealType.LUNCH]: Sun, [MealType.DINNER]: Moon, [MealType.SNACK]: Cookie };
    const Icon = icons[type];
    return <Icon className={`${size} ${colors[type]}`} />;
  };

  const getMealLabel = (type: MealType): string => {
    const keys: Record<MealType, string> = { [MealType.BREAKFAST]: 'breakfast', [MealType.LUNCH]: 'lunch', [MealType.DINNER]: 'dinner', [MealType.SNACK]: 'snack' };
    return tr(keys[type] as any);
  };

  // Modern arc gauge - memoized for performance
  const CalorieGauge = memo(({ size = 120, calories, target, remainingCal }: { size?: number; calories: number; target: number; remainingCal: number }) => {
    const radius = (size - 16) / 2;
    const circumference = 2 * Math.PI * radius;
    const progress = Math.min(1, calories / target);
    const isOver = remainingCal < 0;
    const strokeColor = isOver ? '#EF4444' : '#10B981';
    const bgStroke = isOver ? '#FEE2E2' : '#F0FDF4';

    return (
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={bgStroke} strokeWidth={11} />
          <circle cx={size/2} cy={size/2} r={radius} fill="none"
            stroke={strokeColor}
            strokeWidth={11}
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - progress)}
            strokeLinecap="round"
            className="transition-all duration-700 ease-out"
            style={{ filter: `drop-shadow(0 0 6px ${strokeColor}40)` }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-[28px] font-black tracking-tight font-display ${isOver ? 'text-red-500' : 'text-emerald-600'}`}>
            {Math.abs(Math.round(remainingCal))}
          </span>
          <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">
            {isOver ? tr('over') : tr('left')}
          </span>
        </div>
      </div>
    );
  });


  return (
    <div className="h-full flex flex-col bg-[#FAFAF8]">
      {/* Header with safe area */}
      <div className="bg-white border-b border-gray-100/80 px-4 pb-2" style={{paddingTop: 'max(env(safe-area-inset-top, 12px), 12px)'}}>
        <div className="flex items-center justify-between mb-2">
          <button onClick={onCoachClick} aria-label="AI Coach" className="w-11 h-11 bg-gradient-to-br from-[#E07A5F] to-[#C85A40] rounded-xl flex items-center justify-center active:scale-90 transition-smooth shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E07A5F] focus-visible:ring-offset-2">
            <Brain className="w-[18px] h-[18px] text-white" />
          </button>

          <div className="flex items-center">
            <span className="text-[20px] font-extrabold text-gray-900 font-display tracking-tight">Nutri</span><span className="text-[20px] font-extrabold text-[#E07A5F] font-display tracking-tight">Vault</span>
          </div>

          <button onClick={onSettingsClick} aria-label="Settings" className="w-11 h-11 bg-gray-50 rounded-xl flex items-center justify-center active:scale-90 transition-smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E07A5F] focus-visible:ring-offset-2">
            <Settings className="w-[18px] h-[18px] text-gray-400" />
          </button>
        </div>
        <div className="flex items-center justify-center gap-0">
          <button onClick={() => navigateDate(-1)} aria-label="Previous day" className="p-2.5 text-gray-300 hover:text-gray-500 active:scale-90 transition-smooth min-w-[44px] min-h-[44px] flex items-center justify-center">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-gray-600 font-semibold text-[13px] min-w-[90px] text-center font-display tracking-tight">
            {formatDateHeader(selectedDate)}
          </span>
          <button
            onClick={() => navigateDate(1)}
            disabled={selectedDate >= todayDate}
            aria-label="Next day"
            className={`p-2.5 active:scale-90 transition-smooth min-w-[44px] min-h-[44px] flex items-center justify-center ${selectedDate >= todayDate ? 'text-gray-200' : 'text-gray-300 hover:text-gray-500'}`}
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Sticky Budget Card */}
      <div className="bg-white px-4 py-5 card-shadow">
        <div className="flex items-center justify-center gap-8">
          <div className="text-center min-w-[70px]">
            <span className="text-[28px] font-black text-gray-900 font-display tracking-tight">{Math.round(totals.cal)}</span>
            <p className="text-[10px] text-gray-400 uppercase mt-0.5 font-semibold tracking-wider">{tr('eaten')}</p>
          </div>

          <CalorieGauge size={110} calories={totals.cal} target={targetCalories} remainingCal={remaining} />

          <div className="text-center min-w-[70px]">
            <span className="text-[28px] font-black text-gray-900 font-display tracking-tight">{targetCalories}</span>
            <p className="text-[10px] text-gray-400 uppercase mt-0.5 font-semibold tracking-wider">{tr('goal')}</p>
          </div>
        </div>

        {/* Macros bar */}
        <div className="mt-4 pt-3 border-t border-gray-50">
          {totalMacroGrams > 0 && (
            <div className="flex h-1.5 rounded-full overflow-hidden mb-3">
              <div className="bg-violet-500 transition-all duration-500" style={{ width: `${macroPercents.p}%` }} />
              <div className="bg-cyan-500 transition-all duration-500" style={{ width: `${macroPercents.c}%` }} />
              <div className="bg-amber-500 transition-all duration-500" style={{ width: `${macroPercents.f}%` }} />
            </div>
          )}
          <div className="flex justify-center gap-5">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-violet-500" />
              <span className="text-xs text-gray-500"><span className="font-bold text-gray-700">{Math.round(totals.p)}g</span> P</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-cyan-500" />
              <span className="text-xs text-gray-500"><span className="font-bold text-gray-700">{Math.round(totals.c)}g</span> C</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span className="text-xs text-gray-500"><span className="font-bold text-gray-700">{Math.round(totals.f)}g</span> F</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content - Scrollable with padding for nav + floating buttons */}
      <div className="flex-1 overflow-y-auto px-4 pt-3" style={{ paddingBottom: 'calc(140px + env(safe-area-inset-bottom, 0px))' }}>

        {/* Meal Sections */}
        {[MealType.BREAKFAST, MealType.LUNCH, MealType.DINNER, MealType.SNACK].map((mealType) => {
          const items = mealGroups[mealType];
          const mealCals = getMealCalories(mealType);
          const budget = mealBudgets[mealType];

          return (
            <div key={mealType} className="bg-white rounded-2xl card-shadow mb-3 overflow-hidden">
              {/* Meal Header */}
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2.5">
                  {getMealIcon(mealType, 'w-5 h-5')}
                  <span className="font-bold text-gray-800 text-[15px] font-display">{getMealLabel(mealType)}</span>
                </div>
                <div className="flex items-center gap-3">
                  {items.length > 0 && (
                    <span className="text-sm font-bold text-gray-400">{Math.round(mealCals)}</span>
                  )}
                  <button
                    onClick={() => setSelectedMealType(mealType)}
                    aria-label={`Add food to ${getMealLabel(mealType).toLowerCase()}`}
                    className="w-11 h-11 bg-gradient-to-br from-[#E07A5F] to-[#C85A40] rounded-xl flex items-center justify-center active:scale-90 transition-smooth shadow-sm shadow-[#E07A5F]/20"
                  >
                    <Plus className="w-4 h-4 text-white" strokeWidth={2.5} />
                  </button>
                </div>
              </div>

              {/* Items */}
              {items.length > 0 ? (
                <MealItemList items={items} onItemClick={handleMealItemClick} />
              ) : (
                <div className="px-4 py-3.5 text-sm text-gray-300 italic">
                  {budget} kcal {tr('left').toLowerCase()}
                </div>
              )}
            </div>
          );
        })}

        {/* Water Intake */}
        <div className="bg-white rounded-2xl p-4 card-shadow mb-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Droplets className="w-4 h-4 text-blue-400" />
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Water</span>
            </div>
            <span className="text-sm font-bold text-blue-500 tabular-nums">{((dayLog.waterIntakeMl || 0) / 1000).toFixed(1)}L</span>
          </div>
          <div className="w-full h-1.5 bg-blue-50 rounded-full mb-3 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-blue-400 to-blue-500 rounded-full transition-all duration-500 ease-out" style={{ width: `${Math.min(100, ((dayLog.waterIntakeMl || 0) / 2500) * 100)}%` }} />
          </div>
          <div className="flex items-center justify-center gap-2">
            <button onClick={() => onWaterUpdate?.(selectedDate, -250)} aria-label="Remove 250ml water" className="w-11 h-11 bg-gray-50 rounded-xl flex items-center justify-center active:scale-90 transition-smooth">
              <Minus className="w-4 h-4 text-gray-400" />
            </button>
            {[250, 500].map(ml => (
              <button key={ml} onClick={() => onWaterUpdate?.(selectedDate, ml)} aria-label={`Add ${ml}ml water`} className="flex-1 bg-blue-50 text-blue-600 py-2.5 rounded-xl text-xs font-bold active:scale-90 transition-smooth hover:bg-blue-100 min-h-[44px]">
                +{ml}ml
              </button>
            ))}
          </div>
        </div>

        {/* Habits */}
        {profile.habits && profile.habits.length > 0 && (
          <div className="bg-white rounded-2xl p-4 card-shadow mb-3">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{tr('dailyHabits')}</span>
            <div className="flex flex-wrap gap-2 mt-3">
              {profile.habits.map(h => (
                <button
                  key={h}
                  onClick={() => toggleHabit(selectedDate, h)}
                  className={`px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-smooth active:scale-90 min-h-[44px] ${dayLog.habitsCompleted?.includes(h) ? 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200' : 'bg-gray-50 text-gray-400'}`}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => { setSelectedMealType(null); setAnalyzeError(null); }} role="dialog" aria-modal="true" aria-label="Add food">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <button onClick={() => { setSelectedMealType(null); setAnalyzeError(null); }} className="text-gray-400 text-sm font-medium">
                {tr('cancel')}
              </button>
              <div className="flex items-center gap-2">
                {getMealIcon(selectedMealType, 'w-5 h-5')}
                <span className="font-bold text-gray-900">{getMealLabel(selectedMealType)}</span>
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
                  className="w-full bg-gray-50 rounded-xl py-4 px-4 pr-16 outline-none text-base text-gray-800 placeholder-gray-400 focus:ring-2 focus:ring-[#E07A5F]/30"
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
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-gray-50 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors active:scale-[0.98]"
                >
                  <Camera className="w-4 h-4" />
                  {tr('addPhoto')}
                </button>
                <button
                  onClick={() => setShowManualEntry(true)}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-gray-50 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors active:scale-[0.98]"
                >
                  <PenLine className="w-4 h-4" />
                  {tr('addManually')}
                </button>
              </div>

              {/* Copy from previous day */}
              {(() => {
                const prevDate = new Date(selectedDate);
                prevDate.setDate(prevDate.getDate() - 1);
                const prevDateStr = prevDate.toISOString().split('T')[0];
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
                    className="w-full flex items-center gap-3 p-3.5 mb-4 bg-violet-50 border border-violet-100 rounded-xl hover:bg-violet-100 transition-colors active:scale-[0.98]"
                  >
                    <Copy className="w-4 h-4 text-violet-500 shrink-0" />
                    <div className="text-left flex-1">
                      <p className="text-sm font-semibold text-violet-700">{tr('copyYesterday') || 'Copy yesterday\'s'} {getMealLabel(selectedMealType).toLowerCase()}</p>
                      <p className="text-xs text-violet-400 mt-0.5">{prevItems.length} item{prevItems.length !== 1 ? 's' : ''} • {Math.round(prevCals)} kcal</p>
                    </div>
                  </button>
                );
              })()}

              {/* Most Used foods - quick log */}
              {mostUsedFoods.length > 0 && (
                <div className="mb-4">
                  <div className="flex items-center gap-1.5 mb-2.5">
                    <TrendingUp className="w-3.5 h-3.5 text-[#E07A5F]" />
                    <span className="text-xs font-bold text-gray-400 uppercase">{tr('mostUsed')}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {mostUsedFoods.map((item, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleQuickAdd({ id: generateId(), name: item.name, calories: item.calories, protein: item.protein, carbs: item.carbs, fat: item.fat, amountDescription: item.amountDescription, timestamp: Date.now() } as FoodItem)}
                        className="flex items-center gap-2 px-3 py-2.5 bg-[#E07A5F]/5 border border-[#E07A5F]/10 rounded-xl hover:bg-[#E07A5F]/10 transition-colors active:scale-[0.97]"
                      >
                        <span className="text-sm font-medium text-gray-700">{item.name}</span>
                        <span className="text-[10px] text-gray-400 font-bold">{item.calories}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* My Foods (favorites) */}
              {favoriteFoods.length > 0 && (
                <div className="mb-4">
                  <span className="text-xs font-bold text-gray-400 uppercase">{tr('myFoods')}</span>
                  <div className="mt-2.5 space-y-2">
                    {favoriteFoods.slice(0, 3).map((item) => (
                      <button
                        key={item.id}
                        onClick={() => handleQuickAdd(item)}
                        className="w-full flex items-center justify-between p-3.5 bg-[#E07A5F]/5 rounded-xl hover:bg-[#E07A5F]/10 transition-colors active:scale-[0.98] min-h-[52px]"
                      >
                        <div className="text-left">
                          <p className="font-medium text-gray-800 text-[15px]">{item.name}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{item.defaultAmount}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[15px] font-bold text-gray-600">{item.calories}</span>
                          <Plus className="w-4.5 h-4.5 text-[#E07A5F]" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent foods */}
              {recentFoods.length > 0 && (
                <div className="mb-4">
                  <span className="text-xs font-bold text-gray-400 uppercase">{tr('recent')}</span>
                  <div className="mt-2.5 space-y-2">
                    {recentFoods.slice(0, 4).map((item) => (
                      <button
                        key={item.id}
                        onClick={() => handleQuickAdd(item)}
                        className="w-full flex items-center justify-between p-3.5 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors active:scale-[0.98] min-h-[52px]"
                      >
                        <div className="text-left flex items-center gap-3">
                          {item.photoUri && (
                            <img src={item.photoUri} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                          )}
                          <div>
                            <p className="font-medium text-gray-800 text-[15px]">{item.name}</p>
                            <p className="text-xs text-gray-400 mt-0.5">{item.amountDescription}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[15px] font-bold text-gray-600">{item.calories}</span>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => { setShowManualEntry(false); setSelectedMealType(null); }} role="dialog" aria-modal="true" aria-label="Add food manually">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl max-h-[85vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <button onClick={() => setShowManualEntry(false)} className="text-gray-400 text-sm font-medium">{tr('back')}</button>
              <span className="font-bold text-gray-900">{tr('addFood')}</span>
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
                  className="w-full flex items-center justify-center gap-2 py-4 border-2 border-dashed border-gray-200 rounded-xl text-sm font-medium text-gray-400 hover:border-gray-300 hover:text-gray-500 transition-colors active:scale-[0.98]"
                >
                  <Camera className="w-5 h-5" />
                  {tr('addPhoto')}
                </button>
              )}

              <input type="text" value={manualForm.name} onChange={(e) => setManualForm({ ...manualForm, name: e.target.value })} placeholder={tr('foodName')} autoComplete="off" className="w-full bg-gray-100 rounded-xl py-4 px-4 outline-none text-base text-gray-800 placeholder-gray-400 font-medium focus:ring-2 focus:ring-[#E07A5F]/30" autoFocus />

              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-sm font-bold text-gray-500 mb-3">{tr('servingSize')}</p>
                <div className="flex gap-2">
                  <input type="number" value={manualForm.servingSize} onChange={(e) => setManualForm({ ...manualForm, servingSize: e.target.value })} className="flex-1 bg-white rounded-xl py-3.5 px-4 outline-none text-base text-center font-bold border border-gray-200" />
                  <select value={manualForm.servingUnit} onChange={(e) => setManualForm({ ...manualForm, servingUnit: e.target.value })} className="bg-white rounded-xl py-3.5 px-4 outline-none text-base font-medium border border-gray-200 min-w-[70px]">
                    <option value="g">g</option>
                    <option value="ml">ml</option>
                    <option value="pcs">pcs</option>
                  </select>
                </div>
                <div className="flex items-center justify-between mt-4">
                  <span className="text-sm text-gray-500">{tr('numberOfServings')}</span>
                  <div className="flex items-center gap-3">
                    <button onClick={() => setManualForm({ ...manualForm, servings: String(Math.max(0.5, (parseFloat(manualForm.servings) || 1) - 0.5)) })} className="w-11 h-11 bg-gray-200 rounded-xl text-gray-600 font-bold text-xl active:scale-95 transition-transform">-</button>
                    <span className="w-12 text-center font-bold text-lg">{manualForm.servings}</span>
                    <button onClick={() => setManualForm({ ...manualForm, servings: String((parseFloat(manualForm.servings) || 1) + 0.5) })} className="w-11 h-11 bg-gray-200 rounded-xl text-gray-600 font-bold text-xl active:scale-95 transition-transform">+</button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 font-medium mb-1.5 block">{tr('calories')} *</label>
                  <input type="number" value={manualForm.calories} onChange={(e) => setManualForm({ ...manualForm, calories: e.target.value })} placeholder="0" className="w-full bg-gray-100 rounded-xl py-3.5 px-4 outline-none text-base font-bold focus:ring-2 focus:ring-[#E07A5F]/30" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium mb-1.5 block">{tr('protein')} (g)</label>
                  <input type="number" value={manualForm.protein} onChange={(e) => {
                    const p = e.target.value;
                    const newForm = { ...manualForm, protein: p };
                    // Auto-calc calories from macros if user hasn't manually set calories
                    const autoCalc = (Number(p) || 0) * 4 + (Number(manualForm.carbs) || 0) * 4 + (Number(manualForm.fat) || 0) * 9;
                    if (autoCalc > 0 && !manualForm.calories) newForm.calories = String(Math.round(autoCalc));
                    setManualForm(newForm);
                  }} placeholder="0" className="w-full bg-gray-100 rounded-xl py-3.5 px-4 outline-none text-base font-bold focus:ring-2 focus:ring-[#E07A5F]/30" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium mb-1.5 block">{tr('carbs')} (g)</label>
                  <input type="number" value={manualForm.carbs} onChange={(e) => {
                    const c = e.target.value;
                    const newForm = { ...manualForm, carbs: c };
                    const autoCalc = (Number(manualForm.protein) || 0) * 4 + (Number(c) || 0) * 4 + (Number(manualForm.fat) || 0) * 9;
                    if (autoCalc > 0 && !manualForm.calories) newForm.calories = String(Math.round(autoCalc));
                    setManualForm(newForm);
                  }} placeholder="0" className="w-full bg-gray-100 rounded-xl py-3.5 px-4 outline-none text-base font-bold focus:ring-2 focus:ring-[#E07A5F]/30" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium mb-1.5 block">{tr('fat')} (g)</label>
                  <input type="number" value={manualForm.fat} onChange={(e) => {
                    const f = e.target.value;
                    const newForm = { ...manualForm, fat: f };
                    const autoCalc = (Number(manualForm.protein) || 0) * 4 + (Number(manualForm.carbs) || 0) * 4 + (Number(f) || 0) * 9;
                    if (autoCalc > 0 && !manualForm.calories) newForm.calories = String(Math.round(autoCalc));
                    setManualForm(newForm);
                  }} placeholder="0" className="w-full bg-gray-100 rounded-xl py-3.5 px-4 outline-none text-base font-bold focus:ring-2 focus:ring-[#E07A5F]/30" />
                </div>
              </div>

              {manualForm.calories && (
                <div className="bg-[#E07A5F]/10 rounded-xl p-4 text-center">
                  <p className="text-xs text-[#E07A5F] font-medium mb-1">{tr('total')}</p>
                  <span className="text-3xl font-black text-gray-900">{Math.round((parseFloat(manualForm.calories) || 0) * (parseFloat(manualForm.servings) || 1))}</span>
                  <span className="text-sm text-gray-500 ml-1">kcal</span>
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
                <span className="text-sm text-gray-600">{tr('saveToMyFoods')}</span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Edit Item Modal (Centered) */}
      {itemToEdit && (() => {
        // Calculate per-unit base values for accurate scaling
        const itemGrams = (itemToEdit as any).grams || 0;
        const calcEditPreview = () => {
          let mult = 1;
          if (editUnit === 'multiplier' && editGrams) {
            mult = parseFloat(editGrams) || 1;
          } else if (editUnit === 'grams' && editGrams && itemGrams > 0) {
            mult = parseFloat(editGrams) / itemGrams;
          } else if (editUnit === 'grams' && editGrams) {
            mult = parseFloat(editGrams) / 100;
          } else if (editUnit === 'pieces' && editGrams) {
            mult = parseFloat(editGrams);
          }
          return {
            calories: Math.round(itemToEdit.calories * mult),
            protein: Math.round(itemToEdit.protein * mult),
            carbs: Math.round(itemToEdit.carbs * mult),
            fat: Math.round(itemToEdit.fat * mult),
          };
        };
        const preview = calcEditPreview();

        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setItemToEdit(null)} role="dialog" aria-modal="true" aria-label="Edit portion">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <button onClick={() => setItemToEdit(null)} className="text-gray-400 text-sm font-medium">{tr('cancel')}</button>
              <h3 className="font-bold text-gray-900">{tr('editPortion')}</h3>
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
                  ...preview,
                }], selectedDate);
                setItemToEdit(null);
                setEditGrams(''); setEditUnit('multiplier');
              }} className="text-[#E07A5F] text-sm font-bold">{tr('save')}</button>
            </div>

            <div className="p-4">
              <p className="font-medium text-gray-900 mb-1">{itemToEdit.name}</p>
              <p className="text-xs text-gray-400 mb-4">{tr('current')}: {itemToEdit.amountDescription} • {Math.round(itemToEdit.calories)} kcal</p>

              <div className="flex bg-gray-100 rounded-xl p-1.5 mb-4">
                {(['multiplier', 'grams', 'pieces'] as const).map(unit => (
                  <button key={unit} onClick={() => { setEditUnit(unit); setEditGrams(unit === 'multiplier' ? '1' : unit === 'grams' && itemGrams > 0 ? String(itemGrams) : ''); }}
                    className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all active:scale-95 ${editUnit === unit ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
                    {unit === 'multiplier' ? tr('portion') : unit === 'grams' ? tr('grams') : tr('pieces')}
                  </button>
                ))}
              </div>

              {/* Quick select buttons */}
              {editUnit === 'multiplier' && (
                <div className="grid grid-cols-4 gap-2.5 mb-4">
                  {['0.5', '1', '1.5', '2'].map(m => (
                    <button key={m} onClick={() => setEditGrams(m)} className={`py-3.5 rounded-xl text-base font-bold transition-all active:scale-95 min-h-[48px] ${editGrams === m ? 'bg-[#E07A5F] text-white' : 'bg-gray-100 text-gray-600'}`}>{m}x</button>
                  ))}
                </div>
              )}
              {editUnit === 'grams' && (
                <div className="grid grid-cols-4 gap-2.5 mb-4">
                  {[50, 100, 150, 200].map(g => (
                    <button key={g} onClick={() => setEditGrams(String(g))} className={`py-3.5 rounded-xl text-base font-bold transition-all active:scale-95 min-h-[48px] ${editGrams === String(g) ? 'bg-[#E07A5F] text-white' : 'bg-gray-100 text-gray-600'}`}>{g}g</button>
                  ))}
                </div>
              )}
              {editUnit === 'pieces' && (
                <div className="grid grid-cols-4 gap-2.5 mb-4">
                  {['1', '2', '3', '4'].map(p => (
                    <button key={p} onClick={() => setEditGrams(p)} className={`py-3.5 rounded-xl text-base font-bold transition-all active:scale-95 min-h-[48px] ${editGrams === p ? 'bg-[#E07A5F] text-white' : 'bg-gray-100 text-gray-600'}`}>{p}</button>
                  ))}
                </div>
              )}

              {/* Custom input */}
              <div className="flex gap-2.5 mb-4">
                <input
                  type="number"
                  placeholder={editUnit === 'multiplier' ? '1' : editUnit === 'grams' ? String(itemGrams || 100) : '1'}
                  className="flex-1 bg-gray-100 rounded-xl px-4 py-4 outline-none text-base font-bold text-center"
                  value={editGrams}
                  onChange={(e) => setEditGrams(e.target.value)}
                />
                <span className="flex items-center px-5 bg-gray-100 rounded-xl text-base font-bold text-gray-500">
                  {editUnit === 'multiplier' ? 'x' : editUnit === 'grams' ? 'g' : 'pcs'}
                </span>
              </div>

              {/* Preview */}
              {editGrams && (
                <div className="bg-[#E07A5F]/10 rounded-xl p-3 mb-4">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-[#E07A5F] font-medium">{tr('total')}</span>
                    <span className="text-lg font-black text-gray-900">{preview.calories} kcal</span>
                  </div>
                  <div className="flex gap-3 mt-1.5">
                    <span className="text-[10px] font-bold text-gray-400">P {preview.protein}g</span>
                    <span className="text-[10px] font-bold text-gray-400">C {preview.carbs}g</span>
                    <span className="text-[10px] font-bold text-gray-400">F {preview.fat}g</span>
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
            itemsToAdd.forEach(item => { addToRecentFoods(item); trackFoodFrequency(item); });
            setRecentFoods(getRecentFoods());
            setMostUsedFoods(getMostUsedFoods());
            setPhotoPreview(null);
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
            <div className="bg-gradient-to-r from-[#E07A5F] to-[#C85A40] p-5 text-center">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center mx-auto mb-2">
                <Heart className="w-6 h-6 text-white" />
              </div>
              <h2 className="text-lg font-bold text-white">NutriVault</h2>
              <p className="text-white/80 text-xs mt-1">{tr('appTagline')}</p>
            </div>
            <div className="p-4 space-y-3">
              <div className="bg-[#E07A5F]/5 rounded-xl p-3">
                <span className="font-bold text-gray-900 text-sm block mb-1">{tr('whyWeBuiltThis')}</span>
                <p className="text-xs text-gray-600 leading-relaxed">{tr('aboutDescription')}</p>
              </div>
              <div className="bg-blue-50 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Scale className="w-4 h-4 text-blue-500" />
                  <span className="font-bold text-gray-900 text-sm">{tr('smartEstimation')}</span>
                </div>
                <p className="text-xs text-gray-600">{tr('smartEstimationDesc')}</p>
              </div>
              <div className="bg-amber-50 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Target className="w-4 h-4 text-amber-500" />
                  <span className="font-bold text-gray-900 text-sm">{tr('consistencyOverPerfection')}</span>
                </div>
                <p className="text-xs text-gray-600">{tr('consistencyOverPerfectionDesc')}</p>
              </div>
              <div className="bg-green-50 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Heart className="w-4 h-4 text-green-500" />
                  <span className="font-bold text-gray-900 text-sm">{tr('noJudgment')}</span>
                </div>
                <p className="text-xs text-gray-600">{tr('noJudgmentDesc')}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-[10px] text-gray-400">{tr('dataStaysLocalPhone')} 🔒</p>
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

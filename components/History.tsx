import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, TrendingDown, TrendingUp, Flame, Scale, Plus, X, Check, Droplets, Target, Utensils, Dumbbell } from 'lucide-react';
import { getLogs, getProfile, saveLogs } from '../services/storage';
import { t, getCurrentLanguage } from '../utils/i18n';
import { getMacroTargets, macroGramsFromTargets } from '../utils/calculations';
import { todayStr, toDateStr, parseDateStr } from '../utils/date';
import { DayLog, UserProfile } from '../types';

interface HistoryProps {
  logs?: Record<string, DayLog>;
  profile?: UserProfile | null;
  onCoachClick?: () => void;
}

const History: React.FC<HistoryProps> = ({ logs: propLogs, profile: propProfile }) => {
  const [weekOffset, setWeekOffset] = useState(0);
  const [showWeightInput, setShowWeightInput] = useState(false);
  const [weightInput, setWeightInput] = useState('');
  const [logsVersion, setLogsVersion] = useState(0);

  // Always read from storage (source of truth) - re-read when propLogs change or local writes happen
  const logs = useMemo(() => {
    void propLogs; // trigger re-read when App-level logs change
    return getLogs();
  }, [propLogs, logsVersion]);
  const profile = propProfile || getProfile();
  const targetCalories = profile?.customCalories || profile?.tdee || 2000;
  const lang = getCurrentLanguage();

  const handleLogWeight = () => {
    const weight = parseFloat(weightInput);
    if (isNaN(weight) || weight <= 0) return;
    const today = todayStr();
    const currentLogs = getLogs();
    const day = currentLogs[today] || { date: today, items: [] };
    const updated = { ...currentLogs, [today]: { ...day, weightLog: weight } };
    saveLogs(updated);
    setLogsVersion(v => v + 1);
    setWeightInput('');
    setShowWeightInput(false);
  };

  const weekDates = useMemo(() => {
    const today = new Date();
    const startOfWeek = new Date(today);
    const dow = today.getDay();
    const diff = dow === 0 ? -6 : 1 - dow; // Sunday: go back 6 days to Monday
    startOfWeek.setDate(today.getDate() + diff + (weekOffset * 7));
    const dates: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      dates.push(toDateStr(d));
    }
    return dates;
  }, [weekOffset]);

  const dailyData = useMemo(() => {
    const today = todayStr();
    const weightFactor = (profile?.weightKg || 75) / 75;
    return weekDates.map(date => {
      const log = logs[date];
      const items = log?.items || [];
      // Single pass over items for all macro totals
      let eaten = 0, protein = 0, carbs = 0, fat = 0;
      for (let i = 0; i < items.length; i++) {
        eaten += items[i].calories;
        protein += items[i].protein;
        carbs += items[i].carbs;
        fat += items[i].fat;
      }
      const dayWorkouts = log?.workouts || [];
      let burned = 0;
      for (let i = 0; i < dayWorkouts.length; i++) {
        burned += Math.round(dayWorkouts[i].durationMinutes * (dayWorkouts[i].elevatedHeartRate ? 8 : 5) * weightFactor);
      }
      const d = parseDateStr(date);
      return { date, eaten, burned, protein, carbs, fat, isToday: date === today, hasData: eaten > 0, dayName: ['M', 'T', 'W', 'T', 'F', 'S', 'S'][d.getDay() === 0 ? 6 : d.getDay() - 1] };
    });
  }, [weekDates, logs]);

  const weekStats = useMemo(() => {
    // Single pass over dailyData for all aggregations
    let totalEaten = 0, totalBurned = 0, sumProtein = 0, sumCarbs = 0, sumFat = 0, daysTracked = 0, onTarget = 0, totalWater = 0;
    for (let i = 0; i < dailyData.length; i++) {
      const d = dailyData[i];
      totalEaten += d.eaten;
      totalBurned += d.burned;
      totalWater += logs[d.date]?.waterIntakeMl || 0;
      if (d.hasData) {
        daysTracked++;
        sumProtein += d.protein;
        sumCarbs += d.carbs;
        sumFat += d.fat;
        if (Math.abs(d.eaten - targetCalories) <= 200) onTarget++;
      }
    }
    const avgEaten = daysTracked ? Math.round(totalEaten / daysTracked) : 0;
    const avgProtein = daysTracked ? Math.round(sumProtein / daysTracked) : 0;
    const avgCarbs = daysTracked ? Math.round(sumCarbs / daysTracked) : 0;
    const avgFat = daysTracked ? Math.round(sumFat / daysTracked) : 0;
    const totalMacros = avgProtein + avgCarbs + avgFat;
    const proteinPct = totalMacros > 0 ? Math.round((avgProtein / totalMacros) * 100) : 0;
    const carbsPct = totalMacros > 0 ? Math.round((avgCarbs / totalMacros) * 100) : 0;
    const fatPct = totalMacros > 0 ? Math.round((avgFat / totalMacros) * 100) : 0;
    const avgWater = daysTracked ? Math.round(totalWater / daysTracked) : 0;
    return { totalEaten, totalBurned, avgEaten, avgProtein, avgCarbs, avgFat, proteinPct, carbsPct, fatPct, daysTracked, onTarget, avgWater };
  }, [dailyData, logs, targetCalories]);

  // Macro target grams from profile split (null when no profile is set up)
  const macroTargets = useMemo(
    () => (profile ? macroGramsFromTargets(targetCalories, getMacroTargets(profile)) : null),
    [profile, targetCalories]
  );

  const weightData = useMemo(() => {
    const weights: { date: string; weight: number }[] = [];
    Object.entries(logs).forEach(([date, log]: [string, any]) => {
      if (log.weightLog) weights.push({ date, weight: log.weightLog });
    });
    weights.sort((a, b) => a.date.localeCompare(b.date));
    if (weights.length === 0) return { current: profile?.weightKg || 0, change: 0, avg10: 0, entries: [] as { date: string; weight: number }[], bmi: 0, bmiCategory: '', goalProgress: 0, targetWeight: 0, weeklyRate: 0, weeksToGoal: 0, minWeight: 0, maxWeight: 0 };
    const current = weights[weights.length - 1]?.weight || profile?.weightKg || 0;
    const first = weights[0]?.weight || current;
    const change = Math.round((current - first) * 10) / 10;
    const last10 = weights.slice(-10);
    const avg10 = last10.length > 0 ? Math.round(last10.reduce((s, w) => s + w.weight, 0) / last10.length * 10) / 10 : current;
    // Keep last 30 entries for timeline
    const entries = weights.slice(-30);

    // BMI calculation
    const heightM = (profile?.heightCm || 170) / 100;
    const bmi = current > 0 && heightM > 0 ? Math.round((current / (heightM * heightM)) * 10) / 10 : 0;
    const bmiCategory = bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Normal' : bmi < 30 ? 'Overweight' : 'Obese';

    // Goal progress
    const targetWeight = profile?.targetWeightKg || 0;
    let goalProgress = 0;
    let weeklyRate = 0;
    let weeksToGoal = 0;
    if (targetWeight > 0 && first !== targetWeight) {
      const totalToLose = first - targetWeight; // positive = losing, negative = gaining
      const lost = first - current;
      goalProgress = totalToLose !== 0 ? Math.min(100, Math.max(0, Math.round((lost / totalToLose) * 100))) : 0;

      // Weekly rate based on last 4 weeks of data
      const fourWeeksAgo = weights.filter(w => {
        const daysDiff = (Date.now() - new Date(w.date).getTime()) / (1000 * 60 * 60 * 24);
        return daysDiff <= 28;
      });
      if (fourWeeksAgo.length >= 2) {
        const firstRecent = fourWeeksAgo[0].weight;
        const lastRecent = fourWeeksAgo[fourWeeksAgo.length - 1].weight;
        const daysBetween = (new Date(fourWeeksAgo[fourWeeksAgo.length - 1].date).getTime() - new Date(fourWeeksAgo[0].date).getTime()) / (1000 * 60 * 60 * 24);
        if (daysBetween > 0) {
          weeklyRate = Math.round(((firstRecent - lastRecent) / daysBetween) * 7 * 10) / 10; // kg/week (positive = losing)
          const remaining = current - targetWeight;
          if (weeklyRate !== 0 && Math.sign(remaining) === Math.sign(weeklyRate)) {
            weeksToGoal = Math.max(1, Math.round(Math.abs(remaining / weeklyRate)));
          }
        }
      }
    }

    // Pre-compute min/max to avoid redundant map() calls in SVG render
    let minWeight = Infinity, maxWeight = -Infinity;
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].weight < minWeight) minWeight = entries[i].weight;
      if (entries[i].weight > maxWeight) maxWeight = entries[i].weight;
    }
    if (!isFinite(minWeight)) minWeight = current;
    if (!isFinite(maxWeight)) maxWeight = current;

    return { current, change, avg10, entries, bmi, bmiCategory, goalProgress, targetWeight, weeklyRate, weeksToGoal, minWeight, maxWeight };
  }, [logs, profile]);

  // Workout overview for the week
  const weekWorkouts = useMemo(() => {
    const cardioKeywords = ['running', 'cardio', 'cycling', 'swimming', 'hiit', 'walking', 'jogging', 'rowing', 'elliptical', 'treadmill', 'bike', 'spin', 'aerobic'];
    const strengthKeywords = ['strength', 'weight', 'lifting', 'push', 'pull', 'leg', 'upper', 'lower', 'chest', 'back', 'arm', 'shoulder', 'squat', 'deadlift', 'bench', 'muscle', 'core', 'abs'];

    const workouts: { date: string; type: string; duration: number; category: 'cardio' | 'strength' | 'other'; dayName: string }[] = [];

    weekDates.forEach(date => {
      const log = logs[date];
      const dayWorkouts = log?.workouts || [];
      const d = parseDateStr(date);
      const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];

      dayWorkouts.forEach(w => {
        const typeLower = w.type.toLowerCase();
        let category: 'cardio' | 'strength' | 'other' = 'other';
        if (cardioKeywords.some(k => typeLower.includes(k))) category = 'cardio';
        else if (strengthKeywords.some(k => typeLower.includes(k))) category = 'strength';

        workouts.push({ date, type: w.type, duration: w.durationMinutes, category, dayName });
      });
    });

    const totalCardio = workouts.filter(w => w.category === 'cardio').reduce((s, w) => s + w.duration, 0);
    const totalStrength = workouts.filter(w => w.category === 'strength').reduce((s, w) => s + w.duration, 0);
    const totalOther = workouts.filter(w => w.category === 'other').reduce((s, w) => s + w.duration, 0);

    return { workouts, totalCardio, totalStrength, totalOther, total: totalCardio + totalStrength + totalOther };
  }, [weekDates, logs]);

  const getWeekLabel = (): string => {
    if (weekOffset === 0) return t('thisWeek');
    if (weekOffset === -1) return t('lastWeek');
    const start = parseDateStr(weekDates[0]);
    const end = parseDateStr(weekDates[6]);
    return `${start.getDate()} - ${end.getDate()} ${end.toLocaleDateString(lang, { month: 'short' })}`;
  };

  const maxCal = Math.max(...dailyData.map(d => d.eaten), targetCalories, 1);

  // Labelled 6px progress bar (same pattern as the dashboard hero macros)
  const MacroBar: React.FC<{ label: string; value: number; target: number | null; fallbackPct: number; fill: string; track: string }> = ({ label, value, target, fallbackPct, fill, track }) => {
    const pct = target && target > 0 ? Math.min(100, (value / target) * 100) : fallbackPct;
    const over = !!target && target > 0 && value > target;
    return (
      <div className="flex-1 min-w-0">
        {/* Label on its own line so long labels never truncate at 390px */}
        <span className="text-[11px] font-semibold text-[#6B6257] block leading-tight">{label}</span>
        <span className={`text-[10px] font-semibold tabular-nums block mb-1.5 ${over ? 'text-[#C85A40]' : 'text-[#9A8B80]'}`}>{target && target > 0 ? `${value}/${target}g` : `${value}g`}</span>
        <div className="h-[6px] rounded-full overflow-hidden" style={{ background: track }}>
          <div className="h-full rounded-full anim-bar" style={{ width: `${pct}%`, background: fill }} />
        </div>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-[#FAF6F1]">
      {/* Header: transparent, title left, week switcher pill right */}
      <div className="px-5 pb-3" style={{ paddingTop: 'max(env(safe-area-inset-top, 14px), 14px)' }}>
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-[24px] font-bold text-[#2B2523] font-display tracking-tight">{t('overview')}</h1>
          <div className="flex items-center bg-white rounded-full card-shadow">
            <button
              onClick={() => setWeekOffset(o => o - 1)}
              aria-label="Previous week"
              className="w-11 h-11 flex items-center justify-center rounded-full active:scale-90 transition-smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E07A5F]"
            >
              <ChevronLeft className="w-[18px] h-[18px] text-[#9A8B80]" />
            </button>
            <span className="text-[12px] font-bold text-[#2B2523] font-display tracking-tight min-w-[78px] text-center tabular-nums">
              {getWeekLabel()}
            </span>
            <button
              onClick={() => setWeekOffset(o => Math.min(0, o + 1))}
              disabled={weekOffset >= 0}
              aria-label="Next week"
              className="w-11 h-11 flex items-center justify-center rounded-full active:scale-90 transition-smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E07A5F]"
            >
              <ChevronRight className={`w-[18px] h-[18px] ${weekOffset >= 0 ? 'text-[#E8DFD5]' : 'text-[#9A8B80]'}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5" style={{ paddingBottom: 'calc(90px + env(safe-area-inset-bottom, 0px))' }}>
        {/* Stat tiles row */}
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div className="bg-white rounded-[20px] p-3.5 card-shadow">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Utensils className="w-3.5 h-3.5 text-[#E07A5F]" />
              <span className="text-[10px] font-semibold text-[#9A8B80] capitalize truncate">{t('eaten')}</span>
            </div>
            <span className="text-[20px] font-extrabold text-[#2B2523] font-display tracking-tight tabular-nums">{weekStats.totalEaten.toLocaleString()}</span>
          </div>
          <div className="bg-white rounded-[20px] p-3.5 card-shadow">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Flame className="w-3.5 h-3.5 text-[#D9964F]" />
              <span className="text-[10px] font-semibold text-[#9A8B80] capitalize truncate">{t('burned')}</span>
            </div>
            <span className="text-[20px] font-extrabold text-[#2B2523] font-display tracking-tight tabular-nums">{weekStats.totalBurned.toLocaleString()}</span>
          </div>
          <div className="bg-white rounded-[20px] p-3.5 card-shadow">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Target className="w-3.5 h-3.5 text-[#3D5A48]" />
              <span className="text-[10px] font-semibold text-[#9A8B80] truncate">Avg/day</span>
            </div>
            <span className="text-[20px] font-extrabold text-[#2B2523] font-display tracking-tight tabular-nums">{weekStats.avgEaten.toLocaleString()}</span>
          </div>
        </div>

        {/* On-target days + water chips */}
        <div className="flex gap-3 mb-3">
          <div className="flex-1 flex items-center gap-2 bg-white rounded-[16px] px-3.5 py-2.5 card-shadow">
            <div className="w-7 h-7 bg-[#EFF2EE] rounded-full flex items-center justify-center shrink-0">
              <Target className="w-3.5 h-3.5 text-[#3D5A48]" />
            </div>
            <div className="min-w-0">
              <span className="text-[13px] font-bold text-[#2B2523] font-display tabular-nums">{weekStats.onTarget}/{weekStats.daysTracked}</span>
              <p className="text-[10px] text-[#9A8B80] font-medium truncate">days on target</p>
            </div>
          </div>
          <div className="flex-1 flex items-center gap-2 bg-white rounded-[16px] px-3.5 py-2.5 card-shadow">
            <div className="w-7 h-7 bg-[#EFF2EE] rounded-full flex items-center justify-center shrink-0">
              <Droplets className="w-3.5 h-3.5 text-[#3D5A48]" />
            </div>
            <div className="min-w-0">
              <span className="text-[13px] font-bold text-[#2B2523] font-display tabular-nums">{(weekStats.avgWater / 1000).toFixed(1)}L</span>
              <p className="text-[10px] text-[#9A8B80] font-medium truncate">water / day</p>
            </div>
          </div>
        </div>

        {/* Calories per day */}
        <div className="bg-white rounded-[24px] p-4 card-shadow mb-3">
          <div className="flex items-baseline justify-between mb-3">
            <span className="text-[13px] font-bold text-[#2B2523] font-display">{t('caloriesPerDay')}</span>
            <span className="text-[11px] font-medium text-[#B4A79C] tabular-nums">goal {targetCalories.toLocaleString()}</span>
          </div>
          <div className="flex items-end gap-1.5 h-[110px]">
            {dailyData.map((d) => {
              const barHeight = d.hasData ? Math.max(8, (d.eaten / maxCal) * 100) : 5;
              const barColor = d.isToday ? '#E07A5F' : !d.hasData ? '#F3EAE2' : d.eaten <= targetCalories ? '#3D5A48' : '#E8DFD5';
              return (
                <div
                  key={d.date}
                  className="flex-1 rounded-[8px] transition-all duration-500"
                  style={{ height: `${barHeight}%`, background: barColor }}
                />
              );
            })}
          </div>
          <div className="flex gap-1.5 mt-1.5">
            {dailyData.map((d) => (
              <span key={d.date} className={`flex-1 text-center text-[10px] ${d.isToday ? 'font-bold text-[#E07A5F]' : 'font-medium text-[#9A8B80]'}`}>
                {d.dayName}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-[#F3EAE2]">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-[3px] bg-[#3D5A48]" />
              <span className="text-[10px] text-[#9A8B80] font-medium">On target</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-[3px] bg-[#E07A5F]" />
              <span className="text-[10px] text-[#9A8B80] font-medium">Today</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-[3px] bg-[#E8DFD5]" />
              <span className="text-[10px] text-[#9A8B80] font-medium">Off target</span>
            </div>
          </div>
        </div>

        {/* Macros - daily average */}
        <div className="bg-white rounded-[24px] p-4 card-shadow mb-3">
          <span className="text-[13px] font-bold text-[#2B2523] font-display">{t('macros')} — daily average</span>
          <div className="flex gap-3 mt-3">
            <MacroBar label={t('protein')} value={weekStats.avgProtein} target={macroTargets?.protein ?? null} fallbackPct={weekStats.proteinPct} fill="#3D5A48" track="#EDF0EC" />
            <MacroBar label={t('carbs')} value={weekStats.avgCarbs} target={macroTargets?.carbs ?? null} fallbackPct={weekStats.carbsPct} fill="#D9964F" track="#F6ECE2" />
            <MacroBar label={t('fat')} value={weekStats.avgFat} target={macroTargets?.fat ?? null} fallbackPct={weekStats.fatPct} fill="#E07A5F" track="#F6E4DB" />
          </div>
        </div>

        {/* Weight */}
        <div className="bg-white rounded-[24px] p-4 card-shadow mb-3">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[13px] font-bold text-[#2B2523] font-display">{t('weight')}</span>
            {weightData.entries.length > 0 && (
              <div className="flex items-center gap-1 bg-[#EFF2EE] px-2.5 py-1 rounded-full">
                {weightData.change <= 0 ? <TrendingDown className="w-3 h-3 text-[#3D5A48]" /> : <TrendingUp className="w-3 h-3 text-[#3D5A48]" />}
                <span className="text-[10px] font-bold text-[#3D5A48] tabular-nums">{weightData.change > 0 ? '+' : ''}{weightData.change} kg</span>
              </div>
            )}
          </div>

          <div className="flex items-baseline gap-1.5 mb-3">
            <span className="text-[28px] font-extrabold text-[#2B2523] font-display tracking-tight tabular-nums leading-none">{weightData.current || '—'}</span>
            <span className="text-[13px] text-[#9A8B80] font-medium">
              kg{weightData.targetWeight > 0 ? ` · target ${weightData.targetWeight.toFixed(1)}` : ''}
            </span>
          </div>

          {/* BMI / 10d avg / rate mini stats */}
          {weightData.entries.length > 0 && (
            <div className="flex gap-2 mb-3">
              {weightData.bmi > 0 && (
                <div className="flex-1 bg-[#FAF6F1] rounded-[14px] px-3 py-2">
                  <span className="text-[13px] font-bold text-[#2B2523] font-display tabular-nums">{weightData.bmi}</span>
                  <p className="text-[10px] text-[#9A8B80] font-medium truncate">BMI · {weightData.bmiCategory}</p>
                </div>
              )}
              <div className="flex-1 bg-[#FAF6F1] rounded-[14px] px-3 py-2">
                <span className="text-[13px] font-bold text-[#2B2523] font-display tabular-nums">{weightData.avg10} kg</span>
                <p className="text-[10px] text-[#9A8B80] font-medium truncate">10-day avg</p>
              </div>
              {weightData.weeklyRate !== 0 && (
                <div className="flex-1 bg-[#FAF6F1] rounded-[14px] px-3 py-2">
                  <span className="text-[13px] font-bold text-[#2B2523] font-display tabular-nums">
                    {weightData.weeklyRate > 0 ? '-' : '+'}{Math.abs(weightData.weeklyRate)} kg
                  </span>
                  <p className="text-[10px] text-[#9A8B80] font-medium truncate">per week</p>
                </div>
              )}
            </div>
          )}

          {/* Sparkline */}
          {weightData.entries.length >= 2 ? (
            <div>
              <div className="relative h-[120px]">
                <svg width="100%" height="120" viewBox="0 0 300 120" preserveAspectRatio="none" className="overflow-visible">
                  {(() => {
                    const entries = weightData.entries;
                    const minW = weightData.minWeight - 0.5;
                    const maxW = weightData.maxWeight + 0.5;
                    const range = maxW - minW || 1;
                    const points = entries.map((e, i) => {
                      const x = entries.length === 1 ? 150 : (i / (entries.length - 1)) * 280 + 10;
                      const y = 110 - ((e.weight - minW) / range) * 100;
                      return { x, y };
                    });
                    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
                    const last = points[points.length - 1];
                    return (
                      <>
                        <path d={linePath} fill="none" stroke="#E07A5F" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                        <circle cx={last.x} cy={last.y} r={4.5} fill="#E07A5F" stroke="white" strokeWidth="2" />
                      </>
                    );
                  })()}
                </svg>
              </div>
              {/* Date labels */}
              <div className="flex justify-between mt-1 px-1">
                <span className="text-[10px] text-[#B4A79C] font-medium">{parseDateStr(weightData.entries[0].date).toLocaleDateString(lang, { month: 'short', day: 'numeric' })}</span>
                <span className="text-[10px] text-[#B4A79C] font-medium">{parseDateStr(weightData.entries[weightData.entries.length - 1].date).toLocaleDateString(lang, { month: 'short', day: 'numeric' })}</span>
              </div>
              {/* Weight at first/last entry — chronological, matching the date labels above */}
              <div className="flex justify-between mt-0.5 px-1">
                <span className="text-[10px] text-[#9A8B80] font-semibold tabular-nums">{weightData.entries[0].weight} kg</span>
                <span className="text-[10px] text-[#9A8B80] font-semibold tabular-nums">{weightData.entries[weightData.entries.length - 1].weight} kg</span>
              </div>
            </div>
          ) : (
            <div className="text-center py-6">
              <Scale className="w-8 h-8 mx-auto mb-2 text-[#B4A79C] opacity-60" />
              <p className="text-xs text-[#9A8B80]">Log your weight to see your progress over time</p>
            </div>
          )}

          {/* Goal progress */}
          {weightData.targetWeight > 0 && weightData.entries.length > 0 && (
            <div className="mt-3">
              <div className="h-[6px] rounded-full overflow-hidden bg-[#F6E4DB]">
                <div className="h-full rounded-full anim-bar bg-[#E07A5F]" style={{ width: `${weightData.goalProgress}%` }} />
              </div>
              <div className="flex justify-between mt-1.5">
                <span className="text-[10px] text-[#B4A79C] font-medium tabular-nums">{weightData.goalProgress}% to goal</span>
                {weightData.weeksToGoal > 0 && (
                  <span className="text-[10px] text-[#B4A79C] font-medium tabular-nums">~{weightData.weeksToGoal} {weightData.weeksToGoal === 1 ? 'week' : 'weeks'} to go</span>
                )}
              </div>
            </div>
          )}

          <button
            onClick={() => setShowWeightInput(true)}
            aria-label="Log weight"
            className="w-full mt-3 bg-[#FBEBE4] text-[#C85A40] font-bold text-[13px] py-3 rounded-full flex items-center justify-center gap-1.5 active:scale-95 transition-smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E07A5F]"
          >
            <Plus className="w-4 h-4" />
            {t('logWeight')}
          </button>
        </div>

        {/* Workouts this week */}
        {weekWorkouts.workouts.length > 0 && (
          <div className="bg-white rounded-[24px] p-4 card-shadow mb-3">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[13px] font-bold text-[#2B2523] font-display">Workouts</span>
              <span className="text-[11px] font-semibold text-[#9A8B80] tabular-nums">{weekWorkouts.total} min</span>
            </div>
            {/* Category breakdown */}
            <div className="flex gap-2 mb-3 flex-wrap">
              {weekWorkouts.totalCardio > 0 && (
                <div className="flex items-center gap-1.5 bg-[#EFF2EE] px-2.5 py-1.5 rounded-full">
                  <div className="w-2 h-2 rounded-full bg-[#3D5A48]" />
                  <span className="text-[10px] font-bold text-[#3D5A48] tabular-nums">Cardio {weekWorkouts.totalCardio}m</span>
                </div>
              )}
              {weekWorkouts.totalStrength > 0 && (
                <div className="flex items-center gap-1.5 bg-[#F6ECE2] px-2.5 py-1.5 rounded-full">
                  <div className="w-2 h-2 rounded-full bg-[#D9964F]" />
                  <span className="text-[10px] font-bold text-[#C4763B] tabular-nums">Strength {weekWorkouts.totalStrength}m</span>
                </div>
              )}
              {weekWorkouts.totalOther > 0 && (
                <div className="flex items-center gap-1.5 bg-[#F3EAE2] px-2.5 py-1.5 rounded-full">
                  <div className="w-2 h-2 rounded-full bg-[#B4A79C]" />
                  <span className="text-[10px] font-bold text-[#6B6257] tabular-nums">Other {weekWorkouts.totalOther}m</span>
                </div>
              )}
            </div>
            {/* Workout list */}
            <div className="space-y-1.5">
              {weekWorkouts.workouts.map((w, i) => (
                <div key={i} className="flex items-center justify-between p-2.5 bg-[#FAF6F1] rounded-[14px]">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 rounded-[10px] flex items-center justify-center ${
                      w.category === 'cardio' ? 'bg-[#EFF2EE]' : w.category === 'strength' ? 'bg-[#F6ECE2]' : 'bg-[#F3EAE2]'
                    }`}>
                      <Dumbbell className={`w-4 h-4 ${
                        w.category === 'cardio' ? 'text-[#3D5A48]' : w.category === 'strength' ? 'text-[#C4763B]' : 'text-[#9A8B80]'
                      }`} />
                    </div>
                    <div>
                      <div className="font-semibold text-xs text-[#2B2523]">{w.type}</div>
                      <div className="text-[10px] text-[#9A8B80]">{w.dayName}</div>
                    </div>
                  </div>
                  <span className="font-bold text-xs text-[#6B6257] tabular-nums">{w.duration}m</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Weight Input Modal */}
        {showWeightInput && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Log weight">
            <div className="bg-white w-full max-w-xs rounded-[24px] p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Scale className="w-5 h-5 text-[#E07A5F]" />
                  <h3 className="font-bold font-display text-[15px] text-[#2B2523]">{t('logWeight')}</h3>
                </div>
                <button onClick={() => setShowWeightInput(false)} aria-label="Close" className="p-2 -mr-1 active:scale-90 transition-smooth">
                  <X className="w-5 h-5 text-[#9A8B80]" />
                </button>
              </div>
              <div className="relative mb-4">
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  placeholder={weightData.current ? weightData.current.toString() : "70.0"}
                  value={weightInput}
                  onChange={(e) => setWeightInput(e.target.value)}
                  aria-label="Weight in kg"
                  className="w-full bg-[#FAF6F1] px-4 py-3 pr-12 rounded-[14px] outline-none text-lg font-bold font-display text-center text-[#2B2523] placeholder:text-[#B4A79C] focus:ring-2 focus:ring-[#E07A5F]/30"
                  autoFocus
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[#9A8B80] font-medium">kg</span>
              </div>
              <button
                onClick={handleLogWeight}
                disabled={!weightInput || parseFloat(weightInput) <= 0}
                className="w-full bg-[#E07A5F] terra-shadow text-white py-3.5 rounded-full font-bold disabled:opacity-40 flex items-center justify-center gap-2 active:scale-95 transition-smooth"
              >
                <Check className="w-4 h-4" />
                {t('saveWeight')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default History;

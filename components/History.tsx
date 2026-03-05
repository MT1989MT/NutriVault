import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Flame, Dumbbell, TrendingDown, TrendingUp, Activity, Scale, Plus, X, Check, Droplets, Target, Utensils, Heart, Trophy } from 'lucide-react';
import { getLogs, getProfile, saveLogs } from '../services/storage';
import { t, getCurrentLanguage } from '../utils/i18n';
import { calculateStreak } from '../utils/calculations';
import { DayLog, UserProfile } from '../types';

interface HistoryProps {
  logs?: Record<string, DayLog>;
  profile?: UserProfile | null;
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
    const today = new Date().toISOString().split('T')[0];
    const currentLogs = getLogs();
    if (!currentLogs[today]) currentLogs[today] = { date: today, items: [] };
    currentLogs[today].weightLog = weight;
    saveLogs(currentLogs);
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
      dates.push(d.toISOString().split('T')[0]);
    }
    return dates;
  }, [weekOffset]);

  const dailyData = useMemo(() => {
    return weekDates.map(date => {
      const log = logs[date];
      const items = log?.items || [];
      const eaten = items.reduce((s, i) => s + i.calories, 0);
      const protein = items.reduce((s, i) => s + i.protein, 0);
      const carbs = items.reduce((s, i) => s + i.carbs, 0);
      const fat = items.reduce((s, i) => s + i.fat, 0);
      const dayWorkouts = log?.workouts || [];
      const weightFactor = (profile?.weightKg || 75) / 75; // Scale relative to 75kg reference
      const burned = dayWorkouts.reduce((s, w) => s + Math.round(w.durationMinutes * (w.elevatedHeartRate ? 8 : 5) * weightFactor), 0);
      const isToday = date === new Date().toISOString().split('T')[0];
      const d = new Date(date);
      return { date, eaten, burned, protein, carbs, fat, isToday, hasData: eaten > 0, dayName: ['M', 'T', 'W', 'T', 'F', 'S', 'S'][d.getDay() === 0 ? 6 : d.getDay() - 1] };
    });
  }, [weekDates, logs]);

  const weekStats = useMemo(() => {
    const daysWithData = dailyData.filter(d => d.hasData);
    const totalEaten = dailyData.reduce((s, d) => s + d.eaten, 0);
    const totalBurned = dailyData.reduce((s, d) => s + d.burned, 0);
    const avgEaten = daysWithData.length ? Math.round(totalEaten / daysWithData.length) : 0;
    const avgProtein = daysWithData.length ? Math.round(daysWithData.reduce((s, d) => s + d.protein, 0) / daysWithData.length) : 0;
    const avgCarbs = daysWithData.length ? Math.round(daysWithData.reduce((s, d) => s + d.carbs, 0) / daysWithData.length) : 0;
    const avgFat = daysWithData.length ? Math.round(daysWithData.reduce((s, d) => s + d.fat, 0) / daysWithData.length) : 0;
    const totalMacros = avgProtein + avgCarbs + avgFat;
    const proteinPct = totalMacros > 0 ? Math.round((avgProtein / totalMacros) * 100) : 0;
    const carbsPct = totalMacros > 0 ? Math.round((avgCarbs / totalMacros) * 100) : 0;
    const fatPct = totalMacros > 0 ? Math.round((avgFat / totalMacros) * 100) : 0;
    // Days within ±200 kcal of target
    const onTarget = daysWithData.filter(d => Math.abs(d.eaten - targetCalories) <= 200).length;
    // Average water intake
    const totalWater = weekDates.reduce((s, date) => s + (logs[date]?.waterIntakeMl || 0), 0);
    const avgWater = daysWithData.length ? Math.round(totalWater / daysWithData.length) : 0;
    return { totalEaten, totalBurned, avgEaten, avgProtein, avgCarbs, avgFat, proteinPct, carbsPct, fatPct, daysTracked: daysWithData.length, onTarget, avgWater };
  }, [dailyData, weekDates, logs, targetCalories]);

  const streak = useMemo(() => calculateStreak(logs), [logs]);

  const weightData = useMemo(() => {
    const weights: { date: string; weight: number }[] = [];
    Object.entries(logs).forEach(([date, log]: [string, any]) => {
      if (log.weightLog) weights.push({ date, weight: log.weightLog });
    });
    weights.sort((a, b) => a.date.localeCompare(b.date));
    if (weights.length === 0) return { current: profile?.weightKg || 0, change: 0, avg10: 0, entries: [] as { date: string; weight: number }[], bmi: 0, bmiCategory: '', goalProgress: 0, targetWeight: 0, weeklyRate: 0, weeksToGoal: 0 };
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

    return { current, change, avg10, entries, bmi, bmiCategory, goalProgress, targetWeight, weeklyRate, weeksToGoal };
  }, [logs, profile]);

  // Workout overview for the week
  const weekWorkouts = useMemo(() => {
    const cardioKeywords = ['running', 'cardio', 'cycling', 'swimming', 'hiit', 'walking', 'jogging', 'rowing', 'elliptical', 'treadmill', 'bike', 'spin', 'aerobic'];
    const strengthKeywords = ['strength', 'weight', 'lifting', 'push', 'pull', 'leg', 'upper', 'lower', 'chest', 'back', 'arm', 'shoulder', 'squat', 'deadlift', 'bench', 'muscle', 'core', 'abs'];

    const workouts: { date: string; type: string; duration: number; category: 'cardio' | 'strength' | 'other'; dayName: string }[] = [];

    weekDates.forEach(date => {
      const log = logs[date];
      const dayWorkouts = log?.workouts || [];
      const d = new Date(date);
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
    const start = new Date(weekDates[0]);
    const end = new Date(weekDates[6]);
    return `${start.getDate()} - ${end.getDate()} ${end.toLocaleDateString(lang, { month: 'short' })}`;
  };

  const maxCal = Math.max(...dailyData.map(d => d.eaten), targetCalories, 1);

  return (
    <div className="h-full flex flex-col bg-[#FAFAF8]">
      {/* Header */}
      <div className="bg-white border-b border-gray-100/80 px-4 pb-2" style={{paddingTop: 'max(env(safe-area-inset-top, 12px), 12px)'}}>
        <div className="flex items-center justify-center mb-2">
          <span className="text-[20px] font-extrabold text-gray-900 font-display tracking-tight">{t('overview')}</span>
        </div>
        <div className="flex items-center justify-center gap-0">
          <button onClick={() => setWeekOffset(o => o - 1)} className="p-2 text-gray-300 hover:text-gray-500 active:scale-90 transition-smooth">
            <ChevronLeft className="w-4.5 h-4.5" />
          </button>
          <span className="text-gray-600 font-semibold text-[13px] min-w-[100px] text-center font-display tracking-tight">
            {getWeekLabel()}
          </span>
          <button
            onClick={() => setWeekOffset(o => Math.min(0, o + 1))}
            disabled={weekOffset >= 0}
            className={`p-2 active:scale-90 transition-smooth ${weekOffset >= 0 ? 'text-gray-200' : 'text-gray-300 hover:text-gray-500'}`}
          >
            <ChevronRight className="w-4.5 h-4.5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pt-3" style={{ paddingBottom: 'calc(130px + env(safe-area-inset-bottom, 0px))' }}>
        {/* Weekly Summary */}
        <div className="bg-white rounded-2xl p-4 card-shadow mb-3">
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="text-center">
              <div className="w-8 h-8 bg-[#E07A5F]/10 rounded-xl flex items-center justify-center mx-auto mb-1.5">
                <Utensils className="w-4 h-4 text-[#E07A5F]" />
              </div>
              <span className="text-lg font-black text-gray-900 font-display tabular-nums">{weekStats.totalEaten.toLocaleString()}</span>
              <p className="text-[9px] text-gray-400 font-semibold uppercase tracking-wider">{t('eaten')}</p>
            </div>
            <div className="text-center">
              <div className="w-8 h-8 bg-orange-50 rounded-xl flex items-center justify-center mx-auto mb-1.5">
                <Flame className="w-4 h-4 text-orange-500" />
              </div>
              <span className="text-lg font-black text-gray-900 font-display tabular-nums">{weekStats.totalBurned}</span>
              <p className="text-[9px] text-gray-400 font-semibold uppercase tracking-wider">{t('burned')}</p>
            </div>
            <div className="text-center">
              <div className="w-8 h-8 bg-emerald-50 rounded-xl flex items-center justify-center mx-auto mb-1.5">
                <Target className="w-4 h-4 text-emerald-500" />
              </div>
              <span className="text-lg font-black text-gray-900 font-display tabular-nums">{weekStats.avgEaten}</span>
              <p className="text-[9px] text-gray-400 font-semibold uppercase tracking-wider">{t('avgPerDay')}</p>
            </div>
          </div>
          <div className="flex gap-2 pt-3 border-t border-gray-50">
            <div className="flex-1 flex items-center gap-2 bg-emerald-50 px-3 py-2 rounded-xl">
              <Target className="w-3.5 h-3.5 text-emerald-600" />
              <div>
                <span className="text-xs font-bold text-emerald-700 tabular-nums">{weekStats.onTarget}/{weekStats.daysTracked}</span>
                <span className="text-[9px] text-emerald-600 ml-1">{t('goal')}</span>
              </div>
            </div>
            <div className="flex-1 flex items-center gap-2 bg-blue-50 px-3 py-2 rounded-xl">
              <Droplets className="w-3.5 h-3.5 text-blue-500" />
              <div>
                <span className="text-xs font-bold text-blue-700 tabular-nums">{(weekStats.avgWater / 1000).toFixed(1)}L</span>
                <span className="text-[9px] text-blue-600 ml-1">{t('avgPerDay')}</span>
              </div>
            </div>
          </div>
        </div>

        {/* WEEKLY KCAL OVERVIEW - Enhanced bar chart */}
        <div className="bg-white rounded-2xl p-4 card-shadow mb-3">
          <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">WEEKLY KCAL OVERVIEW</span>
          <div className="mt-3">
            <div className="flex gap-2">
              {dailyData.map((d, i) => {
                const barHeight = maxCal > 0 ? Math.max(6, (d.eaten / maxCal) * 100) : 6;
                const targetLine = maxCal > 0 ? (targetCalories / maxCal) * 100 : 50;
                const isOnTarget = d.eaten > 0 && Math.abs(d.eaten - targetCalories) <= 200;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center">
                    <span className={`text-[8px] font-bold mb-1.5 tabular-nums ${d.isToday ? 'text-[#E07A5F]' : d.eaten > 0 ? 'text-gray-600' : 'text-gray-300'}`}>
                      {d.eaten > 0 ? d.eaten : '-'}
                    </span>
                    <div className="w-full h-[72px] bg-gray-50 rounded-lg relative overflow-hidden">
                      {/* Target line */}
                      <div className="absolute left-0 right-0 border-t border-dashed border-gray-200" style={{ bottom: `${targetLine}%` }} />
                      {/* Bar */}
                      <div
                        className={`absolute bottom-0 left-0.5 right-0.5 rounded-md transition-all duration-500 ${
                          d.isToday ? 'bg-gradient-to-t from-[#E07A5F] to-[#E07A5F]/70' :
                          isOnTarget ? 'bg-gradient-to-t from-emerald-400 to-emerald-300' :
                          d.eaten > 0 ? 'bg-gradient-to-t from-gray-300 to-gray-200' : 'bg-gray-100'
                        }`}
                        style={{ height: `${barHeight}%` }}
                      />
                    </div>
                    <span className={`text-[9px] mt-1.5 font-medium ${d.isToday ? 'font-bold text-[#E07A5F]' : 'text-gray-400'}`}>
                      {d.dayName}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-50">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-0.5 bg-[#E07A5F] rounded-full" />
                <span className="text-[9px] text-gray-400">{t('today')}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-0.5 bg-emerald-400 rounded-full" />
                <span className="text-[9px] text-gray-400">{t('goal')}</span>
              </div>
              <span className="text-[9px] text-gray-300 ml-auto tabular-nums">{targetCalories} kcal/day</span>
            </div>
          </div>
        </div>

        {/* Macros */}
        <div className="bg-white rounded-2xl p-4 card-shadow mb-3">
          <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">{t('macros')} ({t('avgPerDay')})</span>
          {(weekStats.proteinPct + weekStats.carbsPct + weekStats.fatPct) > 0 && (
            <div className="flex h-1.5 rounded-full overflow-hidden mt-3 mb-3 gap-0.5">
              <div className="bg-violet-500 rounded-full transition-all duration-500" style={{ width: `${weekStats.proteinPct}%` }} />
              <div className="bg-cyan-500 rounded-full transition-all duration-500" style={{ width: `${weekStats.carbsPct}%` }} />
              <div className="bg-amber-500 rounded-full transition-all duration-500" style={{ width: `${weekStats.fatPct}%` }} />
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center p-2.5 bg-violet-50/80 rounded-xl">
              <span className="text-base font-black text-gray-900 font-display tabular-nums">{weekStats.avgProtein}g</span>
              <div className="flex items-center justify-center gap-1 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                <span className="text-[9px] text-gray-500">{t('protein')} {weekStats.proteinPct}%</span>
              </div>
            </div>
            <div className="text-center p-2.5 bg-cyan-50/80 rounded-xl">
              <span className="text-base font-black text-gray-900 font-display tabular-nums">{weekStats.avgCarbs}g</span>
              <div className="flex items-center justify-center gap-1 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" />
                <span className="text-[9px] text-gray-500">{t('carbs')} {weekStats.carbsPct}%</span>
              </div>
            </div>
            <div className="text-center p-2.5 bg-amber-50/80 rounded-xl">
              <span className="text-base font-black text-gray-900 font-display tabular-nums">{weekStats.avgFat}g</span>
              <div className="flex items-center justify-center gap-1 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                <span className="text-[9px] text-gray-500">{t('fat')} {weekStats.fatPct}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Streak - Mini ring indicators per day */}
        <div className="bg-white rounded-2xl p-4 card-shadow mb-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5">
              <Heart className="w-3.5 h-3.5 text-[#E07A5F]" />
              <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">STREAK</span>
            </div>
            {streak > 0 && (
              <div className="flex items-center gap-1 bg-[#E07A5F]/10 px-2.5 py-1 rounded-full">
                <Flame className="w-3 h-3 text-[#E07A5F]" />
                <span className="text-[10px] font-bold text-[#E07A5F]">{streak} days</span>
              </div>
            )}
          </div>
          <div className="flex justify-between">
            {dailyData.map((d, i) => {
              const progress = d.eaten > 0 ? Math.min(1, d.eaten / targetCalories) : 0;
              const r = 14;
              const circ = 2 * Math.PI * r;
              return (
                <div key={i} className="flex flex-col items-center gap-1.5">
                  <div className="relative w-9 h-9">
                    <svg width={36} height={36} className="transform -rotate-90">
                      <circle cx={18} cy={18} r={r} fill="none" stroke={d.hasData ? '#E07A5F15' : '#F3F4F6'} strokeWidth={3} />
                      {d.hasData && (
                        <circle cx={18} cy={18} r={r} fill="none"
                          stroke={d.isToday ? '#E07A5F' : '#10B981'}
                          strokeWidth={3}
                          strokeDasharray={circ}
                          strokeDashoffset={circ * (1 - progress)}
                          strokeLinecap="round"
                          className="transition-all duration-500"
                        />
                      )}
                    </svg>
                    {d.hasData && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Check className={`w-3 h-3 ${d.isToday ? 'text-[#E07A5F]' : 'text-emerald-500'}`} strokeWidth={3} />
                      </div>
                    )}
                  </div>
                  <span className={`text-[9px] font-medium ${d.isToday ? 'font-bold text-[#E07A5F]' : 'text-gray-400'}`}>{d.dayName}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Weight Timeline */}
        <div className="bg-white rounded-2xl p-4 card-shadow mb-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5">
              <Scale className="w-3.5 h-3.5 text-blue-500" />
              <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">WEIGHT TIMELINE</span>
            </div>
            <button onClick={() => setShowWeightInput(true)} className="w-8 h-8 bg-gray-50 rounded-xl flex items-center justify-center active:scale-90 transition-smooth">
              <Plus className="w-3.5 h-3.5 text-gray-500" />
            </button>
          </div>

          {/* Stats row */}
          <div className="flex gap-2 mb-3">
            <div className="flex items-center gap-2 flex-1 bg-blue-50 px-3 py-2.5 rounded-xl">
              <Scale className="w-4 h-4 text-blue-500" />
              <div>
                <span className="text-sm font-black text-gray-900 font-display tabular-nums">{weightData.current || '—'} kg</span>
                <p className="text-[9px] text-gray-400">current</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-1 bg-gray-50 px-3 py-2.5 rounded-xl">
              {weightData.change <= 0 ? <TrendingDown className="w-4 h-4 text-emerald-500" /> : <TrendingUp className="w-4 h-4 text-red-500" />}
              <div>
                <span className={`text-sm font-black font-display tabular-nums ${weightData.change <= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{weightData.change > 0 ? '+' : ''}{weightData.change} kg</span>
                <p className="text-[9px] text-gray-400">change</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-1 bg-gray-50 px-3 py-2.5 rounded-xl">
              <Activity className="w-4 h-4 text-blue-500" />
              <div>
                <span className="text-sm font-black text-gray-900 font-display tabular-nums">{weightData.avg10} kg</span>
                <p className="text-[9px] text-gray-400">10d avg</p>
              </div>
            </div>
          </div>

          {/* BMI + Goal row */}
          <div className="flex gap-2 mb-4">
            {weightData.bmi > 0 && (
              <div className={`flex items-center gap-2 flex-1 px-3 py-2.5 rounded-xl ${
                weightData.bmiCategory === 'Normal' ? 'bg-emerald-50' :
                weightData.bmiCategory === 'Underweight' ? 'bg-amber-50' : 'bg-orange-50'
              }`}>
                <Target className={`w-4 h-4 ${
                  weightData.bmiCategory === 'Normal' ? 'text-emerald-500' :
                  weightData.bmiCategory === 'Underweight' ? 'text-amber-500' : 'text-orange-500'
                }`} />
                <div>
                  <span className="text-sm font-black text-gray-900 font-display tabular-nums">{weightData.bmi}</span>
                  <p className="text-[9px] text-gray-400">BMI · {weightData.bmiCategory}</p>
                </div>
              </div>
            )}
            {weightData.targetWeight > 0 && (
              <div className="flex items-center gap-2 flex-1 bg-purple-50 px-3 py-2.5 rounded-xl">
                <Trophy className="w-4 h-4 text-purple-500" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-black text-gray-900 font-display tabular-nums">{weightData.targetWeight} kg</span>
                    <span className="text-[9px] font-bold text-purple-600">{weightData.goalProgress}%</span>
                  </div>
                  <div className="w-full h-1 bg-purple-100 rounded-full mt-1 overflow-hidden">
                    <div className="h-full bg-purple-500 rounded-full transition-all duration-500" style={{ width: `${weightData.goalProgress}%` }} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Weekly rate + ETA */}
          {weightData.targetWeight > 0 && weightData.weeklyRate !== 0 && (
            <div className="flex gap-2 mb-4">
              <div className="flex-1 bg-gray-50 px-3 py-2 rounded-xl text-center">
                <span className={`text-xs font-black font-display tabular-nums ${weightData.weeklyRate > 0 ? 'text-emerald-600' : 'text-blue-600'}`}>
                  {weightData.weeklyRate > 0 ? '-' : '+'}{Math.abs(weightData.weeklyRate)} kg/wk
                </span>
                <p className="text-[9px] text-gray-400">rate</p>
              </div>
              {weightData.weeksToGoal > 0 && (
                <div className="flex-1 bg-gray-50 px-3 py-2 rounded-xl text-center">
                  <span className="text-xs font-black text-gray-900 font-display tabular-nums">
                    ~{weightData.weeksToGoal} {weightData.weeksToGoal === 1 ? 'week' : 'weeks'}
                  </span>
                  <p className="text-[9px] text-gray-400">to goal</p>
                </div>
              )}
            </div>
          )}

          {/* Visual timeline chart */}
          {weightData.entries.length >= 2 ? (
            <div>
              <div className="relative h-[120px] mt-2">
                <svg width="100%" height="120" viewBox="0 0 300 120" preserveAspectRatio="none" className="overflow-visible">
                  {/* Grid lines */}
                  {[0, 1, 2, 3].map(i => (
                    <line key={i} x1="0" y1={i * 40} x2="300" y2={i * 40} stroke="#F3F4F6" strokeWidth="1" />
                  ))}
                  {/* Weight line */}
                  {weightData.entries.length >= 2 && (() => {
                    const entries = weightData.entries;
                    const minW = Math.min(...entries.map(e => e.weight)) - 0.5;
                    const maxW = Math.max(...entries.map(e => e.weight)) + 0.5;
                    const range = maxW - minW || 1;
                    const points = entries.map((e, i) => {
                      const x = entries.length === 1 ? 150 : (i / (entries.length - 1)) * 280 + 10;
                      const y = 110 - ((e.weight - minW) / range) * 100;
                      return { x, y, weight: e.weight, date: e.date };
                    });
                    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
                    const areaPath = linePath + ` L ${points[points.length - 1].x} 120 L ${points[0].x} 120 Z`;
                    return (
                      <>
                        <defs>
                          <linearGradient id="weightGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.2" />
                            <stop offset="100%" stopColor="#3B82F6" stopOpacity="0" />
                          </linearGradient>
                        </defs>
                        <path d={areaPath} fill="url(#weightGrad)" />
                        <path d={linePath} fill="none" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                        {points.map((p, i) => (
                          <circle key={i} cx={p.x} cy={p.y} r={i === points.length - 1 ? 5 : 3} fill={i === points.length - 1 ? '#3B82F6' : 'white'} stroke="#3B82F6" strokeWidth="2" />
                        ))}
                      </>
                    );
                  })()}
                </svg>
              </div>
              {/* Date labels */}
              <div className="flex justify-between mt-1 px-1">
                <span className="text-[9px] text-gray-400">{new Date(weightData.entries[0].date).toLocaleDateString('en', { month: 'short', day: 'numeric' })}</span>
                <span className="text-[9px] text-gray-400">{new Date(weightData.entries[weightData.entries.length - 1].date).toLocaleDateString('en', { month: 'short', day: 'numeric' })}</span>
              </div>
              {/* Weight range */}
              <div className="flex justify-between mt-0.5 px-1">
                <span className="text-[9px] text-blue-400 font-bold">{Math.min(...weightData.entries.map(e => e.weight))} kg</span>
                <span className="text-[9px] text-blue-400 font-bold">{Math.max(...weightData.entries.map(e => e.weight))} kg</span>
              </div>
            </div>
          ) : (
            <div className="text-center py-6 text-gray-300">
              <Scale className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-xs text-gray-400">Log your weight to see your progress over time</p>
            </div>
          )}
        </div>

        {/* Week Workouts Overview */}
        {weekWorkouts.workouts.length > 0 && (
          <div className="bg-white rounded-2xl p-4 card-shadow mb-3">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5">
                <Dumbbell className="w-3.5 h-3.5 text-purple-500" />
                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">WEEK WORKOUTS</span>
              </div>
              <span className="text-xs font-bold text-gray-600">{weekWorkouts.total} min</span>
            </div>
            {/* Category breakdown */}
            <div className="flex gap-2 mb-3">
              {weekWorkouts.totalCardio > 0 && (
                <div className="flex items-center gap-1.5 bg-blue-50 px-2.5 py-1.5 rounded-lg">
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                  <span className="text-[10px] font-bold text-blue-700">Cardio {weekWorkouts.totalCardio}m</span>
                </div>
              )}
              {weekWorkouts.totalStrength > 0 && (
                <div className="flex items-center gap-1.5 bg-purple-50 px-2.5 py-1.5 rounded-lg">
                  <div className="w-2 h-2 rounded-full bg-purple-500" />
                  <span className="text-[10px] font-bold text-purple-700">Strength {weekWorkouts.totalStrength}m</span>
                </div>
              )}
              {weekWorkouts.totalOther > 0 && (
                <div className="flex items-center gap-1.5 bg-gray-100 px-2.5 py-1.5 rounded-lg">
                  <div className="w-2 h-2 rounded-full bg-gray-400" />
                  <span className="text-[10px] font-bold text-gray-600">Other {weekWorkouts.totalOther}m</span>
                </div>
              )}
            </div>
            {/* Workout list */}
            <div className="space-y-1.5">
              {weekWorkouts.workouts.map((w, i) => (
                <div key={i} className="flex items-center justify-between p-2.5 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      w.category === 'cardio' ? 'bg-blue-100' : w.category === 'strength' ? 'bg-purple-100' : 'bg-gray-200'
                    }`}>
                      <Dumbbell className={`w-4 h-4 ${
                        w.category === 'cardio' ? 'text-blue-500' : w.category === 'strength' ? 'text-purple-500' : 'text-gray-500'
                      }`} />
                    </div>
                    <div>
                      <div className="font-semibold text-xs">{w.type}</div>
                      <div className="text-[10px] text-gray-400">{w.dayName}</div>
                    </div>
                  </div>
                  <span className="font-bold text-xs text-gray-600">{w.duration}m</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Weight Input Modal */}
        {showWeightInput && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white w-full max-w-xs rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Scale className="w-5 h-5 text-[#E07A5F]" />
                  <h3 className="font-bold">Log Weight</h3>
                </div>
                <button onClick={() => setShowWeightInput(false)} className="p-1">
                  <X className="w-4 h-4 text-gray-400" />
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
                  className="w-full bg-gray-50 px-4 py-3 pr-12 rounded-xl outline-none text-lg font-bold text-center"
                  autoFocus
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">kg</span>
              </div>
              <button
                onClick={handleLogWeight}
                disabled={!weightInput || parseFloat(weightInput) <= 0}
                className="w-full bg-[#E07A5F] text-white py-3 rounded-xl font-bold disabled:opacity-40 flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" />
                Save Weight
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default History;

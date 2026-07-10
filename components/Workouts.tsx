import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Dumbbell, Clock, CheckCircle2, Loader2, Play, X, Calendar, Plus, Minus, History, Star, HelpCircle, Check, Edit2, ArrowRight, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, BookOpen, Info, Brain, Flame } from 'lucide-react';
import { getTrainingPlan, saveTrainingPlan, getSavedRoutines, saveRoutine, deleteRoutine, getProfile } from '../services/storage';
import { getWorkoutSuggestion, generateTrainingPlan } from '../services/gemini';
import { WorkoutLog, WorkoutSuggestion, TrainingPlan, DayLog, WorkoutRoutine, ScheduledWorkout } from '../types';
import { generateId } from '../utils/calculations';
import { estimateWorkoutCalories, workoutCalories } from '../utils/workoutCalories';
import { todayStr, toDateStr, parseDateStr } from '../utils/date';
import { t as tr, getCurrentLanguage } from '../utils/i18n';

interface WorkoutsProps { logs: Record<string, DayLog>; onAddWorkout: (date: string, workout: WorkoutLog) => void; onCoachClick?: () => void; }

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// 25 most popular fitness exercises
const STANDARD_LIBRARY = [
  {
    category: "Chest & Shoulders",
    exercises: [
      { name: "Bench Press", instructions: "Lower bar to chest, press up explosively." },
      { name: "Push-ups", instructions: "Hands shoulder-width, lower chest to floor." },
      { name: "Incline Dumbbell Press", instructions: "Press dumbbells up from incline bench." },
      { name: "Overhead Press", instructions: "Press barbell from shoulders overhead." },
      { name: "Dumbbell Flyes", instructions: "Arc dumbbells from sides to above chest." },
      { name: "Lateral Raises", instructions: "Raise dumbbells to sides, shoulder height." },
    ]
  },
  {
    category: "Back & Arms",
    exercises: [
      { name: "Pull-ups", instructions: "Hang from bar, pull chin over bar." },
      { name: "Bent-over Rows", instructions: "Hinge forward, pull weight to hip." },
      { name: "Lat Pulldown", instructions: "Pull bar down to upper chest." },
      { name: "Bicep Curls", instructions: "Curl weight from thighs to shoulders." },
      { name: "Tricep Dips", instructions: "Lower body between bars, press up." },
      { name: "Face Pulls", instructions: "Pull rope to face, squeeze rear delts." },
    ]
  },
  {
    category: "Legs & Glutes",
    exercises: [
      { name: "Squats", instructions: "Feet shoulder-width, lower hips back and down." },
      { name: "Deadlifts", instructions: "Hinge at hips, keep back flat, lift bar." },
      { name: "Lunges", instructions: "Step forward, lower back knee to floor." },
      { name: "Leg Press", instructions: "Push platform away with feet." },
      { name: "Romanian Deadlift", instructions: "Hinge hips back, keep legs slightly bent." },
      { name: "Hip Thrusts", instructions: "Drive hips up against barbell." },
      { name: "Calf Raises", instructions: "Rise onto toes, squeeze calves." },
    ]
  },
  {
    category: "Core & Cardio",
    exercises: [
      { name: "Plank", instructions: "Hold body straight on forearms and toes." },
      { name: "Russian Twists", instructions: "Seated twist with weight side to side." },
      { name: "Mountain Climbers", instructions: "Plank, alternate driving knees forward." },
      { name: "Burpees", instructions: "Drop, push up, jump up with arms overhead." },
      { name: "Kettlebell Swings", instructions: "Hinge hips, swing to chest height." },
      { name: "Box Jumps", instructions: "Jump onto box, land softly, step down." },
    ]
  }
];

const Workouts: React.FC<WorkoutsProps> = ({ logs, onAddWorkout, onCoachClick }) => {
  const [viewMode, setViewMode] = useState<'LOG' | 'PLAN' | 'HISTORY' | 'FAVORITES'>('LOG');
  const [showHelp, setShowHelp] = useState(false);
  const [showGenerator, setShowGenerator] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);

  const [genDuration, setGenDuration] = useState('45');
  const [userVibe, setUserVibe] = useState('');
  const [difficulty, setDifficulty] = useState<'Beginner' | 'Intermediate' | 'Advanced'>('Intermediate');
  const [isGenerating, setIsGenerating] = useState(false);

  const [suggestion, setSuggestion] = useState<WorkoutSuggestion | null>(null);
  const [trainingPlan, setTrainingPlan] = useState<TrainingPlan | null>(null);
  const [favorites, setFavorites] = useState<WorkoutRoutine[]>([]);
  const [daysPerWeek, setDaysPerWeek] = useState(4);
  const [planWeeks, setPlanWeeks] = useState(4);
  const [manualType, setManualType] = useState('');
  const [manualDuration, setManualDuration] = useState('');
  const [manualIntensity, setManualIntensity] = useState<'LOW' | 'MODERATE' | 'HIGH'>('MODERATE');
  const [feedback, setFeedback] = useState<string | null>(null);

  // Body weight drives the MET calorie estimates (same helper as Dashboard/Overview)
  const weightKg = useMemo(() => getProfile()?.weightKg, []);

  const [selectedLibraryItems, setSelectedLibraryItems] = useState<string[]>([]);
  const [editingDay, setEditingDay] = useState<string | null>(null);
  const [editFocus, setEditFocus] = useState('');
  const [editDuration, setEditDuration] = useState('');
  const [currentPlanWeek, setCurrentPlanWeek] = useState(1);
  const [draggedDay, setDraggedDay] = useState<string | null>(null);
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);

  // Consolidated session state — single object prevents cascading re-renders from 7 separate setters
  interface SessionData { active: boolean; phase: 'PREP' | 'WORK' | 'REST' | 'FINISHED'; exerciseIdx: number; setNum: number; timer: number; elapsed: number; restDuration: number; }
  const [session, setSession] = useState<SessionData>({ active: false, phase: 'PREP', exerciseIdx: 0, setNum: 1, timer: 0, elapsed: 0, restDuration: 60 });
  // Convenience aliases for read access (no extra re-renders)
  const isSessionActive = session.active;
  const sessionState = session.phase;
  const exerciseIdx = session.exerciseIdx;
  const setNum = session.setNum;
  const timer = session.timer;
  const elapsed = session.elapsed;
  const restDuration = session.restDuration;

  const allWorkouts = useMemo(() => Object.values(logs).flatMap((l: DayLog) => l.workouts || []).sort((a, b) => b.timestamp - a.timestamp), [logs]);

  useEffect(() => { setTrainingPlan(getTrainingPlan()); setFavorites(getSavedRoutines()); }, []);

  // Use ref so the interval callback always reads the latest session without re-creating the interval
  const sessionRef = useRef(session);
  sessionRef.current = session;

  useEffect(() => {
    if (!isSessionActive) return;
    const int = setInterval(() => {
      setSession(prev => {
        const next = { ...prev, elapsed: prev.elapsed + 1 };
        if (prev.phase === 'PREP' || prev.phase === 'REST') {
          if (prev.timer > 1) { next.timer = prev.timer - 1; }
          else if (prev.phase === 'PREP') { next.phase = 'WORK'; next.timer = 0; }
          else {
            // REST done → advance to next set/exercise inline
            const exercises = suggestion?.exercises;
            if (exercises) {
              const maxSets = parseInt(exercises[prev.exerciseIdx]?.sets) || 3;
              if (prev.setNum < maxSets) { next.setNum = prev.setNum + 1; next.phase = 'WORK'; next.timer = 0; }
              else if (prev.exerciseIdx < exercises.length - 1) { next.exerciseIdx = prev.exerciseIdx + 1; next.setNum = 1; next.phase = 'WORK'; next.timer = 0; }
              else next.phase = 'FINISHED';
            }
          }
        } else if (prev.phase === 'WORK') { next.timer = prev.timer + 1; }
        return next;
      });
    }, 1000);
    return () => clearInterval(int);
  }, [isSessionActive, suggestion]);

  const showFeedback = (msg: string) => { setFeedback(msg); setTimeout(() => setFeedback(null), 1500); };
  const startSession = () => setSession(prev => ({ ...prev, active: true, phase: 'PREP', timer: 5, elapsed: 0, exerciseIdx: 0, setNum: 1 }));

  const startNextSet = () => {
    if (!suggestion) return;
    setSession(prev => {
      const ex = suggestion.exercises[prev.exerciseIdx];
      const maxSets = parseInt(ex.sets) || 3;
      if (prev.setNum < maxSets) return { ...prev, setNum: prev.setNum + 1, phase: 'WORK', timer: 0 };
      if (prev.exerciseIdx < suggestion.exercises.length - 1) return { ...prev, exerciseIdx: prev.exerciseIdx + 1, setNum: 1, phase: 'WORK', timer: 0 };
      return { ...prev, phase: 'FINISHED' };
    });
  };

  const handleSetDone = () => {
    if (!suggestion) return;
    setSession(prev => {
      if (prev.setNum < (parseInt(suggestion.exercises[prev.exerciseIdx].sets) || 3) || prev.exerciseIdx < suggestion.exercises.length - 1) {
        if (prev.restDuration === 0) {
          // Inline startNextSet logic
          const ex = suggestion.exercises[prev.exerciseIdx];
          const maxSets = parseInt(ex.sets) || 3;
          if (prev.setNum < maxSets) return { ...prev, setNum: prev.setNum + 1, phase: 'WORK', timer: 0 };
          if (prev.exerciseIdx < suggestion.exercises.length - 1) return { ...prev, exerciseIdx: prev.exerciseIdx + 1, setNum: 1, phase: 'WORK', timer: 0 };
          return { ...prev, phase: 'FINISHED' };
        }
        return { ...prev, phase: 'REST', timer: prev.restDuration };
      }
      return { ...prev, phase: 'FINISHED' };
    });
  };

  const saveSession = () => {
    if (!suggestion) return;
    {
      const d = todayStr();
      const minutes = Math.max(1, Math.ceil(elapsed / 60));
      // Match MET on focus (e.g. "Upper body") + title so creative AI titles still classify
      const kcal = estimateWorkoutCalories(`${suggestion.focus} ${suggestion.title}`, minutes, weightKg, 'MODERATE');
      onAddWorkout(d, { id: generateId(), date: d, type: suggestion.title, durationMinutes: minutes, caloriesBurned: kcal, intensity: 'MODERATE', elevatedHeartRate: true, timestamp: Date.now() });
    }
    setSession(prev => ({ ...prev, active: false })); setShowGenerator(false); setSuggestion(null); showFeedback("Workout Logged!");
  };

  const handleCreatePlan = async () => {
    setIsGenerating(true);
    try {
      const plan = await generateTrainingPlan(userVibe, planWeeks, daysPerWeek);
      if (plan) { saveTrainingPlan(plan); setTrainingPlan(plan); setCurrentPlanWeek(1); }
      else showFeedback(tr('workoutGenFailed'));
    } catch { showFeedback(tr('workoutGenFailed')); }
    setIsGenerating(false);
  };

  const handleStartPlanSession = async (focus: string, duration: number) => {
    setSuggestion(null); setUserVibe(focus); setGenDuration(duration.toString()); setShowGenerator(true); setIsGenerating(true);
    const res = await getWorkoutSuggestion(duration.toString(), focus, [], difficulty);
    if (res) setSuggestion(res);
    else { setShowGenerator(false); showFeedback(tr('workoutGenFailed')); }
    setIsGenerating(false);
  };

  const handleManualLog = () => {
    if (!manualType || !manualDuration) return;
    {
      const d = todayStr();
      const minutes = parseInt(manualDuration);
      const kcal = estimateWorkoutCalories(manualType, minutes, weightKg, manualIntensity);
      onAddWorkout(d, { id: generateId(), date: d, type: manualType, durationMinutes: minutes, caloriesBurned: kcal, intensity: manualIntensity, elevatedHeartRate: manualIntensity !== 'LOW', timestamp: Date.now() });
    }
    setManualType(''); setManualDuration(''); setManualIntensity('MODERATE'); showFeedback("Logged!");
  };

  const buildLibrarySuggestion = () => {
    const selectedEx = STANDARD_LIBRARY.flatMap(cat => cat.exercises).filter(ex => selectedLibraryItems.includes(ex.name));
    return { title: "Custom Session", duration: genDuration, focus: "Custom", warmup: [] as string[], exercises: selectedEx.map(ex => ({ name: ex.name, sets: "3", reps: "12", instructions: ex.instructions })) };
  };

  const handleLibraryBuild = () => {
    setSuggestion(buildLibrarySuggestion());
    setShowLibrary(false); setShowGenerator(true); setSelectedLibraryItems([]);
  };

  const handleLibraryStart = () => {
    setSuggestion(buildLibrarySuggestion());
    setShowLibrary(false); setShowGenerator(true); setSelectedLibraryItems([]);
    setSession(prev => ({ ...prev, active: true, phase: 'PREP', timer: 5, elapsed: 0, exerciseIdx: 0, setNum: 1 }));
  };

  // The schedule for the week currently being viewed (falls back to the flat
  // schedule for older plans that predate per-week storage).
  const getWeekSchedule = (plan: TrainingPlan, week: number): ScheduledWorkout[] =>
    plan.weeklySchedules?.[week - 1] || plan.schedule || [];

  // Persist a new schedule for the currently-viewed week and keep the flat
  // `schedule` (week 1) in sync for backward compatibility.
  const persistWeekSchedule = (newSchedule: ScheduledWorkout[]) => {
    if (!trainingPlan) return;
    const weeks = trainingPlan.weeklySchedules
      ? [...trainingPlan.weeklySchedules]
      : Array.from({ length: trainingPlan.durationWeeks || 1 }, () => trainingPlan.schedule || []);
    weeks[currentPlanWeek - 1] = newSchedule;
    const updated = { ...trainingPlan, weeklySchedules: weeks, schedule: weeks[0] || newSchedule };
    saveTrainingPlan(updated);
    setTrainingPlan(updated);
  };

  const saveEditDay = () => {
    if (!trainingPlan || !editingDay) return;
    const newSchedule = getWeekSchedule(trainingPlan, currentPlanWeek).filter(s => s.dayOfWeek !== editingDay);
    if (editFocus.trim()) newSchedule.push({ dayOfWeek: editingDay, focus: editFocus, durationMinutes: parseInt(editDuration) || 45 });
    persistWeekSchedule(newSchedule);
    setEditingDay(null); showFeedback("Saved");
  };

  // Swap two days' workouts within the current week.
  const swapDays = (dayA: string, dayB: string) => {
    if (!trainingPlan || dayA === dayB) return;
    const schedule = [...getWeekSchedule(trainingPlan, currentPlanWeek)];
    const a = schedule.find(s => s.dayOfWeek === dayA);
    const b = schedule.find(s => s.dayOfWeek === dayB);
    const filtered = schedule.filter(s => s.dayOfWeek !== dayA && s.dayOfWeek !== dayB);
    if (a) filtered.push({ ...a, dayOfWeek: dayB });
    if (b) filtered.push({ ...b, dayOfWeek: dayA });
    persistWeekSchedule(filtered);
    showFeedback("Swapped!");
  };

  const handleDrop = (targetDay: string) => {
    if (!draggedDay) return;
    const source = draggedDay;
    setDraggedDay(null); setDragOverDay(null);
    swapDays(source, targetDay);
  };

  // Touch-friendly reorder (HTML5 drag events don't fire on iOS): move a day's
  // workout up/down to the adjacent calendar day, swapping if occupied.
  const moveDay = (day: string, direction: -1 | 1) => {
    const idx = DAYS.indexOf(day);
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= DAYS.length) return;
    swapDays(day, DAYS[targetIdx]);
  };

  const isFavorite = (title: string) => favorites.some(f => f.name === title);
  const toggleFavorite = (routine: WorkoutSuggestion) => {
    if (isFavorite(routine.title)) {
      const favId = favorites.find(f => f.name === routine.title)?.id;
      if (favId) { setFavorites(deleteRoutine(favId)); showFeedback("Removed"); }
    } else {
      setFavorites(saveRoutine({ id: generateId(), name: routine.title, exercises: routine.exercises, durationMinutes: parseInt(routine.duration), focus: routine.focus }));
      showFeedback("Saved!");
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#FAF6F1]">
      {/* Feedback */}
      {feedback && <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-[#2B2523] text-white px-4 py-2 rounded-full text-xs font-bold z-[70] flex items-center gap-2"><Check className="w-3 h-3 text-white" />{feedback}</div>}

      {/* Help Modal */}
      {showHelp && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Workouts help">
          <div className="bg-white w-full max-w-sm rounded-[24px] p-5 relative card-shadow">
            <button onClick={() => setShowHelp(false)} aria-label="Close help" className="absolute top-3 right-3 p-2"><X className="w-5 h-5 text-[#9A8B80]" /></button>
            <h2 className="text-lg font-display font-bold text-[#2B2523] mb-3">How Workouts Work</h2>
            <div className="text-sm text-[#6B6257] space-y-2 mb-4">
              <p><b>Log:</b> Generate workouts or quick manual entry</p>
              <p><b>Plan:</b> Create multi-week training programs</p>
              <p><b>Saved:</b> Save favorite workouts to reuse</p>
              <p><b>History:</b> View all completed sessions</p>
              <p><b>Library:</b> 25 popular exercises to build custom workouts</p>
            </div>
            <button onClick={() => setShowHelp(false)} className="w-full bg-[#E07A5F] text-white font-bold py-2.5 rounded-[14px] active:scale-[0.98] transition-smooth">Got it</button>
          </div>
        </div>
      )}

      {/* Edit Day Modal */}
      {editingDay && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Edit training day">
          <div className="bg-white w-full max-w-xs rounded-[24px] p-5 card-shadow">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-display font-bold text-[#2B2523]">{editingDay}</h3>
              <button onClick={() => setEditingDay(null)} aria-label="Close" className="p-2"><X className="w-5 h-5" /></button>
            </div>
            <input className="w-full bg-[#FAF6F1] px-3.5 py-3 rounded-[14px] mb-3 outline-none text-sm text-[#2B2523] placeholder-[#B4A79C] focus:ring-2 focus:ring-[#E07A5F]/30" placeholder="Focus (empty = rest)" value={editFocus} onChange={(e) => setEditFocus(e.target.value)} autoFocus />
            <div className="flex gap-1.5 mb-4">
              {[30, 45, 60, 90].map(m => (
                <button key={m} onClick={() => setEditDuration(m.toString())} className={`flex-1 py-2 rounded-full text-xs font-bold transition-smooth ${editDuration === m.toString() ? 'bg-[#2B2523] text-white' : 'bg-[#FAF6F1] text-[#9A8B80]'}`}>{m}m</button>
              ))}
            </div>
            <button onClick={saveEditDay} className="w-full bg-[#E07A5F] text-white py-2.5 rounded-[14px] font-bold active:scale-[0.98] transition-smooth">Save</button>
          </div>
        </div>
      )}

      {/* Library Modal */}
      {showLibrary && createPortal(
        <div className="fixed inset-0 z-[100] bg-[#FAF6F1] flex flex-col">
          <div className="shrink-0 px-4 py-3 bg-white border-b border-[#F3EAE2] flex justify-between items-center" style={{paddingTop: 'max(env(safe-area-inset-top, 12px), 12px)'}}>
            <h2 className="font-display font-bold text-[#2B2523]">Exercise Library ({selectedLibraryItems.length}/25)</h2>
            <button onClick={() => setShowLibrary(false)} aria-label="Close library" className="p-2"><X className="w-5 h-5" /></button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
            {STANDARD_LIBRARY.map((cat, i) => (
              <div key={i}>
                <h3 className="text-[10px] font-bold text-[#E07A5F] uppercase mb-2">{cat.category}</h3>
                <div className="space-y-1.5">
                  {cat.exercises.map(ex => {
                    const sel = selectedLibraryItems.includes(ex.name);
                    return (
                      <button key={ex.name} onClick={() => setSelectedLibraryItems(p => sel ? p.filter(i => i !== ex.name) : [...p, ex.name])} className={`w-full flex justify-between items-center p-3 rounded-[14px] text-left text-sm transition-smooth ${sel ? 'bg-[#E07A5F] text-white terra-shadow' : 'bg-white card-shadow text-[#2B2523]'}`}>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold truncate">{ex.name}</div>
                          <div className={`text-[10px] truncate ${sel ? 'text-white/70' : 'text-[#9A8B80]'}`}>{ex.instructions}</div>
                        </div>
                        {sel ? <CheckCircle2 className="w-4 h-4 shrink-0 ml-2" /> : <Plus className="w-4 h-4 text-[#B4A79C] shrink-0 ml-2" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          {selectedLibraryItems.length > 0 && (
            <div className="bg-white border-t border-[#F3EAE2] px-4 pt-3 animate-in slide-in-from-bottom duration-200" style={{paddingBottom: 'max(env(safe-area-inset-bottom, 16px), 16px)'}}>
              <button onClick={handleLibraryStart} className="w-full bg-[#E07A5F] text-white py-4 rounded-[16px] font-bold flex items-center justify-center gap-2 terra-shadow active:scale-[0.98] transition-smooth">
                <Play className="w-5 h-5 fill-current" /> Start Workout ({selectedLibraryItems.length})
              </button>
            </div>
          )}
        </div>
      , document.body)}

      {/* Session/Generator Modal */}
      {(isSessionActive || showGenerator) && createPortal(
        <div className="fixed inset-0 z-[100] bg-[#2B2523] text-white flex flex-col">
          <div className="shrink-0 flex justify-between items-center p-4 border-b border-white/10" style={{paddingTop: 'max(env(safe-area-inset-top, 16px), 16px)'}}>
            {isSessionActive ? <div className="font-display text-xl font-bold tabular-nums tracking-tight">{Math.floor(elapsed / 60)}:{(elapsed % 60).toString().padStart(2, '0')}</div> : <h2 className="font-display font-bold">{suggestion?.title || "New Workout"}</h2>}
            <button onClick={() => { setSession(prev => ({ ...prev, active: false })); setShowGenerator(false); setSuggestion(null); }} aria-label="Close workout" className="p-2 bg-white/10 rounded-full"><X className="w-5 h-5" /></button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col items-center justify-center" style={{paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))'}}>
            {!isSessionActive ? (
              suggestion ? (
                <div className="w-full max-w-md">
                  <h2 className="text-xl font-display font-bold mb-1 text-center">{suggestion.title}</h2>
                  <p className="text-[#9A8B80] text-sm text-center mb-4">{suggestion.exercises.length} exercises • {suggestion.duration} min</p>
                  <div className="space-y-2 mb-4 max-h-[35vh] overflow-y-auto">
                    {suggestion.exercises.map((e, i) => (
                      <div key={i} className="bg-white/10 p-3 rounded-xl">
                        <div className="flex justify-between items-center">
                          <div className="flex-1 min-w-0 mr-2">
                            <div className="font-semibold text-sm truncate">{e.name}</div>
                            <div className="text-[10px] text-[#9A8B80] truncate">{e.instructions || "Good form"}</div>
                          </div>
                          <button onClick={() => { const ex = [...suggestion.exercises]; ex.splice(i, 1); if (ex.length > 0) setSuggestion({ ...suggestion, exercises: ex }); }} className="p-1 bg-white/5 rounded-lg ml-1 shrink-0"><X className="w-3 h-3 text-[#9A8B80]" /></button>
                        </div>
                        <div className="flex items-center gap-3 mt-2">
                          <div className="flex items-center gap-1.5 bg-white/5 rounded-lg px-2 py-1">
                            <button onClick={() => { const ex = [...suggestion.exercises]; ex[i] = { ...ex[i], sets: Math.max(1, parseInt(ex[i].sets) - 1).toString() }; setSuggestion({ ...suggestion, exercises: ex }); }} className="text-[#9A8B80] active:text-white"><Minus className="w-3 h-3" /></button>
                            <span className="text-xs font-bold w-8 text-center">{e.sets} sets</span>
                            <button onClick={() => { const ex = [...suggestion.exercises]; ex[i] = { ...ex[i], sets: (parseInt(ex[i].sets) + 1).toString() }; setSuggestion({ ...suggestion, exercises: ex }); }} className="text-[#9A8B80] active:text-white"><Plus className="w-3 h-3" /></button>
                          </div>
                          <div className="flex items-center gap-1.5 bg-white/5 rounded-lg px-2 py-1">
                            <button onClick={() => { const ex = [...suggestion.exercises]; ex[i] = { ...ex[i], reps: Math.max(1, parseInt(ex[i].reps) - 1).toString() }; setSuggestion({ ...suggestion, exercises: ex }); }} className="text-[#9A8B80] active:text-white"><Minus className="w-3 h-3" /></button>
                            <span className="text-xs font-bold w-8 text-center">{e.reps} reps</span>
                            <button onClick={() => { const ex = [...suggestion.exercises]; ex[i] = { ...ex[i], reps: (parseInt(ex[i].reps) + 1).toString() }; setSuggestion({ ...suggestion, exercises: ex }); }} className="text-[#9A8B80] active:text-white"><Plus className="w-3 h-3" /></button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button onClick={startSession} className="w-full bg-[#E07A5F] py-3 rounded-[14px] font-bold mb-2 active:scale-[0.98] transition-smooth">Start Workout</button>
                  <button onClick={() => toggleFavorite(suggestion)} className="w-full border border-white/20 py-2.5 rounded-[14px] font-semibold text-sm flex items-center justify-center gap-2">
                    <Star className={`w-4 h-4 ${isFavorite(suggestion.title) ? 'fill-[#D9964F] text-[#D9964F]' : ''}`} />
                    {isFavorite(suggestion.title) ? "Saved" : "Save"}
                  </button>
                </div>
              ) : (
                <div className="w-full max-w-md space-y-4">
                  <input type="text" placeholder="What to train? (e.g. Upper body)" className="w-full bg-white/10 p-3 rounded-xl text-white outline-none placeholder-[#B4A79C] text-sm" value={userVibe} onChange={e => setUserVibe(e.target.value)} />
                  <div>
                    <label className="text-[10px] text-[#9A8B80] uppercase font-bold mb-1.5 block">Level</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {['Beginner', 'Intermediate', 'Advanced'].map(d => (
                        <button key={d} onClick={() => setDifficulty(d as any)} className={`py-2 rounded-lg text-xs font-bold ${difficulty === d ? 'bg-white text-black' : 'bg-white/10'}`}>
                          {d === 'Beginner' ? 'Easy' : d === 'Intermediate' ? 'Medium' : 'Hard'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-[#9A8B80] uppercase font-bold mb-1.5 block">Duration</label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {['20', '30', '45', '60'].map(m => (
                        <button key={m} onClick={() => setGenDuration(m)} className={`py-2 rounded-lg text-xs font-bold ${genDuration === m ? 'bg-[#E07A5F]' : 'bg-white/10'}`}>{m}m</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-[#9A8B80] uppercase font-bold mb-1.5 block">Rest Between Sets</label>
                    <div className="grid grid-cols-5 gap-1">
                      {[0, 30, 45, 60, 90].map(s => (
                        <button key={s} onClick={() => setSession(prev => ({ ...prev, restDuration: s }))} className={`py-2 rounded-lg text-[10px] font-bold ${restDuration === s ? 'bg-[#E07A5F]' : 'bg-white/10'}`}>{s === 0 ? 'None' : `${s}s`}</button>
                      ))}
                    </div>
                  </div>
                  <button onClick={async () => { setIsGenerating(true); const res = await getWorkoutSuggestion(genDuration, userVibe, [], difficulty); if (res) setSuggestion(res); else showFeedback(tr('workoutGenFailed')); setIsGenerating(false); }} disabled={isGenerating} className="w-full bg-[#E07A5F] py-3 rounded-[14px] font-bold active:scale-[0.98] transition-smooth">
                    {isGenerating ? <Loader2 className="animate-spin w-5 h-5 mx-auto" /> : "Generate"}
                  </button>
                  <button onClick={() => { setShowGenerator(false); setShowLibrary(true); }} className="w-full bg-white/10 py-3 rounded-[14px] font-semibold text-sm flex justify-center gap-2"><BookOpen className="w-4 h-4" /> Build from Library</button>
                </div>
              )
            ) : (
              sessionState === 'FINISHED' ? (
                <div className="text-center">
                  <div className="text-5xl mb-3">🎉</div>
                  <h1 className="text-2xl font-display font-bold mb-1">Done!</h1>
                  <p className="text-[#9A8B80] mb-6">
                    {Math.max(1, Math.ceil(elapsed / 60))} minutes · ~{suggestion ? estimateWorkoutCalories(`${suggestion.focus} ${suggestion.title}`, Math.max(1, Math.ceil(elapsed / 60)), weightKg, 'MODERATE') : 0} kcal
                  </p>
                  <button onClick={saveSession} className="bg-[#E07A5F] text-white px-6 py-3 rounded-[14px] font-bold active:scale-[0.98] transition-smooth">Save & Close</button>
                </div>
              ) : (
                <div className="w-full max-w-md text-center">
                  <div className="text-[#E07A5F] font-bold uppercase tracking-wider mb-4 text-xs">{sessionState}</div>
                  {sessionState === 'REST' ? (
                    <div>
                      <div className="text-7xl font-display font-bold tabular-nums mb-6">{timer}</div>
                      <div className="flex justify-center gap-2 mb-4">
                        <button onClick={() => setSession(prev => ({ ...prev, timer: Math.max(0, prev.timer - 15) }))} className="bg-white/10 px-4 py-2 rounded-full font-bold text-sm">-15s</button>
                        <button onClick={() => setSession(prev => ({ ...prev, timer: prev.timer + 15 }))} className="bg-white/10 px-4 py-2 rounded-full font-bold text-sm">+15s</button>
                      </div>
                      <button onClick={startNextSet} className="w-full bg-[#E07A5F] py-3 rounded-[14px] font-bold active:scale-[0.98] transition-smooth">Skip →</button>
                    </div>
                  ) : (
                    <div>
                      <h2 className="text-2xl font-display font-bold mb-2">{suggestion?.exercises[exerciseIdx].name}</h2>
                      <p className="text-[#B4A79C] text-sm mb-6">{suggestion?.exercises[exerciseIdx].instructions || "Good form"}</p>
                      <div className="bg-white/5 py-3 px-4 rounded-[14px] mb-6 inline-block">
                        <span className="text-xl font-display font-bold">Set {setNum}</span>
                        <span className="text-[#9A8B80] mx-2">/</span>
                        <span className="text-[#9A8B80]">{suggestion?.exercises[exerciseIdx].sets}</span>
                        <span className="text-[#9A8B80] mx-2">•</span>
                        <span className="text-[#B4A79C]">{suggestion?.exercises[exerciseIdx].reps} reps</span>
                      </div>
                      <button onClick={handleSetDone} className="w-full bg-[#E07A5F] py-4 rounded-[14px] font-bold text-lg active:scale-[0.98] transition-smooth">Done ✓</button>
                    </div>
                  )}
                </div>
              )
            )}
          </div>
        </div>
      , document.body)}

      {/* Header */}
      <div className="px-5 pb-3 flex items-center justify-between" style={{paddingTop: 'max(env(safe-area-inset-top, 14px), 14px)'}}>
        <h1 className="text-[24px] font-bold text-[#2B2523] font-display tracking-tight">{tr('workout')}</h1>
        <div className="flex items-center gap-2">
          <button onClick={onCoachClick} aria-label="AI Coach" className="w-[42px] h-[42px] bg-white rounded-full card-shadow flex items-center justify-center active:scale-90 transition-smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E07A5F] focus-visible:ring-offset-2">
            <Brain className="w-[18px] h-[18px] text-[#9A8B80]" />
          </button>
          <button onClick={() => setShowHelp(true)} aria-label="Help" className="w-[42px] h-[42px] bg-white rounded-full card-shadow flex items-center justify-center active:scale-90 transition-smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E07A5F] focus-visible:ring-offset-2">
            <HelpCircle className="w-[18px] h-[18px] text-[#9A8B80]" />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto px-5 pt-1" style={{ paddingBottom: 'calc(90px + env(safe-area-inset-bottom, 0px))' }}>
        {/* Segmented pills */}
        <div className="flex gap-2 mb-4">
          {['LOG', 'PLAN', 'FAVORITES', 'HISTORY'].map(tab => (
            <button key={tab} onClick={() => setViewMode(tab as any)} className={`flex-1 py-2.5 text-xs rounded-full transition-smooth min-h-[44px] ${viewMode === tab ? 'bg-[#2B2523] text-white font-bold' : 'bg-white card-shadow text-[#9A8B80] font-semibold'}`}>
              {tab === 'FAVORITES' ? 'Saved' : tab.charAt(0) + tab.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="space-y-3">
        {viewMode === 'LOG' && (
          <div className="space-y-3">
            <button onClick={() => { setShowGenerator(true); setSuggestion(null); }} className="w-full bg-[#E07A5F] rounded-[24px] p-5 terra-shadow flex items-center gap-4 text-left active:scale-[0.98] transition-smooth">
              <div className="w-[54px] h-[54px] rounded-full bg-white/25 flex items-center justify-center shrink-0">
                <Play className="w-6 h-6 text-white" fill="white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[17px] font-display font-bold text-white tracking-tight">Start workout</div>
                <div className="text-xs text-white/75 mt-0.5">AI builds a session at your level</div>
              </div>
              <ChevronRight className="w-5 h-5 text-white shrink-0" />
            </button>
            <button onClick={() => { setShowGenerator(false); setShowLibrary(true); }} className="w-full bg-white rounded-[20px] p-4 card-shadow flex items-center gap-3 text-left active:scale-[0.98] transition-smooth">
              <div className="w-[42px] h-[42px] rounded-[14px] bg-[#EFF2EE] flex items-center justify-center shrink-0">
                <BookOpen className="w-5 h-5 text-[#3D5A48]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-display font-bold text-[#2B2523]">Build from library</div>
                <div className="text-xs text-[#9A8B80] mt-0.5">25 popular exercises</div>
              </div>
              <ChevronRight className="w-5 h-5 text-[#B4A79C] shrink-0" />
            </button>
            <div className="bg-white p-4 rounded-[20px] card-shadow">
              <h3 className="text-[13px] font-display font-bold text-[#2B2523] mb-3">Quick log</h3>
              <input placeholder="Activity (e.g. Running, Yoga)" aria-label="Activity type" className="w-full bg-[#FAF6F1] rounded-[14px] px-3.5 py-3 mb-2.5 outline-none text-sm text-[#2B2523] placeholder-[#B4A79C] focus:ring-2 focus:ring-[#E07A5F]/30" value={manualType} onChange={e => setManualType(e.target.value)} />
              <div className="flex gap-2 mb-2.5">
                <input placeholder="Minutes" type="number" aria-label="Duration in minutes" className="w-28 bg-[#FAF6F1] rounded-[14px] px-3.5 py-3 outline-none text-sm text-[#2B2523] placeholder-[#B4A79C] focus:ring-2 focus:ring-[#E07A5F]/30" value={manualDuration} onChange={e => setManualDuration(e.target.value)} />
                <div className="flex-1 grid grid-cols-3 gap-1.5">
                  {([['LOW', 'Light'], ['MODERATE', 'Normal'], ['HIGH', 'Intense']] as const).map(([val, label]) => (
                    <button key={val} onClick={() => setManualIntensity(val)} className={`rounded-[14px] text-[11px] font-bold transition-smooth ${manualIntensity === val ? 'bg-[#2B2523] text-white' : 'bg-[#FAF6F1] text-[#9A8B80]'}`}>{label}</button>
                  ))}
                </div>
              </div>
              <button onClick={handleManualLog} disabled={!manualType || !manualDuration} className="w-full bg-[#3D5A48] text-white font-bold py-3 rounded-[14px] text-sm disabled:opacity-40 active:scale-[0.98] transition-smooth flex items-center justify-center gap-2">
                <span>Log activity</span>
                {manualType && parseInt(manualDuration) > 0 && (
                  <span className="flex items-center gap-1 text-white/80 font-semibold">
                    <Flame className="w-3.5 h-3.5" />
                    ~{estimateWorkoutCalories(manualType, parseInt(manualDuration), weightKg, manualIntensity)} kcal
                  </span>
                )}
              </button>
            </div>

            {/* Today's Workouts */}
            {(() => {
              const today = todayStr();
              const todayWorkouts = logs[today]?.workouts || [];
              if (todayWorkouts.length === 0) return null;
              const totalMinutes = todayWorkouts.reduce((sum, w) => sum + w.durationMinutes, 0);
              const totalKcal = todayWorkouts.reduce((sum, w) => sum + workoutCalories(w, weightKg), 0);
              return (
                <div className="bg-white p-4 rounded-[20px] card-shadow">
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="text-[13px] font-display font-bold text-[#2B2523]">Today</h3>
                    <span className="text-[11px] font-semibold text-[#C4763B] tabular-nums">{totalMinutes} min · {totalKcal} kcal</span>
                  </div>
                  <div className="space-y-2">
                    {todayWorkouts.map(w => (
                      <div key={w.id} className="flex items-center justify-between p-3 bg-[#FAF6F1] rounded-[14px]">
                        <div className="flex items-center gap-3">
                          <div className="w-[38px] h-[38px] rounded-[12px] bg-[#FBEBE4] flex items-center justify-center">
                            <Dumbbell className="w-4 h-4 text-[#E07A5F]" />
                          </div>
                          <div>
                            <div className="text-[13px] font-semibold text-[#2B2523]">{w.type}</div>
                            <div className="text-[11px] text-[#9A8B80] tabular-nums flex items-center gap-1">
                              <Clock className="w-3 h-3" /> {w.durationMinutes} min
                              <Flame className="w-3 h-3 ml-1 text-[#D9964F]" /> {workoutCalories(w, weightKg)} kcal
                            </div>
                          </div>
                        </div>
                        <CheckCircle2 className="w-5 h-5 text-[#3D5A48]" />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* This week */}
            {(() => {
              const today = todayStr();
              const now = new Date();
              const monday = new Date(now);
              monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
              const week = Array.from({ length: 7 }, (_, i) => {
                const d = new Date(monday);
                d.setDate(monday.getDate() + i);
                const ds = toDateStr(d);
                return { ds, hasWorkout: (logs[ds]?.workouts?.length || 0) > 0, isToday: ds === today, isFuture: ds > today };
              });
              const done = week.filter(d => d.hasWorkout).length;
              const target = trainingPlan?.daysPerWeek ?? 4;
              return (
                <div className="bg-[#EFF2EE] p-4 rounded-[20px]">
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="text-[13px] font-display font-bold text-[#3D5A48]">This week</h3>
                    <span className="text-[11px] font-semibold text-[#3D5A48]">{done} of {target} sessions</span>
                  </div>
                  <div className="grid grid-cols-7 gap-1.5">
                    {week.map((d, i) => (
                      <div key={d.ds} className="flex flex-col items-center gap-1">
                        <div className={`w-full h-[34px] rounded-[10px] ${d.isToday ? 'bg-[#E07A5F]' : d.hasWorkout ? 'bg-[#3D5A48]' : `bg-white ${d.isFuture ? 'opacity-60' : ''}`}`} />
                        <span className="text-[9px] font-semibold text-[#3D5A48]/60">{'MTWTFSS'[i]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {viewMode === 'PLAN' && (
          <div>
            {trainingPlan ? (
              <div className="bg-white rounded-[20px] p-4 card-shadow">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h2 className="font-display font-bold text-[#2B2523]">{trainingPlan.title}</h2>
                    <p className="text-[10px] text-[#9A8B80]">{trainingPlan.durationWeeks}w • {trainingPlan.daysPerWeek}d/week</p>
                  </div>
                  <button onClick={() => { if (confirm('Delete this training plan?')) { saveTrainingPlan(null as any); setTrainingPlan(null); } }} className="text-[10px] text-red-500 font-bold">Delete</button>
                </div>
                <div className="flex items-center justify-between bg-[#FAF6F1] p-2 rounded-[14px] mb-3">
                  <button onClick={() => setCurrentPlanWeek(Math.max(1, currentPlanWeek - 1))} disabled={currentPlanWeek === 1} className="p-1.5 disabled:opacity-30"><ChevronLeft className="w-4 h-4 text-[#6B6257]" /></button>
                  <span className="font-display font-bold text-sm text-[#2B2523]">Week {currentPlanWeek}</span>
                  <button onClick={() => setCurrentPlanWeek(Math.min(trainingPlan.durationWeeks || 4, currentPlanWeek + 1))} disabled={currentPlanWeek === (trainingPlan.durationWeeks || 4)} className="p-1.5 disabled:opacity-30"><ChevronRight className="w-4 h-4 text-[#6B6257]" /></button>
                </div>
                <div className="space-y-1.5">
                  {DAYS.map((day, idx) => {
                    const weekSchedule = getWeekSchedule(trainingPlan, currentPlanWeek);
                    const sched = weekSchedule.find(x => x.dayOfWeek === day);
                    return (
                      <div key={day} draggable={!!sched} onDragStart={() => setDraggedDay(day)} onDragOver={(e) => { e.preventDefault(); if (day !== draggedDay) setDragOverDay(day); }} onDragLeave={() => setDragOverDay(null)} onDrop={() => handleDrop(day)} onDragEnd={() => { setDraggedDay(null); setDragOverDay(null); }}
                        className={`p-3 rounded-[14px] flex justify-between items-center ${sched ? 'bg-[#FAF6F1]' : 'bg-[#FAF6F1]/50'} ${draggedDay === day ? 'opacity-50' : ''} ${dragOverDay === day ? 'ring-2 ring-[#E07A5F]' : ''}`}>
                        <div className="flex items-center gap-2">
                          <div className={`w-8 h-8 rounded-[10px] flex items-center justify-center text-[10px] font-bold ${sched ? 'bg-[#E07A5F] text-white' : 'bg-[#E8DFD5] text-[#9A8B80]'}`}>{DAY_SHORT[idx]}</div>
                          <div className="min-w-0">
                            {sched ? <><div className="font-semibold text-sm text-[#2B2523] truncate">{sched.focus}</div><div className="text-[10px] text-[#9A8B80]">{sched.durationMinutes}m</div></> : <div className="text-xs text-[#9A8B80]">Rest</div>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {sched && (
                            <div className="flex flex-col">
                              <button onClick={() => moveDay(day, -1)} disabled={idx === 0} aria-label="Move up" className="p-0.5 text-[#B4A79C] disabled:opacity-30 active:text-[#E07A5F]"><ChevronUp className="w-3.5 h-3.5" /></button>
                              <button onClick={() => moveDay(day, 1)} disabled={idx === DAYS.length - 1} aria-label="Move down" className="p-0.5 text-[#B4A79C] disabled:opacity-30 active:text-[#E07A5F]"><ChevronDown className="w-3.5 h-3.5" /></button>
                            </div>
                          )}
                          {sched && <button onClick={() => handleStartPlanSession(sched.focus, sched.durationMinutes)} className="bg-[#2B2523] text-white px-2.5 py-1 rounded-full text-[10px] font-bold active:scale-95 transition-smooth">Go</button>}
                          <button onClick={() => { setEditingDay(day); setEditFocus(sched?.focus || ''); setEditDuration((sched?.durationMinutes || 45).toString()); }} aria-label="Edit day" className="p-1.5 bg-[#F3EAE2] rounded-lg"><Edit2 className="w-3 h-3 text-[#9A8B80]" /></button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-[20px] p-4 card-shadow">
                <Calendar className="w-10 h-10 text-[#E07A5F] mx-auto mb-3" />
                <h3 className="font-display font-bold text-[#2B2523] text-center mb-1">Create Plan</h3>
                <p className="text-xs text-[#9A8B80] text-center mb-4">Smart multi-week program</p>
                <input placeholder="Goal (e.g. Build muscle)" className="w-full bg-[#FAF6F1] px-3.5 py-3 rounded-[14px] mb-3 text-sm text-[#2B2523] placeholder-[#B4A79C] outline-none focus:ring-2 focus:ring-[#E07A5F]/30" value={userVibe} onChange={e => setUserVibe(e.target.value)} />
                <div className="mb-3">
                  <label className="text-[10px] text-[#9A8B80] uppercase font-bold mb-1.5 block">Days/Week</label>
                  <div className="flex gap-1.5 justify-center">
                    {[3, 4, 5, 6].map(d => (
                      <button key={d} onClick={() => setDaysPerWeek(d)} className={`w-10 h-10 rounded-full font-bold text-sm transition-smooth ${daysPerWeek === d ? 'bg-[#2B2523] text-white' : 'bg-[#FAF6F1] text-[#9A8B80]'}`}>{d}</button>
                    ))}
                  </div>
                </div>
                <div className="mb-4">
                  <label className="text-[10px] text-[#9A8B80] uppercase font-bold mb-1.5 block">Weeks</label>
                  <div className="flex items-center justify-center gap-3 bg-[#FAF6F1] p-2 rounded-[14px]">
                    <button onClick={() => setPlanWeeks(Math.max(2, planWeeks - 1))} className="p-1"><Minus className="w-4 h-4 text-[#6B6257]" /></button>
                    <span className="font-display font-bold w-16 text-center text-[#2B2523]">{planWeeks}w</span>
                    <button onClick={() => setPlanWeeks(Math.min(12, planWeeks + 1))} className="p-1"><Plus className="w-4 h-4 text-[#6B6257]" /></button>
                  </div>
                </div>
                <button onClick={handleCreatePlan} disabled={isGenerating || !userVibe} className="w-full bg-[#E07A5F] text-white py-3 rounded-[14px] font-bold disabled:opacity-50 active:scale-[0.98] transition-smooth">
                  {isGenerating ? <Loader2 className="animate-spin w-5 h-5 mx-auto" /> : "Generate"}
                </button>
              </div>
            )}
          </div>
        )}

        {viewMode === 'FAVORITES' && (
          <div className="space-y-2.5">
            {favorites.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-[20px] card-shadow"><Star className="w-8 h-8 text-[#E8DFD5] mx-auto mb-2" /><p className="text-[#9A8B80] text-sm font-medium">No saved workouts</p><p className="text-[#B4A79C] text-xs mt-1">Generate a workout and save it</p></div>
            ) : favorites.map(f => (
              <div key={f.id} className="bg-white p-4 rounded-[20px] card-shadow flex justify-between items-center min-h-[64px]">
                <div className="min-w-0 flex-1 mr-3">
                  <h4 className="font-display font-bold text-sm text-[#2B2523] truncate">{f.name}</h4>
                  <p className="text-xs text-[#9A8B80] mt-0.5">{f.durationMinutes} min • {f.exercises?.length || 0} exercises</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => { setSuggestion({ title: f.name, duration: f.durationMinutes.toString(), focus: f.focus, exercises: f.exercises, warmup: [] }); setShowGenerator(true); }} className="bg-[#E07A5F] text-white px-4 py-2 rounded-full text-xs font-bold active:scale-95 transition-smooth">Start</button>
                  <button onClick={() => setFavorites(deleteRoutine(f.id))} className="p-2 bg-[#FAF6F1] rounded-full active:scale-95"><X className="w-4 h-4 text-[#9A8B80]" /></button>
                </div>
              </div>
            ))}
          </div>
        )}

        {viewMode === 'HISTORY' && (
          <div className="space-y-2.5">
            {allWorkouts.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-[20px] card-shadow"><History className="w-8 h-8 text-[#E8DFD5] mx-auto mb-2" /><p className="text-[#9A8B80] text-sm font-medium">No workouts yet</p><p className="text-[#B4A79C] text-xs mt-1">Start your first workout above</p></div>
            ) : (
              <>
                {/* Last-7-days summary: sessions / minutes / kcal */}
                {(() => {
                  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
                  const recent = allWorkouts.filter(w => w.timestamp >= cutoff);
                  const minutes = recent.reduce((s, w) => s + w.durationMinutes, 0);
                  const kcal = recent.reduce((s, w) => s + workoutCalories(w, weightKg), 0);
                  return (
                    <div className="grid grid-cols-3 gap-2.5">
                      <div className="bg-white rounded-[18px] p-3 card-shadow text-center">
                        <div className="text-[18px] font-display font-extrabold text-[#2B2523] tabular-nums">{recent.length}</div>
                        <div className="text-[10px] text-[#9A8B80] font-semibold">sessions · 7d</div>
                      </div>
                      <div className="bg-white rounded-[18px] p-3 card-shadow text-center">
                        <div className="text-[18px] font-display font-extrabold text-[#2B2523] tabular-nums">{minutes}</div>
                        <div className="text-[10px] text-[#9A8B80] font-semibold">minutes</div>
                      </div>
                      <div className="bg-white rounded-[18px] p-3 card-shadow text-center">
                        <div className="text-[18px] font-display font-extrabold text-[#D9964F] tabular-nums">{kcal}</div>
                        <div className="text-[10px] text-[#9A8B80] font-semibold">kcal burned</div>
                      </div>
                    </div>
                  );
                })()}
                {allWorkouts.slice(0, 20).map(w => (
                  <div key={w.id} className="bg-white p-4 rounded-[20px] card-shadow flex justify-between items-center min-h-[60px]">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-[14px] bg-[#FBEBE4] flex items-center justify-center">
                        <Dumbbell className="w-4 h-4 text-[#E07A5F]" />
                      </div>
                      <div>
                        <div className="font-display font-bold text-sm text-[#2B2523]">{w.type}</div>
                        <div className="text-xs text-[#9A8B80]">
                          {w.date === todayStr()
                            ? tr('today')
                            : parseDateStr(w.date).toLocaleDateString(getCurrentLanguage(), { weekday: 'short', day: 'numeric', month: 'short' })}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-display font-bold text-sm text-[#6B6257] tabular-nums">{w.durationMinutes} min</div>
                      <div className="text-[11px] text-[#D9964F] font-semibold tabular-nums flex items-center justify-end gap-0.5">
                        <Flame className="w-3 h-3" />{workoutCalories(w, weightKg)} kcal
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
        </div>
      </div>
    </div>
  );
};

export default Workouts;

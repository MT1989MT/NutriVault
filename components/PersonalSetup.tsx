import React, { useState, useMemo, useCallback } from 'react';
import {
  ChevronLeft, ChevronRight, Check, Target, Heart, User,
  Activity, Scale, Gauge, Salad, PieChart, Sparkles, AlertTriangle
} from 'lucide-react';
import {
  ActivityLevel, Gender, GoalType, MacroPreset, MacroTargets, UserProfile
} from '../types';
import {
  calculateBMR, calculateTDEE, calculateMaintenance,
  macroGramsFromTargets, MACRO_PRESETS, generateId
} from '../utils/calculations';
import { getCurrentLanguage } from '../utils/i18n';

interface PersonalSetupProps {
  existingProfile?: UserProfile | null;
  onComplete: (profile: UserProfile) => void;
  onCancel?: () => void;
}

type Step =
  | 'WELCOME' | 'GOAL' | 'REASONS' | 'STATS' | 'ACTIVITY'
  | 'TARGET_WEIGHT' | 'PACE' | 'DIET' | 'MACROS' | 'SUMMARY';

const STEP_ORDER_LOSE_GAIN: Step[] = [
  'WELCOME', 'GOAL', 'REASONS', 'STATS', 'ACTIVITY',
  'TARGET_WEIGHT', 'PACE', 'DIET', 'MACROS', 'SUMMARY',
];
const STEP_ORDER_MAINTAIN: Step[] = [
  'WELCOME', 'GOAL', 'REASONS', 'STATS', 'ACTIVITY',
  'DIET', 'MACROS', 'SUMMARY',
];

// Tiny in-component dictionary so we don't need to bloat global i18n.
// Falls back to English for any unsupported locale.
type SetupStrings = {
  skip: string; back: string; next: string; finish: string;
  fillFieldsHint: string;
  welcomeTitle: string; welcomeBody: string;
  welcomeBullet1: string; welcomeBullet2: string; welcomeBullet3: string;
  goalTitle: string; goalSub: string;
  goalLose: string; goalLoseDesc: string;
  goalMaintain: string; goalMaintainDesc: string;
  goalGain: string; goalGainDesc: string;
  goalFit: string; goalFitDesc: string;
  reasonsTitle: string; reasonsSub: string;
  statsTitle: string; statsSub: string;
  name: string; age: string; sex: string; height: string; weight: string;
  male: string; female: string;
  activityTitle: string; activitySub: string;
  targetTitle: string; targetSub: string;
  paceTitle: string; paceSubLose: string; paceSubGain: string;
  paceSlow: string; paceMid: string; paceFast: string; paceMax: string;
  paceWarning: string; floorWarning: string; weeksToGoal: string;
  dietTitle: string; dietSub: string;
  macrosTitle: string; macrosSub: string;
  macroBalanced: string; macroBalancedDesc: string;
  macroHighProtein: string; macroHighProteinDesc: string;
  macroLowCarb: string; macroLowCarbDesc: string;
  macroKeto: string; macroKetoDesc: string;
  macroCustom: string; macroCustomDesc: string;
  summaryTitle: string; summarySub: string;
  dailyCalories: string; maintenance: string;
  deficit: string; surplus: string;
  pHeader: string; cHeader: string; fHeader: string;
  saveAndStart: string;
};

const STRINGS: Record<'en' | 'nl', SetupStrings> = {
  en: {
    skip: 'Skip',
    back: 'Back',
    next: 'Next',
    finish: 'Get Started',
    fillFieldsHint: 'Fill in all fields above to continue',
    welcomeTitle: "Let's personalise your plan",
    welcomeBody: 'Answer a few quick questions and we\'ll calculate the right calorie & macro targets just for you.',
    welcomeBullet1: 'Custom calorie goal based on your body & pace',
    welcomeBullet2: 'Macro split that fits your diet style',
    welcomeBullet3: 'Change anything later in your profile',
    goalTitle: 'What is your main goal?',
    goalSub: 'You can fine-tune this later.',
    goalLose: 'Lose weight',
    goalLoseDesc: 'Eat in a calorie deficit',
    goalMaintain: 'Maintain weight',
    goalMaintainDesc: 'Stay where you are now',
    goalGain: 'Gain weight',
    goalGainDesc: 'Build muscle or recover',
    goalFit: 'Get healthier',
    goalFitDesc: 'Eat better, no scale focus',
    reasonsTitle: 'What\'s driving you?',
    reasonsSub: 'Pick everything that fits — your coach uses this for motivation.',
    statsTitle: 'About you',
    statsSub: 'Used to calculate your daily calorie needs.',
    name: 'Name', age: 'Age', sex: 'Sex', height: 'Height', weight: 'Current weight',
    male: 'Male', female: 'Female',
    activityTitle: 'How active are you?',
    activitySub: 'Outside of planned workouts. Be honest — most people overestimate.',
    targetTitle: 'What\'s your target weight?',
    targetSub: 'We\'ll use this to track your progress over time.',
    paceTitle: 'How fast do you want to go?',
    paceSubLose: 'A slower pace is easier to keep up. 0.5 kg/week is the sweet spot for most.',
    paceSubGain: 'A slower pace builds more muscle and less fat. 0.25 kg/week works for most.',
    paceSlow: 'Easy', paceMid: 'Recommended', paceFast: 'Aggressive', paceMax: 'Maximum',
    paceWarning: 'Aggressive deficits can cost muscle, mood and adherence. Re-think if this is sustainable.',
    floorWarning: 'We capped your minimum at a safe level so the target stays sustainable.',
    weeksToGoal: 'weeks to reach',
    dietTitle: 'Any dietary preferences?',
    dietSub: 'We\'ll keep these in mind for recipes & coach tips.',
    macrosTitle: 'Pick your macro split',
    macrosSub: 'How your daily calories divide between protein, carbs and fat.',
    macroBalanced: 'Balanced', macroBalancedDesc: 'Standard 30/40/30 split',
    macroHighProtein: 'High protein', macroHighProteinDesc: 'Great for cutting & muscle',
    macroLowCarb: 'Low carb', macroLowCarbDesc: 'Less carbs, more fat',
    macroKeto: 'Keto', macroKetoDesc: 'Very low carb, high fat',
    macroCustom: 'Custom', macroCustomDesc: 'Set your own %',
    summaryTitle: 'Your plan',
    summarySub: 'Here\'s what we calculated. You can change everything anytime.',
    dailyCalories: 'Daily calories',
    maintenance: 'Maintenance',
    deficit: 'Daily deficit', surplus: 'Daily surplus',
    pHeader: 'Protein', cHeader: 'Carbs', fHeader: 'Fat',
    saveAndStart: 'Start tracking',
  },
  nl: {
    skip: 'Overslaan',
    back: 'Terug',
    next: 'Volgende',
    finish: 'Aan de slag',
    fillFieldsHint: 'Vul alle velden hierboven in om verder te gaan',
    welcomeTitle: 'Laten we jouw plan personaliseren',
    welcomeBody: 'Beantwoord een paar korte vragen en we berekenen de juiste calorie- en macrodoelen voor jou.',
    welcomeBullet1: 'Persoonlijk caloriedoel op basis van jouw lichaam en tempo',
    welcomeBullet2: 'Macroverdeling die bij jouw dieetstijl past',
    welcomeBullet3: 'Alles is later aan te passen in je profiel',
    goalTitle: 'Wat is je belangrijkste doel?',
    goalSub: 'Je kunt dit later altijd bijstellen.',
    goalLose: 'Afvallen',
    goalLoseDesc: 'Eten met een caloriedeficit',
    goalMaintain: 'Gewicht behouden',
    goalMaintainDesc: 'Blijven waar je nu zit',
    goalGain: 'Aankomen',
    goalGainDesc: 'Spier opbouwen of herstellen',
    goalFit: 'Gezonder worden',
    goalFitDesc: 'Beter eten, weegschaal niet centraal',
    reasonsTitle: 'Wat motiveert je?',
    reasonsSub: 'Kies alles wat past — je coach gebruikt dit voor motivatie.',
    statsTitle: 'Over jou',
    statsSub: 'Gebruikt om je dagelijkse caloriebehoefte te berekenen.',
    name: 'Naam', age: 'Leeftijd', sex: 'Geslacht', height: 'Lengte', weight: 'Huidig gewicht',
    male: 'Man', female: 'Vrouw',
    activityTitle: 'Hoe actief ben je?',
    activitySub: 'Buiten geplande workouts om. Wees eerlijk — de meeste mensen overschatten.',
    targetTitle: 'Wat is je streefgewicht?',
    targetSub: 'Hiermee volgen we je voortgang.',
    paceTitle: 'In welk tempo wil je dit?',
    paceSubLose: 'Een rustiger tempo houd je makkelijker vol. 0,5 kg/week is voor de meesten ideaal.',
    paceSubGain: 'Een rustiger tempo bouwt meer spier en minder vet op. 0,25 kg/week werkt voor de meesten.',
    paceSlow: 'Rustig', paceMid: 'Aanbevolen', paceFast: 'Stevig', paceMax: 'Maximaal',
    paceWarning: 'Een agressief deficit kost vaak spier, energie en doorzettingsvermogen. Denk goed na of dit vol te houden is.',
    floorWarning: 'We hebben je minimum begrensd op een veilige waarde zodat het haalbaar blijft.',
    weeksToGoal: 'weken tot doel',
    dietTitle: 'Dieetvoorkeuren?',
    dietSub: 'We houden hier rekening mee bij recepten en coach-tips.',
    macrosTitle: 'Kies je macroverdeling',
    macrosSub: 'Hoe je dagelijkse calorieën verdeeld worden over eiwit, koolhydraten en vet.',
    macroBalanced: 'Gebalanceerd', macroBalancedDesc: 'Standaard 30/40/30 verdeling',
    macroHighProtein: 'Hoog eiwit', macroHighProteinDesc: 'Top tijdens cutten of voor spier',
    macroLowCarb: 'Laag koolhydraat', macroLowCarbDesc: 'Minder koolhydraten, meer vet',
    macroKeto: 'Keto', macroKetoDesc: 'Heel weinig koolhydraten, veel vet',
    macroCustom: 'Eigen', macroCustomDesc: 'Stel zelf je % in',
    summaryTitle: 'Jouw plan',
    summarySub: 'Dit hebben we berekend. Alles is later aan te passen.',
    dailyCalories: 'Dagelijkse calorieën',
    maintenance: 'Onderhoud',
    deficit: 'Dagelijks tekort', surplus: 'Dagelijks overschot',
    pHeader: 'Eiwit', cHeader: 'Koolh.', fHeader: 'Vet',
    saveAndStart: 'Begin met tracken',
  },
} as const;

const REASON_OPTIONS = [
  { id: 'energy',     en: 'More energy',          nl: 'Meer energie' },
  { id: 'confidence', en: 'Feel more confident',  nl: 'Meer zelfvertrouwen' },
  { id: 'health',     en: 'Improve my health',    nl: 'Mijn gezondheid verbeteren' },
  { id: 'strength',   en: 'Get stronger',         nl: 'Sterker worden' },
  { id: 'habits',     en: 'Build healthy habits', nl: 'Gezonde gewoontes opbouwen' },
  { id: 'event',      en: 'For a big event',      nl: 'Voor een speciale gelegenheid' },
  { id: 'sleep',      en: 'Sleep better',         nl: 'Beter slapen' },
  { id: 'mood',       en: 'Boost my mood',        nl: 'Beter humeur' },
];

const DIET_OPTIONS = [
  { id: 'none',         en: 'No restrictions',  nl: 'Geen beperkingen' },
  { id: 'vegetarian',   en: 'Vegetarian',       nl: 'Vegetarisch' },
  { id: 'vegan',        en: 'Vegan',            nl: 'Veganistisch' },
  { id: 'pescatarian',  en: 'Pescatarian',      nl: 'Pescatarisch' },
  { id: 'gluten_free',  en: 'Gluten free',      nl: 'Glutenvrij' },
  { id: 'lactose_free', en: 'Lactose free',     nl: 'Lactosevrij' },
  { id: 'halal',        en: 'Halal',            nl: 'Halal' },
  { id: 'kosher',       en: 'Kosher',           nl: 'Koosjer' },
  { id: 'low_carb',     en: 'Low carb',         nl: 'Koolhydraatarm' },
  { id: 'mediterranean',en: 'Mediterranean',    nl: 'Mediterraan' },
];

const ACTIVITY_OPTIONS: { val: ActivityLevel; en: { title: string; desc: string }; nl: { title: string; desc: string } }[] = [
  { val: ActivityLevel.SEDENTARY,         en: { title: 'Sedentary',  desc: 'Desk job, little exercise' },           nl: { title: 'Zittend',     desc: 'Kantoorbaan, weinig beweging' } },
  { val: ActivityLevel.LIGHTLY_ACTIVE,    en: { title: 'Light',      desc: 'Light exercise 1–3x/week' },             nl: { title: 'Licht',       desc: 'Licht sporten 1–3x/week' } },
  { val: ActivityLevel.MODERATELY_ACTIVE, en: { title: 'Moderate',   desc: 'Exercise 3–5x/week' },                   nl: { title: 'Gemiddeld',   desc: 'Sporten 3–5x/week' } },
  { val: ActivityLevel.VERY_ACTIVE,       en: { title: 'Very active', desc: 'Exercise 6–7x/week' },                  nl: { title: 'Zeer actief', desc: 'Sporten 6–7x/week' } },
  { val: ActivityLevel.EXTRA_ACTIVE,      en: { title: 'Athlete',    desc: 'Twice a day or physical job' },          nl: { title: 'Atleet',      desc: '2x per dag of fysiek werk' } },
];

const PACE_OPTIONS = [
  { rate: 0.25, key: 'paceSlow' as const },
  { rate: 0.5,  key: 'paceMid'  as const },
  { rate: 0.75, key: 'paceFast' as const },
  { rate: 1.0,  key: 'paceMax'  as const },
];

const PersonalSetup: React.FC<PersonalSetupProps> = ({ existingProfile, onComplete, onCancel }) => {
  const lang = getCurrentLanguage() === 'nl' ? 'nl' : 'en';
  const T = STRINGS[lang];

  const [stepIndex, setStepIndex] = useState(0);
  const [data, setData] = useState<Partial<UserProfile>>(() => existingProfile ?? {
    name: '',
    gender: Gender.MALE,
    activityLevel: ActivityLevel.LIGHTLY_ACTIVE,
    goal: 'LOSE',
    quickLog: false,
    ignoreWorkoutCalories: true,
    coachPersonality: 'FRIENDLY',
    weeklyWeightChangeKg: 0.5,
    macroPreset: 'BALANCED',
    reasons: [],
    dietaryPreferences: [],
  });

  // String state for numeric inputs (avoid controlled-input rerender lag)
  const [ageStr,    setAgeStr]    = useState(existingProfile?.age?.toString() ?? '');
  const [heightStr, setHeightStr] = useState(existingProfile?.heightCm?.toString() ?? '');
  const [weightStr, setWeightStr] = useState(existingProfile?.weightKg?.toString() ?? '');
  const [targetStr, setTargetStr] = useState(existingProfile?.targetWeightKg?.toString() ?? '');
  const [customMacros, setCustomMacros] = useState<MacroTargets>(
    existingProfile?.macroTargets ?? { proteinPct: 30, carbsPct: 40, fatPct: 30 }
  );

  // Active step list depends on goal selection
  const stepOrder = useMemo<Step[]>(() => {
    return data.goal === 'LOSE' || data.goal === 'GAIN'
      ? STEP_ORDER_LOSE_GAIN
      : STEP_ORDER_MAINTAIN;
  }, [data.goal]);

  const currentStep = stepOrder[Math.min(stepIndex, stepOrder.length - 1)];
  const totalVisible = stepOrder.length;
  const progress = (stepIndex + 1) / totalVisible;

  // Validation per step — disables Next when required input missing
  const isStepValid = useMemo(() => {
    switch (currentStep) {
      case 'STATS':
        return Number(ageStr) >= 13 && Number(heightStr) >= 100 && Number(weightStr) >= 30;
      case 'TARGET_WEIGHT':
        return Number(targetStr) > 0;
      default:
        return true;
    }
  }, [currentStep, ageStr, heightStr, weightStr, targetStr]);

  // Live calculations for summary & pace screens
  const calc = useMemo(() => {
    const w = Number(weightStr) || 0;
    const h = Number(heightStr) || 0;
    const a = Number(ageStr) || 0;
    if (!w || !h || !a) return null;
    const bmr = calculateBMR(w, h, a, data.gender || Gender.MALE);
    const maintenance = calculateMaintenance(bmr, data.activityLevel || ActivityLevel.SEDENTARY);
    const target = calculateTDEE(
      bmr, data.activityLevel || ActivityLevel.SEDENTARY,
      data.goal || 'MAINTAIN',
      data.weeklyWeightChangeKg,
      data.gender,
    );
    const requestedDelta = Math.round(((data.weeklyWeightChangeKg ?? 0) * 7700) / 7);
    const actualDelta = Math.abs(target - maintenance);
    const wasFloored = (data.goal === 'LOSE') && requestedDelta > actualDelta;

    const macros = data.macroPreset === 'CUSTOM' ? customMacros : (data.macroPreset ? MACRO_PRESETS[data.macroPreset as Exclude<MacroPreset, 'CUSTOM'>] : MACRO_PRESETS.BALANCED);
    const grams = macroGramsFromTargets(target, macros);

    let weeksToGoal: number | null = null;
    const targetW = Number(targetStr) || 0;
    if (targetW && (data.goal === 'LOSE' || data.goal === 'GAIN') && (data.weeklyWeightChangeKg ?? 0) > 0) {
      const diff = Math.abs(w - targetW);
      weeksToGoal = Math.max(1, Math.ceil(diff / (data.weeklyWeightChangeKg as number)));
    }

    return { bmr, maintenance, target, macros, grams, weeksToGoal, wasFloored, actualDelta };
  }, [weightStr, heightStr, ageStr, data.gender, data.activityLevel, data.goal,
      data.weeklyWeightChangeKg, data.macroPreset, customMacros, targetStr]);

  const goNext = useCallback(() => {
    if (stepIndex < stepOrder.length - 1) setStepIndex(stepIndex + 1);
  }, [stepIndex, stepOrder.length]);

  const goBack = useCallback(() => {
    if (stepIndex > 0) setStepIndex(stepIndex - 1);
  }, [stepIndex]);

  const toggleArrayItem = (key: 'reasons' | 'dietaryPreferences', id: string) => {
    setData(prev => {
      const arr = prev[key] || [];
      const next = arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id];
      return { ...prev, [key]: next };
    });
  };

  const handleFinish = () => {
    if (!calc) return;
    const finalProfile: UserProfile = {
      id: existingProfile?.id || generateId(),
      name: (data.name || '').trim() || 'You',
      age: Number(ageStr) || undefined,
      heightCm: Number(heightStr) || undefined,
      weightKg: Number(weightStr) || undefined,
      gender: data.gender || Gender.MALE,
      activityLevel: data.activityLevel || ActivityLevel.SEDENTARY,
      goal: data.goal || 'MAINTAIN',
      tdee: calc.target,
      targetWeightKg: Number(targetStr) || undefined,
      weeklyWeightChangeKg: data.goal === 'LOSE' || data.goal === 'GAIN' ? data.weeklyWeightChangeKg : undefined,
      reasons: data.reasons,
      dietaryPreferences: data.dietaryPreferences,
      macroPreset: data.macroPreset,
      macroTargets: data.macroPreset === 'CUSTOM' ? customMacros : calc.macros,
      quickLog: data.quickLog ?? false,
      ignoreWorkoutCalories: data.ignoreWorkoutCalories ?? true,
      coachPersonality: data.coachPersonality || 'FRIENDLY',
    };
    onComplete(finalProfile);
  };

  return (
    <div
      className="fixed inset-0 flex flex-col bg-[#FAF6F1]"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      {/* Header: back, progress, skip-or-cancel */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <button
          onClick={goBack}
          disabled={stepIndex === 0}
          aria-label={T.back}
          className={`w-10 h-10 rounded-xl flex items-center justify-center transition-smooth ${
            stepIndex === 0 ? 'opacity-0 pointer-events-none' : 'bg-white card-shadow active:scale-95'
          }`}
        >
          <ChevronLeft className="w-5 h-5 text-[#6B6257]" />
        </button>

        <div className="flex-1 mx-3">
          <div className="h-1.5 bg-[#E8DFD5] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#E07A5F] transition-all duration-300"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          <div className="text-[10px] text-[#9A8B80] text-center mt-1 font-medium tabular-nums">
            {stepIndex + 1} / {totalVisible}
          </div>
        </div>

        {onCancel ? (
          <button onClick={onCancel} className="text-[#9A8B80] text-xs font-medium px-2">
            {T.skip}
          </button>
        ) : <div className="w-10" />}
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto px-5 pb-4">
        {currentStep === 'WELCOME' && (
          <Welcome T={T} />
        )}

        {currentStep === 'GOAL' && (
          <GoalStep
            T={T}
            value={data.goal || 'LOSE'}
            onChange={(g) => setData({ ...data, goal: g })}
          />
        )}

        {currentStep === 'REASONS' && (
          <ReasonsStep
            T={T}
            lang={lang}
            selected={data.reasons || []}
            onToggle={(id) => toggleArrayItem('reasons', id)}
          />
        )}

        {currentStep === 'STATS' && (
          <StatsStep
            T={T}
            name={data.name || ''}
            onName={(v) => setData({ ...data, name: v })}
            gender={data.gender || Gender.MALE}
            onGender={(g) => setData({ ...data, gender: g })}
            ageStr={ageStr} setAgeStr={setAgeStr}
            heightStr={heightStr} setHeightStr={setHeightStr}
            weightStr={weightStr} setWeightStr={setWeightStr}
          />
        )}

        {currentStep === 'ACTIVITY' && (
          <ActivityStep
            T={T} lang={lang}
            value={data.activityLevel || ActivityLevel.LIGHTLY_ACTIVE}
            onChange={(a) => setData({ ...data, activityLevel: a })}
          />
        )}

        {currentStep === 'TARGET_WEIGHT' && (
          <TargetWeightStep
            T={T}
            goal={data.goal || 'LOSE'}
            currentWeight={Number(weightStr) || 0}
            value={targetStr}
            onChange={setTargetStr}
          />
        )}

        {currentStep === 'PACE' && (
          <PaceStep
            T={T}
            goal={data.goal || 'LOSE'}
            value={data.weeklyWeightChangeKg || 0.5}
            onChange={(rate) => setData({ ...data, weeklyWeightChangeKg: rate })}
            calc={calc}
          />
        )}

        {currentStep === 'DIET' && (
          <DietStep
            T={T} lang={lang}
            selected={data.dietaryPreferences || []}
            onToggle={(id) => toggleArrayItem('dietaryPreferences', id)}
          />
        )}

        {currentStep === 'MACROS' && (
          <MacrosStep
            T={T}
            preset={data.macroPreset || 'BALANCED'}
            onPreset={(p) => setData({ ...data, macroPreset: p })}
            custom={customMacros}
            onCustom={setCustomMacros}
            calc={calc}
          />
        )}

        {currentStep === 'SUMMARY' && (
          <SummaryStep T={T} lang={lang} data={data} calc={calc} targetWeightStr={targetStr} />
        )}
      </div>

      {/* Bottom CTA */}
      <div
        className="px-5 pt-2 pb-4 bg-[#FAF6F1]"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        {currentStep === 'SUMMARY' ? (
          <button
            onClick={handleFinish}
            className="w-full bg-[#E07A5F] text-white py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2 active:scale-[0.97] transition-smooth shadow-lg shadow-[#E07A5F]/25"
          >
            <Check className="w-5 h-5" /> {T.saveAndStart}
          </button>
        ) : (
          <>
            {/* Explain WHY the button is disabled instead of a silent grey button */}
            {!isStepValid && (
              <p className="text-center text-[11px] text-[#9A8B80] font-medium mb-2">{T.fillFieldsHint}</p>
            )}
            <button
              onClick={goNext}
              disabled={!isStepValid}
              className={`w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2 transition-smooth ${
                isStepValid
                  ? 'bg-[#E07A5F] text-white active:scale-[0.97] shadow-lg shadow-[#E07A5F]/25'
                  : 'bg-[#E8DFD5] text-[#9A8B80]'
              }`}
            >
              {T.next} <ChevronRight className="w-5 h-5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
};

// ===== Step components =====

const StepHeader: React.FC<{ icon: React.ReactNode; title: string; sub?: string }> = ({ icon, title, sub }) => (
  <div className="text-center mb-6 pt-4">
    <div className="w-14 h-14 mx-auto mb-4 bg-gradient-to-br from-[#E07A5F]/15 to-[#C85A40]/10 rounded-2xl flex items-center justify-center">
      {icon}
    </div>
    <h1 className="text-[24px] font-black text-[#2B2523] font-display tracking-tight leading-tight mb-1.5">
      {title}
    </h1>
    {sub && <p className="text-[14px] text-[#9A8B80] leading-relaxed">{sub}</p>}
  </div>
);

const Welcome: React.FC<{ T: SetupStrings }> = ({ T }) => (
  <div className="pt-10 text-center max-w-sm mx-auto">
    <div className="w-20 h-20 bg-[#E07A5F] rounded-[22px] flex items-center justify-center mx-auto mb-6 shadow-lg shadow-[#E07A5F]/25">
      <Sparkles className="w-9 h-9 text-white" />
    </div>
    <h1 className="text-[28px] font-black text-[#2B2523] font-display tracking-tight leading-tight mb-3">
      {T.welcomeTitle}
    </h1>
    <p className="text-[15px] text-[#9A8B80] leading-relaxed mb-6">
      {T.welcomeBody}
    </p>
    <div className="bg-white rounded-2xl card-shadow p-4 text-left space-y-3">
      <Bullet text={T.welcomeBullet1} />
      <Bullet text={T.welcomeBullet2} />
      <Bullet text={T.welcomeBullet3} />
    </div>
  </div>
);

const Bullet: React.FC<{ text: string }> = ({ text }) => (
  <div className="flex items-start gap-2.5">
    <div className="w-5 h-5 bg-[#E07A5F]/10 rounded-full flex items-center justify-center shrink-0 mt-0.5">
      <Check className="w-3 h-3 text-[#E07A5F]" />
    </div>
    <p className="text-[13px] text-[#6B6257]">{text}</p>
  </div>
);

const GoalStep: React.FC<{
  T: SetupStrings;
  value: GoalType;
  onChange: (v: GoalType) => void;
}> = ({ T, value, onChange }) => {
  const opts: { val: GoalType; title: string; desc: string }[] = [
    { val: 'LOSE',     title: T.goalLose,     desc: T.goalLoseDesc },
    { val: 'MAINTAIN', title: T.goalMaintain, desc: T.goalMaintainDesc },
    { val: 'GAIN',     title: T.goalGain,     desc: T.goalGainDesc },
    { val: 'FIT',      title: T.goalFit,      desc: T.goalFitDesc },
  ];
  return (
    <>
      <StepHeader icon={<Target className="w-7 h-7 text-[#E07A5F]" />} title={T.goalTitle} sub={T.goalSub} />
      <div className="space-y-2.5">
        {opts.map(o => (
          <button
            key={o.val}
            onClick={() => onChange(o.val)}
            className={`w-full p-4 rounded-2xl text-left transition-all ${
              value === o.val
                ? 'bg-[#E07A5F] text-white shadow-lg shadow-[#E07A5F]/25'
                : 'bg-white card-shadow text-[#2B2523] active:scale-[0.99]'
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-[15px]">{o.title}</p>
                <p className={`text-[12px] mt-0.5 ${value === o.val ? 'text-white/80' : 'text-[#9A8B80]'}`}>{o.desc}</p>
              </div>
              {value === o.val && <Check className="w-5 h-5" />}
            </div>
          </button>
        ))}
      </div>
    </>
  );
};

const ReasonsStep: React.FC<{
  T: SetupStrings;
  lang: 'en' | 'nl';
  selected: string[];
  onToggle: (id: string) => void;
}> = ({ T, lang, selected, onToggle }) => (
  <>
    <StepHeader icon={<Heart className="w-7 h-7 text-[#E07A5F]" />} title={T.reasonsTitle} sub={T.reasonsSub} />
    <div className="grid grid-cols-2 gap-2">
      {REASON_OPTIONS.map(o => {
        const active = selected.includes(o.id);
        return (
          <button
            key={o.id}
            onClick={() => onToggle(o.id)}
            className={`p-3 rounded-xl text-center text-[13px] font-bold transition-all ${
              active
                ? 'bg-[#E07A5F] text-white shadow-md'
                : 'bg-white card-shadow text-[#6B6257] active:scale-[0.98]'
            }`}
          >
            {o[lang]}
          </button>
        );
      })}
    </div>
  </>
);

const StatsStep: React.FC<{
  T: SetupStrings;
  name: string; onName: (v: string) => void;
  gender: Gender; onGender: (g: Gender) => void;
  ageStr: string; setAgeStr: (v: string) => void;
  heightStr: string; setHeightStr: (v: string) => void;
  weightStr: string; setWeightStr: (v: string) => void;
}> = ({ T, name, onName, gender, onGender, ageStr, setAgeStr, heightStr, setHeightStr, weightStr, setWeightStr }) => {
  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setTimeout(() => e.target.scrollIntoView({ behavior: 'smooth', block: 'center' }), 250);
  };

  return (
    <>
      <StepHeader icon={<User className="w-7 h-7 text-[#E07A5F]" />} title={T.statsTitle} sub={T.statsSub} />

      <div className="bg-white rounded-2xl card-shadow p-3 mb-3">
        <label className="text-[10px] font-bold text-[#9A8B80] uppercase block mb-1">{T.name}</label>
        <input
          type="text"
          value={name}
          onChange={(e) => onName(e.target.value)}
          onFocus={handleFocus}
          className="w-full bg-transparent outline-none font-bold text-[#2B2523] text-[15px]"
          placeholder="—"
        />
      </div>

      <div className="bg-white rounded-2xl card-shadow p-3 mb-3">
        <label className="text-[10px] font-bold text-[#9A8B80] uppercase block mb-2">{T.sex}</label>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => onGender(Gender.MALE)}
            className={`py-3 rounded-xl font-bold text-sm transition-all ${
              gender === Gender.MALE ? 'bg-[#E07A5F] text-white shadow-md' : 'bg-[#FAF6F1] text-[#6B6257]'
            }`}
          >{T.male}</button>
          <button
            onClick={() => onGender(Gender.FEMALE)}
            className={`py-3 rounded-xl font-bold text-sm transition-all ${
              gender === Gender.FEMALE ? 'bg-[#E07A5F] text-white shadow-md' : 'bg-[#FAF6F1] text-[#6B6257]'
            }`}
          >{T.female}</button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <NumberCell label={T.age} suffix="" inputMode="numeric" value={ageStr} onChange={setAgeStr} onFocus={handleFocus} />
        <NumberCell label={T.height} suffix="cm" inputMode="numeric" value={heightStr} onChange={setHeightStr} onFocus={handleFocus} />
        <NumberCell label={T.weight} suffix="kg" inputMode="decimal" value={weightStr} onChange={setWeightStr} onFocus={handleFocus} />
      </div>
    </>
  );
};

const NumberCell: React.FC<{
  label: string; suffix: string; value: string;
  inputMode: 'numeric' | 'decimal';
  onChange: (v: string) => void;
  onFocus: (e: React.FocusEvent<HTMLInputElement>) => void;
}> = ({ label, suffix, value, onChange, inputMode, onFocus }) => (
  <div className="bg-white rounded-2xl card-shadow p-3 text-center">
    <label className="text-[9px] font-bold text-[#9A8B80] uppercase block mb-1">{label}</label>
    <div className="flex items-baseline justify-center gap-1">
      <input
        type="text"
        inputMode={inputMode}
        pattern={inputMode === 'numeric' ? '[0-9]*' : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(inputMode === 'decimal' ? /[^0-9.]/g : /[^0-9]/g, ''))}
        onFocus={onFocus}
        className="w-full bg-transparent outline-none font-black text-[22px] text-center text-[#2B2523] tabular-nums"
        placeholder="—"
      />
    </div>
    {suffix && <p className="text-[10px] text-[#9A8B80] font-bold mt-0.5">{suffix}</p>}
  </div>
);

const ActivityStep: React.FC<{
  T: SetupStrings; lang: 'en' | 'nl';
  value: ActivityLevel;
  onChange: (a: ActivityLevel) => void;
}> = ({ T, lang, value, onChange }) => (
  <>
    <StepHeader icon={<Activity className="w-7 h-7 text-[#E07A5F]" />} title={T.activityTitle} sub={T.activitySub} />
    <div className="space-y-2.5">
      {ACTIVITY_OPTIONS.map(o => {
        const localized = o[lang];
        const active = value === o.val;
        return (
          <button
            key={o.val}
            onClick={() => onChange(o.val)}
            className={`w-full p-4 rounded-2xl text-left transition-all flex items-center justify-between ${
              active ? 'bg-[#E07A5F] text-white shadow-lg shadow-[#E07A5F]/25' : 'bg-white card-shadow active:scale-[0.99]'
            }`}
          >
            <div>
              <p className="font-bold text-[15px]">{localized.title}</p>
              <p className={`text-[12px] mt-0.5 ${active ? 'text-white/80' : 'text-[#9A8B80]'}`}>{localized.desc}</p>
            </div>
            {active && <Check className="w-5 h-5" />}
          </button>
        );
      })}
    </div>
  </>
);

const TargetWeightStep: React.FC<{
  T: SetupStrings;
  goal: GoalType;
  currentWeight: number;
  value: string;
  onChange: (v: string) => void;
}> = ({ T, goal, currentWeight, value, onChange }) => {
  const suggestion = goal === 'LOSE' ? Math.max(40, currentWeight - 5) : currentWeight + 5;
  return (
    <>
      <StepHeader icon={<Scale className="w-7 h-7 text-[#E07A5F]" />} title={T.targetTitle} sub={T.targetSub} />
      <div className="bg-white rounded-2xl card-shadow p-6 text-center">
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ''))}
          placeholder={String(suggestion)}
          className="w-full bg-transparent outline-none font-black text-[48px] text-center text-[#2B2523] tabular-nums"
        />
        <p className="text-[12px] text-[#9A8B80] font-bold mt-1">kg</p>
      </div>
      {currentWeight > 0 && Number(value) > 0 && (
        <div className="mt-4 bg-gradient-to-r from-[#E07A5F]/8 to-[#C85A40]/5 rounded-xl p-3 text-center">
          <p className="text-[12px] text-[#6B6257]">
            {goal === 'LOSE'
              ? `${currentWeight} kg → ${Number(value)} kg (-${(currentWeight - Number(value)).toFixed(1)} kg)`
              : `${currentWeight} kg → ${Number(value)} kg (+${(Number(value) - currentWeight).toFixed(1)} kg)`}
          </p>
        </div>
      )}
    </>
  );
};

const PaceStep: React.FC<{
  T: SetupStrings;
  goal: GoalType;
  value: number;
  onChange: (rate: number) => void;
  calc: CalcResult | null;
}> = ({ T, goal, value, onChange, calc }) => {
  const sub = goal === 'LOSE' ? T.paceSubLose : T.paceSubGain;
  const isAggressive = value >= 1.0;
  return (
    <>
      <StepHeader icon={<Gauge className="w-7 h-7 text-[#E07A5F]" />} title={T.paceTitle} sub={sub} />
      <div className="space-y-2.5">
        {PACE_OPTIONS.map(opt => {
          const active = Math.abs(value - opt.rate) < 0.001;
          const dailyKcal = Math.round((opt.rate * 7700) / 7);
          return (
            <button
              key={opt.rate}
              onClick={() => onChange(opt.rate)}
              className={`w-full p-4 rounded-2xl text-left transition-all flex items-center justify-between ${
                active ? 'bg-[#E07A5F] text-white shadow-lg shadow-[#E07A5F]/25' : 'bg-white card-shadow active:scale-[0.99]'
              }`}
            >
              <div>
                <p className="font-bold text-[15px]">
                  {opt.rate.toFixed(2).replace('.', ',')} kg / week
                </p>
                <p className={`text-[12px] mt-0.5 ${active ? 'text-white/80' : 'text-[#9A8B80]'}`}>
                  {T[opt.key]} · {goal === 'LOSE' ? '−' : '+'}{dailyKcal} kcal/{goal === 'LOSE' ? 'day' : 'day'}
                </p>
              </div>
              {active && <Check className="w-5 h-5" />}
            </button>
          );
        })}
      </div>

      {isAggressive && goal === 'LOSE' && (
        <div className="mt-4 bg-[#F6ECE2] border border-[#F0DCC8] rounded-xl p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-[#C4763B] shrink-0 mt-0.5" />
          <p className="text-[12px] text-[#A8674F] leading-relaxed">{T.paceWarning}</p>
        </div>
      )}

      {calc?.wasFloored && (
        <div className="mt-3 bg-[#EFF2EE] border border-[#DDE5DB] rounded-xl p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-[#3D5A48] shrink-0 mt-0.5" />
          <p className="text-[12px] text-[#3D5A48] leading-relaxed">{T.floorWarning}</p>
        </div>
      )}

      {calc?.weeksToGoal != null && (
        <div className="mt-4 bg-white rounded-2xl card-shadow p-4 text-center">
          <p className="text-[10px] uppercase font-bold text-[#9A8B80] tracking-wider">{T.weeksToGoal}</p>
          <p className="text-[28px] font-black text-[#E07A5F] tabular-nums mt-1">{calc.weeksToGoal}</p>
        </div>
      )}
    </>
  );
};

interface CalcResult {
  bmr: number;
  maintenance: number;
  target: number;
  macros: MacroTargets;
  grams: { protein: number; carbs: number; fat: number };
  weeksToGoal: number | null;
  wasFloored: boolean;
  actualDelta: number;
}

const DietStep: React.FC<{
  T: SetupStrings; lang: 'en' | 'nl';
  selected: string[];
  onToggle: (id: string) => void;
}> = ({ T, lang, selected, onToggle }) => (
  <>
    <StepHeader icon={<Salad className="w-7 h-7 text-[#E07A5F]" />} title={T.dietTitle} sub={T.dietSub} />
    <div className="grid grid-cols-2 gap-2">
      {DIET_OPTIONS.map(o => {
        const active = selected.includes(o.id);
        return (
          <button
            key={o.id}
            onClick={() => onToggle(o.id)}
            className={`p-3 rounded-xl text-center text-[13px] font-bold transition-all ${
              active ? 'bg-[#E07A5F] text-white shadow-md' : 'bg-white card-shadow text-[#6B6257] active:scale-[0.98]'
            }`}
          >
            {o[lang]}
          </button>
        );
      })}
    </div>
  </>
);

const MacrosStep: React.FC<{
  T: SetupStrings;
  preset: MacroPreset;
  onPreset: (p: MacroPreset) => void;
  custom: MacroTargets;
  onCustom: (c: MacroTargets) => void;
  calc: CalcResult | null;
}> = ({ T, preset, onPreset, custom, onCustom, calc }) => {
  const presets: { val: MacroPreset; title: string; desc: string; pct: MacroTargets }[] = [
    { val: 'BALANCED',     title: T.macroBalanced,    desc: T.macroBalancedDesc,    pct: MACRO_PRESETS.BALANCED },
    { val: 'HIGH_PROTEIN', title: T.macroHighProtein, desc: T.macroHighProteinDesc, pct: MACRO_PRESETS.HIGH_PROTEIN },
    { val: 'LOW_CARB',     title: T.macroLowCarb,     desc: T.macroLowCarbDesc,     pct: MACRO_PRESETS.LOW_CARB },
    { val: 'KETO',         title: T.macroKeto,        desc: T.macroKetoDesc,        pct: MACRO_PRESETS.KETO },
  ];

  const totalPct = custom.proteinPct + custom.carbsPct + custom.fatPct;
  const totalOk = totalPct === 100;

  return (
    <>
      <StepHeader icon={<PieChart className="w-7 h-7 text-[#E07A5F]" />} title={T.macrosTitle} sub={T.macrosSub} />

      <div className="space-y-2.5">
        {presets.map(p => {
          const active = preset === p.val;
          return (
            <button
              key={p.val}
              onClick={() => onPreset(p.val)}
              className={`w-full p-3.5 rounded-2xl text-left transition-all ${
                active ? 'bg-[#E07A5F] text-white shadow-lg shadow-[#E07A5F]/25' : 'bg-white card-shadow active:scale-[0.99]'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-[14px]">{p.title}</p>
                  <p className={`text-[11px] mt-0.5 ${active ? 'text-white/80' : 'text-[#9A8B80]'}`}>{p.desc}</p>
                </div>
                <div className="text-right">
                  <p className={`text-[11px] font-bold tabular-nums ${active ? 'text-white' : 'text-[#6B6257]'}`}>
                    {p.pct.proteinPct}/{p.pct.carbsPct}/{p.pct.fatPct}
                  </p>
                  <p className={`text-[9px] ${active ? 'text-white/70' : 'text-[#9A8B80]'}`}>P · C · F</p>
                </div>
              </div>
            </button>
          );
        })}

        {/* Custom */}
        <button
          onClick={() => onPreset('CUSTOM')}
          className={`w-full p-3.5 rounded-2xl text-left transition-all ${
            preset === 'CUSTOM' ? 'bg-[#E07A5F] text-white shadow-lg shadow-[#E07A5F]/25' : 'bg-white card-shadow active:scale-[0.99]'
          }`}
        >
          <p className="font-bold text-[14px]">{T.macroCustom}</p>
          <p className={`text-[11px] mt-0.5 ${preset === 'CUSTOM' ? 'text-white/80' : 'text-[#9A8B80]'}`}>{T.macroCustomDesc}</p>
        </button>
      </div>

      {preset === 'CUSTOM' && (
        <div className="mt-4 bg-white rounded-2xl card-shadow p-4 space-y-3">
          <PctSlider label={T.pHeader} color="bg-[#EFF2EE]0" value={custom.proteinPct} onChange={(v) => onCustom({ ...custom, proteinPct: v })} />
          <PctSlider label={T.cHeader} color="bg-[#F6ECE2]0"   value={custom.carbsPct}   onChange={(v) => onCustom({ ...custom, carbsPct: v })} />
          <PctSlider label={T.fHeader} color="bg-rose-500"    value={custom.fatPct}     onChange={(v) => onCustom({ ...custom, fatPct: v })} />
          <p className={`text-[11px] text-center font-bold ${totalOk ? 'text-[#3D5A48]' : 'text-[#C85A40]'}`}>
            {totalPct}% / 100%
          </p>
        </div>
      )}

      {/* Live preview of grams */}
      {calc && (
        <div className="mt-4 bg-gradient-to-r from-[#E07A5F]/8 to-[#C85A40]/5 rounded-2xl p-4">
          <p className="text-[10px] font-bold text-[#9A8B80] uppercase tracking-wider mb-2 text-center">≈ {calc.target} kcal</p>
          <div className="grid grid-cols-3 gap-2 text-center">
            <MacroCell color="text-[#3D5A48]" label={T.pHeader} grams={calc.grams.protein} />
            <MacroCell color="text-[#C4763B]"   label={T.cHeader} grams={calc.grams.carbs} />
            <MacroCell color="text-rose-600"    label={T.fHeader} grams={calc.grams.fat} />
          </div>
        </div>
      )}
    </>
  );
};

const PctSlider: React.FC<{ label: string; color: string; value: number; onChange: (v: number) => void }> = ({ label, value, onChange, color }) => (
  <div>
    <div className="flex justify-between items-baseline mb-1">
      <span className="text-[12px] font-bold text-[#6B6257]">{label}</span>
      <span className="text-[14px] font-black tabular-nums text-[#2B2523]">{value}%</span>
    </div>
    <div className="relative h-2 bg-[#F3EAE2] rounded-full overflow-hidden">
      <div className={`${color} absolute inset-y-0 left-0 rounded-full transition-all`} style={{ width: `${value}%` }} />
    </div>
    <input
      type="range" min={0} max={100} step={5} value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full mt-1 accent-[#E07A5F]"
    />
  </div>
);

const MacroCell: React.FC<{ color: string; label: string; grams: number }> = ({ color, label, grams }) => (
  <div>
    <p className={`text-[18px] font-black ${color} tabular-nums`}>{grams}<span className="text-[11px] font-bold text-[#9A8B80]">g</span></p>
    <p className="text-[10px] font-bold text-[#9A8B80] uppercase tracking-wider">{label}</p>
  </div>
);

const SummaryStep: React.FC<{
  T: SetupStrings;
  lang: 'en' | 'nl';
  data: Partial<UserProfile>;
  calc: CalcResult | null;
  targetWeightStr: string;
}> = ({ T, lang, data, calc, targetWeightStr }) => {
  if (!calc) return null;
  const isLose = data.goal === 'LOSE';
  const isGain = data.goal === 'GAIN';
  const showDelta = isLose || isGain;
  return (
    <>
      <StepHeader icon={<Sparkles className="w-7 h-7 text-[#E07A5F]" />} title={T.summaryTitle} sub={T.summarySub} />

      {/* Big calorie card */}
      <div className="bg-[#E07A5F] rounded-3xl p-6 text-white text-center shadow-lg shadow-[#E07A5F]/25 mb-3">
        <p className="text-[11px] font-bold uppercase tracking-wider text-white/80 mb-1">{T.dailyCalories}</p>
        <p className="text-[56px] font-black leading-none tabular-nums">{calc.target}</p>
        <p className="text-[12px] font-bold text-white/80 mt-1">kcal / {lang === 'nl' ? 'dag' : 'day'}</p>
      </div>

      {/* Maintenance + delta */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-white rounded-2xl card-shadow p-3 text-center">
          <p className="text-[9px] font-bold text-[#9A8B80] uppercase tracking-wider mb-1">{T.maintenance}</p>
          <p className="text-[18px] font-black text-[#2B2523] tabular-nums">{calc.maintenance}</p>
        </div>
        {showDelta && (
          <div className="bg-white rounded-2xl card-shadow p-3 text-center">
            <p className="text-[9px] font-bold text-[#9A8B80] uppercase tracking-wider mb-1">
              {isLose ? T.deficit : T.surplus}
            </p>
            <p className="text-[18px] font-black text-[#E07A5F] tabular-nums">
              {isLose ? '−' : '+'}{calc.actualDelta}
            </p>
          </div>
        )}
        {!showDelta && targetWeightStr && (
          <div className="bg-white rounded-2xl card-shadow p-3 text-center">
            <p className="text-[9px] font-bold text-[#9A8B80] uppercase tracking-wider mb-1">Target</p>
            <p className="text-[18px] font-black text-[#2B2523] tabular-nums">{targetWeightStr} kg</p>
          </div>
        )}
      </div>

      {/* Macro grams */}
      <div className="bg-white rounded-2xl card-shadow p-4 mb-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <MacroCell color="text-[#3D5A48]" label={T.pHeader} grams={calc.grams.protein} />
          <MacroCell color="text-[#C4763B]"   label={T.cHeader} grams={calc.grams.carbs} />
          <MacroCell color="text-rose-600"    label={T.fHeader} grams={calc.grams.fat} />
        </div>
      </div>

      {/* Weeks to goal */}
      {calc.weeksToGoal != null && targetWeightStr && (
        <div className="bg-white rounded-2xl card-shadow p-3 mb-3 flex items-center justify-between">
          <span className="text-[12px] font-bold text-[#9A8B80] uppercase tracking-wider">{T.weeksToGoal}</span>
          <span className="text-[18px] font-black text-[#E07A5F] tabular-nums">{calc.weeksToGoal}</span>
        </div>
      )}
    </>
  );
};

export default PersonalSetup;

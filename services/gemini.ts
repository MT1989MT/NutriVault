import { FoodItem, Recipe, WorkoutSuggestion, WorkoutLog, TrainingPlan, CoachPersonality } from "../types";
import { generateId } from "../utils/calculations";

// Gemini model mapping - using available model names
const FAST_MODEL = "gemini-2.0-flash";
const POWERFUL_MODEL = "gemini-2.0-flash";

const cleanJsonOutput = (text: string): string => {
  if (!text) return "[]";
  // Try to extract JSON from markdown code blocks
  const match = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*?)\s*```/);
  if (match) return match[1].trim();
  // Try to find JSON array or object directly
  const jsonMatch = text.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
  if (jsonMatch) return jsonMatch[1];
  return text.trim();
};

const getPersonalityPrompt = (style: CoachPersonality = 'FRIENDLY') => {
    switch (style) {
        case 'STOIC': return "Tone: Stoic, concise, focus on discipline and duty. No fluff.";
        case 'TOUGH_LOVE': return "Tone: Direct, challenging, no excuses. Push the user hard.";
        case 'SCIENTIFIC': return "Tone: Data-driven, analytical, explain the 'why'.";
        case 'HUMOROUS': return "Tone: Witty, light-hearted, use metaphors.";
        default: return "Tone: Friendly, encouraging, like a supportive friend.";
    }
};

// API base URL
// - Web (Vercel): empty string → relative URL "/api/gemini" → same-origin, no CORS
// - Native (Capacitor): full URL since there's no local API server
// - Explicit env var overrides everything
const API_BASE_URL = (() => {
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  if (typeof window !== 'undefined' && ((window as any).Capacitor?.isNativePlatform?.() || window.location?.protocol === 'capacitor:')) {
    return 'https://nutri-vault.vercel.app';
  }
  return '';
})();

// Call our secure API route (API key stays server-side)
const callGemini = async (model: string, prompt: string, jsonMode: boolean = false, imageBase64?: string): Promise<string> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const body: any = { model, prompt, jsonMode };
    if (imageBase64) body.imageBase64 = imageBase64;

    const response = await fetch(`${API_BASE_URL}/api/gemini`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `API error: ${response.status}`);
    }

    const data = await response.json();
    return data.text || "";
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error('Request timed out. Please try again.');
    }
    console.error('[callGemini] fetch failed:', error?.message || error?.toString?.() || 'unknown', 'URL:', `${API_BASE_URL}/api/gemini`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

// Shared response parser for food items from AI
const parseFoodResponse = (rawData: any[], includeMicros: boolean = true) => {
  return rawData.map((item: any) => {
    let cal = Math.max(0, Math.round(Number(item.cal) || 0));
    const protein = Math.max(0, Math.round(Number(item.p) || 0));
    const carbs = Math.max(0, Math.round(Number(item.c) || 0));
    const fat = Math.max(0, Math.round(Number(item.f) || 0));

    // Always recalculate calories from macros — Atwater is ground truth
    const macroCal = (protein * 4) + (carbs * 4) + (fat * 9);
    if (macroCal > 0) {
      // If AI calories differ >20% from macro math, trust the macros
      if (cal === 0 || Math.abs(cal - macroCal) > cal * 0.2) {
        cal = macroCal;
      }
    }

    const result: any = {
      name: typeof item.name === 'string' ? item.name : 'Unknown food',
      amountDescription: item.portion || "1 serving",
      calories: cal,
      protein,
      carbs,
      fat,
    };

    if (includeMicros) {
      result.micros = [
        { name: 'Fiber', amount: Math.max(0, Number(item.fiber) || 0), unit: 'g', percentageOfDailyNeeds: Math.round((Math.max(0, Number(item.fiber) || 0)) / 25 * 100) },
        { name: 'Sugar', amount: Math.max(0, Number(item.sugar) || 0), unit: 'g', percentageOfDailyNeeds: Math.round((Math.max(0, Number(item.sugar) || 0)) / 50 * 100) },
        { name: 'Sodium', amount: Math.max(0, Number(item.sodium) || 0), unit: 'mg', percentageOfDailyNeeds: Math.round((Math.max(0, Number(item.sodium) || 0)) / 2300 * 100) }
      ];
    } else {
      result.micros = [];
    }

    return result;
  }).filter((item: any) => item.calories > 0 || item.protein > 0 || item.carbs > 0 || item.fat > 0);
};

export const parseFoodInput = async (input: string): Promise<Omit<FoodItem, 'id' | 'timestamp' | 'mealType'>[]> => {
  const trimmed = input.trim();
  if (!trimmed) return [];
  if (trimmed.length > 500) {
    throw new Error('Input too long. Please use max 500 characters.');
  }

  try {
    const safeInput = trimmed.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ');

    const text = await callGemini(
      POWERFUL_MODEL,
      `Parse this food input into nutritional data. Understand any language.

"${safeInput}"

Rules:
- Understand casual input (e.g. "2 boterhammen kaas" or "a bowl of oatmeal")
- Combined foods stay as one item ("broodje kroket" = 1 item)
- Split multiple items only at commas, "and"/"en"/"+", or newlines
- Use realistic portion sizes when not specified
- Calculate: cal = (protein × 4) + (carbs × 4) + (fat × 9)
- Food names in the SAME language as input
- Include estimated weight in portion description

Return JSON array:
[{"name":"string","portion":"string (~weight)","cal":number,"p":number,"c":number,"f":number,"fiber":number,"sugar":number,"sodium":number}]`,
      true
    );
    if (!text) return [];
    return parseFoodResponse(JSON.parse(cleanJsonOutput(text)));
  } catch (error: any) {
    throw error;
  }
};

export const parseFoodFromPhoto = async (imageBase64: string): Promise<Omit<FoodItem, 'id' | 'timestamp' | 'mealType'>[]> => {
  try {
    const lang = (navigator.language || 'en').split('-')[0];
    const langName = { nl: 'Dutch', de: 'German', fr: 'French', es: 'Spanish', it: 'Italian' }[lang] || 'English';

    const text = await callGemini(
      POWERFUL_MODEL,
      `Identify ALL food and drinks in this photo. Estimate portions using plate/utensils for scale.

For each item: estimate weight, calculate macros, derive cal = (p×4)+(c×4)+(f×9).
Include sauces, spreads, and drinks if visible. Food names in ${langName}.

Return JSON array (empty [] if no food visible):
[{"name":"string","portion":"string (~weight)","cal":number,"p":number,"c":number,"f":number,"fiber":number,"sugar":number,"sodium":number}]`,
      true,
      imageBase64
    );

    if (!text) return [];
    return parseFoodResponse(JSON.parse(cleanJsonOutput(text)));
  } catch (error: any) {
    throw error;
  }
};

export const autoTrackDay = async (description: string): Promise<{ items: Omit<FoodItem, 'id' | 'timestamp' | 'mealType'>[], workout: WorkoutLog | null }> => {
    try {
        const safeInput = description.trim().replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ');

        const text = await callGemini(
            POWERFUL_MODEL,
            `Parse this description of food eaten and optional exercise. Understand any language.

"${safeInput}"

Rules:
- Combined foods stay as one item ("broodje kroket" = 1 item)
- Use realistic portions when not specified
- Food names in the same language as input
- Also detect any exercise/workout mentioned

Return JSON:
{"foods":[{"name":"string","portion":"string (~weight)","cal":number,"p":number,"c":number,"f":number}],"workout":{"type":"string","durationMinutes":number,"elevatedHeartRate":boolean} or null}`,
            true
        );
        if (!text) return { items: [], workout: null };
        const data = JSON.parse(cleanJsonOutput(text));
        const items = parseFoodResponse(data.foods || [], false);
        return { items, workout: data.workout };
    } catch (e) { return { items: [], workout: null }; }
};

export const fixMyMeal = async (items: FoodItem[]): Promise<string> => {
    try {
        const mealSummary = items.map(i => `${i.amountDescription} ${i.name}`).join(", ");
        const text = await callGemini(
            FAST_MODEL,
            `Review meal: ${mealSummary}. 2 short tweaks for health. JSON string array.`,
            false
        );
        return text || "Looks good!";
    } catch (e) { return "Balanced enough."; }
};

export const getRecipeSuggestion = async (preferences: string, mood?: string, dietaryRestrictions: string[] = []): Promise<Recipe | null> => {
  try {
    const diet = dietaryRestrictions.length > 0 ? `Dietary restrictions: ${dietaryRestrictions.join(", ")}.` : "";
    const prompt = mood ? `User mood: "${mood}". Prefs: "${preferences}". ${diet} Suggest 1 recipe.` : `Suggest healthy recipe: "${preferences}". ${diet}`;
    const text = await callGemini(
      POWERFUL_MODEL,
      `${prompt} Return JSON: { title, ingredients[], shoppingList: ["General Item Name", "General Item Name"] (general product names only, no quantities, e.g. 'Milk' not '200ml Milk'), instructions[], calories, macros: {protein, carbs, fat}, dietaryCompliance: boolean (true if matches restrictions) }.`,
      true
    );
    const recipeData = text ? JSON.parse(cleanJsonOutput(text)) : null;
    if (recipeData) recipeData.id = generateId();
    return recipeData;
  } catch (error) { return null; }
};

export const generateGroceryList = async (diet: string, days: number): Promise<string[]> => {
    try {
        const text = await callGemini(
            FAST_MODEL,
            `Grocery list for ${days} days. Diet: ${diet}. Return JSON array of strings (General product names only, no quantities).`,
            true
        );
        return text ? JSON.parse(cleanJsonOutput(text)) : [];
    } catch (e) { return []; }
};

export interface ChatHistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

export const getMotivationMessage = async (
  userInput: string,
  conditions: string[] = [],
  style: CoachPersonality = 'FRIENDLY',
  habits: string[] = [],
  chatHistory: ChatHistoryItem[] = [],
  userContext: string = ''
): Promise<string> => {
  try {
    const conditionContext = conditions.length > 0 ? `User conditions: ${conditions.join(", ")}.` : "";
    const habitContext = habits.length > 0 ? `Active habits: ${habits.join(", ")}.` : "";

    // Build conversation history string
    const historyStr = chatHistory.length > 0
      ? `\n\nPREVIOUS CONVERSATION:\n${chatHistory.slice(-6).map(m =>
          m.role === 'user' ? `User: ${m.content}` : `Coach: ${m.content}`
        ).join('\n')}\n\n`
      : '';

    const text = await callGemini(
      POWERFUL_MODEL,
      `You are NutriVault Coach - an AI personal trainer with full access to the user's nutrition and fitness data.

${getPersonalityPrompt(style)}

=== USER DATA ===
${userContext || 'No data available yet'}
${conditionContext}
${habitContext}

${historyStr}

USER MESSAGE: "${userInput}"

INSTRUCTIONS:
- You have access to the user's real data above - USE IT to give personalized advice
- Reference their actual numbers, foods eaten, workouts done
- Keep responses concise but helpful (2-4 sentences max)
- Be specific and actionable based on their actual situation
- Stay in character with your personality style
- Respond in the same language as the user's message`,
      false
    );
    return text || "Keep going. You've got this!";
  } catch (error) { return "Consistency is key. Every small step counts!"; }
};

export const getWeeklyInsights = async (logs: any, style: CoachPersonality): Promise<string> => {
    try {
        const text = await callGemini(
            POWERFUL_MODEL,
            `Analyze logs: ${JSON.stringify(logs)}. 3 short bullet points (Trend, Strength, Focus). ${getPersonalityPrompt(style)}`,
            false
        );
        return text || "Keep consistent.";
    } catch(e) { return "Data analysis unavailable."; }
};

export const generateTrainingPlan = async (goal: string, weeks: number, daysPerWeek: number): Promise<TrainingPlan | null> => {
    try {
        const text = await callGemini(
            POWERFUL_MODEL,
            `Create ${weeks}-week training plan for: "${goal}". Frequency: ${daysPerWeek} days/week.
            RULES:
            1. Return strictly valid JSON.
            2. "schedule" array must have exactly ${daysPerWeek} entries for days: Monday, Tuesday, etc.
            3. Duration must be number (minutes).
            4. VARY THE WEEKS. "weeks" array should show progression.
            Schema: { "title": "Plan Name", "goal": "${goal}", "daysPerWeek": ${daysPerWeek}, "weeks": [{ "weekNumber": 1, "schedule": [{ "dayOfWeek": "Monday", "focus": "Legs", "durationMinutes": 60 }] }], "startDate": "YYYY-MM-DD" }`,
            true
        );
        if (!text) return null;
        const plan = JSON.parse(cleanJsonOutput(text));

        // Flatten for the current view, but data structure supports weeks
        const firstWeek = plan.weeks ? plan.weeks[0].schedule : plan.schedule;

        return { ...plan, id: generateId(), active: true, durationWeeks: weeks, schedule: firstWeek, startDate: new Date().toISOString() };
    } catch(e) { return null; }
};

export const getWorkoutSuggestion = async (duration: string, userVibe: string, history: WorkoutLog[], difficulty: 'Beginner' | 'Intermediate' | 'Advanced' = 'Intermediate'): Promise<WorkoutSuggestion | null> => {
  try {
    const recentHistory = history.slice(0, 3).map(h => `${h.type} (${h.date})`).join(", ");

    let difficultyPrompt = "";
    if (difficulty === 'Beginner') difficultyPrompt = "Difficulty: Easy/Beginner. Accessible exercises, focus on form, lower volume, not too crazy.";
    if (difficulty === 'Intermediate') difficultyPrompt = "Difficulty: Intermediate. Balanced intensity and volume.";
    if (difficulty === 'Advanced') difficultyPrompt = "Difficulty: Hard/Advanced. Focus on Hypertrophy, high volume, complex movements.";

    const text = await callGemini(
      POWERFUL_MODEL,
      `Create a ${duration} min workout. Focus: "${userVibe}". ${difficultyPrompt}. History: [${recentHistory}].
      Return JSON: { "title": "", "duration": "", "focus": "", "warmup": [], "exercises": [{ "name": "", "sets": "3", "reps": "12", "notes": "Tempo 2-0-2", "instructions": "Short 1-sentence how-to." }] }`,
      true
    );
    if (!text) return null;
    return JSON.parse(cleanJsonOutput(text));
  } catch (error) { return null; }
};

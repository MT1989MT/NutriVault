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

import { API_BASE_URL } from './config';

// Call our secure API route (API key stays server-side) with retry logic
const callGemini = async (model: string, prompt: string, jsonMode: boolean = false, imageBase64?: string): Promise<string> => {
  const MAX_RETRIES = 2;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const body: Record<string, unknown> = { model, prompt, jsonMode };
      if (imageBase64) body.imageBase64 = imageBase64;

      const response = await fetch(`${API_BASE_URL}/api/gemini`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const error = new Error(errorData.error || `API error: ${response.status}`);
        // Don't retry on client errors (400-level) except 429
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          throw error;
        }
        lastError = error;
        clearTimeout(timeout);
        if (attempt < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        throw error;
      }

      const data = await response.json();
      return data.text || "";
    } catch (error: any) {
      clearTimeout(timeout);
      if (error.name === 'AbortError') {
        lastError = new Error('Request timed out. Please try again.');
        if (attempt < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
      }
      if (attempt === MAX_RETRIES) {
        console.error('[callGemini] all retries failed:', error?.message || 'unknown');
        throw lastError || error;
      }
      lastError = error;
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError || new Error('Request failed');
};

// Shared response parser for food items from AI
// Handles multiple field name formats in case Gemini uses full names instead of abbreviations
const parseFoodResponse = (rawData: any[], includeMicros: boolean = true) => {
  return rawData.map((item: any) => {
    const protein = Math.max(0, Math.round(Number(item.p ?? item.protein) || 0));
    const carbs = Math.max(0, Math.round(Number(item.c ?? item.carbs ?? item.carbohydrates) || 0));
    const fat = Math.max(0, Math.round(Number(item.f ?? item.fat ?? item.fats) || 0));
    const grams = Math.max(0, Math.round(Number(item.grams ?? item.weight ?? item.g) || 0));

    // Always calculate calories from macros — Atwater is ground truth
    const cal = (protein * 4) + (carbs * 4) + (fat * 9);

    const result: any = {
      name: typeof item.name === 'string' ? item.name : 'Unknown food',
      amountDescription: item.portion || "1 serving",
      calories: cal,
      protein,
      carbs,
      fat,
      grams, // store base weight for portion adjustment
    };

    // Preserve group name for branded/composite products
    if (typeof item.group === 'string' && item.group.trim()) {
      result.groupName = item.group.trim();
    }

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
      `Food database. Parse what the user ate into JSON.

"${safeInput}"

RULES:
1. BRANDED/KNOWN PRODUCTS (Big Mac, Whopper, KitKat, etc.): Return as ONE item with official nutritional values. Do NOT split into ingredients.
2. HOMEMADE/COMPOSITE: Split into individual ingredients (e.g. "bread with cheese" → bread, cheese).
3. GROUPING: When there are 2+ items from one meal/input, ALL items MUST have the same "group" field with a short natural meal name. Examples: "twee boterhammen met kaas" → group:"Boterhammen met kaas", "pasta with meat sauce" → group:"Pasta bolognese", "Big Mac menu" → group:"Big Mac Menu".
4. Single items (1 result): omit "group".
5. Macros must be FOR THE PORTION, not per 100g. Use official/database values, not estimates.
6. Food names in SAME language as input. Handle typos, slang, any language.

JSON: [{"name":"str","portion":"str (~Xg)","grams":N,"p":N,"c":N,"f":N,"fiber":N,"sugar":N,"sodium":N,"group":"str or omit"}]`,
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
      `Food database. Analyze this food photo into JSON.

RULES:
1. BRANDED/KNOWN PRODUCTS: Return as ONE item with official nutritional values. Do NOT split into ingredients.
2. HOMEMADE/COMPOSITE: Split into visible components (bread, topping, sauce, drink, sides).
3. GROUPING: When there are 2+ items, ALL items MUST share the same "group" field with a short natural meal name. Single items: omit "group".
4. Estimate portions using plate/packaging/utensils for scale. Use official/database values for macros.
5. Food names in ${langName}. Empty [] if no food visible.

JSON: [{"name":"str","portion":"str (~Xg)","grams":N,"p":N,"c":N,"f":N,"fiber":N,"sugar":N,"sodium":N,"group":"str or omit"}]`,
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
            `You are a precise nutritionist. Someone describes their day (food and possibly exercise):

"${safeInput}"

PARSING:
- Handle casual speech, any language, typos, brand names.
- Combined dishes = 1 item. Food names in same language as input.
- Also detect any exercise mentioned (running, gym, cycling, walking, etc.).

PORTION ESTIMATION (critical — be realistic):
- First look up accurate macros per 100g, then estimate portion weight, then scale.
- Use context: "kipfilet" on bread = ~30g cold cut; as main dish = ~150g.
- Sauces/condiments unless specified: mayo = 15g, ketchup = 15g, butter on bread = 10g, peanut butter = 15g.
- Drinks: coffee/tea = 150ml, juice/soda = 250ml. Bread slice = ~35g.
- When ambiguous, pick the most common everyday interpretation.
- Include weight estimate in portion description.

JSON: {"foods":[{"name":"str","portion":"str (~Xg)","cal":N,"p":N,"c":N,"f":N}],"workout":{"type":"str","durationMinutes":N,"elevatedHeartRate":bool} or null}`,
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
      `You are NutriVault Coach - a genuine AI buddy and personal companion who happens to know about nutrition and fitness.

${getPersonalityPrompt(style)}

=== USER DATA ===
${userContext || 'No data available yet'}
${conditionContext}
${habitContext}

${historyStr}

USER MESSAGE: "${userInput}"

INSTRUCTIONS:
- You are a REAL FRIEND first, coach second. Talk naturally like a buddy would.
- You care about the user as a whole person - their day, mood, energy, sleep, stress, life - not just calories and macros.
- Be conversational and spontaneous. Use casual language. Ask follow-up questions sometimes.
- When you have user data, weave it in naturally (don't just list stats).
- Keep responses concise (2-4 sentences). Don't lecture.
- You can joke, share observations, be curious about their life, give encouragement, or just chat.
- Only talk about food/fitness when relevant or when they ask. You're not a broken record about nutrition.
- Stay in character with your personality style
- Respond in the same language as the user's message
${userInput === '__BANNER_GREETING__' ? `
SPECIAL: This is a banner greeting shown at the top of the app. Write ONE short casual line (max 60 chars).
Be creative and varied - sometimes comment on their day, sometimes motivate, sometimes just be friendly.
Examples of good greetings: "Lekker bezig vandaag!", "Hoe gaat ie?", "Ready to crush it today?", "Middag! Al geluncht?"
Do NOT mention being an AI or coach. Just be a friend saying hi.` : ''}`,
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

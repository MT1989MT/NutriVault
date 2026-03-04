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
      `You are a precise food database. A user describes what they ate:

"${safeInput}"

TASK: Break down into INDIVIDUAL ingredients. Each ingredient is a separate item.

SPLITTING RULES:
- "bread with cheese and butter" → 3 items: bread, cheese, butter
- "pasta with meat sauce" → 2 items: pasta, meat sauce (or further: pasta, ground beef, tomato sauce)
- "coffee with milk" → 2 items: coffee, milk
- "broodje kroket" → 2 items: broodje/bun, kroket
- Single items stay single: "an apple" → 1 item: apple
- Composite dishes that can't logically be split stay as 1 item: "pizza margherita", "sushi roll"
- Handle typos, slang, any language, brand names

NUTRITIONAL DATA (critical — be accurate):
- For each ingredient, determine the macros PER 100g from a reliable food database
- Then estimate the realistic portion weight in grams for the context
- Calculate final macros by scaling: (macros_per_100g × grams / 100)
- Return both the per-100g values AND the estimated portion weight

PORTION WEIGHTS (realistic defaults when unspecified):
- Bread slice: 35g, bread roll/broodje: 50g
- Butter on bread: 10g, cheese on bread: 20g, ham/cold cuts: 20g
- Mayo/ketchup/mustard: 15g, peanut butter: 15g, jam: 15g
- Chicken breast (main): 150g, chicken on sandwich: 30g
- Rice/pasta (cooked, side): 150g, as main: 250g
- Coffee/tea: 150ml, milk in coffee: 30ml, glass juice: 250ml
- Egg: 60g, apple/banana: 150g, yogurt: 150g

LANGUAGE: Food names in the SAME language as the input.

JSON array, one object per ingredient:
[{"name":"str","portion":"str (~Xg)","grams":N,"p":N,"c":N,"f":N,"fiber":N,"sugar":N,"sodium":N}]

"grams" = estimated portion weight. "p","c","f" = protein, carbs, fat in grams FOR THAT PORTION (not per 100g).`,
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
      `You are a precise food database analyzing a food photo.

TASK: Break down everything visible into INDIVIDUAL ingredients/items.

SPLITTING RULES:
- Separate each visible component: bread, topping, sauce, drink, side dish
- "Sandwich with cheese and ham" → bread, cheese, ham (3 items)
- Don't forget: sauces, butter, dressing, cooking oil, drinks, sides, garnishes
- Composite items that can't be split stay as 1: "pizza", "sushi roll", "kroket"

NUTRITIONAL DATA (critical — be accurate):
- For each item, determine macros per 100g from a reliable database
- Use plate size, utensils, hands, packaging for scale to estimate portion weight
- Calculate final macros: (macros_per_100g × grams / 100)

PORTION ESTIMATION:
- Sauces if visible but amount unclear: mayo = 15g, ketchup = 15g, butter = 10g, dressing = 25ml
- Drinks: coffee = 150ml, juice = 250ml, wine = 150ml, beer = 330ml

Food names in ${langName}.

JSON (empty [] if no food): [{"name":"str","portion":"str (~Xg)","grams":N,"p":N,"c":N,"f":N,"fiber":N,"sugar":N,"sodium":N}]

"grams" = estimated portion weight. "p","c","f" = protein, carbs, fat in grams FOR THAT PORTION.`,
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

import { FoodItem, Recipe, WorkoutSuggestion, WorkoutLog, TrainingPlan, CoachPersonality } from "../types";
import { generateId } from "../utils/calculations";
import { createLogger } from "./logger";

const log = createLogger('Gemini');

// Gemini model mapping — gemini-2.0-flash deprecated March 2026, shutdown June 2026
const FAST_MODEL = "gemini-2.5-flash";
const POWERFUL_MODEL = "gemini-2.5-flash";

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

/** Try to repair truncated JSON arrays (e.g. from token limit cutoff) */
const repairJson = (text: string): any => {
  try { return JSON.parse(text); } catch (_) { /* fall through */ }
  // Try closing open strings/objects/arrays from the end
  let s = text.replace(/,\s*$/, ''); // remove trailing comma
  // Try progressively closing brackets
  const closers = ['"', '}', ']'];
  for (let i = 0; i < 4; i++) {
    for (const c of closers) {
      try { return JSON.parse(s + c); } catch (_) { /* next */ }
    }
    s = s + '}'; // try adding another closing brace
  }
  // Last resort: extract any complete objects from a partial array
  const objects: any[] = [];
  const objRegex = /\{[^{}]*\}/g;
  let m;
  while ((m = objRegex.exec(text)) !== null) {
    try { objects.push(JSON.parse(m[0])); } catch (_) { /* skip */ }
  }
  if (objects.length > 0) return objects;
  throw new Error('Could not parse food data. Please try again.');
};

const getPersonalityPrompt = (style: CoachPersonality = 'FRIENDLY') => {
    switch (style) {
        case 'STOIC': return `PERSONALITY: Stoic Coach
- Speak with calm authority and philosophical depth. Channel Marcus Aurelius meets fitness coach.
- Focus on discipline, consistency, and long-term thinking. No sugarcoating, no unnecessary praise.
- Use short, powerful statements. "You chose this path. Honor it."
- When they struggle, reframe it as opportunity. When they succeed, point to the next challenge.
- Never use exclamation marks or emojis. Your strength is quiet conviction.`;
        case 'TOUGH_LOVE': return `PERSONALITY: Tough Love Coach
- Be direct, no-BS, and challenging. You care deeply but show it through high standards.
- Call out excuses but always follow with actionable solutions. Never just criticize.
- Use bold statements: "That's not a meal, that's a snack. Let's fix this."
- Push them out of comfort zones but know when they need a break.
- Your tough exterior hides genuine care — let it show occasionally.`;
        case 'SCIENTIFIC': return `PERSONALITY: Science Coach
- Lead with evidence and data. Explain the WHY behind every recommendation.
- Reference mechanisms: "Protein synthesis peaks within 24-48h post-training, so..."
- Use specific numbers when helpful. Break down the science in accessible language.
- When analyzing their data, identify patterns and explain what they mean physiologically.
- Balance being informative with being practical. Don't lecture — educate conversationally.`;
        case 'HUMOROUS': return `PERSONALITY: Funny Coach
- Be witty, playful, and use creative metaphors. Make health advice entertaining.
- Use humor to deliver serious points: "Your protein intake is lower than my expectations for this conversation."
- Pop culture references, food puns, and playful roasts are welcome.
- Keep the laughs coming but never at the expense of good advice. The humor IS the delivery method.
- When things get serious (mental health, real struggles), dial back the jokes and be genuine.`;
        default: return `PERSONALITY: Friendly Coach
- Be warm, encouraging, and genuinely interested in their life beyond just food and fitness.
- Celebrate small wins enthusiastically. Notice improvements they might miss themselves.
- Use casual, conversational language. "That's awesome!" "Ooh nice choice!"
- Ask about their day, their mood, what's going on. Build a real connection.
- When they're struggling, be empathetic first, solutions second.`;
    }
};

import { API_BASE_URL } from './config';
import { lookupFoodNutrition } from './storage';
import { lookupNutritionDB } from '../data/nutritionDB';

// Simple time-limited cache to avoid duplicate API calls for identical prompts
const responseCache = new Map<string, { text: string; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 30;

const getCacheKey = (model: string, prompt: string, imageBase64?: string): string => {
  // Use first 200 chars of prompt + model as key (images are never cached)
  if (imageBase64) return '';
  return `${model}:${prompt.substring(0, 200)}`;
};

// Call our secure API route (API key stays server-side) with retry logic
const callGemini = async (model: string, prompt: string, jsonMode: boolean = false, imageBase64?: string): Promise<string> => {
  // Check cache for non-image requests
  const cacheKey = getCacheKey(model, prompt, imageBase64);
  if (cacheKey) {
    const cached = responseCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.text;
    }
  }
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
        // Try JSON first; fall back to raw text so we can see what Vercel returned
        const cloned = response.clone();
        const errorData = await response.json().catch(() => null);
        const rawText = errorData ? null : await cloned.text().catch(() => '');
        const errorMsg = errorData?.detail || errorData?.error
          || (rawText ? `Server error: ${rawText.slice(0, 120)}` : `API error: ${response.status}`);
        const error = new Error(errorMsg);
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
      const text = data.text || "";

      // Store in cache for non-image requests
      if (cacheKey && text) {
        if (responseCache.size >= MAX_CACHE_SIZE) {
          // Evict oldest entry
          const oldestKey = responseCache.keys().next().value;
          if (oldestKey) responseCache.delete(oldestKey);
        }
        responseCache.set(cacheKey, { text, timestamp: Date.now() });
      }

      return text;
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
        log.error('All retries failed', error);
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
// Supports two response formats:
//   New (per-100g):  { p100, c100, f100, grams } — we compute absolute values
//   Legacy (absolute): { p, c, f, grams } — used as-is, per-100g derived
// For foods the user has logged before, stored per-100g values override the AI's
// to ensure consistent macros across sessions.
const parseFoodResponse = (rawData: any[], includeMicros: boolean = true) => {
  return rawData.map((item: any) => {
    const name = typeof item.name === 'string' ? item.name : 'Unknown food';
    const rawGrams = Math.round(Number(item.grams ?? item.weight ?? item.g) || 0);
    const grams = rawGrams > 0 ? rawGrams : 100;

    // Determine per-100g macros — prefer explicit per-100g fields from AI
    const hasPer100g = item.p100 !== undefined || item.c100 !== undefined || item.f100 !== undefined;

    let p100: number, c100: number, f100: number;

    if (hasPer100g) {
      p100 = Math.max(0, Number(item.p100) || 0);
      c100 = Math.max(0, Number(item.c100) || 0);
      f100 = Math.max(0, Number(item.f100) || 0);
    } else {
      // Legacy absolute values → derive per-100g
      const absP = Math.max(0, Number(item.p ?? item.protein) || 0);
      const absC = Math.max(0, Number(item.c ?? item.carbs ?? item.carbohydrates) || 0);
      const absF = Math.max(0, Number(item.f ?? item.fat ?? item.fats) || 0);
      p100 = grams > 0 ? absP / grams * 100 : absP;
      c100 = grams > 0 ? absC / grams * 100 : absC;
      f100 = grams > 0 ? absF / grams * 100 : absF;
    }

    // Sanity-check per-100g values: clamp to plausible ranges
    p100 = Math.min(p100, 90);
    c100 = Math.min(c100, 100);
    f100 = Math.min(f100, 100);
    if (p100 + c100 + f100 > 120) {
      const scale = 120 / (p100 + c100 + f100);
      p100 *= scale;
      c100 *= scale;
      f100 *= scale;
    }

    // Priority: (1) static nutrition DB, (2) user's history, (3) AI values
    const dbEntry = lookupNutritionDB(name);
    if (dbEntry) {
      p100 = dbEntry.p100;
      c100 = dbEntry.c100;
      f100 = dbEntry.f100;
    } else {
      const stored = lookupFoodNutrition(name);
      if (stored) {
        p100 = stored.p100;
        c100 = stored.c100;
        f100 = stored.f100;
      }
    }

    // Compute absolute macros from per-100g × portion
    const protein = Math.max(0, Math.round(p100 * grams / 100));
    const carbs = Math.max(0, Math.round(c100 * grams / 100));
    const fat = Math.max(0, Math.round(f100 * grams / 100));

    // Atwater is ground truth for calories
    const cal = (protein * 4) + (carbs * 4) + (fat * 9);

    const result: any = {
      name,
      amountDescription: item.portion || "1 serving",
      calories: cal,
      protein,
      carbs,
      fat,
      grams,
      // Attach raw per-100g values so they flow through to trackFoodFrequency
      proteinPer100g: p100,
      carbsPer100g: c100,
      fatPer100g: f100,
    };

    // Preserve group name for branded/composite products
    if (typeof item.group === 'string' && item.group.trim()) {
      result.groupName = item.group.trim();
    }

    // Pass through alternatives for ambiguous items
    if (Array.isArray(item.alt) && item.alt.length > 0) {
      result.alternatives = item.alt.filter((a: any) => typeof a === 'string').slice(0, 3);
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
      `You are a precise food nutrition database. Parse what the user ate into a JSON array.

USER INPUT: "${safeInput}"

PARSING RULES:
1. Understand ANY language, casual speech, abbreviations, typos, brand names, slang.
   Examples: "broodje kaas", "2 boterhammen pb", "koffie verkeerd", "bowl of oats with banana", "mcchicken menu", "tosti ham kaas"
2. Split composite meals into individual ingredients for accurate tracking:
   - "broodje gezond" → bread, cheese, lettuce, tomato, egg, butter
   - "Big Mac" → bun, beef patties, sauce, lettuce, cheese, pickles, onions
   But keep simple items single: "banana" → just banana
3. When 2+ items from a single meal: add "group" field with a short meal name (e.g. "Broodje gezond"). Single items: omit "group".
4. Food names MUST be in the SAME language as the user's input.
5. MACROS MUST BE PER 100g (p100/c100/f100). Use standard nutritional reference values:
   - Chicken breast: p100=31, c100=0, f100=3.6
   - Banana: p100=1.1, c100=23, f100=0.3
   - White bread: p100=9, c100=49, f100=3.2
   - Whole milk: p100=3.4, c100=4.7, f100=3.3
   - Cheddar cheese: p100=25, c100=1.3, f100=33
   - Peanut butter: p100=25, c100=20, f100=50
   - Egg (whole): p100=13, c100=1.1, f100=11
   - White rice (cooked): p100=2.7, c100=28, f100=0.3
   - Butter: p100=0.9, c100=0.1, f100=81
   Look up the actual standard per-100g values. Do NOT guess.
6. Estimate realistic portions using common sense:
   - "koffie" = 150ml black coffee (~2 kcal) unless specified otherwise
   - "broodje" = 1 bread roll (~50g)
   - "kaas" on bread = ~20g slice, as snack = ~30g cube
   - "boterham" = 1 slice bread (~35g)
   - Sauces/spreads: butter ~10g, peanut butter ~15g, mayo ~15g
7. Include weight estimate in portion description.
8. "grams" = estimated portion weight. We multiply per-100g macros by grams/100 to get the total.
9. ALTERNATIVES: If the preparation method or type is ambiguous and would significantly change the macros, add an "alt" array with 1-2 alternatives.
   Examples of when to add alternatives:
   - "eggs" → default to boiled, alt: ["fried egg", "scrambled egg"]
   - "bread" → default to white, alt: ["whole wheat bread"]
   - "milk" → default to whole, alt: ["semi-skimmed milk", "skimmed milk"]
   - "yogurt" → default to greek, alt: ["low fat yogurt"]
   Do NOT add alternatives for items where the type is already clear (e.g. "fried egg", "whole wheat bread").

RESPONSE FORMAT — strict JSON array only:
[{"name":"str","portion":"str (~Xg)","grams":N,"p100":N,"c100":N,"f100":N,"fiber":N,"sugar":N,"sodium":N,"group":"str or omit","alt":["str"] or omit}]`,
      true
    );
    if (!text) return [];
    return parseFoodResponse(repairJson(cleanJsonOutput(text)));
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
1. Identify each food item visible. Split composites into components (bread, topping, sauce, etc.).
2. When 2+ items: add "group" with a short meal name. 1 item: omit "group".
3. Estimate portion weight in grams using plate/packaging for scale.
4. p100/c100/f100 = macros PER 100g (standard reference values, not for the portion).
   "grams" = estimated portion weight. We compute total macros from per-100g × grams/100.
5. Food names in ${langName}. Empty [] if no food visible.

JSON: [{"name":"str","portion":"str (~Xg)","grams":N,"p100":N,"c100":N,"f100":N,"fiber":N,"sugar":N,"sodium":N,"group":"str or omit"}]`,
      true,
      imageBase64
    );

    if (!text) return [];
    return parseFoodResponse(repairJson(cleanJsonOutput(text)));
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

MACROS PER 100g:
- p100/c100/f100 = macros PER 100g using standard nutritional reference values.
- "grams" = estimated portion weight. We compute totals from per-100g × grams/100.
- Use context: "kipfilet" on bread = ~30g cold cut; as main dish = ~150g.
- Sauces/condiments unless specified: mayo = 15g, ketchup = 15g, butter on bread = 10g, peanut butter = 15g.
- Drinks: coffee/tea = 150ml, juice/soda = 250ml. Bread slice = ~35g.
- When ambiguous, pick the most common everyday interpretation.
- Include weight estimate in portion description.

JSON: {"foods":[{"name":"str","portion":"str (~Xg)","grams":N,"p100":N,"c100":N,"f100":N}],"workout":{"type":"str","durationMinutes":N,"elevatedHeartRate":bool} or null}`,
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
    const conditionContext = conditions.length > 0 ? `\nMENTAL HEALTH NOTES: The user has indicated: ${conditions.join(", ")}. Be mindful and sensitive about these. Never diagnose or replace professional help.` : "";
    const habitContext = habits.length > 0 ? `\nACTIVE HABITS THEY'RE TRACKING: ${habits.join(", ")}` : "";

    // Build conversation history — keep last 12 messages for better context
    const historyStr = chatHistory.length > 0
      ? `\n\nCONVERSATION SO FAR:\n${chatHistory.slice(-12).map(m =>
          m.role === 'user' ? `User: ${m.content}` : `Coach: ${m.content}`
        ).join('\n')}\n`
      : '';

    const isBanner = userInput === '__BANNER_GREETING__';

    const text = await callGemini(
      POWERFUL_MODEL,
      `You are the NutriVault Coach — a knowledgeable, personable AI companion built into a nutrition & fitness tracking app.

${getPersonalityPrompt(style)}

=== WHO YOU ARE ===
You are NOT a generic chatbot. You are a smart personal coach who:
- Has deep knowledge of nutrition science, exercise physiology, meal planning, and healthy habits
- Can see the user's actual food logs, workouts, weight, and progress data (provided below)
- Gives SPECIFIC, ACTIONABLE advice based on THEIR data — not generic tips
- Remembers the conversation context and builds on previous messages
- Speaks naturally like a real person — not a help article or FAQ bot

=== USER'S DATA ===
${userContext || 'No data available yet — the user just started.'}
${conditionContext}
${habitContext}
${historyStr}

=== CURRENT MESSAGE ===
User says: "${userInput}"

=== HOW TO RESPOND ===

CORE RULES:
1. RESPOND IN THE SAME LANGUAGE as the user's message. If they write Dutch, respond in Dutch. If English, respond in English. Match their language naturally.
2. Be a REAL conversational partner. React to what they actually said. Don't pivot to unsolicited nutrition advice.
3. Match response length to the question complexity:
   - Simple greeting or chat → 1-2 sentences
   - Question about their data → 2-4 sentences with specific numbers from their data
   - Request for advice/help → 3-6 sentences with actionable, personalized recommendations
   - Complex topic (meal planning, training advice, explaining concepts) → as long as needed, use structure (bullets, steps) when helpful
4. USE THEIR DATA when relevant. Don't say "make sure you eat enough protein" — say "you've had 45g protein today, that's about half your target. Maybe add some Greek yogurt or chicken to your next meal?"
5. Be genuine. If you don't know something, say so. If their data looks concerning, be honest but kind.
6. Ask follow-up questions when it makes the conversation better — but not every single message.
7. You can discuss ANY topic — you're a companion, not just a nutrition bot. But you shine when talking about health, food, fitness, habits, and wellbeing.

WHAT YOU'RE GREAT AT:
- Analyzing their eating patterns and spotting trends
- Suggesting specific meals/snacks based on what they need (remaining macros, preferences, time of day)
- Explaining nutrition science in accessible language
- Creating quick workout ideas or movement suggestions
- Helping with motivation, habit building, and consistency
- Discussing meal prep strategies, recipe ideas, grocery tips
- Interpreting their progress and setting realistic expectations
- Helping with specific goals (weight loss, muscle gain, better energy, etc.)

WHAT TO AVOID:
- Generic motivational quotes that could apply to anyone
- Repeating the same advice across messages
- Listing stats back without interpretation
- Being preachy or lecturing
- Medical diagnoses or replacing professional medical advice
- Responding to everything with food/fitness when they just want to chat
${isBanner ? `
SPECIAL MODE — BANNER GREETING:
This is shown at the top of the app as a casual one-liner. Write ONE short line (max 60 chars).
Be creative: comment on their data, time of day, or just be friendly. No generic "How are you?".
Examples: "Lekker bezig vandaag! 💪", "Al 1200 kcal, nice!", "Nog 800 to go, you got this", "Middag! Al geluncht?"
Do NOT mention being AI. Just be a buddy saying hi.` : ''}`,
      false
    );
    return text || "Hey, ik ben er! Wat wil je weten?";
  } catch (error) { return "Hmm, ik kon even niet verbinden. Probeer het nog eens!"; }
};

export const getWeeklyInsights = async (logs: any, style: CoachPersonality): Promise<string> => {
    try {
        const text = await callGemini(
            POWERFUL_MODEL,
            `You are a nutrition coach analyzing a user's weekly food & workout logs.

${getPersonalityPrompt(style)}

DATA:
${JSON.stringify(logs)}

Provide a USEFUL weekly analysis with:
1. **Trend** — What pattern do you see in their eating/training? (calories consistency, macro balance, meal timing)
2. **Win** — What are they doing well? Be specific with numbers.
3. **Focus** — One concrete, actionable improvement for next week. Not generic — based on THEIR actual data.

Respond in the same language as the food names in the logs. Keep each point to 1-2 sentences. Use the personality tone.`,
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

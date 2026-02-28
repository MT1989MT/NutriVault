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

// API base URL - configurable via env var, defaults to Vercel deployment
const API_BASE_URL = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) || 'https://nutri-vault.vercel.app';

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
      `You are an expert food database like MyFitnessPal. Parse this food input into nutritional data.

INPUT: "${safeInput}"

=== YOUR TASK ===
People type food casually. Your job is to UNDERSTAND what they mean and return accurate nutrition.

=== UNDERSTANDING CASUAL INPUT ===
People type like this — you must handle ALL of these patterns:

MINIMAL INPUT (just a food name → use standard serving):
- "koffie" → coffee with milk, 1 standard cup (150ml + 30ml semi-skimmed milk)
- "thee" → tea without additions, 0 cal
- "rijst" → 1 normal plate cooked white rice (~200g)
- "pasta" → 1 plate cooked pasta (~200g)
- "brood" → 1 slice Dutch bread with butter
- "ei" / "egg" → 1 medium boiled egg
- "banaan" → 1 medium banana
- "yoghurt" → 1 bowl (~150g) plain yogurt

VAGUE PORTIONS — use these realistic defaults:
- "wat/beetje/some/a little" → small portion (~75g or half standard)
- "veel/a lot/big portion" → large portion (~1.5× standard)
- "een bakje/schaaltje/bowl" → ~150-200g
- "een bord/plate" → ~250-300g for a main dish
- "een kom/bowl" → ~200-250ml for soup, ~150g for yoghurt/muesli
- "een handje/handful" → ~30g for nuts/snacks
- "een stuk/piece/stukje" → context-dependent (cake ~80g, cheese ~30g, fruit ~150g)
- "een glas/glass" → 200ml for milk/juice, 150ml for wine, 250ml for water
- "een kopje/cup" → 150ml for coffee/tea

COMBINED FOODS — keep as ONE item:
- "boterham met kaas" = bread + butter + cheese = 1 item
- "broodje kroket" = bun + kroket = 1 item
- "koffie met melk" = coffee + milk = 1 item
- "yoghurt met muesli" = yoghurt + muesli = 1 item
- "rijst met kip" = rice + chicken = 1 item
- "toast met avocado" = toast + avocado = 1 item

SPLIT ONLY at: comma, "and", "en", "und", "et", "y", "+", new line

BRAND RECOGNITION:
- McDonald's: Big Mac (508cal), McChicken (388cal), Medium Fries (337cal), McNuggets 6pc (259cal)
- Starbucks: Caffe Latte tall (150cal), Cappuccino tall (80cal), Caramel Macchiato (240cal)
- Subway: 6" Turkey sub (280cal), 6" Italian BMT (380cal)
- AH/Jumbo/Lidl huismerk: use standard Dutch supermarket products
- Hema: worst (275cal/100g), rookworst (280cal/100g)

COOKING METHOD matters:
- "gebakken ei" / "fried egg" → add ~45cal for oil vs boiled egg
- "gebakken rijst" → add ~80cal for oil vs plain rice
- "gegrilde kip" / "grilled chicken" → similar to plain
- "gefrituurde" / "deep fried" → add ~40% more cal than baked
- Raw vs cooked weight: "100g rijst" without context = COOKED weight

=== CALCULATION METHOD ===
1. Identify the food + realistic portion in grams
2. Look up macros per 100g (use USDA/NEVO database values)
3. Calculate: protein, carbs, fat for that portion
4. Derive calories: cal = (protein × 4) + (carbs × 4) + (fat × 9)

=== REFERENCE DATA (realistic portions) ===

BREAKFAST:
- 1 boterham (35g) + butter (7g) + kaas (20g): 189cal, 7p, 16c, 11f
- 1 boterham + pindakaas (15g): 181cal, 7p, 18c, 9f
- 1 boterham + hagelslag (15g): 159cal, 4p, 27c, 4f
- 1 croissant (60g): 246cal, 5p, 26c, 14f
- 1 beschuit (10g) + butter + jam: 81cal, 1p, 11c, 4f
- Muesli/granola bowl (60g) + milk (150ml): 340cal, 12p, 48c, 11f
- Overnight oats (50g oats + 150ml milk + toppings): 320cal, 13p, 45c, 9f
- Cracker (15g): 58cal, 1p, 10c, 1f
- Ontbijtkoek 1 slice (30g): 96cal, 1p, 21c, 1f

LUNCH:
- Broodje gezond: 340cal, 18p, 35c, 14f
- Tosti ham/kaas: 348cal, 18p, 30c, 17f
- Broodje kroket: 380cal, 10p, 42c, 19f
- Caesar salad + chicken: 440cal, 32p, 16c, 28f
- Cup-a-soup: 55cal, 1p, 8c, 2f
- Soep (tomaten/groente, 250ml): 80cal, 2p, 12c, 2f
- Wrap kip/groente: 420cal, 25p, 40c, 18f

DINNER:
- Bord rijst (200g cooked) + kip (150g) + groente (100g): 520cal, 50p, 58c, 8f
- Bord pasta (200g cooked) + bolognese saus (150g): 480cal, 24p, 54c, 18f
- Bord stamppot (300g) + rookworst (100g): 574cal, 20p, 44c, 34f
- Pizza Margherita (1 medium/250g): 575cal, 24p, 68c, 22f
- Nasi goreng (300g): 420cal, 14p, 56c, 16f
- Bami goreng (300g): 390cal, 13p, 52c, 14f
- Shoarma schotel: 680cal, 38p, 52c, 34f
- Sushi (8 stuks maki): 280cal, 10p, 48c, 4f

SNACKS:
- 1 stroopwafel (30g): 131cal, 1p, 19c, 5f
- 1 koek/cookie (35g): 160cal, 2p, 22c, 7f
- Handful noten/nuts (30g): 183cal, 5p, 4c, 17f
- Reep chocolade/chocolate bar (45g): 240cal, 3p, 27c, 14f
- Zak chips (30g): 160cal, 2p, 16c, 10f
- 1 bitterbal: 75cal, 3p, 5c, 5f
- 1 frikandel: 234cal, 12p, 13c, 15f
- 1 kaassoufflé: 289cal, 8p, 22c, 19f
- 1 loempia (80g): 180cal, 5p, 19c, 9f
- Popcorn (30g): 116cal, 3p, 19c, 3f
- Rijstwafel (10g): 39cal, 1p, 8c, 0f

DRINKS:
- Koffie zwart: 2cal, 0p, 0c, 0f
- Koffie met melk (30ml halfvol): 16cal, 1p, 1c, 1f
- Cappuccino (200ml milk): 78cal, 5p, 7c, 3f
- Latte (300ml milk): 117cal, 8p, 11c, 5f
- Thee zonder suiker: 1cal, 0p, 0c, 0f
- Thee met honing (10g): 33cal, 0p, 8c, 0f
- Glas melk (200ml halfvol): 96cal, 7p, 10c, 3f
- Glas jus d'orange (200ml): 88cal, 1p, 20c, 0f
- Glas cola (250ml): 105cal, 0p, 27c, 0f
- Cola zero/light: 1cal, 0p, 0c, 0f
- Glas water: 0cal, 0p, 0c, 0f
- Smoothie fruit (250ml): 135cal, 2p, 30c, 1f
- Protein shake (300ml + 30g powder): 180cal, 30p, 8c, 3f

ALCOHOL:
- Biertje/pils (330ml): 140cal, 1p, 10c, 0f
- Speciaal bier (330ml): 180cal, 2p, 15c, 0f
- Glas wijn rood (150ml): 125cal, 0p, 4c, 0f
- Glas wijn wit (150ml): 118cal, 0p, 4c, 0f
- Glas rosé (150ml): 120cal, 0p, 4c, 0f
- Shot/borrel (35ml): 78cal, 0p, 0c, 0f
- Gin-tonic (200ml): 171cal, 0p, 11c, 0f
- Aperol Spritz: 155cal, 0p, 15c, 0f

SAUCES & EXTRAS:
- Mayonaise (15g): 103cal, 0p, 0c, 12f
- Fritessaus (25g): 82cal, 0p, 3c, 8f
- Ketchup (15g): 17cal, 0p, 4c, 0f
- Sriracha (10g): 10cal, 0p, 2c, 0f
- Olijfolie (1 eetlepel/15ml): 119cal, 0p, 0c, 14f
- Dressing (30ml): 90cal, 0p, 4c, 8f
- Sojasaus (15ml): 8cal, 1p, 1c, 0f
- Pesto (15g): 58cal, 2p, 1c, 5f

=== RESPONSE FORMAT ===
- Food names in the SAME language as input
- Natural portions: "2 sneetjes", "1 kopje", "1 bord", "1 glas", "1 stuk"
- Include estimated weight: "1 bord (~200g)", "1 kopje (~150ml)"

Return ONLY valid JSON array:
[{"name": "Food name", "portion": "portion (~weight)", "cal": number, "p": number, "c": number, "f": number, "fiber": number, "sugar": number, "sodium": number}]`,
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
      `Analyze this food photo like MyFitnessPal. Identify ALL visible food and drinks.

=== INSTRUCTIONS ===
1. Identify every food item, drink, sauce, side dish visible
2. Estimate portion weight using visual cues:
   - Standard dinner plate = 25cm diameter
   - Fork/knife for scale reference
   - Bowl depth, glass size
   - Don't underestimate — real portions are often larger than textbook
3. For each item: look up macros per 100g → calculate for estimated portion
4. Derive: cal = (protein × 4) + (carbs × 4) + (fat × 9)

=== PORTION ESTIMATION GUIDE ===
- Full plate of rice/pasta/potatoes: ~250-300g cooked
- Side portion of rice/vegetables: ~100-150g
- Piece of meat/fish on plate: ~120-180g
- Bowl of soup: ~300ml
- Glass of drink: ~200-250ml
- Salad plate: ~150-200g
- Sauce/dressing visible: ~30-50g
- Bread roll/broodje: ~60-80g

=== COMMON MISTAKES TO AVOID ===
- Don't forget visible sauces, butter, dressing, cheese on top
- Count drinks if visible (coffee, juice, wine, beer)
- If bread is visible, include likely butter/spread
- Mixed dishes (curry, stew): estimate total weight, use typical macro ratios

=== RESPONSE ===
- Return food names in ${langName}
- Include estimated weight in portions: "1 bord (~250g)", "~150g", "1 glas (~200ml)"

Return ONLY valid JSON array:
[{"name": "Food name in ${langName}", "portion": "portion (~weight)", "cal": number, "p": number, "c": number, "f": number, "fiber": number, "sugar": number, "sodium": number}]

If no food visible, return: []`,
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
            `Parse this voice/text description of what someone ate (and possibly did as exercise). Understand ANY language.

INPUT: "${safeInput}"

=== FOOD PARSING ===
People describe food casually in speech. Understand:
- "ik had koffie en een broodje kaas" → coffee with milk + bread with cheese
- "bij de lunch twee tosti's en cola" → 2 grilled cheese sandwiches + glass of cola
- "s'avonds pasta met gehakt en een wijntje" → plate of pasta bolognese + glass of red wine
- "ontbijt was yoghurt met muesli" → bowl yoghurt + muesli
- "tussendoor een koekje en koffie" → cookie + coffee with milk
- "had een biertje en bitterballen" → beer + ~6 bitterballen
- "pizza en salade" → medium pizza + side salad

RULES:
- Keep combined foods as 1 item ("broodje kroket" = 1 item)
- When someone says just "koffie"/"coffee" → include standard milk (30ml)
- When no portion specified → use realistic adult default portions
- Names in the SAME language as input
- For each: estimate weight → macros per 100g → calculate portion → cal = (p×4)+(c×4)+(f×9)

=== WORKOUT DETECTION ===
Detect: hardlopen/running, fietsen/cycling, gym/fitness, wandelen/walking, zwemmen/swimming, yoga, voetbal, tennis, etc.
- "ik heb een uur hardgelopen" → running, 60 min
- "een rondje gefietst" → cycling, 30 min
- "naar de gym geweest" → gym workout, 60 min

Return JSON: {
  "foods": [{"name": "string", "portion": "string (~weight)", "cal": number, "p": number, "c": number, "f": number}],
  "workout": { "type": "string", "durationMinutes": number, "elevatedHeartRate": boolean } or null
}`,
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

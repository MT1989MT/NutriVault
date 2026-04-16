// Static nutritional reference database — per-100g values from USDA / standard food tables.
// Used as ground truth for common foods instead of trusting AI estimates.

export interface NutritionEntry {
  p100: number; // protein per 100g
  c100: number; // carbs per 100g
  f100: number; // fat per 100g
  fiber?: number;
  aliases?: string[]; // alternative names / translations
}

// All values are per 100g edible portion
const DB: Record<string, NutritionEntry> = {
  // ── Eggs ────────────────────────────────────────────────────────────
  'egg':              { p100: 13, c100: 1.1, f100: 11, aliases: ['ei', 'eieren', 'oeuf', 'huevo', 'uovo'] },
  'boiled egg':       { p100: 13, c100: 1.1, f100: 11, aliases: ['gekookt ei', 'hard boiled egg', 'soft boiled egg', 'hardgekookt ei', 'zachtgekookt ei'] },
  'fried egg':        { p100: 13.6, c100: 0.8, f100: 14.8, aliases: ['gebakken ei', 'spiegelei'] },
  'scrambled egg':    { p100: 10.1, c100: 1.6, f100: 11.2, aliases: ['roerei'] },

  // ── Bread & grains ──────────────────────────────────────────────────
  'white bread':      { p100: 9, c100: 49, f100: 3.2, fiber: 2.7, aliases: ['wit brood', 'witbrood', 'boterham', 'bread', 'brood', 'pain blanc', 'pan blanco'] },
  'whole wheat bread': { p100: 13, c100: 41, f100: 3.4, fiber: 7, aliases: ['volkoren brood', 'volkorenbrood', 'bruinbrood', 'brown bread', 'whole grain bread', 'pain complet'] },
  'bread roll':       { p100: 9.4, c100: 51, f100: 3.5, aliases: ['broodje', 'pistolet', 'bol', 'kaiserbroodje', 'petit pain'] },
  'tortilla':         { p100: 8.3, c100: 47, f100: 6.4, aliases: ['wrap', 'flour tortilla'] },
  'oats':             { p100: 13.2, c100: 68, f100: 6.5, fiber: 10, aliases: ['havermout', 'oatmeal', 'porridge', 'flocons davoine'] },
  'white rice cooked': { p100: 2.7, c100: 28, f100: 0.3, aliases: ['rijst', 'witte rijst', 'rice', 'riz', 'arroz'] },
  'brown rice cooked': { p100: 2.6, c100: 23, f100: 0.9, fiber: 1.8, aliases: ['zilvervliesrijst', 'bruine rijst'] },
  'pasta cooked':     { p100: 5.8, c100: 25, f100: 0.9, aliases: ['spaghetti', 'penne', 'fusilli', 'macaroni', 'noodles', 'pasta'] },
  'couscous cooked':  { p100: 3.8, c100: 23, f100: 0.2, aliases: ['couscous'] },

  // ── Dairy ───────────────────────────────────────────────────────────
  'whole milk':       { p100: 3.4, c100: 4.7, f100: 3.3, aliases: ['volle melk', 'melk', 'milk', 'lait entier'] },
  'semi-skimmed milk': { p100: 3.4, c100: 4.8, f100: 1.5, aliases: ['halfvolle melk', 'semi skimmed milk'] },
  'skimmed milk':     { p100: 3.4, c100: 5, f100: 0.1, aliases: ['magere melk', 'fat free milk'] },
  'greek yogurt':     { p100: 10, c100: 3.6, f100: 5, aliases: ['griekse yoghurt', 'yogurt', 'yoghurt', 'yaourt grec'] },
  'low fat yogurt':   { p100: 5.3, c100: 7.0, f100: 1.6, aliases: ['magere yoghurt', 'light yogurt'] },
  'cottage cheese':   { p100: 11, c100: 3.4, f100: 4.3, aliases: ['huttenkase', 'kwark'] },
  'cheddar cheese':   { p100: 25, c100: 1.3, f100: 33, aliases: ['cheddar'] },
  'gouda cheese':     { p100: 25, c100: 2.2, f100: 27, aliases: ['gouda', 'goudse kaas', 'belegen kaas', 'jong belegen', 'oude kaas'] },
  'mozzarella':       { p100: 22, c100: 2.2, f100: 22, aliases: ['mozzarella cheese'] },
  'parmesan':         { p100: 36, c100: 3.2, f100: 26, aliases: ['parmezaanse kaas', 'parmigiano'] },
  'cream cheese':     { p100: 6, c100: 4, f100: 34, aliases: ['roomkaas', 'philadelphia', 'zuivelspread'] },
  'butter':           { p100: 0.9, c100: 0.1, f100: 81, aliases: ['boter', 'beurre', 'mantequilla'] },

  // ── Meat & poultry ──────────────────────────────────────────────────
  'chicken breast':   { p100: 31, c100: 0, f100: 3.6, aliases: ['kipfilet', 'kippenborst', 'kip', 'chicken', 'poulet', 'pollo'] },
  'chicken thigh':    { p100: 26, c100: 0, f100: 10.9, aliases: ['kippendij', 'kipbout'] },
  'turkey breast':    { p100: 29, c100: 0, f100: 1, aliases: ['kalkoenfilet', 'turkey', 'dinde'] },
  'beef steak':       { p100: 26, c100: 0, f100: 15, aliases: ['biefstuk', 'steak', 'rundvlees', 'boeuf'] },
  'ground beef':      { p100: 17.2, c100: 0, f100: 20, aliases: ['gehakt', 'rundergehakt', 'minced beef', 'mince'] },
  'pork chop':        { p100: 27, c100: 0, f100: 14, aliases: ['varkenslapje', 'karbonade', 'varkensvlees'] },
  'bacon':            { p100: 37, c100: 1.4, f100: 42, aliases: ['spek', 'ontbijtspek'] },
  'ham':              { p100: 21, c100: 1.5, f100: 5, aliases: ['ham', 'achterham', 'jambon'] },
  'salami':           { p100: 22, c100: 1.2, f100: 34, aliases: ['cervelaat'] },

  // ── Fish & seafood ──────────────────────────────────────────────────
  'salmon':           { p100: 20, c100: 0, f100: 13, aliases: ['zalm', 'saumon'] },
  'tuna':             { p100: 26, c100: 0, f100: 1, aliases: ['tonijn', 'thon', 'atun'] },
  'tuna canned':      { p100: 26, c100: 0, f100: 0.8, aliases: ['tonijn uit blik'] },
  'shrimp':           { p100: 24, c100: 0.2, f100: 0.3, aliases: ['garnalen', 'crevettes', 'gambas'] },
  'cod':              { p100: 18, c100: 0, f100: 0.7, aliases: ['kabeljauw', 'cabillaud'] },

  // ── Fruits ──────────────────────────────────────────────────────────
  'banana':           { p100: 1.1, c100: 23, f100: 0.3, fiber: 2.6, aliases: ['banaan', 'banane', 'platano'] },
  'apple':            { p100: 0.3, c100: 14, f100: 0.2, fiber: 2.4, aliases: ['appel', 'pomme', 'manzana'] },
  'orange':           { p100: 0.9, c100: 12, f100: 0.1, fiber: 2.4, aliases: ['sinaasappel', 'naranja'] },
  'strawberry':       { p100: 0.7, c100: 7.7, f100: 0.3, fiber: 2, aliases: ['aardbei', 'aardbeien', 'fraise', 'fresa'] },
  'blueberry':        { p100: 0.7, c100: 14, f100: 0.3, fiber: 2.4, aliases: ['blauwe bes', 'bosbes', 'myrtille'] },
  'grape':            { p100: 0.6, c100: 17, f100: 0.4, aliases: ['druif', 'druiven', 'raisin', 'uva'] },
  'mango':            { p100: 0.8, c100: 15, f100: 0.4, aliases: ['mango'] },
  'avocado':          { p100: 2, c100: 8.5, f100: 15, fiber: 6.7, aliases: ['avocado'] },
  'watermelon':       { p100: 0.6, c100: 7.6, f100: 0.2, aliases: ['watermeloen'] },
  'pineapple':        { p100: 0.5, c100: 13, f100: 0.1, aliases: ['ananas'] },
  'pear':             { p100: 0.4, c100: 15, f100: 0.1, fiber: 3.1, aliases: ['peer', 'poire'] },
  'kiwi':             { p100: 1.1, c100: 15, f100: 0.5, aliases: ['kiwi'] },

  // ── Vegetables ──────────────────────────────────────────────────────
  'broccoli':         { p100: 2.8, c100: 7, f100: 0.4, fiber: 2.6, aliases: ['broccoli'] },
  'spinach':          { p100: 2.9, c100: 3.6, f100: 0.4, fiber: 2.2, aliases: ['spinazie', 'epinard'] },
  'tomato':           { p100: 0.9, c100: 3.9, f100: 0.2, aliases: ['tomaat', 'tomate'] },
  'carrot':           { p100: 0.9, c100: 10, f100: 0.2, fiber: 2.8, aliases: ['wortel', 'carotte', 'zanahoria'] },
  'cucumber':         { p100: 0.7, c100: 3.6, f100: 0.1, aliases: ['komkommer', 'concombre'] },
  'lettuce':          { p100: 1.4, c100: 2.9, f100: 0.2, aliases: ['sla', 'ijsbergsla', 'laitue', 'lechuga'] },
  'bell pepper':      { p100: 1, c100: 6, f100: 0.3, aliases: ['paprika', 'poivron', 'pimiento'] },
  'onion':            { p100: 1.1, c100: 9.3, f100: 0.1, aliases: ['ui', 'ajuin', 'oignon', 'cebolla'] },
  'potato':           { p100: 2, c100: 17, f100: 0.1, fiber: 2.2, aliases: ['aardappel', 'aardappelen', 'pieper', 'pomme de terre', 'patata'] },
  'sweet potato':     { p100: 1.6, c100: 20, f100: 0.1, fiber: 3, aliases: ['zoete aardappel', 'bataat', 'patate douce'] },
  'mushroom':         { p100: 3.1, c100: 3.3, f100: 0.3, aliases: ['champignon', 'paddenstoel'] },
  'corn':             { p100: 3.3, c100: 19, f100: 1.4, aliases: ['mais', 'maïs'] },

  // ── Legumes ─────────────────────────────────────────────────────────
  'chickpeas cooked': { p100: 8.9, c100: 27, f100: 2.6, fiber: 7.6, aliases: ['kikkererwten', 'pois chiches'] },
  'lentils cooked':   { p100: 9, c100: 20, f100: 0.4, fiber: 7.9, aliases: ['linzen', 'lentilles'] },
  'kidney beans':     { p100: 8.7, c100: 22, f100: 0.5, fiber: 6.4, aliases: ['kidneybonen', 'bruine bonen'] },
  'black beans':      { p100: 8.9, c100: 24, f100: 0.5, fiber: 8.7, aliases: ['zwarte bonen'] },
  'edamame':          { p100: 11, c100: 8.9, f100: 5, fiber: 5.2, aliases: ['edamame'] },
  'tofu':             { p100: 8, c100: 1.9, f100: 4.8, aliases: ['tofu', 'tahoe'] },

  // ── Nuts & seeds ────────────────────────────────────────────────────
  'peanut butter':    { p100: 25, c100: 20, f100: 50, fiber: 6, aliases: ['pindakaas', 'beurre de cacahuète'] },
  'almonds':          { p100: 21, c100: 22, f100: 49, fiber: 12.5, aliases: ['amandelen', 'amandes'] },
  'walnuts':          { p100: 15, c100: 14, f100: 65, fiber: 6.7, aliases: ['walnoten', 'noix'] },
  'cashews':          { p100: 18, c100: 30, f100: 44, aliases: ['cashewnoten', 'noix de cajou'] },
  'peanuts':          { p100: 26, c100: 16, f100: 49, fiber: 8.5, aliases: ['pinda', 'pindas', 'cacahuète'] },
  'chia seeds':       { p100: 17, c100: 42, f100: 31, fiber: 34, aliases: ['chiazaad', 'chiazaden'] },
  'sunflower seeds':  { p100: 21, c100: 20, f100: 51, aliases: ['zonnebloempitten'] },

  // ── Oils & fats ─────────────────────────────────────────────────────
  'olive oil':        { p100: 0, c100: 0, f100: 100, aliases: ['olijfolie'] },
  'coconut oil':      { p100: 0, c100: 0, f100: 100, aliases: ['kokosolie'] },
  'mayonnaise':       { p100: 1.1, c100: 0.6, f100: 75, aliases: ['mayo', 'mayonaise'] },

  // ── Spreads & condiments ────────────────────────────────────────────
  'honey':            { p100: 0.3, c100: 82, f100: 0, aliases: ['honing', 'miel'] },
  'jam':              { p100: 0.4, c100: 69, f100: 0.1, aliases: ['confituur', 'marmelade', 'confiture'] },
  'nutella':          { p100: 6.3, c100: 56, f100: 31, aliases: ['chocopasta', 'chocoladepasta', 'hazelnut spread'] },
  'hummus':           { p100: 8, c100: 14, f100: 10, fiber: 4, aliases: ['houmous'] },
  'ketchup':          { p100: 1.3, c100: 28, f100: 0.1, aliases: ['ketchup', 'tomatenketchup'] },
  'mustard':          { p100: 4.4, c100: 5.3, f100: 4.4, aliases: ['mosterd', 'moutarde'] },
  'soy sauce':        { p100: 5.6, c100: 4.9, f100: 0, aliases: ['sojasaus', 'ketjap'] },

  // ── Drinks ──────────────────────────────────────────────────────────
  'orange juice':     { p100: 0.7, c100: 10.4, f100: 0.2, aliases: ['sinaasappelsap', 'jus dorange'] },
  'apple juice':      { p100: 0.1, c100: 11, f100: 0.1, aliases: ['appelsap'] },
  'cola':             { p100: 0, c100: 10.6, f100: 0, aliases: ['coca cola', 'pepsi', 'fanta'] },
  'beer':             { p100: 0.5, c100: 3.6, f100: 0, aliases: ['bier', 'pils', 'bière', 'cerveza'] },
  'wine red':         { p100: 0.1, c100: 2.6, f100: 0, aliases: ['rode wijn', 'red wine', 'vin rouge'] },
  'wine white':       { p100: 0.1, c100: 2.6, f100: 0, aliases: ['witte wijn', 'white wine', 'vin blanc'] },
  'coffee black':     { p100: 0.1, c100: 0, f100: 0, aliases: ['koffie', 'zwarte koffie', 'coffee', 'café'] },
  'cappuccino':       { p100: 1.7, c100: 2.4, f100: 1.7, aliases: ['cappuccino'] },
  'latte':            { p100: 2.5, c100: 3.5, f100: 2.3, aliases: ['latte macchiato', 'koffie verkeerd', 'cafe latte'] },

  // ── Snacks & sweets ─────────────────────────────────────────────────
  'chocolate dark':   { p100: 5, c100: 46, f100: 31, aliases: ['pure chocolade', 'dark chocolate', 'chocolat noir'] },
  'chocolate milk':   { p100: 7.6, c100: 56, f100: 30, aliases: ['melkchocolade', 'milk chocolate', 'chocolat au lait'] },
  'potato chips':     { p100: 7, c100: 52, f100: 35, aliases: ['chips', 'crisps', 'lays'] },
  'rice cake':        { p100: 7.5, c100: 82, f100: 2.8, aliases: ['rijstwafel', 'galette de riz'] },
  'popcorn':          { p100: 9, c100: 58, f100: 28, aliases: ['popcorn'] },
  'cookie':           { p100: 5.5, c100: 62, f100: 25, aliases: ['koekje', 'biscuit', 'galleta'] },
  'croissant':        { p100: 8.2, c100: 46, f100: 21, aliases: ['croissant'] },

  // ── Protein & supplements ───────────────────────────────────────────
  'whey protein':     { p100: 80, c100: 7, f100: 3, aliases: ['proteine poeder', 'protein powder', 'eiwitpoeder', 'whey'] },
  'protein bar':      { p100: 25, c100: 35, f100: 15, aliases: ['eiwitreep', 'proteinereep'] },

  // ── Fast food reference ─────────────────────────────────────────────
  'french fries':     { p100: 3.4, c100: 41, f100: 15, aliases: ['friet', 'frites', 'patat', 'frietjes', 'pommes frites'] },
  'pizza margherita': { p100: 11, c100: 33, f100: 8, aliases: ['pizza', 'margherita'] },
};

// Build a fast lookup index: lowercase name/alias → entry
const index = new Map<string, NutritionEntry>();
for (const [key, entry] of Object.entries(DB)) {
  index.set(key.toLowerCase(), entry);
  if (entry.aliases) {
    for (const alias of entry.aliases) {
      index.set(alias.toLowerCase(), entry);
    }
  }
}

/**
 * Look up per-100g nutritional values from the static database.
 * Returns null if the food isn't in the DB.
 */
export function lookupNutritionDB(name: string): NutritionEntry | null {
  if (!name) return null;
  const key = name.toLowerCase().trim();

  // Direct match
  const direct = index.get(key);
  if (direct) return direct;

  // Try without trailing 's' (simple plural handling)
  if (key.endsWith('s') && key.length > 3) {
    const singular = index.get(key.slice(0, -1));
    if (singular) return singular;
  }

  // Try without 'en' suffix (Dutch plurals: bananen → banaan needs alias, but eieren → ei)
  if (key.endsWith('en') && key.length > 4) {
    const stem = index.get(key.slice(0, -2));
    if (stem) return stem;
  }

  return null;
}

// Verified nutrition database — per-100g values from official labels (brands)
// and standard food-composition tables (NEVO/USDA). This is the source of
// truth for common foods: AI estimates and user history are overridden by
// these values so the same food ALWAYS logs the same macros.
//
// kcal100 is the official label value per 100g, NOT the Atwater sum of the
// macros — this keeps calories correct for foods where Atwater is off
// (alcohol, fiber-rich foods, branded label rounding).

export interface VerifiedFood {
  /** Normalized names that match this food (Dutch + English, incl. plurals) */
  aliases: string[];
  /** Official calories per 100g (label value) */
  kcal100: number;
  p100: number;
  c100: number;
  f100: number;
  /** Weight in grams of 1 countable unit (slice, piece, glass, bar, burger…) */
  unitGrams?: number;
  /**
   * Fixed-size product (Big Mac, Snickers, can of soda): the portion is always
   * count × unitGrams. AI gram guesses are ignored for these.
   */
  wholeUnit?: boolean;
}

const DB: VerifiedFood[] = [
  // ── Fast food & branded (official label values) ──────────────────────────
  { aliases: ['big mac'], kcal100: 229, p100: 12, c100: 18.5, f100: 12, unitGrams: 220, wholeUnit: true },
  { aliases: ['mcchicken', 'mc chicken'], kcal100: 226, p100: 7.9, c100: 20.6, f100: 12, unitGrams: 190, wholeUnit: true },
  { aliases: ['cheeseburger'], kcal100: 250, p100: 13, c100: 25, f100: 11, unitGrams: 120, wholeUnit: true },
  { aliases: ['hamburger', 'hamburgers'], kcal100: 240, p100: 12.4, c100: 28.9, f100: 8, unitGrams: 105, wholeUnit: true },
  { aliases: ['quarter pounder', 'kwartpounder', 'kwart ponder'], kcal100: 260, p100: 15, c100: 19, f100: 13, unitGrams: 200, wholeUnit: true },
  { aliases: ['whopper'], kcal100: 233, p100: 10.4, c100: 17.8, f100: 13.1, unitGrams: 275, wholeUnit: true },
  { aliases: ['kipnuggets', 'chicken nuggets', 'mcnuggets', 'nuggets'], kcal100: 259, p100: 15.4, c100: 15.9, f100: 15.3, unitGrams: 17, wholeUnit: true },
  { aliases: ['friet', 'frietjes', 'patat', 'patatje', 'franse frietjes', 'fries', 'french fries', 'frites'], kcal100: 293, p100: 3.4, c100: 36, f100: 14.5, unitGrams: 115 },
  { aliases: ['frikandel', 'frikandellen', 'frikadel'], kcal100: 260, p100: 9.4, c100: 8.2, f100: 21, unitGrams: 85, wholeUnit: true },
  { aliases: ['kroket', 'kroketten', 'rundvleeskroket'], kcal100: 207, p100: 7.7, c100: 17.5, f100: 11.6, unitGrams: 70, wholeUnit: true },
  { aliases: ['bitterbal', 'bitterballen'], kcal100: 250, p100: 8, c100: 18, f100: 15, unitGrams: 20, wholeUnit: true },
  { aliases: ['kaassouffle', 'kaas souffle'], kcal100: 265, p100: 8, c100: 25, f100: 15, unitGrams: 65, wholeUnit: true },
  { aliases: ['broodje doner', 'doner', 'doner kebab', 'kebab', 'broodje kebab', 'broodje shoarma'], kcal100: 165, p100: 10, c100: 16, f100: 7, unitGrams: 350, wholeUnit: true },
  { aliases: ['shoarma', 'shoarmavlees', 'shawarma'], kcal100: 202, p100: 17.5, c100: 1.5, f100: 14, unitGrams: 150 },
  { aliases: ['pizza margherita', 'pizza', 'pizza salami', 'pizza pepperoni'], kcal100: 250, p100: 10.5, c100: 31, f100: 9.5, unitGrams: 350 },
  { aliases: ['snickers'], kcal100: 488, p100: 8.5, c100: 60.5, f100: 23.9, unitGrams: 50, wholeUnit: true },
  { aliases: ['mars'], kcal100: 449, p100: 3.9, c100: 69.6, f100: 16.9, unitGrams: 45, wholeUnit: true },
  { aliases: ['kitkat', 'kit kat'], kcal100: 518, p100: 6.4, c100: 60, f100: 27.5, unitGrams: 41.5, wholeUnit: true },
  { aliases: ['red bull', 'redbull', 'energy drink', 'energydrank'], kcal100: 45, p100: 0, c100: 11, f100: 0, unitGrams: 250, wholeUnit: true },
  { aliases: ['cola', 'coca cola', 'coke', 'pepsi'], kcal100: 42, p100: 0, c100: 10.6, f100: 0, unitGrams: 330 },
  { aliases: ['cola zero', 'coca cola zero', 'cola light', 'coke zero'], kcal100: 1, p100: 0, c100: 0, f100: 0, unitGrams: 330 },

  // ── Bread & breakfast ─────────────────────────────────────────────────────
  { aliases: ['boterham', 'boterhammen', 'brood', 'bruin brood', 'bruinbrood', 'wit brood', 'witbrood', 'bread', 'slice of bread', 'bread slice', 'sneetje brood'], kcal100: 265, p100: 8.9, c100: 49, f100: 3.2, unitGrams: 35 },
  { aliases: ['volkorenbrood', 'volkoren brood', 'volkoren boterham', 'whole wheat bread', 'wholemeal bread'], kcal100: 250, p100: 10.7, c100: 41.2, f100: 3.3, unitGrams: 35 },
  { aliases: ['broodje', 'broodjes', 'bread roll', 'bol', 'pistolet'], kcal100: 285, p100: 10, c100: 52, f100: 3.5, unitGrams: 50 },
  { aliases: ['croissant', 'croissants'], kcal100: 406, p100: 8.2, c100: 45.8, f100: 21, unitGrams: 65, wholeUnit: true },
  { aliases: ['beschuit', 'beschuiten'], kcal100: 407, p100: 10, c100: 76, f100: 5, unitGrams: 10, wholeUnit: true },
  { aliases: ['cracker', 'crackers'], kcal100: 400, p100: 10, c100: 68, f100: 8, unitGrams: 8, wholeUnit: true },
  { aliases: ['rijstwafel', 'rijstwafels', 'rice cake', 'rice cakes'], kcal100: 387, p100: 8, c100: 81, f100: 3, unitGrams: 9, wholeUnit: true },
  { aliases: ['havermout', 'oats', 'oatmeal', 'havervlokken'], kcal100: 375, p100: 13.5, c100: 58.7, f100: 7, unitGrams: 40 },
  { aliases: ['muesli'], kcal100: 360, p100: 9.7, c100: 62, f100: 7.5, unitGrams: 45 },
  { aliases: ['cornflakes'], kcal100: 378, p100: 7, c100: 84, f100: 0.9, unitGrams: 30 },
  { aliases: ['ontbijtkoek', 'peperkoek'], kcal100: 300, p100: 4, c100: 66, f100: 1.5, unitGrams: 25 },
  { aliases: ['eierkoek', 'eierkoeken'], kcal100: 320, p100: 8, c100: 62, f100: 4, unitGrams: 40, wholeUnit: true },
  { aliases: ['stroopwafel', 'stroopwafels'], kcal100: 470, p100: 4, c100: 63, f100: 21, unitGrams: 30, wholeUnit: true },

  // ── Toppings & spreads ────────────────────────────────────────────────────
  { aliases: ['kaas', 'cheese', 'goudse kaas', 'jonge kaas', 'belegen kaas', 'plak kaas', 'plakje kaas', 'slice of cheese', 'cheese slice'], kcal100: 356, p100: 24.6, c100: 0, f100: 28.6, unitGrams: 20 },
  { aliases: ['30+ kaas', 'lightkaas', 'light kaas', 'magere kaas'], kcal100: 280, p100: 29, c100: 0, f100: 18, unitGrams: 20 },
  { aliases: ['ham', 'achterham', 'plakje ham', 'slice of ham'], kcal100: 107, p100: 18.5, c100: 0.5, f100: 3.3, unitGrams: 15 },
  { aliases: ['salami'], kcal100: 407, p100: 22, c100: 1, f100: 35, unitGrams: 10 },
  { aliases: ['pindakaas', 'peanut butter'], kcal100: 600, p100: 26, c100: 14, f100: 48, unitGrams: 15 },
  { aliases: ['boter', 'roomboter', 'butter'], kcal100: 717, p100: 0.9, c100: 0.1, f100: 81, unitGrams: 10 },
  { aliases: ['halvarine', 'margarine'], kcal100: 360, p100: 0.2, c100: 0.5, f100: 40, unitGrams: 10 },
  { aliases: ['hagelslag', 'chocoladehagelslag'], kcal100: 448, p100: 4.6, c100: 66.4, f100: 17.4, unitGrams: 20 },
  { aliases: ['jam', 'aardbeienjam', 'confiture'], kcal100: 250, p100: 0.3, c100: 60, f100: 0.1, unitGrams: 15 },
  { aliases: ['honing', 'honey'], kcal100: 320, p100: 0.4, c100: 82, f100: 0, unitGrams: 15 },
  { aliases: ['hummus', 'houmous'], kcal100: 177, p100: 7.9, c100: 14.3, f100: 9.6, unitGrams: 25 },

  // ── Dairy & eggs ──────────────────────────────────────────────────────────
  { aliases: ['ei', 'eieren', 'gekookt ei', 'gekookte eieren', 'egg', 'eggs', 'boiled egg', 'boiled eggs'], kcal100: 155, p100: 12.6, c100: 1.1, f100: 10.6, unitGrams: 50 },
  { aliases: ['gebakken ei', 'gebakken eieren', 'fried egg', 'fried eggs', 'spiegelei'], kcal100: 196, p100: 13.6, c100: 0.8, f100: 14.8, unitGrams: 55 },
  { aliases: ['melk', 'halfvolle melk', 'milk', 'semi-skimmed milk', 'glas melk'], kcal100: 46, p100: 3.5, c100: 4.8, f100: 1.5, unitGrams: 250 },
  { aliases: ['volle melk', 'whole milk'], kcal100: 64, p100: 3.4, c100: 4.7, f100: 3.3, unitGrams: 250 },
  { aliases: ['magere melk', 'skimmed milk'], kcal100: 35, p100: 3.6, c100: 5, f100: 0.1, unitGrams: 250 },
  { aliases: ['karnemelk', 'buttermilk'], kcal100: 37, p100: 3.4, c100: 4, f100: 0.5, unitGrams: 250 },
  { aliases: ['yoghurt', 'naturel yoghurt', 'yogurt', 'volle yoghurt'], kcal100: 61, p100: 3.5, c100: 4.7, f100: 3.3, unitGrams: 150 },
  { aliases: ['griekse yoghurt', 'greek yogurt', 'greek yoghurt'], kcal100: 121, p100: 6.4, c100: 4, f100: 9, unitGrams: 150 },
  { aliases: ['magere yoghurt', 'low fat yogurt'], kcal100: 40, p100: 4, c100: 4.5, f100: 0.1, unitGrams: 150 },
  { aliases: ['kwark', 'magere kwark', 'quark', 'cottage cheese'], kcal100: 57, p100: 10, c100: 4, f100: 0.2, unitGrams: 150 },

  // ── Fruit ─────────────────────────────────────────────────────────────────
  { aliases: ['banaan', 'bananen', 'banana', 'bananas'], kcal100: 89, p100: 1.1, c100: 22.8, f100: 0.3, unitGrams: 120 },
  { aliases: ['appel', 'appels', 'apple', 'apples'], kcal100: 52, p100: 0.3, c100: 13.8, f100: 0.2, unitGrams: 150 },
  { aliases: ['sinaasappel', 'sinaasappels', 'orange', 'oranges'], kcal100: 47, p100: 0.9, c100: 11.8, f100: 0.1, unitGrams: 130 },
  { aliases: ['peer', 'peren', 'pear', 'pears'], kcal100: 57, p100: 0.4, c100: 15.2, f100: 0.1, unitGrams: 170 },
  { aliases: ['kiwi', 'kiwis'], kcal100: 61, p100: 1.1, c100: 14.7, f100: 0.5, unitGrams: 75 },
  { aliases: ['aardbei', 'aardbeien', 'strawberry', 'strawberries'], kcal100: 32, p100: 0.7, c100: 7.7, f100: 0.3 },
  { aliases: ['blauwe bessen', 'blueberries', 'bosbessen'], kcal100: 57, p100: 0.7, c100: 14.5, f100: 0.3 },
  { aliases: ['druiven', 'grapes', 'druif'], kcal100: 69, p100: 0.7, c100: 18, f100: 0.2 },
  { aliases: ['avocado', 'avocados'], kcal100: 160, p100: 2, c100: 8.5, f100: 14.7, unitGrams: 140 },

  // ── Vegetables ────────────────────────────────────────────────────────────
  { aliases: ['tomaat', 'tomaten', 'tomato', 'tomatoes'], kcal100: 18, p100: 0.9, c100: 3.9, f100: 0.2, unitGrams: 100 },
  { aliases: ['komkommer', 'cucumber'], kcal100: 15, p100: 0.7, c100: 3.6, f100: 0.1 },
  { aliases: ['paprika', 'bell pepper'], kcal100: 26, p100: 1, c100: 6, f100: 0.3, unitGrams: 150 },
  { aliases: ['broccoli'], kcal100: 34, p100: 2.8, c100: 7, f100: 0.4 },
  { aliases: ['sperziebonen', 'green beans', 'boontjes'], kcal100: 31, p100: 1.8, c100: 7, f100: 0.1 },
  { aliases: ['wortel', 'wortels', 'worteltjes', 'carrot', 'carrots'], kcal100: 41, p100: 0.9, c100: 9.6, f100: 0.2, unitGrams: 60 },
  { aliases: ['sla', 'lettuce', 'salade'], kcal100: 15, p100: 1.4, c100: 2.9, f100: 0.2 },
  { aliases: ['ui', 'uien', 'onion', 'onions'], kcal100: 40, p100: 1.1, c100: 9.3, f100: 0.1, unitGrams: 100 },
  { aliases: ['spinazie', 'spinach'], kcal100: 23, p100: 2.9, c100: 3.6, f100: 0.4 },

  // ── Carbs (cooked) ────────────────────────────────────────────────────────
  { aliases: ['rijst', 'witte rijst', 'gekookte rijst', 'rice', 'white rice', 'cooked rice'], kcal100: 130, p100: 2.7, c100: 28.2, f100: 0.3, unitGrams: 150 },
  { aliases: ['zilvervliesrijst', 'bruine rijst', 'brown rice'], kcal100: 111, p100: 2.6, c100: 23, f100: 0.9, unitGrams: 150 },
  { aliases: ['pasta', 'spaghetti', 'penne', 'macaroni', 'gekookte pasta'], kcal100: 158, p100: 5.8, c100: 30.9, f100: 0.9, unitGrams: 150 },
  { aliases: ['volkoren pasta', 'whole wheat pasta'], kcal100: 124, p100: 5, c100: 26.5, f100: 0.5, unitGrams: 150 },
  { aliases: ['aardappel', 'aardappels', 'aardappelen', 'gekookte aardappelen', 'potato', 'potatoes'], kcal100: 87, p100: 1.9, c100: 20.1, f100: 0.1, unitGrams: 100 },
  { aliases: ['zoete aardappel', 'sweet potato'], kcal100: 86, p100: 1.6, c100: 20, f100: 0.1, unitGrams: 150 },
  { aliases: ['quinoa'], kcal100: 120, p100: 4.4, c100: 21.3, f100: 1.9, unitGrams: 150 },
  { aliases: ['couscous'], kcal100: 112, p100: 3.8, c100: 23.2, f100: 0.2, unitGrams: 150 },

  // ── Protein (cooked) ──────────────────────────────────────────────────────
  { aliases: ['kipfilet', 'kip', 'chicken breast', 'chicken', 'gegrilde kip', 'grilled chicken'], kcal100: 165, p100: 31, c100: 0, f100: 3.6, unitGrams: 150 },
  { aliases: ['kipdijfilet', 'chicken thigh'], kcal100: 177, p100: 24, c100: 0, f100: 9, unitGrams: 150 },
  { aliases: ['zalm', 'salmon', 'zalmfilet'], kcal100: 208, p100: 20.4, c100: 0, f100: 13.4, unitGrams: 125 },
  { aliases: ['tonijn', 'tuna', 'tonijn uit blik', 'blikje tonijn'], kcal100: 116, p100: 25.5, c100: 0, f100: 0.8, unitGrams: 110 },
  { aliases: ['kabeljauw', 'witvis', 'cod', 'white fish'], kcal100: 82, p100: 17.8, c100: 0, f100: 0.7, unitGrams: 125 },
  { aliases: ['gehakt', 'half om half gehakt', 'rundergehakt', 'ground beef', 'minced meat'], kcal100: 241, p100: 21.3, c100: 0, f100: 17.3, unitGrams: 100 },
  { aliases: ['mager rundergehakt', 'lean ground beef'], kcal100: 187, p100: 26, c100: 0, f100: 9, unitGrams: 100 },
  { aliases: ['biefstuk', 'steak'], kcal100: 150, p100: 28, c100: 0, f100: 4, unitGrams: 150 },
  { aliases: ['spek', 'ontbijtspek', 'bacon', 'baconreepjes'], kcal100: 417, p100: 13, c100: 0.5, f100: 40, unitGrams: 10 },
  { aliases: ['tofu'], kcal100: 76, p100: 8, c100: 1.9, f100: 4.8, unitGrams: 100 },
  { aliases: ['proteine shake', 'eiwitshake', 'protein shake', 'whey', 'whey shake', 'eiwitpoeder', 'protein powder'], kcal100: 400, p100: 78, c100: 8, f100: 7, unitGrams: 30 },

  // ── Fats, sauces & condiments ─────────────────────────────────────────────
  { aliases: ['olijfolie', 'olive oil', 'olie', 'oil'], kcal100: 884, p100: 0, c100: 0, f100: 100, unitGrams: 10 },
  { aliases: ['mayonaise', 'mayo', 'mayonnaise'], kcal100: 680, p100: 1, c100: 2.5, f100: 75, unitGrams: 15 },
  { aliases: ['ketchup', 'tomatenketchup'], kcal100: 100, p100: 1.2, c100: 24, f100: 0.1, unitGrams: 15 },
  { aliases: ['suiker', 'sugar'], kcal100: 400, p100: 0, c100: 100, f100: 0, unitGrams: 4 },

  // ── Snacks & sweets ───────────────────────────────────────────────────────
  { aliases: ['chips', 'crisps', 'potato chips'], kcal100: 536, p100: 6.6, c100: 50, f100: 34, unitGrams: 25 },
  { aliases: ['chocolade', 'melkchocolade', 'chocolate', 'milk chocolate', 'chocola'], kcal100: 535, p100: 7.6, c100: 57, f100: 30, unitGrams: 25 },
  { aliases: ['pure chocolade', 'dark chocolate'], kcal100: 546, p100: 6, c100: 46, f100: 35, unitGrams: 25 },
  { aliases: ['koekje', 'koekjes', 'koek', 'biscuit', 'cookie', 'cookies'], kcal100: 480, p100: 6, c100: 65, f100: 20, unitGrams: 10, wholeUnit: true },
  { aliases: ['noten', 'gemengde noten', 'nuts', 'mixed nuts', 'notenmix'], kcal100: 607, p100: 20, c100: 10, f100: 54, unitGrams: 25 },
  { aliases: ['amandelen', 'almonds', 'amandel'], kcal100: 579, p100: 21, c100: 9, f100: 50, unitGrams: 25 },
  { aliases: ['walnoten', 'walnuts', 'walnoot'], kcal100: 654, p100: 15, c100: 7, f100: 65, unitGrams: 25 },

  // ── Drinks ────────────────────────────────────────────────────────────────
  { aliases: ['koffie', 'zwarte koffie', 'coffee', 'black coffee', 'espresso'], kcal100: 1, p100: 0.1, c100: 0.3, f100: 0, unitGrams: 150 },
  { aliases: ['cappuccino'], kcal100: 39, p100: 1.9, c100: 3.7, f100: 1.9, unitGrams: 150 },
  { aliases: ['latte', 'latte macchiato', 'koffie verkeerd', 'flat white'], kcal100: 29, p100: 1.6, c100: 2.4, f100: 1.5, unitGrams: 200 },
  { aliases: ['thee', 'tea', 'groene thee', 'green tea'], kcal100: 1, p100: 0, c100: 0.2, f100: 0, unitGrams: 150 },
  { aliases: ['sinaasappelsap', 'jus d orange', 'orange juice', 'jus'], kcal100: 45, p100: 0.7, c100: 10.4, f100: 0.1, unitGrams: 200 },
  { aliases: ['appelsap', 'apple juice'], kcal100: 46, p100: 0.1, c100: 11.3, f100: 0.1, unitGrams: 200 },
  { aliases: ['bier', 'pils', 'beer', 'biertje', 'pilsje'], kcal100: 43, p100: 0.5, c100: 3.5, f100: 0, unitGrams: 250 },
  { aliases: ['wijn', 'rode wijn', 'witte wijn', 'wine', 'red wine', 'white wine', 'glas wijn'], kcal100: 82, p100: 0.1, c100: 2.6, f100: 0, unitGrams: 150 },

  // ── Soups & mixed dishes ──────────────────────────────────────────────────
  { aliases: ['tomatensoep', 'tomato soup'], kcal100: 35, p100: 1.5, c100: 5, f100: 1, unitGrams: 250 },
  { aliases: ['erwtensoep', 'snert', 'pea soup'], kcal100: 80, p100: 4.5, c100: 9, f100: 2.5, unitGrams: 250 },
  { aliases: ['nasi', 'nasi goreng', 'bami', 'bami goreng'], kcal100: 150, p100: 5.5, c100: 20, f100: 5, unitGrams: 350 },
  { aliases: ['sushi'], kcal100: 145, p100: 6, c100: 27, f100: 1.5, unitGrams: 30 },
];

/** Normalize a food name for matching: lowercase, strip diacritics & punctuation. */
const normalize = (name: string): string =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Build the alias → food lookup map once at module load
const LOOKUP = new Map<string, VerifiedFood>();
for (const food of DB) {
  for (const alias of food.aliases) {
    LOOKUP.set(normalize(alias), food);
  }
}

/**
 * Look up verified nutrition for a food by name (Dutch or English).
 * Returns null when the food is not in the curated database.
 */
export const lookupVerifiedFood = (name: string): VerifiedFood | null => {
  if (!name) return null;
  const key = normalize(name);
  if (!key) return null;

  const direct = LOOKUP.get(key);
  if (direct) return direct;

  // Try simple singular fallback ("bananas" → "banana")
  if (key.endsWith('s')) {
    const singular = LOOKUP.get(key.slice(0, -1));
    if (singular) return singular;
  }
  return null;
};

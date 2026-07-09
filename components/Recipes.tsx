
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ChefHat, Loader2, Save, X, Check, Flame, Plus, Utensils, ShoppingCart, Trash2, Coffee, Sun, Moon, Cookie, Bookmark, ArrowRight } from 'lucide-react';
import { getRecipeSuggestion } from '../services/gemini';
import { getSavedRecipes, saveRecipe, deleteRecipe, getProfile } from '../services/storage';
import { Recipe, FoodItem, MealType } from '../types';
import { generateId } from '../utils/calculations';
import { t as tr } from '../utils/i18n';

interface ShoppingItem { id: string; name: string; checked: boolean; }

// 15 easy, affordable, healthy meals in English
const QUICK_MEALS = [
  {
    category: "Breakfast",
    meals: [
      { name: "Oatmeal with banana", calories: 320, protein: 10, carbs: 55, fat: 6, ingredients: ["50g oats", "200ml milk", "1 banana", "honey"], time: "5 min" },
      { name: "Greek yogurt bowl", calories: 280, protein: 18, carbs: 30, fat: 8, ingredients: ["200g Greek yogurt", "50g granola", "handful of berries"], time: "3 min" },
      { name: "Scrambled eggs on toast", calories: 350, protein: 20, carbs: 25, fat: 18, ingredients: ["2 eggs", "2 slices bread", "butter", "salt & pepper"], time: "8 min" },
    ]
  },
  {
    category: "Lunch",
    meals: [
      { name: "Chicken wrap", calories: 420, protein: 30, carbs: 35, fat: 16, ingredients: ["1 tortilla", "100g chicken breast", "lettuce", "tomato", "sauce"], time: "10 min" },
      { name: "Tuna salad", calories: 350, protein: 28, carbs: 15, fat: 20, ingredients: ["1 can tuna", "mayo", "onion", "crackers"], time: "5 min" },
      { name: "Couscous salad", calories: 390, protein: 12, carbs: 55, fat: 12, ingredients: ["100g couscous", "cucumber", "tomato", "feta", "olive oil"], time: "10 min" },
      { name: "Avocado toast with egg", calories: 320, protein: 12, carbs: 30, fat: 18, ingredients: ["bread", "1/2 avocado", "1 egg", "salt & pepper"], time: "8 min" },
    ]
  },
  {
    category: "Dinner",
    meals: [
      { name: "Pasta bolognese", calories: 520, protein: 28, carbs: 60, fat: 18, ingredients: ["100g pasta", "100g ground beef", "tomato sauce", "onion", "garlic"], time: "25 min" },
      { name: "Chicken & rice stir-fry", calories: 480, protein: 35, carbs: 50, fat: 12, ingredients: ["150g chicken breast", "100g rice", "vegetables", "soy sauce"], time: "20 min" },
      { name: "Salmon with potatoes", calories: 520, protein: 32, carbs: 40, fat: 22, ingredients: ["125g salmon", "200g potatoes", "broccoli", "lemon"], time: "25 min" },
      { name: "Burrito bowl", calories: 510, protein: 26, carbs: 55, fat: 18, ingredients: ["rice", "black beans", "ground beef", "corn", "guacamole"], time: "20 min" },
      { name: "Spaghetti carbonara", calories: 550, protein: 24, carbs: 55, fat: 24, ingredients: ["100g spaghetti", "bacon", "egg", "parmesan", "pepper"], time: "20 min" },
    ]
  },
  {
    category: "Snacks",
    meals: [
      { name: "Hummus & veggies", calories: 180, protein: 6, carbs: 18, fat: 10, ingredients: ["50g hummus", "carrots", "cucumber", "bell pepper"], time: "2 min" },
      { name: "Apple & nuts", calories: 220, protein: 5, carbs: 28, fat: 12, ingredients: ["1 apple", "30g mixed nuts"], time: "1 min" },
    ]
  }
];

// Placeholder thumb icon per category (meal-ish lucide icons)
const CATEGORY_ICONS: Record<string, React.ElementType> = {
  Breakfast: Coffee,
  Lunch: Sun,
  Dinner: Moon,
  Snacks: Cookie,
};

interface RecipesProps {
  onLogRecipe?: (items: FoodItem[]) => void;
  onCoachClick?: () => void;
}

const Recipes: React.FC<RecipesProps> = ({ onLogRecipe, onCoachClick }) => {
  const [input, setInput] = useState('');
  const [generatedRecipe, setGeneratedRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(false);
  const [savedRecipes, setSavedRecipes] = useState<Recipe[]>([]);
  const [viewMode, setViewMode] = useState<'CREATE' | 'SAVED' | 'QUICK' | 'SHOPPING'>('QUICK');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shoppingList, setShoppingList] = useState<ShoppingItem[]>([]);
  const [shoppingInput, setShoppingInput] = useState('');
  const [expandedQuickMeal, setExpandedQuickMeal] = useState<string | null>(null);
  const [mealTypeModal, setMealTypeModal] = useState<{ recipe?: Recipe; quickMeal?: typeof QUICK_MEALS[0]['meals'][0] } | null>(null);
  const [logServings, setLogServings] = useState(1);
  const profile = useMemo(() => getProfile(), []);

  useEffect(() => {
    setSavedRecipes(getSavedRecipes().reverse());
    const savedList = localStorage.getItem('nutrivault_shopping');
    if (savedList) setShoppingList(JSON.parse(savedList));
  }, []);

  // Debounce shopping list writes — avoids a localStorage write on every single item toggle/add/remove
  const shoppingWriteTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    clearTimeout(shoppingWriteTimer.current);
    shoppingWriteTimer.current = setTimeout(() => {
      localStorage.setItem('nutrivault_shopping', JSON.stringify(shoppingList));
    }, 500);
    return () => clearTimeout(shoppingWriteTimer.current);
  }, [shoppingList]);

  const quickIdeas = ['Healthy salad', 'Chicken dish', 'Quick breakfast', 'Pasta'];

  const addShoppingItem = () => {
    if (!shoppingInput.trim()) return;
    setShoppingList([...shoppingList, { id: generateId(), name: shoppingInput.trim(), checked: false }]);
    setShoppingInput('');
  };

  const toggleShoppingItem = (id: string) => {
    setShoppingList(shoppingList.map(item => item.id === id ? { ...item, checked: !item.checked } : item));
  };

  const removeShoppingItem = (id: string) => {
    setShoppingList(shoppingList.filter(item => item.id !== id));
  };

  const clearCheckedItems = () => {
    setShoppingList(shoppingList.filter(item => !item.checked));
  };

  const addIngredientsToShopping = (ingredients: string[]) => {
    // Extract product names only (remove quantities like "50g", "200ml", "1/2", "2 slices")
    const extractProductName = (ing: string): string => {
      return ing
        .replace(/^\d+[.,]?\d*\s*(g|gr|gram|kg|ml|l|liter|tbsp|tsp|cups?|slices?|cans?|handful)?\s*/i, '')
        .replace(/^[½¼¾⅓⅔]\s*/, '')
        .replace(/^\d+\/\d+\s*/, '')
        .trim();
    };

    const newItems = ingredients.map(ing => ({
      id: generateId(),
      name: extractProductName(ing) || ing,
      checked: false
    }));
    setShoppingList([...shoppingList, ...newItems]);
    showFeedback("Added to shopping list!");
  };

  const showFeedback = (msg: string) => { setFeedback(msg); setTimeout(() => setFeedback(null), 1500); };

  const handleGenerate = async (prompt?: string) => {
    setLoading(true);
    setError(null);
    try {
      const recipe = await getRecipeSuggestion(prompt || input, undefined, profile?.dietaryPreferences || []);
      // Validate the AI response shape before trusting it — a malformed recipe
      // (e.g. missing macros) would otherwise crash the render.
      if (recipe && recipe.title && recipe.macros && typeof recipe.calories === 'number') {
        setGeneratedRecipe({
          ...recipe,
          macros: {
            protein: Number(recipe.macros.protein) || 0,
            carbs: Number(recipe.macros.carbs) || 0,
            fat: Number(recipe.macros.fat) || 0,
          },
          ingredients: recipe.ingredients || [],
          instructions: recipe.instructions || [],
        });
      } else {
        setError(tr('recipeGenFailed'));
      }
    } catch {
      setError(tr('recipeGenFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = () => {
    if (generatedRecipe) {
      setSavedRecipes(saveRecipe({ ...generatedRecipe, isSaved: true }).reverse());
      showFeedback("Recipe saved!");
    }
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSavedRecipes(deleteRecipe(id).reverse());
    showFeedback("Deleted");
  };

  const handleLogRecipe = (recipe: Recipe, e: React.MouseEvent) => {
    e.stopPropagation();
    setMealTypeModal({ recipe });
  };

  const handleLogQuickMeal = (meal: typeof QUICK_MEALS[0]['meals'][0], e: React.MouseEvent) => {
    e.stopPropagation();
    setMealTypeModal({ quickMeal: meal });
  };

  const confirmLogWithMealType = (mealType: MealType) => {
    if (!onLogRecipe || !mealTypeModal) return;

    const s = logServings > 0 ? logServings : 1;
    const label = s === 1 ? '1 serving' : `${s} servings`;

    if (mealTypeModal.recipe) {
      const recipe = mealTypeModal.recipe;
      const cal = (Number(recipe.calories) || 0) * s;
      const prot = (Number(recipe.macros?.protein) || 0) * s;
      const carb = (Number(recipe.macros?.carbs) || 0) * s;
      const fats = (Number(recipe.macros?.fat) || 0) * s;

      const foodItem: FoodItem = {
        id: generateId(),
        name: recipe.title || 'Recipe',
        calories: Math.round(isNaN(cal) ? 0 : cal),
        protein: Math.round(isNaN(prot) ? 0 : prot),
        carbs: Math.round(isNaN(carb) ? 0 : carb),
        fat: Math.round(isNaN(fats) ? 0 : fats),
        amountDescription: label,
        mealType,
        timestamp: Date.now(),
        source: 'RECIPE'
      };
      onLogRecipe([foodItem]);
    } else if (mealTypeModal.quickMeal) {
      const meal = mealTypeModal.quickMeal;
      const foodItem: FoodItem = {
        id: generateId(),
        name: meal.name,
        calories: Math.round(meal.calories * s),
        protein: Math.round(meal.protein * s),
        carbs: Math.round(meal.carbs * s),
        fat: Math.round(meal.fat * s),
        amountDescription: label,
        mealType,
        timestamp: Date.now(),
        source: 'RECIPE'
      };
      onLogRecipe([foodItem]);
    }

    setMealTypeModal(null);
    setLogServings(1);
    showFeedback("Logged!");
  };

  const isMainView = viewMode !== 'SHOPPING' && viewMode !== 'SAVED';

  return (
    <div className="h-full flex flex-col bg-[#FAF6F1]">
      {feedback && <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-[#2B2523] text-white px-4 py-2 rounded-full text-xs font-bold z-[70] flex items-center gap-2"><Check className="w-3 h-3 text-[#E07A5F]"/>{feedback}</div>}

      {/* Header — transparent on app bg */}
      <div className="px-5 pb-3" style={{paddingTop: 'max(env(safe-area-inset-top, 14px), 14px)'}}>
        <div className="flex items-center justify-between">
          <h1 className="text-[24px] font-bold text-[#2B2523] font-display tracking-tight">{tr('recipes')}</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode(viewMode === 'SHOPPING' ? 'QUICK' : 'SHOPPING')}
              aria-label={viewMode === 'SHOPPING' ? 'Back to recipes' : 'Shopping list'}
              className={`w-[42px] h-[42px] rounded-full flex items-center justify-center card-shadow active:scale-90 transition-smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E07A5F] focus-visible:ring-offset-2 ${viewMode === 'SHOPPING' ? 'bg-[#E07A5F] terra-shadow' : 'bg-white'}`}
            >
              <ShoppingCart className={`w-[18px] h-[18px] ${viewMode === 'SHOPPING' ? 'text-white' : 'text-[#9A8B80]'}`} />
            </button>
            <button
              onClick={() => setViewMode(viewMode === 'SAVED' ? 'QUICK' : 'SAVED')}
              aria-label={viewMode === 'SAVED' ? 'Back to recipes' : 'Saved recipes'}
              className={`w-[42px] h-[42px] rounded-full flex items-center justify-center card-shadow active:scale-90 transition-smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E07A5F] focus-visible:ring-offset-2 ${viewMode === 'SAVED' ? 'bg-[#E07A5F] terra-shadow' : 'bg-white'}`}
            >
              <Bookmark className={`w-[18px] h-[18px] ${viewMode === 'SAVED' ? 'text-white' : 'text-[#9A8B80]'}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto px-5 pt-1" style={{ paddingBottom: 'calc(90px + env(safe-area-inset-bottom, 0px))' }}>
        {isMainView && (
          <div>
            {/* Create bar */}
            <div className="bg-white rounded-[18px] p-2.5 card-shadow flex items-center gap-2 mb-3">
              <ChefHat className="w-5 h-5 text-[#E07A5F] shrink-0 ml-1.5" />
              <input
                type="text"
                placeholder="What do you want to cook?"
                aria-label="Recipe idea"
                className="flex-1 min-w-0 bg-transparent outline-none text-[14px] text-[#2B2523] placeholder-[#B4A79C]"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
              />
              <button
                onClick={() => handleGenerate()}
                disabled={loading || !input.trim()}
                aria-label="Generate recipe"
                className="w-11 h-11 shrink-0 flex items-center justify-center active:scale-90 transition-smooth disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E07A5F] focus-visible:ring-offset-2 rounded-[12px]"
              >
                <span className="w-[34px] h-[34px] bg-[#E07A5F] rounded-[12px] terra-shadow flex items-center justify-center">
                  {loading ? <Loader2 className="w-4 h-4 text-white animate-spin"/> : <ArrowRight className="w-4 h-4 text-white"/>}
                </span>
              </button>
            </div>

            {/* Suggestion chips */}
            <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5 mb-4">
              {quickIdeas.map((idea, k) => (
                <button
                  key={k}
                  onClick={() => { setInput(idea); handleGenerate(idea); }}
                  className="whitespace-nowrap bg-white rounded-full px-3.5 py-2 card-shadow text-[12px] font-semibold text-[#6B6257] active:scale-95 transition-smooth"
                >
                  {idea}
                </button>
              ))}
            </div>

            {/* Error */}
            {error && (
              <div className="bg-[#FBEBE4] text-[#C85A40] text-sm font-medium px-4 py-3 rounded-[16px] flex items-center gap-2 mb-3">
                <X className="w-4 h-4 shrink-0" /> {error}
              </div>
            )}

            {/* Generated Recipe */}
            {generatedRecipe && (
              <div className="bg-white rounded-[20px] card-shadow overflow-hidden mb-4">
                <div className="bg-[#FBEBE4] p-4">
                  <div className="flex justify-between items-start gap-2">
                    <h2 className="text-[17px] font-bold font-display tracking-tight text-[#2B2523] flex-1">{generatedRecipe.title}</h2>
                    <button onClick={handleSave} aria-label="Save recipe" className="w-9 h-9 bg-white rounded-full card-shadow flex items-center justify-center shrink-0 active:scale-90 transition-smooth">
                      <Save className="w-4 h-4 text-[#E07A5F]"/>
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2.5">
                    <span className="flex items-center gap-1 bg-white rounded-full px-2.5 py-1 text-[11px] font-semibold text-[#C4763B]"><Flame className="w-3 h-3"/>{generatedRecipe.calories} kcal</span>
                    <span className="bg-white rounded-full px-2.5 py-1 text-[11px] font-semibold text-[#3D5A48]">P: {generatedRecipe.macros.protein}g</span>
                    <span className="bg-white rounded-full px-2.5 py-1 text-[11px] font-semibold text-[#C4763B]">C: {generatedRecipe.macros.carbs}g</span>
                    <span className="bg-white rounded-full px-2.5 py-1 text-[11px] font-semibold text-[#6B6257]">F: {generatedRecipe.macros.fat}g</span>
                  </div>
                </div>
                <div className="p-4 space-y-4">
                  <div>
                    <h4 className="text-[11px] font-display font-bold text-[#9A8B80] uppercase tracking-wider mb-2">Ingredients</h4>
                    <ul className="space-y-1.5">
                      {generatedRecipe.ingredients.map((ing, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-[#6B6257]">
                          <span className="w-1.5 h-1.5 bg-[#E07A5F] rounded-full mt-1.5 shrink-0"/>
                          {ing}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-[11px] font-display font-bold text-[#9A8B80] uppercase tracking-wider mb-2">Instructions</h4>
                    <ol className="space-y-2">
                      {generatedRecipe.instructions.map((step, i) => (
                        <li key={i} className="flex gap-3 text-sm text-[#6B6257]">
                          <span className="text-[#E07A5F]/50 font-display font-bold">{i + 1}</span>
                          {step}
                        </li>
                      ))}
                    </ol>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button onClick={handleSave} className="flex-1 bg-[#FAF6F1] text-[#6B6257] font-bold py-2.5 rounded-[14px] flex items-center justify-center gap-2 min-h-[44px] active:scale-95 transition-smooth">
                      <Save className="w-4 h-4"/> Save dish
                    </button>
                    <button onClick={(e) => handleLogRecipe(generatedRecipe, e)} className="flex-1 bg-[#E07A5F] terra-shadow text-white font-bold py-2.5 rounded-[14px] flex items-center justify-center gap-2 min-h-[44px] active:scale-95 transition-smooth">
                      <Plus className="w-4 h-4"/> Log now
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Quick meals */}
            <div className="space-y-4">
              {QUICK_MEALS.map((category, catIdx) => {
                const ThumbIcon = CATEGORY_ICONS[category.category] || Utensils;
                return (
                  <div key={catIdx}>
                    <h3 className="text-[12px] font-display font-bold text-[#3D5A48] uppercase tracking-wider mb-2">{category.category}</h3>
                    <div className="space-y-2">
                      {category.meals.map((meal, mealIdx) => {
                        const mealKey = `${catIdx}-${mealIdx}`;
                        const isExpanded = expandedQuickMeal === mealKey;
                        return (
                          <div key={mealKey} onClick={() => setExpandedQuickMeal(isExpanded ? null : mealKey)} className="bg-white rounded-[20px] p-3 card-shadow cursor-pointer">
                            <div className="flex items-center gap-3">
                              <div className="w-[52px] h-[52px] rounded-[16px] bg-[#F6ECE2] flex items-center justify-center shrink-0">
                                <ThumbIcon className="w-5 h-5 text-[#C4763B]" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 className="font-display font-bold text-[14px] text-[#2B2523] tracking-tight truncate">{meal.name}</h4>
                                <div className="flex items-center gap-1.5 text-[11px] font-medium mt-0.5">
                                  <span className="text-[#C4763B]">{meal.calories} kcal</span>
                                  <span className="text-[#B4A79C]">·</span>
                                  <span className="text-[#9A8B80]">{meal.protein}g protein</span>
                                  <span className="text-[#B4A79C]">·</span>
                                  <span className="text-[#9A8B80]">{meal.time}</span>
                                </div>
                              </div>
                              <button onClick={(e) => handleLogQuickMeal(meal, e)} aria-label={`Log ${meal.name}`} className="w-11 h-11 -mr-1 shrink-0 flex items-center justify-center active:scale-90 transition-smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E07A5F] rounded-full">
                                <span className="w-[34px] h-[34px] bg-[#FBEBE4] rounded-full flex items-center justify-center">
                                  <Plus className="w-4 h-4 text-[#E07A5F]" />
                                </span>
                              </button>
                            </div>

                            {isExpanded && (
                              <div className="mt-3 pt-3 border-t border-[#F3EAE2]">
                                <div className="flex gap-3 text-xs font-bold mb-2">
                                  <span className="text-[#3D5A48]">P: {meal.protein}g</span>
                                  <span className="text-[#C4763B]">C: {meal.carbs}g</span>
                                  <span className="text-[#9A8B80]">F: {meal.fat}g</span>
                                </div>
                                <p className="text-[10px] text-[#9A8B80] uppercase tracking-wider font-display font-bold mb-1">Ingredients</p>
                                <ul className="text-xs text-[#6B6257] space-y-0.5 mb-3">
                                  {meal.ingredients.map((ing, i) => (
                                    <li key={i} className="flex items-center gap-1.5">
                                      <span className="w-1 h-1 bg-[#E07A5F] rounded-full" />{ing}
                                    </li>
                                  ))}
                                </ul>
                                <div className="flex gap-2">
                                  <button onClick={(e) => { e.stopPropagation(); addIngredientsToShopping(meal.ingredients); }} className="flex-1 bg-[#FAF6F1] text-[#6B6257] font-bold py-2.5 rounded-[14px] text-xs flex items-center justify-center gap-1 min-h-[44px] active:scale-95 transition-smooth">
                                    <ShoppingCart className="w-3.5 h-3.5" /> List
                                  </button>
                                  <button onClick={(e) => handleLogQuickMeal(meal, e)} className="flex-1 bg-[#E07A5F] terra-shadow text-white font-bold py-2.5 rounded-[14px] text-xs flex items-center justify-center gap-1 min-h-[44px] active:scale-95 transition-smooth">
                                    <Plus className="w-3.5 h-3.5" /> Log
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {viewMode === 'SAVED' && (
          <div className="space-y-3">
            {savedRecipes.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-[20px] card-shadow">
                <ChefHat className="w-10 h-10 text-[#E8DFD5] mx-auto mb-3" />
                <p className="text-[#9A8B80] text-sm font-medium">No saved dishes yet</p>
                <p className="text-[#B4A79C] text-xs">Create a recipe and save it here</p>
              </div>
            ) : savedRecipes.map(recipe => (
              <div key={recipe.id} onClick={() => setExpandedId(expandedId === recipe.id ? null : recipe.id)} className="bg-white rounded-[20px] p-4 card-shadow cursor-pointer">
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-display font-bold tracking-tight text-[#2B2523] truncate">{recipe.title}</h3>
                    <div className="flex gap-3 mt-1 text-xs font-medium">
                      <span className="flex items-center gap-1 text-[#C4763B]"><Flame className="w-3 h-3"/>{recipe.calories} kcal</span>
                      <span className="text-[#9A8B80]">P: {recipe.macros.protein}g</span>
                    </div>
                  </div>
                  <div className="flex gap-1.5 ml-2" onClick={e => e.stopPropagation()}>
                    <button onClick={(e) => handleLogRecipe(recipe, e)} aria-label={`Log ${recipe.title}`} className="w-[34px] h-[34px] bg-[#FBEBE4] rounded-full flex items-center justify-center active:scale-90 transition-smooth" title="Log as food">
                      <Plus className="w-4 h-4 text-[#E07A5F]"/>
                    </button>
                    <button onClick={(e) => handleDelete(recipe.id, e)} aria-label={`Delete ${recipe.title}`} className="w-[34px] h-[34px] bg-[#FAF6F1] rounded-full flex items-center justify-center active:scale-90 transition-smooth">
                      <X className="w-4 h-4 text-red-500"/>
                    </button>
                  </div>
                </div>

                {expandedId === recipe.id && (
                  <div className="mt-3 pt-3 border-t border-[#F3EAE2] space-y-3 text-sm">
                    <div>
                      <h4 className="text-[10px] font-display font-bold text-[#9A8B80] uppercase tracking-wider mb-1">Ingredients</h4>
                      <ul className="text-[#6B6257] space-y-1">
                        {recipe.ingredients.map((i, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="w-1 h-1 bg-[#E07A5F] rounded-full mt-2 shrink-0"/>{i}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={(e) => { e.stopPropagation(); addIngredientsToShopping(recipe.ingredients); }} className="flex-1 bg-[#FAF6F1] text-[#6B6257] font-bold py-2.5 rounded-[14px] flex items-center justify-center gap-2 min-h-[44px] active:scale-95 transition-smooth">
                        <ShoppingCart className="w-4 h-4"/> Add to list
                      </button>
                      <button onClick={(e) => handleLogRecipe(recipe, e)} className="flex-1 bg-[#E07A5F] terra-shadow text-white font-bold py-2.5 rounded-[14px] flex items-center justify-center gap-2 min-h-[44px] active:scale-95 transition-smooth">
                        <Utensils className="w-4 h-4"/> Log meal
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {viewMode === 'SHOPPING' && (
          <div className="space-y-3">
            {/* Add Item */}
            <div className="bg-white rounded-[20px] p-3 card-shadow">
              <div className="flex gap-2">
                <input type="text" placeholder="Add item..." aria-label="Shopping list item" className="flex-1 min-w-0 bg-[#FAF6F1] rounded-[14px] py-2.5 px-4 outline-none text-[#2B2523] placeholder-[#B4A79C] text-sm focus:ring-2 focus:ring-[#E07A5F]/30" value={shoppingInput} onChange={(e) => setShoppingInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addShoppingItem()} />
                <button onClick={addShoppingItem} disabled={!shoppingInput.trim()} aria-label="Add to shopping list" className="bg-[#E07A5F] terra-shadow text-white rounded-[14px] disabled:opacity-50 min-w-[44px] min-h-[44px] flex items-center justify-center active:scale-90 transition-smooth">
                  <Plus className="w-4 h-4"/>
                </button>
              </div>
            </div>

            {/* Shopping List */}
            {shoppingList.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-[20px] card-shadow">
                <ShoppingCart className="w-10 h-10 text-[#E8DFD5] mx-auto mb-3" />
                <p className="text-[#9A8B80] text-sm font-medium">Your shopping list is empty</p>
                <p className="text-[#B4A79C] text-xs">Add items or ingredients from recipes</p>
              </div>
            ) : (
              <div className="bg-white rounded-[20px] p-4 card-shadow">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-[11px] font-display font-bold text-[#9A8B80] uppercase tracking-wider">{shoppingList.filter(i => !i.checked).length} items</span>
                  {shoppingList.some(i => i.checked) && (
                    <button onClick={clearCheckedItems} className="text-xs text-red-500 font-semibold">Clear checked</button>
                  )}
                </div>
                <div className="space-y-2">
                  {shoppingList.map(item => (
                    <div key={item.id} className="flex items-center gap-3 py-2 border-b border-[#F3EAE2] last:border-0">
                      <button onClick={() => toggleShoppingItem(item.id)} aria-label={item.checked ? `Uncheck ${item.name}` : `Check ${item.name}`} className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all ${item.checked ? 'bg-[#E07A5F] border-[#E07A5F]' : 'border-[#E8DFD5]'}`}>
                        {item.checked && <Check className="w-3.5 h-3.5 text-white" />}
                      </button>
                      <span className={`flex-1 text-sm ${item.checked ? 'line-through text-[#9A8B80]' : 'text-[#6B6257]'}`}>{item.name}</span>
                      <button onClick={() => removeShoppingItem(item.id)} aria-label={`Remove ${item.name}`} className="p-2 text-[#B4A79C] hover:text-red-400">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Meal Type Selection Modal */}
      {mealTypeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setMealTypeModal(null)} role="dialog" aria-modal="true" aria-label="Select meal type">
          <div className="bg-white w-full max-w-xs rounded-[24px] shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-[#F3EAE2] text-center">
              <h3 className="font-display font-bold tracking-tight text-[#2B2523]">{tr('addFood')}</h3>
              <p className="text-xs text-[#9A8B80] mt-1">
                {mealTypeModal.recipe?.title || mealTypeModal.quickMeal?.name}
              </p>
            </div>
            {/* Servings selector — a recipe's totals are for the whole dish, so
                let the user log the fraction/multiple they actually ate. */}
            <div className="px-4 pt-3 pb-1">
              <div className="flex items-center justify-between bg-[#FAF6F1] rounded-[14px] p-2">
                <span className="text-xs font-semibold text-[#9A8B80] pl-1">{tr('numberOfServings')}</span>
                <div className="flex items-center gap-3">
                  <button onClick={() => setLogServings(s => Math.max(0.25, Math.round((s - 0.25) * 100) / 100))} aria-label="Fewer servings" className="w-7 h-7 rounded-full bg-white card-shadow flex items-center justify-center active:scale-90 transition-smooth"><span className="text-lg font-bold text-[#E07A5F] leading-none">−</span></button>
                  <span className="font-display font-bold text-sm w-10 text-center tabular-nums text-[#2B2523]">{logServings}</span>
                  <button onClick={() => setLogServings(s => Math.round((s + 0.25) * 100) / 100)} aria-label="More servings" className="w-7 h-7 rounded-full bg-white card-shadow flex items-center justify-center active:scale-90 transition-smooth"><span className="text-lg font-bold text-[#E07A5F] leading-none">+</span></button>
                </div>
              </div>
            </div>
            <div className="p-3 space-y-2">
              {[
                { type: MealType.BREAKFAST, icon: Coffee, label: tr('breakfast'), color: 'text-[#C4763B]' },
                { type: MealType.LUNCH, icon: Sun, label: tr('lunch'), color: 'text-[#D9964F]' },
                { type: MealType.DINNER, icon: Moon, label: tr('dinner'), color: 'text-[#3D5A48]' },
                { type: MealType.SNACK, icon: Cookie, label: tr('snack'), color: 'text-[#E07A5F]' },
              ].map(({ type, icon: Icon, label, color }) => (
                <button
                  key={type}
                  onClick={() => confirmLogWithMealType(type)}
                  className="w-full flex items-center gap-3 p-3 bg-[#FAF6F1] rounded-[14px] hover:bg-[#FBEBE4] transition-colors min-h-[44px]"
                >
                  <Icon className={`w-5 h-5 ${color}`} />
                  <span className="font-semibold text-[#2B2523]">{label}</span>
                </button>
              ))}
            </div>
            <div className="p-3 pt-0">
              <button onClick={() => setMealTypeModal(null)} className="w-full py-2 text-[#9A8B80] text-sm font-medium min-h-[44px]">
                {tr('cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default Recipes;

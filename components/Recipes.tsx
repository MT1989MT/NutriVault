
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ChefHat, Loader2, Save, X, Zap, Check, Flame, HelpCircle, Plus, Utensils, ShoppingCart, Trash2, BookOpen, Coffee, Sun, Moon, Cookie, Brain } from 'lucide-react';
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
  const [showHelp, setShowHelp] = useState(false);
  const [shoppingList, setShoppingList] = useState<ShoppingItem[]>([]);
  const [shoppingInput, setShoppingInput] = useState('');
  const [expandedQuickMeal, setExpandedQuickMeal] = useState<string | null>(null);
  const [mealTypeModal, setMealTypeModal] = useState<{ recipe?: Recipe; quickMeal?: typeof QUICK_MEALS[0]['meals'][0] } | null>(null);
  const profile = useMemo(() => getProfile(), []);

  useEffect(() => {
    setSavedRecipes(getSavedRecipes().reverse());
    const savedList = localStorage.getItem('nutrivault_shopping');
    if (savedList) setShoppingList(JSON.parse(savedList));
  }, []);

  // Debounce shopping list writes — avoids a localStorage write on every single item toggle/add/remove
  const shoppingWriteTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    clearTimeout(shoppingWriteTimer.current);
    shoppingWriteTimer.current = setTimeout(() => {
      localStorage.setItem('nutrivault_shopping', JSON.stringify(shoppingList));
    }, 500);
    return () => clearTimeout(shoppingWriteTimer.current);
  }, [shoppingList]);

  const quickIdeas = ['🥗 Healthy salad', '🍗 Chicken dish', '🥣 Quick breakfast', '🍝 Pasta'];

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
    const recipe = await getRecipeSuggestion(prompt || input, undefined, profile?.dietaryPreferences || []);
    setGeneratedRecipe(recipe);
    setLoading(false);
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

    if (mealTypeModal.recipe) {
      const recipe = mealTypeModal.recipe;
      const cal = Number(recipe.calories) || 0;
      const prot = Number(recipe.macros?.protein) || 0;
      const carb = Number(recipe.macros?.carbs) || 0;
      const fats = Number(recipe.macros?.fat) || 0;

      const foodItem: FoodItem = {
        id: generateId(),
        name: recipe.title || 'Recipe',
        calories: isNaN(cal) ? 0 : cal,
        protein: isNaN(prot) ? 0 : prot,
        carbs: isNaN(carb) ? 0 : carb,
        fat: isNaN(fats) ? 0 : fats,
        amountDescription: '1 serving',
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
        calories: meal.calories,
        protein: meal.protein,
        carbs: meal.carbs,
        fat: meal.fat,
        amountDescription: '1 serving',
        mealType,
        timestamp: Date.now(),
        source: 'RECIPE'
      };
      onLogRecipe([foodItem]);
    }

    setMealTypeModal(null);
    showFeedback("Logged!");
  };

  return (
    <div className="h-full flex flex-col bg-[#FAFAF8]">
      {feedback && <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-black text-white px-4 py-2 rounded-full text-xs font-bold z-[70] flex items-center gap-2"><Check className="w-3 h-3 text-green-400"/>{feedback}</div>}

      {/* Header */}
      <div className="bg-white border-b border-gray-100/80 px-4 pb-2.5" style={{paddingTop: 'max(env(safe-area-inset-top, 12px), 12px)'}}>
        <div className="flex items-center justify-between">
          <button onClick={onCoachClick} className="w-10 h-10 bg-gradient-to-br from-[#E07A5F] to-[#C85A40] rounded-xl flex items-center justify-center active:scale-90 transition-smooth shadow-sm">
            <Brain className="w-[18px] h-[18px] text-white" />
          </button>
          <span className="text-[20px] font-extrabold text-gray-900 font-display tracking-tight">{tr('recipes')}</span>
          <button onClick={() => setShowHelp(true)} className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center active:scale-95 transition-transform">
            <HelpCircle className="w-[18px] h-[18px] text-gray-400" />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto px-4 pt-3" style={{ paddingBottom: 'calc(90px + env(safe-area-inset-bottom, 0px))' }}>
        {/* Tabs */}
        <div className="flex bg-gray-100 rounded-xl p-1 mb-4">
        <button onClick={() => setViewMode('QUICK')} className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1 ${viewMode === 'QUICK' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
          <Zap className="w-3.5 h-3.5" /> Quick
        </button>
        <button onClick={() => setViewMode('CREATE')} className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1 ${viewMode === 'CREATE' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
          <ChefHat className="w-3.5 h-3.5" /> Create
        </button>
        <button onClick={() => setViewMode('SAVED')} className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1 ${viewMode === 'SAVED' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
          <Save className="w-3.5 h-3.5" /> Saved
        </button>
        <button onClick={() => setViewMode('SHOPPING')} className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1 ${viewMode === 'SHOPPING' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
          <ShoppingCart className="w-3.5 h-3.5" /> List
        </button>
      </div>

      {/* Content */}
      <div className="space-y-4">
        {viewMode === 'QUICK' && (
          <div className="space-y-4">
            {QUICK_MEALS.map((category, catIdx) => (
              <div key={catIdx}>
                <h3 className="text-[10px] font-bold text-[#E07A5F] uppercase mb-2">{category.category}</h3>
                <div className="space-y-2">
                  {category.meals.map((meal, mealIdx) => {
                    const mealKey = `${catIdx}-${mealIdx}`;
                    const isExpanded = expandedQuickMeal === mealKey;
                    return (
                      <div key={mealKey} onClick={() => setExpandedQuickMeal(isExpanded ? null : mealKey)} className="bg-white rounded-xl p-3 card-shadow cursor-pointer">
                        <div className="flex justify-between items-center">
                          <div className="flex-1 min-w-0 mr-2">
                            <h4 className="font-semibold text-gray-900 text-sm truncate">{meal.name}</h4>
                            <div className="flex gap-2 text-[10px] text-gray-400">
                              <span className="flex items-center gap-0.5"><Flame className="w-3 h-3 text-[#E07A5F]" />{meal.calories}</span>
                              <span>P:{meal.protein}g</span>
                              <span>⏱️{meal.time}</span>
                            </div>
                          </div>
                          <button onClick={(e) => handleLogQuickMeal(meal, e)} className="p-2 bg-green-50 rounded-xl shrink-0">
                            <Plus className="w-4 h-4 text-green-600" />
                          </button>
                        </div>

                        {isExpanded && (
                          <div className="mt-3 pt-3 border-t border-gray-100">
                            <div className="flex gap-3 text-xs font-bold mb-2">
                              <span className="text-[#E07A5F]">P: {meal.protein}g</span>
                              <span className="text-[#81B29A]">C: {meal.carbs}g</span>
                              <span className="text-[#F2CC8F]">F: {meal.fat}g</span>
                            </div>
                            <p className="text-[10px] text-gray-400 uppercase font-bold mb-1">Ingredients</p>
                            <ul className="text-xs text-gray-600 space-y-0.5 mb-3">
                              {meal.ingredients.map((ing, i) => (
                                <li key={i} className="flex items-center gap-1.5">
                                  <span className="w-1 h-1 bg-[#E07A5F] rounded-full" />{ing}
                                </li>
                              ))}
                            </ul>
                            <div className="flex gap-2">
                              <button onClick={(e) => { e.stopPropagation(); addIngredientsToShopping(meal.ingredients); }} className="flex-1 bg-gray-100 text-gray-700 font-bold py-2 rounded-xl text-xs flex items-center justify-center gap-1">
                                <ShoppingCart className="w-3.5 h-3.5" /> List
                              </button>
                              <button onClick={(e) => handleLogQuickMeal(meal, e)} className="flex-1 bg-[#E07A5F] text-white font-bold py-2 rounded-xl text-xs flex items-center justify-center gap-1">
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
            ))}
          </div>
        )}

        {viewMode === 'SAVED' && (
          <div className="space-y-3">
            {savedRecipes.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-2xl">
                <ChefHat className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                <p className="text-gray-400 text-sm font-medium">No saved dishes yet</p>
                <p className="text-gray-300 text-xs">Create a recipe and save it here</p>
              </div>
            ) : savedRecipes.map(recipe => (
              <div key={recipe.id} onClick={() => setExpandedId(expandedId === recipe.id ? null : recipe.id)} className="bg-white rounded-2xl p-4 card-shadow cursor-pointer">
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-gray-900 truncate">{recipe.title}</h3>
                    <div className="flex gap-3 mt-1 text-xs text-gray-500">
                      <span className="flex items-center gap-1"><Flame className="w-3 h-3 text-[#E07A5F]"/>{recipe.calories} kcal</span>
                      <span>P: {recipe.macros.protein}g</span>
                    </div>
                  </div>
                  <div className="flex gap-1.5 ml-2" onClick={e => e.stopPropagation()}>
                    <button onClick={(e) => handleLogRecipe(recipe, e)} className="p-2 bg-green-50 rounded-xl" title="Log as food">
                      <Plus className="w-4 h-4 text-green-600"/>
                    </button>
                    <button onClick={(e) => handleDelete(recipe.id, e)} className="p-2 bg-red-50 rounded-xl">
                      <X className="w-4 h-4 text-red-400"/>
                    </button>
                  </div>
                </div>

                {expandedId === recipe.id && (
                  <div className="mt-3 pt-3 border-t border-gray-100 space-y-3 text-sm">
                    <div>
                      <h4 className="text-[10px] font-bold text-gray-400 uppercase mb-1">Ingredients</h4>
                      <ul className="text-gray-600 space-y-1">
                        {recipe.ingredients.map((i, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="w-1 h-1 bg-[#E07A5F] rounded-full mt-2 shrink-0"/>{i}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={(e) => { e.stopPropagation(); addIngredientsToShopping(recipe.ingredients); }} className="flex-1 bg-gray-100 text-gray-700 font-bold py-2.5 rounded-xl flex items-center justify-center gap-2">
                        <ShoppingCart className="w-4 h-4"/> Add to list
                      </button>
                      <button onClick={(e) => handleLogRecipe(recipe, e)} className="flex-1 bg-[#E07A5F] text-white font-bold py-2.5 rounded-xl flex items-center justify-center gap-2">
                        <Utensils className="w-4 h-4"/> Log meal
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {viewMode === 'CREATE' && (
          <div className="space-y-4">
            {/* Input */}
            <div className="bg-white rounded-2xl p-4 card-shadow">
              <div className="relative">
                <input type="text" placeholder="What do you want to cook?" className="w-full bg-gray-50 rounded-xl py-3 px-4 pr-12 outline-none text-gray-900 placeholder-gray-400 text-sm" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleGenerate()} />
                <button onClick={() => handleGenerate()} disabled={loading || !input.trim()} className="absolute right-2 top-1/2 -translate-y-1/2 bg-[#E07A5F] text-white p-2 rounded-lg disabled:opacity-50">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin"/> : <ChefHat className="w-4 h-4"/>}
                </button>
              </div>
              <div className="flex gap-2 mt-3 overflow-x-auto no-scrollbar">
                {quickIdeas.map((idea, k) => (
                  <button key={k} onClick={() => { setInput(idea.slice(2).trim()); handleGenerate(idea.slice(2).trim()); }} className="whitespace-nowrap bg-gray-50 text-gray-600 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1">
                    <Zap className="w-3 h-3 text-[#E07A5F]"/>{idea}
                  </button>
                ))}
              </div>
            </div>

            {/* Generated Recipe */}
            {generatedRecipe && (
              <div className="bg-white rounded-2xl card-shadow overflow-hidden">
                <div className="bg-gradient-to-r from-[#E07A5F]/10 to-[#E07A5F]/5 p-4">
                  <div className="flex justify-between items-start">
                    <h2 className="text-lg font-bold text-gray-900 flex-1">{generatedRecipe.title}</h2>
                    <button onClick={handleSave} className="p-2 bg-white rounded-lg shadow-sm ml-2">
                      <Save className="w-4 h-4 text-[#E07A5F]"/>
                    </button>
                  </div>
                  <div className="flex gap-4 mt-2 text-xs font-semibold">
                    <span className="flex items-center gap-1 text-[#E07A5F]"><Flame className="w-3.5 h-3.5"/>{generatedRecipe.calories} kcal</span>
                    <span className="text-gray-500">P: {generatedRecipe.macros.protein}g</span>
                    <span className="text-gray-500">C: {generatedRecipe.macros.carbs}g</span>
                    <span className="text-gray-500">F: {generatedRecipe.macros.fat}g</span>
                  </div>
                </div>
                <div className="p-4 space-y-4">
                  <div>
                    <h4 className="text-[10px] font-bold text-gray-400 uppercase mb-2">Ingredients</h4>
                    <ul className="space-y-1.5">
                      {generatedRecipe.ingredients.map((ing, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                          <span className="w-1.5 h-1.5 bg-[#E07A5F] rounded-full mt-1.5 shrink-0"/>
                          {ing}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-[10px] font-bold text-gray-400 uppercase mb-2">Instructions</h4>
                    <ol className="space-y-2">
                      {generatedRecipe.instructions.map((step, i) => (
                        <li key={i} className="flex gap-3 text-sm text-gray-700">
                          <span className="text-[#E07A5F]/50 font-bold">{i + 1}</span>
                          {step}
                        </li>
                      ))}
                    </ol>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button onClick={handleSave} className="flex-1 bg-gray-100 text-gray-700 font-bold py-2.5 rounded-xl flex items-center justify-center gap-2">
                      <Save className="w-4 h-4"/> Save dish
                    </button>
                    <button onClick={(e) => handleLogRecipe(generatedRecipe, e)} className="flex-1 bg-[#E07A5F] text-white font-bold py-2.5 rounded-xl flex items-center justify-center gap-2">
                      <Plus className="w-4 h-4"/> Log now
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {viewMode === 'SHOPPING' && (
          <div className="space-y-3">
            {/* Add Item */}
            <div className="bg-white rounded-2xl p-4 card-shadow">
              <div className="flex gap-2">
                <input type="text" placeholder="Add item..." className="flex-1 bg-gray-50 rounded-xl py-2.5 px-4 outline-none text-gray-900 placeholder-gray-400 text-sm" value={shoppingInput} onChange={(e) => setShoppingInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addShoppingItem()} />
                <button onClick={addShoppingItem} disabled={!shoppingInput.trim()} className="bg-[#E07A5F] text-white p-2.5 rounded-xl disabled:opacity-50">
                  <Plus className="w-4 h-4"/>
                </button>
              </div>
            </div>

            {/* Shopping List */}
            {shoppingList.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-2xl">
                <ShoppingCart className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                <p className="text-gray-400 text-sm font-medium">Your shopping list is empty</p>
                <p className="text-gray-300 text-xs">Add items or ingredients from recipes</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl p-4 card-shadow">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-xs font-bold text-gray-400 uppercase">{shoppingList.filter(i => !i.checked).length} items</span>
                  {shoppingList.some(i => i.checked) && (
                    <button onClick={clearCheckedItems} className="text-xs text-red-500 font-semibold">Clear checked</button>
                  )}
                </div>
                <div className="space-y-2">
                  {shoppingList.map(item => (
                    <div key={item.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                      <button onClick={() => toggleShoppingItem(item.id)} className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${item.checked ? 'bg-green-500 border-green-500' : 'border-gray-300'}`}>
                        {item.checked && <Check className="w-3 h-3 text-white" />}
                      </button>
                      <span className={`flex-1 text-sm ${item.checked ? 'line-through text-gray-400' : 'text-gray-700'}`}>{item.name}</span>
                      <button onClick={() => removeShoppingItem(item.id)} className="p-1 text-gray-300 hover:text-red-400">
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
      </div>

      {/* Help Modal */}
      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-[#E07A5F] to-[#C85A40] p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ChefHat className="w-5 h-5 text-white" />
                <h3 className="font-bold text-white">Recipes</h3>
              </div>
              <button onClick={() => setShowHelp(false)} className="p-1 hover:bg-white/20 rounded-lg">
                <X className="w-5 h-5 text-white" />
              </button>
            </div>
            <div className="p-4 space-y-3 text-sm text-gray-600">
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 bg-[#E07A5F]/10 rounded-full flex items-center justify-center shrink-0 text-[#E07A5F] font-bold text-xs">1</span>
                <p><strong>Create recipes</strong> - type what you want and get a full recipe with nutrition info</p>
              </div>
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 bg-[#E07A5F]/10 rounded-full flex items-center justify-center shrink-0 text-[#E07A5F] font-bold text-xs">2</span>
                <p><strong>Save dishes</strong> - save your favorite recipes to My Dishes</p>
              </div>
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 bg-[#E07A5F]/10 rounded-full flex items-center justify-center shrink-0 text-[#E07A5F] font-bold text-xs">3</span>
                <p><strong>Log meals</strong> - tap + to instantly log a dish to your food diary</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3 mt-3">
                <p className="text-xs text-gray-500">💡 Saved dishes can be logged with one tap!</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Meal Type Selection Modal */}
      {mealTypeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setMealTypeModal(null)}>
          <div className="bg-white w-full max-w-xs rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-100 text-center">
              <h3 className="font-bold text-gray-900">{tr('addFood')}</h3>
              <p className="text-xs text-gray-400 mt-1">
                {mealTypeModal.recipe?.title || mealTypeModal.quickMeal?.name}
              </p>
            </div>
            <div className="p-3 space-y-2">
              {[
                { type: MealType.BREAKFAST, icon: Coffee, label: tr('breakfast'), color: 'text-orange-500' },
                { type: MealType.LUNCH, icon: Sun, label: tr('lunch'), color: 'text-amber-500' },
                { type: MealType.DINNER, icon: Moon, label: tr('dinner'), color: 'text-indigo-500' },
                { type: MealType.SNACK, icon: Cookie, label: tr('snack'), color: 'text-pink-500' },
              ].map(({ type, icon: Icon, label, color }) => (
                <button
                  key={type}
                  onClick={() => confirmLogWithMealType(type)}
                  className="w-full flex items-center gap-3 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
                >
                  <Icon className={`w-5 h-5 ${color}`} />
                  <span className="font-medium text-gray-800">{label}</span>
                </button>
              ))}
            </div>
            <div className="p-3 pt-0">
              <button onClick={() => setMealTypeModal(null)} className="w-full py-2 text-gray-400 text-sm font-medium">
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

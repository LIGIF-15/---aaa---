import React, { useState, useEffect, useMemo } from 'react';
import {
  Sparkles,
  Clock,
  Users,
  ShieldCheck,
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Plus,
  Minus,
  Trash2,
  Check,
  Copy,
  ShoppingBag,
  UtensilsCrossed,
  Code2,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import {
  FamilyProfile,
  GROCERY_CATEGORIES,
  MealCategoryType,
  MealDifficulty,
  MealPlanPreferences,
  PantryItem,
  PlannedMeal,
  StoredMealPlanState,
} from '../types/pantry';

interface MealPlannerViewProps {
  profile: FamilyProfile;
  pantryItems: PantryItem[];
  onEditProfile: () => void;
  onGoToScan: () => void;
  onPantryUpdated: (items: PantryItem[]) => void;
}

interface AnalysisPreview {
  usableCount: number;
  priorityItems: { name: string; priorityTier: number; priorityReason: string }[];
  excludedItems: { name: string; reason: string }[];
  warnings: string[];
}

const DURATION_OPTIONS: (1 | 3 | 5 | 7)[] = [1, 3, 5, 7];

const MEAL_TYPE_OPTIONS: MealCategoryType[] = [
  'Breakfast',
  'Lunch',
  'Dinner',
  'Morning snack',
  'Afternoon snack',
];

const CUISINE_OPTIONS = [
  'Chinese',
  'Japanese',
  'Korean',
  'Western',
  'Mediterranean',
  'Indian',
  'Southeast Asian',
  'Mexican',
  'Middle Eastern',
];

const NUTRITION_GOAL_OPTIONS = [
  'Balanced nutrition',
  'Weight management',
  'Cholesterol-conscious meals',
  'Higher protein',
  'Higher fibre intake',
];

const DEFAULT_PREFS: MealPlanPreferences = {
  durationDays: 3,
  mealTypes: ['Breakfast', 'Lunch', 'Dinner'],
  cuisinePreferences: [],
  maxCookingTimeMinutes: 45,
  difficulty: 'Any',
  budgetAmount: null,
  budgetPeriod: 'weekly',
  currency: 'SGD',
  mealsCookedAtHome: null,
  preferLeftovers: true,
  allowNewIngredients: true,
  excludedIngredients: [],
  nutritionGoalsOverride: [],
  customNote: '',
};

type WorkspaceTab = 'schedule' | 'grocery' | 'json';

export const MealPlannerView: React.FC<MealPlannerViewProps> = ({
  profile,
  pantryItems,
  onEditProfile,
  onGoToScan,
  onPantryUpdated,
}) => {
  const [prefs, setPrefs] = useState<MealPlanPreferences>({
    ...DEFAULT_PREFS,
    cuisinePreferences: profile.preferredCuisines || [],
    preferLeftovers: profile.householdSize.batchCookingPreferred,
  });
  const [prefsExpanded, setPrefsExpanded] = useState(true);
  const [excludeInput, setExcludeInput] = useState('');

  const [loadingInitial, setLoadingInitial] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [busyMessage, setBusyMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const [mealPlanState, setMealPlanState] = useState<StoredMealPlanState | null>(null);
  const [analysisPreview, setAnalysisPreview] = useState<AnalysisPreview | null>(null);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('schedule');
  const [expandedRecipes, setExpandedRecipes] = useState<Record<string, boolean>>({});

  // Replace meal modal/drawer state
  const [replaceTarget, setReplaceTarget] = useState<{
    day: number;
    meal: PlannedMeal;
  } | null>(null);
  const [replaceCuisine, setReplaceCuisine] = useState('');
  const [replaceMaxMinutes, setReplaceMaxMinutes] = useState<number>(45);
  const [replaceExclude, setReplaceExclude] = useState('');
  const [replaceNote, setReplaceNote] = useState('');
  const [replacingMeal, setReplacingMeal] = useState(false);

  // Add meal modal state
  const [addTargetDay, setAddTargetDay] = useState<number | null>(null);
  const [addMealType, setAddMealType] = useState<MealCategoryType>('Afternoon snack');
  const [addMealNote, setAddMealNote] = useState('');
  const [addingMeal, setAddingMeal] = useState(false);

  // Grocery checked & price drafts
  const [checkedGrocery, setCheckedGrocery] = useState<Record<string, boolean>>({});
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [copiedJson, setCopiedJson] = useState(false);
  const [copiedGrocery, setCopiedGrocery] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/meal-plan');
        if (!res.ok) return;
        const data = await res.json();
        if (!active) return;
        if (data.mealPlanState) {
          setMealPlanState(data.mealPlanState);
          setPrefs(data.mealPlanState.preferences);
          setPrefsExpanded(false);
        }
        if (data.analysisPreview) {
          setAnalysisPreview(data.analysisPreview);
        }
      } catch {
        // ignore initial fetch error
      } finally {
        if (active) setLoadingInitial(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [pantryItems.length]);

  const toggleMealType = (mt: MealCategoryType) => {
    setPrefs((prev) => {
      const exists = prev.mealTypes.includes(mt);
      if (exists && prev.mealTypes.length === 1) return prev;
      return {
        ...prev,
        mealTypes: exists
          ? prev.mealTypes.filter((x) => x !== mt)
          : [...prev.mealTypes, mt],
      };
    });
  };

  const toggleCuisine = (c: string) => {
    setPrefs((prev) => {
      const exists = prev.cuisinePreferences.includes(c);
      return {
        ...prev,
        cuisinePreferences: exists
          ? prev.cuisinePreferences.filter((x) => x !== c)
          : [...prev.cuisinePreferences, c],
      };
    });
  };

  const toggleGoalOverride = (g: string) => {
    setPrefs((prev) => {
      const exists = prev.nutritionGoalsOverride.includes(g);
      return {
        ...prev,
        nutritionGoalsOverride: exists
          ? prev.nutritionGoalsOverride.filter((x) => x !== g)
          : [...prev.nutritionGoalsOverride, g],
      };
    });
  };

  const addExcludedIngredient = () => {
    const trimmed = excludeInput.trim();
    if (!trimmed) return;
    setPrefs((prev) =>
      prev.excludedIngredients.includes(trimmed)
        ? prev
        : { ...prev, excludedIngredients: [...prev.excludedIngredients, trimmed] }
    );
    setExcludeInput('');
  };

  const handleGeneratePlan = async () => {
    setGenerating(true);
    setBusyMessage('Running Stage 1 Pantry Analysis, Stage 2 Gemini Recipe Planning, and Stage 3 Validation...');
    setErrorMsg(null);
    setStatusNotice(null);
    try {
      const res = await fetch('/api/meal-plan/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prefs),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate meal plan.');
      }
      setMealPlanState(data.mealPlanState);
      setPrefsExpanded(false);
      setActiveTab('schedule');
      setStatusNotice('Meal plan generated and validated against your Family Profile and confirmed Pantry.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to generate meal plan.');
    } finally {
      setGenerating(false);
      setBusyMessage(null);
    }
  };

  const openReplaceDialog = (day: number, meal: PlannedMeal) => {
    setReplaceTarget({ day, meal });
    setReplaceCuisine('');
    setReplaceMaxMinutes(meal.preparation_time_minutes + meal.cooking_time_minutes || prefs.maxCookingTimeMinutes);
    setReplaceExclude('');
    setReplaceNote('');
  };

  const handleReplaceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replaceTarget) return;
    setReplacingMeal(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/meal-plan/replace-meal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          day: replaceTarget.day,
          recipeId: replaceTarget.meal.recipe_id,
          swapCuisine: replaceCuisine || undefined,
          maxMinutes: replaceMaxMinutes || undefined,
          excludeIngredient: replaceExclude.trim() || undefined,
          customInstruction: replaceNote.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to replace meal.');
      setMealPlanState(data.mealPlanState);
      setReplaceTarget(null);
      setStatusNotice('Meal replaced and pantry allocation, grocery list, and nutrition recalculated.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to replace meal.');
    } finally {
      setReplacingMeal(false);
    }
  };

  const handleAddMealSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (addTargetDay === null) return;
    setAddingMeal(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/meal-plan/add-meal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          day: addTargetDay,
          mealType: addMealType,
          customInstruction: addMealNote.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add meal.');
      setMealPlanState(data.mealPlanState);
      setAddTargetDay(null);
      setAddMealNote('');
      setStatusNotice(`Added ${addMealType} to Day ${addTargetDay} and updated grocery & nutrition totals.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to add meal.');
    } finally {
      setAddingMeal(false);
    }
  };

  const handleRecalculate = async (payload: {
    action: 'update_servings' | 'remove_meal' | 'update_prices' | 'reconcile_pantry';
    day?: number;
    recipeId?: string;
    servings?: number;
    priceUpdates?: Record<string, number | null>;
  }) => {
    setErrorMsg(null);
    try {
      const res = await fetch('/api/meal-plan/recalculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to recalculate plan.');
      setMealPlanState(data.mealPlanState);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Recalculation failed.');
    }
  };

  const handleMarkCooked = async (day: number, recipeId: string, recipeName: string) => {
    setErrorMsg(null);
    try {
      const res = await fetch('/api/meal-plan/mark-cooked', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ day, recipeId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to mark meal cooked.');
      setMealPlanState(data.mealPlanState);
      if (Array.isArray(data.pantryItems)) {
        onPantryUpdated(data.pantryItems);
      }
      setStatusNotice(`Confirmed "${recipeName}" cooked and deducted used quantities from your pantry.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to deduct cooked ingredients.');
    }
  };

  const plan = mealPlanState?.output.meal_plan || null;

  const totalMealsPlanned = useMemo(() => {
    if (!plan) return 0;
    return plan.daily_plans.reduce((sum, d) => sum + d.meals.length, 0);
  }, [plan]);

  const groupedGrocery = useMemo(() => {
    if (!plan) return [];
    return GROCERY_CATEGORIES.map((cat) => ({
      category: cat,
      items: plan.grocery_list.filter((g) => g.category === cat),
    })).filter((group) => group.items.length > 0);
  }, [plan]);

  const copyPlanJson = () => {
    if (!mealPlanState) return;
    navigator.clipboard.writeText(JSON.stringify(mealPlanState.output, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  const copyGroceryText = () => {
    if (!plan) return;
    const lines = groupedGrocery.flatMap((g) => [
      `## ${g.category}`,
      ...g.items.map(
        (item) =>
          `- ${item.ingredient}: buy ${item.purchase_quantity} ${item.unit} (need ${item.required_quantity}, have ${item.available_quantity})`
      ),
      '',
    ]);
    navigator.clipboard.writeText(lines.join('\n'));
    setCopiedGrocery(true);
    setTimeout(() => setCopiedGrocery(false), 2000);
  };

  const makePriceKey = (ingredient: string, unit: string) =>
    `${ingredient.toLowerCase().trim().replace(/\b(fresh|organic|raw|whole|sliced|chopped|diced|minced|grated|large|small|medium|extra|virgin|bag of|carton of|jar of|can of|bottle of|box of|bunch of)\b/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim().replace(/s\b/, '')}__${unit.toLowerCase().trim().replace(/s$/, '')}`;

  return (
    <div className="max-w-[1360px] mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Meal Plan Generator
          </h1>
          <p className="mt-1.5 text-sm text-slate-600 max-w-2xl">
            Builds balanced multi-day meal plans from your Family Profile and confirmed Smart Pantry
            inventory—prioritising expiring items, validating allergies, and calculating smart
            grocery lists.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onEditProfile}
            className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            Edit Family Profile
          </button>
          {plan && (
            <button
              type="button"
              onClick={() => setPrefsExpanded((v) => !v)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              <SlidersHorizontal className="w-4 h-4" aria-hidden="true" />
              <span>{prefsExpanded ? 'Hide Preferences' : 'Plan Preferences'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Stage 1 Profile & Pantry Intelligence Summary */}
      <section className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 text-sm">
          <div>
            <span className="text-xs font-medium text-slate-500 block">Household & Servings</span>
            <span className="text-slate-900 font-medium tabular-nums">
              {profile.householdName} · {profile.householdSize.typicalServings} servings/meal
            </span>
          </div>
          <div>
            <span className="text-xs font-medium text-slate-500 block">Dietary & Nutrition</span>
            <span className="text-slate-900">
              {(prefs.nutritionGoalsOverride.length > 0
                ? prefs.nutritionGoalsOverride
                : [...profile.dietaryPreferences, ...profile.healthGoals]
              ).join(' · ') || 'Balanced nutrition'}
            </span>
          </div>
          <div>
            <span className="text-xs font-medium text-slate-500 block">
              Allergy Protection
            </span>
            <span
              className={
                profile.allergies.length > 0 ? 'font-semibold text-red-700' : 'text-slate-700'
              }
            >
              {profile.allergies.length > 0
                ? `Strictly excludes ${profile.allergies.join(', ')}`
                : 'None listed in profile'}
              {profile.crossContaminationStrict ? ' (Strict cross-contamination)' : ''}
            </span>
          </div>
          <div>
            <span className="text-xs font-medium text-slate-500 block">Equipment & Spice</span>
            <span className="text-slate-900">
              {profile.cookingEquipment.join(', ') || 'Stovetop'} · {profile.spiceTolerance}
            </span>
          </div>
          <div>
            <span className="text-xs font-medium text-slate-500 block">
              Confirmed Pantry Readiness
            </span>
            <span className="text-slate-900 tabular-nums">
              {analysisPreview
                ? `${analysisPreview.usableCount} confirmed (${analysisPreview.priorityItems.length} use soon)`
                : `${pantryItems.filter((i) => !i.verificationRequired).length} confirmed items`}
            </span>
          </div>
        </div>

        {analysisPreview && analysisPreview.excludedItems.length > 0 && (
          <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-amber-800 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              Excluded from auto-planning until verified/inspected:{' '}
              {analysisPreview.excludedItems.map((e) => `${e.name} (${e.reason})`).join(' · ')}
            </span>
          </div>
        )}
      </section>

      {/* Meal Planning Preferences Configuration */}
      {prefsExpanded && (
        <section className="bg-white rounded-xl border border-slate-200 p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-100">
            <div>
              <h2 className="font-display text-lg font-semibold text-slate-900">
                Customise Meal Plan Preferences
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Configure duration, meal slots, cuisines, time limits, budget, and leftover
                preferences before generating.
              </p>
            </div>
            {pantryItems.length === 0 && (
              <button
                type="button"
                onClick={onGoToScan}
                className="text-xs font-medium text-emerald-700 hover:text-emerald-800 underline self-start sm:self-auto"
              >
                Upload pantry photos first for pantry-aware recipes
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Duration */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">
                Planning Duration
              </label>
              <div className="inline-flex gap-1 p-1 rounded-lg bg-slate-100">
                {DURATION_OPTIONS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setPrefs((p) => ({ ...p, durationDays: d }))}
                    className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                      prefs.durationDays === d
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {d} {d === 1 ? 'Day' : 'Days'}
                  </button>
                ))}
              </div>
            </div>

            {/* Max Cooking Time */}
            <div>
              <label
                htmlFor="max-cook-time"
                className="block text-xs font-semibold text-slate-700 mb-2"
              >
                Max Cooking & Prep Time per Meal
              </label>
              <select
                id="max-cook-time"
                value={prefs.maxCookingTimeMinutes}
                onChange={(e) =>
                  setPrefs((p) => ({ ...p, maxCookingTimeMinutes: Number(e.target.value) }))
                }
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-800 focus:outline-none focus:border-emerald-700"
              >
                <option value={20}>Under 20 minutes (Express)</option>
                <option value={30}>Under 30 minutes (Weeknight)</option>
                <option value={45}>Under 45 minutes (Balanced)</option>
                <option value={60}>Under 60 minutes</option>
                <option value={90}>Up to 90 minutes (Weekend)</option>
              </select>
            </div>

            {/* Difficulty */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">
                Preparation Difficulty
              </label>
              <div className="inline-flex gap-1 p-1 rounded-lg bg-slate-100">
                {(['Any', 'Easy', 'Intermediate', 'Advanced'] as const).map((diff) => (
                  <button
                    key={diff}
                    type="button"
                    onClick={() =>
                      setPrefs((p) => ({ ...p, difficulty: diff as 'Any' | MealDifficulty }))
                    }
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                      prefs.difficulty === diff
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {diff}
                  </button>
                ))}
              </div>
            </div>

            {/* Meal Types */}
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-2">
                Meals to Include
              </label>
              <div className="flex flex-wrap gap-2">
                {MEAL_TYPE_OPTIONS.map((mt) => {
                  const active = prefs.mealTypes.includes(mt);
                  return (
                    <button
                      key={mt}
                      type="button"
                      onClick={() => toggleMealType(mt)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-emerald-700 text-white border-emerald-700'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {mt}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Budget & Home Meals */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">
                Optional Grocery Budget & Home Meals
              </label>
              <div className="flex gap-2">
                <select
                  value={prefs.currency}
                  onChange={(e) => setPrefs((p) => ({ ...p, currency: e.target.value }))}
                  className="px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-800"
                >
                  <option value="SGD">SGD</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                  <option value="MYR">MYR</option>
                </select>
                <input
                  type="number"
                  min={0}
                  placeholder="Budget (opt.)"
                  value={prefs.budgetAmount ?? ''}
                  onChange={(e) =>
                    setPrefs((p) => ({
                      ...p,
                      budgetAmount: e.target.value ? Number(e.target.value) : null,
                    }))
                  }
                  className="w-28 px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-mono tabular-nums focus:outline-none focus:border-emerald-700"
                />
                <select
                  value={prefs.budgetPeriod}
                  onChange={(e) =>
                    setPrefs((p) => ({
                      ...p,
                      budgetPeriod: e.target.value as 'daily' | 'weekly',
                    }))
                  }
                  className="px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-800"
                >
                  <option value="weekly">Weekly</option>
                  <option value="daily">Daily</option>
                </select>
              </div>
            </div>

            {/* Cuisines */}
            <div className="lg:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-2">
                Cuisine Preferences
              </label>
              <div className="flex flex-wrap gap-2">
                {CUISINE_OPTIONS.map((c) => {
                  const active = prefs.cuisinePreferences.includes(c);
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => toggleCuisine(c)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-emerald-700 text-white border-emerald-700'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Nutrition Goal Override */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">
                Plan Nutrition Focus (Optional)
              </label>
              <div className="flex flex-wrap gap-1.5">
                {NUTRITION_GOAL_OPTIONS.map((g) => {
                  const active = prefs.nutritionGoalsOverride.includes(g);
                  return (
                    <button
                      key={g}
                      type="button"
                      onClick={() => toggleGoalOverride(g)}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {g}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Toggles, Exclusions, Custom Note & Generate CTA */}
          <div className="pt-5 border-t border-slate-100 grid grid-cols-1 lg:grid-cols-12 gap-5 items-end">
            <div className="lg:col-span-5 space-y-2.5">
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={prefs.preferLeftovers}
                  onChange={(e) =>
                    setPrefs((p) => ({ ...p, preferLeftovers: e.target.checked }))
                  }
                  className="w-4 h-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-700"
                />
                <span>Include batch prep & practical leftover repurposing</span>
              </label>

              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={prefs.allowNewIngredients}
                  onChange={(e) =>
                    setPrefs((p) => ({ ...p, allowNewIngredients: e.target.checked }))
                  }
                  className="w-4 h-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-700"
                />
                <span>Allow supplemental grocery ingredients when needed for balanced recipes</span>
              </label>
            </div>

            <div className="lg:col-span-4 space-y-2">
              <label className="block text-xs font-semibold text-slate-700">
                Temporarily Exclude Ingredients (This Plan)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={excludeInput}
                  onChange={(e) => setExcludeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addExcludedIngredient();
                    }
                  }}
                  placeholder="e.g. Mushrooms, pork"
                  className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:border-emerald-700"
                />
                <button
                  type="button"
                  onClick={addExcludedIngredient}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Exclude
                </button>
              </div>
              {prefs.excludedIngredients.length > 0 && (
                <div className="flex flex-wrap gap-2 text-xs text-slate-700">
                  {prefs.excludedIngredients.map((ex) => (
                    <span key={ex} className="inline-flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded">
                      {ex}
                      <button
                        type="button"
                        onClick={() =>
                          setPrefs((p) => ({
                            ...p,
                            excludedIngredients: p.excludedIngredients.filter((x) => x !== ex),
                          }))
                        }
                        aria-label={`Remove exclusion ${ex}`}
                        className="text-slate-400 hover:text-slate-800"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="lg:col-span-3 flex flex-col items-stretch sm:items-end gap-2">
              <button
                type="button"
                disabled={generating}
                onClick={handleGeneratePlan}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg bg-emerald-700 text-white text-sm font-medium hover:bg-emerald-800 disabled:opacity-60 transition-colors whitespace-nowrap"
              >
                {generating ? (
                  <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Sparkles className="w-4 h-4" aria-hidden="true" />
                )}
                <span>
                  {generating
                    ? 'Generating Plan...'
                    : plan
                      ? 'Regenerate Meal Plan'
                      : 'Generate Meal Plan'}
                </span>
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="plan-custom-note" className="block text-xs font-semibold text-slate-700 mb-1">
              Additional Planning Request (Optional)
            </label>
            <input
              id="plan-custom-note"
              type="text"
              value={prefs.customNote}
              onChange={(e) => setPrefs((p) => ({ ...p, customNote: e.target.value }))}
              placeholder="e.g. Packable lunches for work on Days 2 and 3; lighter dinners"
              className="w-full px-3.5 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:border-emerald-700"
            />
          </div>
        </section>
      )}

      {/* Status & Error Banners */}
      {busyMessage && (
        <div
          role="status"
          className="p-4 rounded-xl bg-slate-900 text-white text-sm flex items-center gap-3"
        >
          <RefreshCw className="w-4 h-4 animate-spin text-emerald-400 shrink-0" aria-hidden="true" />
          <span>{busyMessage}</span>
        </div>
      )}

      {statusNotice && (
        <div
          role="status"
          className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-900 flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />
            <span>{statusNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusNotice(null)}
            className="text-emerald-700 hover:text-emerald-900"
            aria-label="Dismiss notice"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {errorMsg && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800 flex items-start justify-between gap-3"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            aria-label="Dismiss error"
            className="text-red-600 hover:text-red-900"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Empty State */}
      {!loadingInitial && !plan && !generating && (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center max-w-2xl mx-auto">
          <UtensilsCrossed className="w-8 h-8 text-slate-400 mx-auto" aria-hidden="true" />
          <h2 className="mt-4 font-display text-lg font-semibold text-slate-900">
            Ready to build your personalised meal plan
          </h2>
          <p className="mt-1.5 text-sm text-slate-600">
            Select your planning duration and preferences above, then click{' '}
            <strong>Generate Meal Plan</strong>. The planner will prioritise expiring pantry stock,
            enforce all household allergies, and compile a consolidated grocery list.
          </p>
        </div>
      )}

      {/* Generated Meal Plan Workspace */}
      {plan && (
        <div className="space-y-6">
          {/* Weekly KPI Summary Strip */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-xs font-medium text-slate-500">Meals Planned</p>
              <p className="mt-1 font-display text-2xl font-bold text-slate-900 tabular-nums">
                {totalMealsPlanned}
              </p>
              <p className="text-xs text-slate-500 tabular-nums">{plan.duration_days} day schedule</p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-xs font-medium text-slate-500">Pantry Items Used</p>
              <p className="mt-1 font-display text-2xl font-bold text-emerald-700 tabular-nums">
                {plan.pantry_utilisation.ingredients_used.length}
              </p>
              <p className="text-xs text-slate-500 tabular-nums">
                {plan.pantry_utilisation.ingredients_prioritised.length} expiring prioritised
              </p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-xs font-medium text-slate-500">Grocery Items Needed</p>
              <p className="mt-1 font-display text-2xl font-bold text-slate-900 tabular-nums">
                {plan.grocery_list.length}
              </p>
              <p className="text-xs text-slate-500">Auto-deducted pantry</p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-xs font-medium text-slate-500">Avg Daily Energy (Est.)</p>
              <p className="mt-1 font-display text-2xl font-bold text-slate-900 tabular-nums">
                {plan.weekly_nutrition_summary.average_daily_calories ?? '—'}
              </p>
              <p className="text-xs text-slate-500">kcal / serving-day</p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-xs font-medium text-slate-500">Avg Protein & Fibre (Est.)</p>
              <p className="mt-1 font-display text-xl font-bold text-slate-900 tabular-nums">
                {plan.weekly_nutrition_summary.average_daily_protein_g ?? '—'}g /{' '}
                {plan.weekly_nutrition_summary.average_daily_fibre_g ?? '—'}g
              </p>
              <p className="text-xs text-slate-500">Protein / Fibre daily</p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-xs font-medium text-slate-500">Est. Grocery Total</p>
              <p className="mt-1 font-display text-2xl font-bold text-slate-900 tabular-nums">
                {plan.planning_summary.estimated_total_grocery_cost !== null
                  ? `${plan.planning_summary.currency} ${plan.planning_summary.estimated_total_grocery_cost.toFixed(2)}`
                  : 'Enter prices'}
              </p>
              <p className="text-xs text-slate-500">From user-entered prices</p>
            </div>
          </div>

          {/* Warnings & Assumptions */}
          {(plan.warnings.length > 0 || plan.assumptions.length > 0) && (
            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
              {plan.warnings.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" aria-hidden="true" />
                    <span>Validation & Safety Notes</span>
                  </p>
                  <ul className="list-disc list-inside text-xs text-amber-900 space-y-0.5">
                    {plan.warnings.map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
              {plan.assumptions.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-700">Planning Assumptions</p>
                  <ul className="list-disc list-inside text-xs text-slate-600 space-y-0.5">
                    {plan.assumptions.map((a, idx) => (
                      <li key={idx}>{a}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Workspace View Switcher */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-3">
            <div className="inline-flex gap-1 p-1 rounded-lg bg-slate-200/70">
              <button
                type="button"
                onClick={() => setActiveTab('schedule')}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  activeTab === 'schedule'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <UtensilsCrossed className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Daily Plan & Recipes ({totalMealsPlanned})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('grocery')}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  activeTab === 'grocery'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ShoppingBag className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Smart Grocery List ({plan.grocery_list.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('json')}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  activeTab === 'json'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Code2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Structured JSON</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => handleRecalculate({ action: 'reconcile_pantry' })}
              className="text-xs font-medium text-slate-600 hover:text-emerald-800 underline whitespace-nowrap"
            >
              Re-sync with latest Pantry stock
            </button>
          </div>

          {/* TAB 1: DAILY SCHEDULE & RECIPES */}
          {activeTab === 'schedule' && (
            <div className="space-y-8">
              {plan.daily_plans.map((dayPlan) => (
                <section
                  key={dayPlan.day}
                  className="bg-white rounded-xl border border-slate-200 overflow-hidden"
                >
                  {/* Day Header & Nutrition Totals */}
                  <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div>
                      <h3 className="font-display text-lg font-bold text-slate-900 tabular-nums">
                        Day {dayPlan.day}
                        {dayPlan.date && (
                          <span className="ml-2 text-sm font-normal text-slate-500 font-mono">
                            {dayPlan.date}
                          </span>
                        )}
                      </h3>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-700 tabular-nums">
                      <span>
                        Est. Daily Totals:{' '}
                        <strong className="text-slate-900">
                          {dayPlan.daily_nutrition_summary.calories_kcal ?? '—'} kcal
                        </strong>
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        Protein:{' '}
                        <strong className="text-slate-900">
                          {dayPlan.daily_nutrition_summary.protein_g ?? '—'}g
                        </strong>
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        Carbs:{' '}
                        <strong className="text-slate-900">
                          {dayPlan.daily_nutrition_summary.carbohydrates_g ?? '—'}g
                        </strong>
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        Fat:{' '}
                        <strong className="text-slate-900">
                          {dayPlan.daily_nutrition_summary.fat_g ?? '—'}g
                        </strong>
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        Fibre:{' '}
                        <strong className="text-slate-900">
                          {dayPlan.daily_nutrition_summary.fibre_g ?? '—'}g
                        </strong>
                      </span>

                      <button
                        type="button"
                        onClick={() => {
                          setAddTargetDay(dayPlan.day);
                          setAddMealType('Afternoon snack');
                          setAddMealNote('');
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap"
                      >
                        <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Add Meal</span>
                      </button>
                    </div>
                  </div>

                  {/* Meals List for Day */}
                  <div className="divide-y divide-slate-200">
                    {dayPlan.meals.map((meal) => {
                      const isExpanded = Boolean(expandedRecipes[meal.recipe_id]);
                      const isCooked = mealPlanState?.cookedRecipeIds.includes(meal.recipe_id);
                      const totalMin =
                        meal.preparation_time_minutes + meal.cooking_time_minutes;

                      return (
                        <article key={meal.recipe_id} className="p-6 space-y-4">
                          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                            <div className="space-y-1.5 flex-1">
                              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                <span className="font-semibold text-emerald-800">
                                  {meal.meal_type}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span>{meal.cuisine}</span>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono tabular-nums">{meal.recipe_id}</span>
                                <span aria-hidden="true">·</span>
                                <span className="inline-flex items-center gap-1 tabular-nums">
                                  <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                                  {totalMin} min ({meal.preparation_time_minutes}m prep +{' '}
                                  {meal.cooking_time_minutes}m cook)
                                </span>
                                <span aria-hidden="true">·</span>
                                <span>{meal.difficulty}</span>
                                <span aria-hidden="true">·</span>
                                <span>{meal.equipment_used.join(', ')}</span>
                              </div>

                              <h4 className="font-display text-lg font-bold text-slate-900">
                                {meal.recipe_name}
                              </h4>
                              {meal.description && (
                                <p className="text-sm text-slate-600 max-w-3xl">
                                  {meal.description}
                                </p>
                              )}

                              {/* Prioritised items & nutrition preview */}
                              <div className="pt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                                {meal.pantry_items_prioritised.length > 0 && (
                                  <span className="font-medium text-amber-800">
                                    Uses priority pantry: {meal.pantry_items_prioritised.join(', ')}
                                  </span>
                                )}
                                {meal.nutrition_per_serving.calories_kcal !== null && (
                                  <span className="text-slate-500 tabular-nums">
                                    Est. per serving: {meal.nutrition_per_serving.calories_kcal} kcal
                                    · {meal.nutrition_per_serving.protein_g ?? '—'}g protein ·{' '}
                                    {meal.nutrition_per_serving.fibre_g ?? '—'}g fibre
                                  </span>
                                )}
                              </div>

                              {meal.leftover_note && (
                                <p className="text-xs text-slate-600">
                                  Leftover / Prep Tip: {meal.leftover_note}
                                </p>
                              )}
                            </div>

                            {/* Meal Interaction & Serving Controls */}
                            <div className="flex flex-wrap items-center gap-2 shrink-0">
                              {/* Serving adjuster */}
                              <div className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 text-xs">
                                <Users className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleRecalculate({
                                      action: 'update_servings',
                                      day: dayPlan.day,
                                      recipeId: meal.recipe_id,
                                      servings: Math.max(1, meal.servings - 1),
                                    })
                                  }
                                  aria-label="Decrease servings"
                                  className="p-0.5 text-slate-600 hover:text-slate-900"
                                >
                                  <Minus className="w-3 h-3" />
                                </button>
                                <span className="font-mono font-semibold text-slate-900 tabular-nums px-1">
                                  {meal.servings} srv
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleRecalculate({
                                      action: 'update_servings',
                                      day: dayPlan.day,
                                      recipeId: meal.recipe_id,
                                      servings: meal.servings + 1,
                                    })
                                  }
                                  aria-label="Increase servings"
                                  className="p-0.5 text-slate-600 hover:text-slate-900"
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>

                              <button
                                type="button"
                                onClick={() => openReplaceDialog(dayPlan.day, meal)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                              >
                                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>Replace</span>
                              </button>

                              <button
                                type="button"
                                disabled={isCooked}
                                onClick={() =>
                                  handleMarkCooked(dayPlan.day, meal.recipe_id, meal.recipe_name)
                                }
                                title="Confirm you cooked this meal to deduct used ingredients from your Pantry"
                                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                                  isCooked
                                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                    : 'border border-slate-300 bg-white text-slate-700 hover:bg-emerald-50 hover:text-emerald-800'
                                }`}
                              >
                                <Check className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>{isCooked ? 'Cooked & Deducted' : 'Mark Cooked'}</span>
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedRecipes((prev) => ({
                                    ...prev,
                                    [meal.recipe_id]: !prev[meal.recipe_id],
                                  }))
                                }
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 whitespace-nowrap"
                              >
                                <span>{isExpanded ? 'Hide Recipe' : 'Full Recipe'}</span>
                                {isExpanded ? (
                                  <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
                                ) : (
                                  <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                                )}
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  handleRecalculate({
                                    action: 'remove_meal',
                                    day: dayPlan.day,
                                    recipeId: meal.recipe_id,
                                  })
                                }
                                aria-label={`Remove ${meal.recipe_name}`}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-red-700 hover:bg-red-50 transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          {/* Expanded Full Recipe View */}
                          {isExpanded && (
                            <div className="pt-5 mt-4 border-t border-slate-200 grid grid-cols-1 lg:grid-cols-12 gap-6">
                              {/* Left: Ingredients + Nutrition + Substitutions */}
                              <div className="lg:col-span-5 space-y-5">
                                <div className="p-3 rounded-lg bg-emerald-50/70 border border-emerald-200 text-xs text-emerald-950 flex items-start gap-2">
                                  <ShieldCheck
                                    className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5"
                                    aria-hidden="true"
                                  />
                                  <span>{meal.allergen_safety_check}</span>
                                </div>

                                <div>
                                  <h5 className="text-xs font-semibold text-slate-900 mb-2">
                                    Ingredients ({meal.servings} servings)
                                  </h5>
                                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                                    <table className="w-full text-xs">
                                      <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                                        <tr>
                                          <th className="text-left py-2 px-3 font-medium">
                                            Ingredient
                                          </th>
                                          <th className="text-right py-2 px-2 font-medium">Req.</th>
                                          <th className="text-right py-2 px-2 font-medium">
                                            Pantry
                                          </th>
                                          <th className="text-right py-2 px-3 font-medium">
                                            Buy
                                          </th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100">
                                        {meal.ingredients.map((ing, i) => (
                                          <tr key={i} className="hover:bg-slate-50/60">
                                            <td className="py-2 px-3 font-medium text-slate-900">
                                              {ing.name}
                                            </td>
                                            <td className="py-2 px-2 text-right font-mono tabular-nums text-slate-700">
                                              {ing.quantity} {ing.unit}
                                            </td>
                                            <td className="py-2 px-2 text-right font-mono tabular-nums text-emerald-700">
                                              {ing.pantry_quantity_used > 0
                                                ? `${ing.pantry_quantity_used} ${ing.unit}`
                                                : '—'}
                                            </td>
                                            <td className="py-2 px-3 text-right font-mono tabular-nums text-amber-700">
                                              {ing.additional_quantity_required > 0
                                                ? `${ing.additional_quantity_required} ${ing.unit}`
                                                : '0'}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>

                                {/* Estimated Nutrition Table */}
                                <div>
                                  <h5 className="text-xs font-semibold text-slate-900 mb-2">
                                    Estimated Nutrition per Serving (Not Medical Advice)
                                  </h5>
                                  <div className="grid grid-cols-4 gap-2 text-xs border border-slate-200 rounded-lg p-3 bg-slate-50/60 tabular-nums">
                                    <div>
                                      <span className="text-slate-500 block">Calories</span>
                                      <span className="font-mono font-semibold text-slate-900">
                                        {meal.nutrition_per_serving.calories_kcal ?? '—'} kcal
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-slate-500 block">Protein</span>
                                      <span className="font-mono font-semibold text-slate-900">
                                        {meal.nutrition_per_serving.protein_g ?? '—'} g
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-slate-500 block">Carbs</span>
                                      <span className="font-mono font-semibold text-slate-900">
                                        {meal.nutrition_per_serving.carbohydrates_g ?? '—'} g
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-slate-500 block">Fibre</span>
                                      <span className="font-mono font-semibold text-slate-900">
                                        {meal.nutrition_per_serving.fibre_g ?? '—'} g
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-slate-500 block">Total Fat</span>
                                      <span className="font-mono font-semibold text-slate-900">
                                        {meal.nutrition_per_serving.fat_g ?? '—'} g
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-slate-500 block">Sat. Fat</span>
                                      <span className="font-mono font-semibold text-slate-900">
                                        {meal.nutrition_per_serving.saturated_fat_g ?? '—'} g
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-slate-500 block">Sodium</span>
                                      <span className="font-mono font-semibold text-slate-900">
                                        {meal.nutrition_per_serving.sodium_mg ?? '—'} mg
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                {meal.substitutions.length > 0 && (
                                  <div>
                                    <h5 className="text-xs font-semibold text-slate-900 mb-1.5">
                                      Allergy-Safe Substitutions
                                    </h5>
                                    <ul className="space-y-1.5 text-xs text-slate-700">
                                      {meal.substitutions.map((sub, i) => (
                                        <li key={i}>
                                          <strong>{sub.original_ingredient}</strong> &rarr;{' '}
                                          {sub.alternative}{' '}
                                          <span className="text-slate-500">({sub.reason})</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>

                              {/* Right: Sequential Instructions */}
                              <div className="lg:col-span-7">
                                <h5 className="text-xs font-semibold text-slate-900 mb-2.5">
                                  Cooking Instructions
                                </h5>
                                <ol className="space-y-3">
                                  {meal.instructions.map((step) => (
                                    <li
                                      key={step.step}
                                      className="p-3.5 rounded-lg border border-slate-200 bg-white text-sm"
                                    >
                                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mb-1">
                                        <span className="font-mono font-semibold text-slate-900">
                                          Step {step.step}
                                        </span>
                                        {step.method && (
                                          <>
                                            <span aria-hidden="true">·</span>
                                            <span>{step.method}</span>
                                          </>
                                        )}
                                        {step.temperature && (
                                          <>
                                            <span aria-hidden="true">·</span>
                                            <span>{step.temperature}</span>
                                          </>
                                        )}
                                        {step.duration_minutes ? (
                                          <>
                                            <span aria-hidden="true">·</span>
                                            <span className="tabular-nums">
                                              {step.duration_minutes} min
                                            </span>
                                          </>
                                        ) : null}
                                      </div>
                                      <p className="text-slate-800 leading-relaxed">
                                        {step.description}
                                      </p>
                                      {step.tip && (
                                        <p className="mt-1 text-xs text-slate-500">
                                          Tip: {step.tip}
                                        </p>
                                      )}
                                    </li>
                                  ))}
                                </ol>
                              </div>
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}

          {/* TAB 2: SMART GROCERY LIST & PANTRY UTILISATION */}
          {activeTab === 'grocery' && (
            <div className="space-y-6">
              <section className="bg-white rounded-xl border border-slate-200 p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
                  <div>
                    <h3 className="font-display text-lg font-semibold text-slate-900">
                      Smart Grocery List
                    </h3>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Calculated automatically by subtracting confirmed pantry quantities from total
                      recipe needs. Optionally enter prices to track estimated spend.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={copyGroceryText}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 self-start sm:self-auto"
                  >
                    <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{copiedGrocery ? 'Copied List' : 'Copy Shopping List'}</span>
                  </button>
                </div>

                {groupedGrocery.length === 0 ? (
                  <div className="py-10 text-center text-sm text-slate-600">
                    All ingredients for this meal plan are already covered by your confirmed pantry
                    inventory.
                  </div>
                ) : (
                  <div className="mt-6 space-y-6">
                    {groupedGrocery.map((group) => (
                      <div key={group.category}>
                        <h4 className="font-display text-sm font-semibold text-slate-900 pb-2 border-b border-slate-200">
                          {group.category} ({group.items.length})
                        </h4>
                        <div className="divide-y divide-slate-100">
                          {group.items.map((item) => {
                            const rowKey = `${item.ingredient}__${item.unit}`;
                            const pKey = makePriceKey(item.ingredient, item.unit);
                            const isChecked = Boolean(checkedGrocery[rowKey]);
                            const priceVal =
                              priceDrafts[pKey] !== undefined
                                ? priceDrafts[pKey]
                                : item.estimated_price !== null &&
                                    item.estimated_price !== undefined
                                  ? String(item.estimated_price)
                                  : '';

                            return (
                              <div
                                key={rowKey}
                                className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                              >
                                <label className="flex items-start gap-3 cursor-pointer flex-1 min-w-0">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={(e) =>
                                      setCheckedGrocery((prev) => ({
                                        ...prev,
                                        [rowKey]: e.target.checked,
                                      }))
                                    }
                                    className="mt-1 w-4 h-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-700"
                                  />
                                  <div className={isChecked ? 'line-through text-slate-400' : ''}>
                                    <p className="text-sm font-medium text-slate-900">
                                      {item.ingredient}
                                    </p>
                                    <p className="text-xs text-slate-500 tabular-nums">
                                      Need {item.required_quantity} {item.unit} · In pantry:{' '}
                                      {item.available_quantity} {item.unit} · Used in:{' '}
                                      {item.used_in_recipes.join(', ')}
                                    </p>
                                  </div>
                                </label>

                                <div className="flex items-center gap-4 shrink-0 pl-7 sm:pl-0">
                                  <span className="font-mono text-sm font-semibold text-emerald-800 tabular-nums">
                                    Buy {item.purchase_quantity} {item.unit}
                                  </span>
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-xs text-slate-400">
                                      {plan.planning_summary.currency}
                                    </span>
                                    <input
                                      type="number"
                                      min={0}
                                      step="0.10"
                                      placeholder="Price"
                                      value={priceVal}
                                      onChange={(e) =>
                                        setPriceDrafts((prev) => ({
                                          ...prev,
                                          [pKey]: e.target.value,
                                        }))
                                      }
                                      onBlur={() => {
                                        const raw = priceDrafts[pKey];
                                        if (raw === undefined) return;
                                        const num = raw.trim() === '' ? null : Number(raw);
                                        if (num !== null && Number.isNaN(num)) return;
                                        handleRecalculate({
                                          action: 'update_prices',
                                          priceUpdates: { [pKey]: num },
                                        });
                                      }}
                                      aria-label={`Estimated price for ${item.ingredient}`}
                                      className="w-20 px-2 py-1 rounded border border-slate-200 text-xs font-mono tabular-nums text-slate-800 focus:outline-none focus:border-emerald-700"
                                    />
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Pantry Utilisation & Food Waste Reduction Summary */}
              <section className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
                <div>
                  <h3 className="font-display text-base font-semibold text-slate-900">
                    Pantry Utilisation & Food Waste Reduction
                  </h3>
                  {plan.pantry_utilisation.estimated_food_waste_reduction && (
                    <p className="text-sm text-emerald-800 mt-1">
                      {plan.pantry_utilisation.estimated_food_waste_reduction}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2 text-sm">
                  <div>
                    <p className="text-xs font-semibold text-slate-700 mb-2">
                      Pantry Stock Allocated ({plan.pantry_utilisation.ingredients_used.length})
                    </p>
                    <ul className="space-y-1 text-xs text-slate-700">
                      {plan.pantry_utilisation.ingredients_used.map((u) => (
                        <li key={u.name} className="flex justify-between gap-2 tabular-nums">
                          <span>{u.name}</span>
                          <span className="font-mono text-slate-500">
                            {u.quantity_used} / {u.available_quantity} {u.unit}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-slate-700 mb-2">
                      Expiring / Priority Items Used (
                      {plan.pantry_utilisation.ingredients_prioritised.length})
                    </p>
                    <p className="text-xs text-slate-600">
                      {plan.pantry_utilisation.ingredients_prioritised.length > 0
                        ? plan.pantry_utilisation.ingredients_prioritised.join(' · ')
                        : 'None required priority rescue'}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-slate-700 mb-2">
                      Remaining Unused Pantry (
                      {plan.pantry_utilisation.ingredients_not_used.length})
                    </p>
                    <p className="text-xs text-slate-600">
                      {plan.pantry_utilisation.ingredients_not_used.length > 0
                        ? plan.pantry_utilisation.ingredients_not_used.join(' · ')
                        : 'All confirmed pantry items utilised'}
                    </p>
                  </div>
                </div>
              </section>
            </div>
          )}

          {/* TAB 3: STRUCTURED JSON OUTPUT */}
          {activeTab === 'json' && (
            <section className="bg-slate-900 text-slate-100 rounded-xl border border-slate-800 p-5">
              <div className="flex items-center justify-between gap-4 pb-3 border-b border-slate-800">
                <div>
                  <h3 className="font-display text-sm font-semibold text-white">
                    Structured Meal Plan JSON Output
                  </h3>
                  <p className="text-xs text-slate-400">
                    Validated machine-readable schema containing daily plans, recipes, grocery
                    list, pantry utilisation, and nutritional summaries.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={copyPlanJson}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{copiedJson ? 'Copied' : 'Copy JSON'}</span>
                </button>
              </div>
              <pre className="mt-3 max-h-[560px] overflow-auto text-xs font-mono text-emerald-300 leading-relaxed">
                {JSON.stringify(mealPlanState?.output, null, 2)}
              </pre>
            </section>
          )}
        </div>
      )}

      {/* Replace Individual Meal Modal */}
      {replaceTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Replace meal"
          className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-xl border border-slate-200 max-w-md w-full overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-slate-900">
                Replace Day {replaceTarget.day} {replaceTarget.meal.meal_type}
              </h3>
              <button
                type="button"
                onClick={() => setReplaceTarget(null)}
                className="text-slate-500 hover:text-slate-800"
                aria-label="Close replace modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleReplaceSubmit} className="p-5 space-y-4">
              <p className="text-xs text-slate-600">
                Replacing <strong>{replaceTarget.meal.recipe_name}</strong>. Household allergies,
                dietary restrictions, and cooking equipment remain strictly enforced.
              </p>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Swap Cuisine (Optional)
                </label>
                <select
                  value={replaceCuisine}
                  onChange={(e) => setReplaceCuisine(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:border-emerald-700"
                >
                  <option value="">Any suitable cuisine</option>
                  {CUISINE_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Max Preparation + Cooking Time (minutes)
                </label>
                <input
                  type="number"
                  min={10}
                  max={180}
                  value={replaceMaxMinutes}
                  onChange={(e) => setReplaceMaxMinutes(Number(e.target.value) || 30)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono tabular-nums focus:outline-none focus:border-emerald-700"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Exclude Ingredient (Optional)
                </label>
                <input
                  type="text"
                  value={replaceExclude}
                  onChange={(e) => setReplaceExclude(e.target.value)}
                  placeholder="e.g. Pasta, bell pepper"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:border-emerald-700"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Preference Note (Optional)
                </label>
                <input
                  type="text"
                  value={replaceNote}
                  onChange={(e) => setReplaceNote(e.target.value)}
                  placeholder="e.g. Soup-based or extra quick"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:border-emerald-700"
                />
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setReplaceTarget(null)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={replacingMeal}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-700 text-white text-sm font-medium hover:bg-emerald-800 disabled:opacity-60"
                >
                  {replacingMeal && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{replacingMeal ? 'Replacing...' : 'Generate Alternative'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Additional Meal Modal */}
      {addTargetDay !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Add additional meal"
          className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-xl border border-slate-200 max-w-md w-full overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-slate-900">
                Add Meal to Day {addTargetDay}
              </h3>
              <button
                type="button"
                onClick={() => setAddTargetDay(null)}
                className="text-slate-500 hover:text-slate-800"
                aria-label="Close add meal modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddMealSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Meal Type</label>
                <select
                  value={addMealType}
                  onChange={(e) => setAddMealType(e.target.value as MealCategoryType)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:border-emerald-700"
                >
                  {MEAL_TYPE_OPTIONS.map((mt) => (
                    <option key={mt} value={mt}>
                      {mt}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Meal Idea or Request (Optional)
                </label>
                <input
                  type="text"
                  value={addMealNote}
                  onChange={(e) => setAddMealNote(e.target.value)}
                  placeholder="e.g. Fruit & oat snack using ripe bananas"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:border-emerald-700"
                />
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setAddTargetDay(null)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingMeal}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-700 text-white text-sm font-medium hover:bg-emerald-800 disabled:opacity-60"
                >
                  {addingMeal && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{addingMeal ? 'Adding...' : 'Add to Day'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

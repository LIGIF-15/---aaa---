import { GoogleGenAI, Type } from '@google/genai';
import type {
  DailyMealPlan,
  FamilyProfile,
  GroceryCategory,
  GroceryListItem,
  MealCategoryType,
  MealDifficulty,
  MealPlanDocument,
  MealPlanOutput,
  MealPlanPreferences,
  PantryIntelligenceClass,
  PantryItem,
  PlannedMeal,
  RecipeIngredientLine,
} from '../src/types/pantry';

export interface AnalysedPantryEntry {
  id: string;
  name: string;
  normalizedName: string;
  intelligenceClass: PantryIntelligenceClass;
  originalCategory: string;
  quantityValue: number;
  unit: string;
  quantityEstimated: boolean;
  storageLocation: string;
  freshnessStatus: string;
  condition: string;
  expiryDate: string | null;
  expiryType: string | null;
  daysUntilExpiry: number | null;
  priorityTier: 1 | 2 | 3 | 4 | 5;
  priorityReason: string;
}

export interface Stage1AnalysisResult {
  todayIso: string;
  usablePantry: AnalysedPantryEntry[];
  excludedItems: { name: string; reason: string }[];
  warnings: string[];
  assumptions: string[];
  resolvedProfile: {
    householdSizeCount: number;
    typicalServings: number;
    dietaryPreferences: string[];
    healthGoals: string[];
    allergies: string[];
    crossContaminationStrict: boolean;
    crossContaminationNotes: string;
    favoriteFoods: string[];
    dislikedIngredients: string[];
    preferredCuisines: string[];
    spiceTolerance: string;
    cookingEquipment: string[];
    additionalNotes: string;
  };
  resolvedPreferences: MealPlanPreferences;
}

export const DEFAULT_MEAL_PLAN_PREFERENCES: MealPlanPreferences = {
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

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(
      /\b(fresh|organic|raw|whole|sliced|chopped|diced|minced|grated|large|small|medium|extra|virgin|bag of|carton of|jar of|can of|bottle of|box of|bunch of)\b/g,
      ''
    )
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/s\b/, '');
}

function daysBetween(todayIso: string, targetIso: string): number | null {
  const t0 = new Date(`${todayIso}T00:00:00`);
  const t1 = new Date(`${targetIso}T00:00:00`);
  if (Number.isNaN(t0.getTime()) || Number.isNaN(t1.getTime())) return null;
  return Math.round((t1.getTime() - t0.getTime()) / (1000 * 60 * 60 * 24));
}

function classifyPantryIntelligence(item: PantryItem): PantryIntelligenceClass {
  const cat = item.category.toLowerCase();
  const n = item.name.toLowerCase();

  if (item.storageLocation === 'Freezer' || cat.includes('frozen')) {
    return 'Frozen food';
  }
  if (
    n.includes('bean') ||
    n.includes('lentil') ||
    n.includes('chickpea') ||
    n.includes('tofu') ||
    n.includes('tempeh') ||
    n.includes('edamame')
  ) {
    return 'Legumes and beans';
  }
  if (cat.includes('canned') || cat.includes('jarred')) {
    return 'Canned and preserved food';
  }
  if (cat.includes('vegetable')) return 'Fresh vegetables';
  if (cat.includes('fruit')) return 'Fresh fruits';
  if (cat.includes('meat') || cat.includes('poultry')) return 'Meat and poultry';
  if (cat.includes('seafood')) return 'Seafood';
  if (cat.includes('dairy') || cat.includes('egg')) return 'Eggs and dairy';
  if (cat.includes('grain') || cat.includes('pasta') || cat.includes('bakery')) {
    return 'Grains and carbohydrates';
  }
  if (cat.includes('oil') || cat.includes('condiment') || cat.includes('herb') || cat.includes('spice')) {
    return 'Condiments, herbs and spices';
  }
  return 'Other cooking ingredients';
}

export function mapToGroceryCategory(rawCategory?: string, ingredientName?: string): GroceryCategory {
  const c = (rawCategory || '').toLowerCase();
  const n = (ingredientName || '').toLowerCase();

  if (
    c.includes('vegetable') ||
    c.includes('fruit') ||
    c.includes('produce') ||
    /\b(spinach|broccoli|tomato|onion|garlic|carrot|lemon|lime|banana|avocado|cilantro|parsley|pepper|mushroom|lettuce|kale|zucchini|apple|berry|ginger|scallion)\b/.test(n)
  ) {
    return 'Vegetables and fruits';
  }
  if (
    c.includes('meat') ||
    c.includes('poultry') ||
    /\b(chicken|beef|pork|turkey|lamb|duck|sausage)\b/.test(n)
  ) {
    return 'Meat and poultry';
  }
  if (
    c.includes('seafood') ||
    c.includes('fish') ||
    /\b(salmon|tuna|shrimp|prawn|cod|tilapia|mackerel|fish|crab|squid)\b/.test(n)
  ) {
    return 'Seafood';
  }
  if (
    c.includes('dairy') ||
    c.includes('egg') ||
    /\b(milk|cheese|cheddar|mozzarella|parmesan|yogurt|butter|cream|egg)\b/.test(n)
  ) {
    return 'Dairy and eggs';
  }
  if (
    c.includes('frozen') ||
    /\b(frozen)\b/.test(n)
  ) {
    return 'Frozen products';
  }
  if (
    c.includes('grain') ||
    c.includes('pasta') ||
    c.includes('bakery') ||
    c.includes('legume') ||
    c.includes('canned') ||
    c.includes('dry') ||
    c.includes('nut') ||
    /\b(rice|oat|pasta|penne|spaghetti|noodle|bread|flour|quinoa|lentil|bean|chickpea|tofu|almond|seed|canned)\b/.test(n)
  ) {
    return 'Grains and dry goods';
  }
  if (
    c.includes('condiment') ||
    c.includes('oil') ||
    c.includes('herb') ||
    c.includes('spice') ||
    c.includes('seasoning') ||
    /\b(oil|vinegar|sauce|salt|pepper|cumin|paprika|oregano|basil|thyme|honey|mustard|broth|stock)\b/.test(n)
  ) {
    return 'Condiments and seasonings';
  }
  return 'Other items';
}

// ============================================================================
// STAGE 1: ANALYSE HOUSEHOLD PROFILE, CONFIRMED PANTRY & USER PREFERENCES
// ============================================================================
export function analyseHouseholdAndPantry(
  profile: FamilyProfile,
  pantryItems: PantryItem[],
  prefsInput?: Partial<MealPlanPreferences>
): Stage1AnalysisResult {
  const todayIso = new Date().toISOString().slice(0, 10);
  const warnings: string[] = [];
  const assumptions: string[] = [];
  const excludedItems: { name: string; reason: string }[] = [];

  const resolvedPreferences: MealPlanPreferences = {
    ...DEFAULT_MEAL_PLAN_PREFERENCES,
    ...(prefsInput || {}),
    mealTypes:
      prefsInput?.mealTypes && prefsInput.mealTypes.length > 0
        ? prefsInput.mealTypes
        : DEFAULT_MEAL_PLAN_PREFERENCES.mealTypes,
    cuisinePreferences:
      prefsInput?.cuisinePreferences && prefsInput.cuisinePreferences.length > 0
        ? prefsInput.cuisinePreferences
        : profile.preferredCuisines || [],
    preferLeftovers:
      prefsInput?.preferLeftovers !== undefined
        ? prefsInput.preferLeftovers
        : profile.householdSize.batchCookingPreferred,
  };

  // Profile safety & sensible defaults check
  const householdSizeCount = Math.max(
    1,
    (profile.householdSize.adults || 0) + (profile.householdSize.children || 0)
  );
  const typicalServings = Math.max(1, profile.householdSize.typicalServings || householdSizeCount);

  let equipment = [...(profile.cookingEquipment || [])];
  if (equipment.length === 0) {
    equipment = ['Stovetop'];
    assumptions.push(
      'No cooking equipment was listed in the Family Profile; defaulted conservatively to Stovetop only.'
    );
  }

  if (!profile.allergies || profile.allergies.length === 0) {
    assumptions.push(
      'No food allergies were recorded in the Family Profile. Confirm in Family Profile if any household member has allergies or intolerances.'
    );
  }

  if (!profile.dietaryPreferences || profile.dietaryPreferences.length === 0) {
    assumptions.push('No specific dietary restriction listed; defaulted to Balanced.');
  }

  const usablePantry: AnalysedPantryEntry[] = [];

  for (const item of pantryItems) {
    // Rule: Use confirmed inventory rather than unverified AI recognition results
    if (item.verificationRequired) {
      excludedItems.push({
        name: item.name,
        reason: 'Pending user verification (excluded from automatic planning until confirmed)',
      });
      continue;
    }

    // Rule: Do not recommend spoiled or potentially unsafe ingredients
    if (item.freshness.status === 'Inspect Carefully' || item.freshness.status === 'Uncertain') {
      excludedItems.push({
        name: item.name,
        reason: `Freshness flagged as "${item.freshness.status}" — inspect manually before use`,
      });
      continue;
    }

    const daysUntil = item.expiry.date ? daysBetween(todayIso, item.expiry.date) : null;
    const dateType = item.expiry.dateType;

    // Rule: Do not recommend consuming food past a safety-related Use By / Expiry date
    if (daysUntil !== null && daysUntil < 0) {
      if (dateType === 'Use By' || dateType === 'Expiry' || !dateType) {
        excludedItems.push({
          name: item.name,
          reason: `Past ${dateType || 'expiry'} date (${item.expiry.date}) — excluded for food safety`,
        });
        continue;
      }
      // Best Before past date: flag for manual check rather than auto-using
      excludedItems.push({
        name: item.name,
        reason: `Past Best Before date (${item.expiry.date}) — check quality manually before consuming`,
      });
      continue;
    }

    const intelligenceClass = classifyPantryIntelligence(item);
    const condLower = (item.condition || '').toLowerCase();

    let priorityTier: 1 | 2 | 3 | 4 | 5 = 4;
    let priorityReason = 'Standard shelf or refrigerator storage life';

    if (daysUntil !== null && daysUntil <= 7) {
      priorityTier = 1;
      priorityReason =
        dateType === 'Best Before'
          ? `Approaching Best Before date (${item.expiry.date}, ${daysUntil}d)`
          : `Approaching ${dateType || 'expiry'} date (${item.expiry.date}, ${daysUntil}d)`;
    } else if (
      item.freshness.status === 'Use Soon' ||
      condLower.includes('ripen') ||
      condLower.includes('wilt') ||
      condLower.includes('bruis') ||
      intelligenceClass === 'Fresh vegetables' ||
      intelligenceClass === 'Fresh fruits'
    ) {
      priorityTier = item.freshness.status === 'Use Soon' ? 2 : 3;
      priorityReason =
        item.freshness.status === 'Use Soon'
          ? 'Produce flagged as Use Soon / ripening'
          : 'Fresh produce with shorter shelf life';
    } else if (condLower.includes('open')) {
      priorityTier = 3;
      priorityReason = 'Opened item with limited remaining shelf life';
    } else if (
      intelligenceClass === 'Frozen food' ||
      intelligenceClass === 'Canned and preserved food' ||
      intelligenceClass === 'Grains and carbohydrates' ||
      intelligenceClass === 'Condiments, herbs and spices'
    ) {
      priorityTier = 5;
      priorityReason = 'Frozen or shelf-stable ingredient';
    }

    usablePantry.push({
      id: item.id,
      name: item.name,
      normalizedName: item.normalizedName || normalizeName(item.name),
      intelligenceClass,
      originalCategory: item.category,
      quantityValue: item.quantity.value,
      unit: item.quantity.unit,
      quantityEstimated: item.quantity.estimated,
      storageLocation: item.storageLocation,
      freshnessStatus: item.freshness.status,
      condition: item.condition,
      expiryDate: item.expiry.date,
      expiryType: item.expiry.dateType,
      daysUntilExpiry: daysUntil,
      priorityTier,
      priorityReason,
    });
  }

  usablePantry.sort((a, b) => a.priorityTier - b.priorityTier);

  if (excludedItems.length > 0) {
    warnings.push(
      `${excludedItems.length} pantry item(s) were excluded from automatic planning for safety or verification: ${excludedItems
        .map((e) => `${e.name} (${e.reason})`)
        .join('; ')}.`
    );
  }

  if (usablePantry.some((u) => u.quantityEstimated)) {
    assumptions.push(
      'Some confirmed pantry quantities are marked as AI-estimated; verify exact stock before shopping.'
    );
  }

  return {
    todayIso,
    usablePantry,
    excludedItems,
    warnings,
    assumptions,
    resolvedProfile: {
      householdSizeCount,
      typicalServings,
      dietaryPreferences:
        profile.dietaryPreferences.length > 0 ? profile.dietaryPreferences : ['Balanced'],
      healthGoals:
        resolvedPreferences.nutritionGoalsOverride.length > 0
          ? resolvedPreferences.nutritionGoalsOverride
          : profile.healthGoals.length > 0
            ? profile.healthGoals
            : ['Balanced nutrition'],
      allergies: profile.allergies || [],
      crossContaminationStrict: Boolean(profile.crossContaminationStrict),
      crossContaminationNotes: profile.crossContaminationNotes || '',
      favoriteFoods: profile.favoriteFoods || [],
      dislikedIngredients: [
        ...(profile.dislikedIngredients || []),
        ...(resolvedPreferences.excludedIngredients || []),
      ],
      preferredCuisines: profile.preferredCuisines || [],
      spiceTolerance: profile.spiceTolerance || 'Medium',
      cookingEquipment: equipment,
      additionalNotes: profile.additionalNotes || '',
    },
    resolvedPreferences,
  };
}

// ============================================================================
// STAGE 2: GEMINI INTELLIGENT MEAL & RECIPE GENERATION
// ============================================================================
const RECIPE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    meal_type: { type: Type.STRING },
    recipe_id: { type: Type.STRING },
    recipe_name: { type: Type.STRING },
    description: { type: Type.STRING },
    cuisine: { type: Type.STRING },
    servings: { type: Type.INTEGER },
    preparation_time_minutes: { type: Type.INTEGER },
    cooking_time_minutes: { type: Type.INTEGER },
    difficulty: { type: Type.STRING, enum: ['Easy', 'Intermediate', 'Advanced'] },
    equipment_used: { type: Type.ARRAY, items: { type: Type.STRING } },
    leftover_note: { type: Type.STRING, nullable: true },
    allergen_safety_check: { type: Type.STRING },
    ingredients: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          category: { type: Type.STRING },
          quantity: { type: Type.NUMBER },
          unit: { type: Type.STRING },
          pantry_available: { type: Type.BOOLEAN },
          pantry_quantity_used: { type: Type.NUMBER },
          additional_quantity_required: { type: Type.NUMBER },
        },
        required: [
          'name',
          'category',
          'quantity',
          'unit',
          'pantry_available',
          'pantry_quantity_used',
          'additional_quantity_required',
        ],
      },
    },
    instructions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          step: { type: Type.INTEGER },
          description: { type: Type.STRING },
          method: { type: Type.STRING, nullable: true },
          temperature: { type: Type.STRING, nullable: true },
          duration_minutes: { type: Type.INTEGER, nullable: true },
          tip: { type: Type.STRING, nullable: true },
        },
        required: ['step', 'description'],
      },
    },
    nutrition_per_serving: {
      type: Type.OBJECT,
      properties: {
        calories_kcal: { type: Type.NUMBER, nullable: true },
        protein_g: { type: Type.NUMBER, nullable: true },
        carbohydrates_g: { type: Type.NUMBER, nullable: true },
        fat_g: { type: Type.NUMBER, nullable: true },
        saturated_fat_g: { type: Type.NUMBER, nullable: true },
        fibre_g: { type: Type.NUMBER, nullable: true },
        sodium_mg: { type: Type.NUMBER, nullable: true },
      },
      required: [
        'calories_kcal',
        'protein_g',
        'carbohydrates_g',
        'fat_g',
        'saturated_fat_g',
        'fibre_g',
        'sodium_mg',
      ],
    },
    substitutions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          original_ingredient: { type: Type.STRING },
          alternative: { type: Type.STRING },
          reason: { type: Type.STRING },
        },
        required: ['original_ingredient', 'alternative', 'reason'],
      },
    },
    pantry_items_prioritised: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
  },
  required: [
    'meal_type',
    'recipe_id',
    'recipe_name',
    'description',
    'cuisine',
    'servings',
    'preparation_time_minutes',
    'cooking_time_minutes',
    'difficulty',
    'equipment_used',
    'allergen_safety_check',
    'ingredients',
    'instructions',
    'nutrition_per_serving',
    'substitutions',
    'pantry_items_prioritised',
  ],
};

function buildPromptContext(stage1: Stage1AnalysisResult): string {
  const { resolvedProfile: rp, resolvedPreferences: pref, usablePantry, todayIso } = stage1;

  return `
TODAY'S DATE: ${todayIso}

FAMILY PROFILE (HARD CONSTRAINTS):
- Household Size: ${rp.householdSizeCount} members | Default Servings per Meal: ${rp.typicalServings}
- Dietary Preferences & Restrictions: ${rp.dietaryPreferences.join(', ')}
- Nutrition & Health Goals: ${rp.healthGoals.join(', ')}
- FOOD ALLERGIES & INTOLERANCES (STRICTLY ZERO TOLERANCE): ${rp.allergies.length > 0 ? rp.allergies.join(', ') : 'None listed'}
- Cross-Contamination Strict Mode: ${rp.crossContaminationStrict ? `YES — ${rp.crossContaminationNotes || 'Avoid shared-equipment sauces/condiments and note safe surface prep'}` : 'No'}
- Disliked / Excluded Ingredients (DO NOT USE): ${rp.dislikedIngredients.length > 0 ? rp.dislikedIngredients.join(', ') : 'None'}
- Favourite Foods: ${rp.favoriteFoods.length > 0 ? rp.favoriteFoods.join(', ') : 'None listed'}
- Spice Tolerance: ${rp.spiceTolerance}
- Available Cooking Equipment (ONLY use equipment from this list): ${rp.cookingEquipment.join(', ')}
- Additional Notes: ${rp.additionalNotes || 'None'}

MEAL PLANNING PREFERENCES:
- Duration: ${pref.durationDays} day(s)
- Selected Meal Categories per Day: ${pref.mealTypes.join(', ')}
- Preferred Cuisines: ${pref.cuisinePreferences.length > 0 ? pref.cuisinePreferences.join(', ') : 'Varied'}
- Maximum Cooking + Prep Time per Meal: ${pref.maxCookingTimeMinutes} minutes
- Difficulty Preference: ${pref.difficulty}
- Budget Guidance: ${pref.budgetAmount ? `${pref.currency} ${pref.budgetAmount} (${pref.budgetPeriod})` : 'Not specified — minimise unnecessary purchases'}
- Meals Cooked at Home Limit: ${pref.mealsCookedAtHome ?? 'All selected meals'}
- Prefer Leftovers / Batch Cooking: ${pref.preferLeftovers ? 'Yes — suggest practical batch prep or leftover repurposing where helpful' : 'No'}
- Allow New Grocery Ingredients: ${pref.allowNewIngredients ? 'Yes — keep additional items practical and minimal' : 'Minimize new purchases strictly; rely heavily on pantry'}
- Custom Request: ${pref.customNote || 'None'}

CONFIRMED PANTRY INVENTORY (SORTED BY EXPIRY & FRESHNESS PRIORITY TIER 1 -> 5):
${JSON.stringify(
  usablePantry.map((u) => ({
    name: u.name,
    class: u.intelligenceClass,
    quantity: u.quantityValue,
    unit: u.unit,
    storageLocation: u.storageLocation,
    freshness: u.freshnessStatus,
    expiryDate: u.expiryDate,
    expiryType: u.expiryType,
    priorityTier: u.priorityTier,
    priorityReason: u.priorityReason,
  })),
  null,
  2
)}
`.trim();
}

export async function generateMealPlanWithGemini(
  ai: GoogleGenAI,
  stage1: Stage1AnalysisResult
): Promise<{
  pantry_utilisation_strategy: string;
  daily_plans: { day: number; meals: PlannedMeal[] }[];
  assumptions: string[];
}> {
  const { resolvedPreferences: pref, resolvedProfile: rp } = stage1;
  const context = buildPromptContext(stage1);

  const systemInstruction = [
    'You are an evidence-informed household meal planning chef and nutrition analyst.',
    'Return ONLY valid JSON matching the exact schema.',
    'CRITICAL RULES:',
    '1. ALLERGIES & DIETARY RULES: Never include any ingredient, condiment, or hidden derivative matching the household allergies, dietary restrictions, or disliked/excluded ingredients. Check sauces (e.g., soy sauce contains wheat/soy; oyster sauce contains shellfish; pesto contains nuts/dairy).',
    '2. PANTRY UTILISATION: Prioritise Tier 1 and Tier 2 ingredients (approaching expiry/best-before or ripening produce) into sensible, genuinely appetising recipes. Use exact pantry ingredient names when drawing from pantry stock, and specify numeric quantities and standard units (g, ml, tbsp, tsp, cup, item, clove, slice, etc.).',
    '3. EQUIPMENT & TIME: Only use cooking equipment explicitly listed in Available Cooking Equipment. Respect the maximum preparation + cooking time per meal.',
    '4. VARIETY: Across the planning days, rotate protein sources, vegetables, cuisines, and cooking methods. Never repeat the exact same meal unless explicitly marked as planned leftovers.',
    '5. COMPLETE RECIPES: Every meal must have numeric ingredient quantities, sequential cooking instructions with method/temperature/duration/tip, estimated nutrition_per_serving (realistic estimates based on ingredient quantities), and allergy-safe substitutions.',
    '6. NUTRITION ALIGNMENT: Align meals with the stated health goals (e.g., Cholesterol-Conscious -> soluble fibre like oats/beans, unsaturated fats; Weight Management -> vegetable-rich, balanced energy; Higher Protein -> solid protein per main meal; Higher Fibre -> whole grains, legumes, veg/fruit).',
  ].join('\n');

  const prompt = `
${context}

Generate a complete ${pref.durationDays}-day meal plan.
For EACH day from Day 1 to Day ${pref.durationDays}, include ONLY these meal types: ${pref.mealTypes.join(', ')}.
Set servings to ${rp.typicalServings} for every meal.
Assign unique sequential recipe_id values (REC001, REC002, ...).
`;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          pantry_utilisation_strategy: { type: Type.STRING },
          daily_plans: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                day: { type: Type.INTEGER },
                meals: {
                  type: Type.ARRAY,
                  items: RECIPE_SCHEMA,
                },
              },
              required: ['day', 'meals'],
            },
          },
          assumptions: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
        },
        required: ['pantry_utilisation_strategy', 'daily_plans', 'assumptions'],
      },
    },
  });

  const parsed = JSON.parse((response.text ?? '{}').trim()) as {
    pantry_utilisation_strategy?: string;
    daily_plans?: { day: number; meals: PlannedMeal[] }[];
    assumptions?: string[];
  };

  return {
    pantry_utilisation_strategy:
      parsed.pantry_utilisation_strategy || 'Prioritise ingredients approaching expiry and minimise waste',
    daily_plans: Array.isArray(parsed.daily_plans) ? parsed.daily_plans : [],
    assumptions: Array.isArray(parsed.assumptions) ? parsed.assumptions : [],
  };
}

export async function generateSingleReplacementMealWithGemini(
  ai: GoogleGenAI,
  stage1: Stage1AnalysisResult,
  params: {
    day: number;
    mealType: MealCategoryType | string;
    currentRecipeName?: string;
    swapCuisine?: string;
    maxMinutes?: number;
    servings?: number;
    excludeIngredient?: string;
    customInstruction?: string;
    existingMealNames: string[];
    recipeId: string;
  }
): Promise<PlannedMeal> {
  const context = buildPromptContext(stage1);
  const targetServings = params.servings || stage1.resolvedProfile.typicalServings;
  const maxTime = params.maxMinutes || stage1.resolvedPreferences.maxCookingTimeMinutes;

  const prompt = `
${context}

TASK: Generate ONE replacement/new recipe for Day ${params.day}, Meal Type "${params.mealType}".
- Recipe ID MUST be: "${params.recipeId}"
- Target Servings: ${targetServings}
- Maximum Total Time (prep + cook): ${maxTime} minutes
${params.currentRecipeName ? `- Replace existing recipe "${params.currentRecipeName}" with a noticeably different alternative.` : ''}
${params.swapCuisine ? `- Preferred Cuisine for this replacement: ${params.swapCuisine}` : ''}
${params.excludeIngredient ? `- MUST EXCLUDE this ingredient: ${params.excludeIngredient}` : ''}
${params.customInstruction ? `- Additional User Request: ${params.customInstruction}` : ''}
- Avoid duplicating these meals already in the plan: ${params.existingMealNames.join(', ') || 'None'}

Respect ALL household allergies, cross-contamination rules, dietary restrictions, and available cooking equipment strictly.
`;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      systemInstruction:
        'You are a registered culinary meal planner. Generate one complete, safe, pantry-aware replacement recipe matching the JSON schema.',
      responseMimeType: 'application/json',
      responseSchema: RECIPE_SCHEMA,
    },
  });

  const meal = JSON.parse((response.text ?? '{}').trim()) as PlannedMeal;
  meal.recipe_id = params.recipeId;
  meal.meal_type = params.mealType;
  meal.servings = targetServings;
  return meal;
}

// ============================================================================
// STAGE 3: DETERMINISTIC VALIDATION, PANTRY ALLOCATION, NUTRITION & GROCERY
// ============================================================================
const HIDDEN_ALLERGEN_SYNONYMS: Record<string, string[]> = {
  peanuts: ['peanut', 'groundnut', 'satay', 'peanut butter'],
  'tree nuts': ['almond', 'walnut', 'cashew', 'pecan', 'pistachio', 'hazelnut', 'macadamia', 'pine nut', 'pesto'],
  'dairy / lactose': ['milk', 'cheese', 'cheddar', 'mozzarella', 'parmesan', 'butter', 'cream', 'yogurt', 'whey', 'ghee', 'lactose'],
  eggs: ['egg', 'mayonnaise', 'mayo', 'meringue'],
  shellfish: ['shrimp', 'prawn', 'crab', 'lobster', 'clam', 'mussel', 'oyster', 'scallop', 'oyster sauce', 'shrimp paste'],
  fish: ['salmon', 'tuna', 'cod', 'tilapia', 'mackerel', 'anchovy', 'fish sauce', 'worcestershire'],
  'wheat / gluten': ['wheat', 'flour', 'bread', 'pasta', 'penne', 'spaghetti', 'noodle', 'soy sauce', 'couscous', 'barley', 'rye', 'breadcrumbs', 'panko'],
  soy: ['soy', 'tofu', 'tempeh', 'edamame', 'miso', 'tamari', 'soy sauce'],
  sesame: ['sesame', 'tahini', 'sesame oil', 'sesame seed'],
};

function findAllergenConflict(ingredientName: string, allergies: string[]): string | null {
  const ing = ingredientName.toLowerCase();
  for (const allergy of allergies) {
    const key = allergy.toLowerCase().trim();
    const synonyms = HIDDEN_ALLERGEN_SYNONYMS[key] || [key];
    for (const term of synonyms) {
      if (ing.includes(term)) {
        return `${ingredientName} may conflict with allergy "${allergy}"`;
      }
    }
  }
  return null;
}

function convertToCommonUnit(value: number, fromUnit: string, toUnit: string): number | null {
  const f = fromUnit.toLowerCase().trim();
  const t = toUnit.toLowerCase().trim();
  if (f === t || normalizeUnit(f) === normalizeUnit(t)) return value;

  if (f === 'kg' && t === 'g') return value * 1000;
  if (f === 'g' && t === 'kg') return value / 1000;
  if (f === 'l' && t === 'ml') return value * 1000;
  if (f === 'ml' && t === 'l') return value / 1000;
  if (f === 'tbsp' && t === 'tsp') return value * 3;
  if (f === 'tsp' && t === 'tbsp') return value / 3;
  return null;
}

function normalizeUnit(u: string): string {
  const clean = u.toLowerCase().trim().replace(/\.$/, '');
  if (clean === 'grams' || clean === 'gram') return 'g';
  if (clean === 'kilograms' || clean === 'kilogram') return 'kg';
  if (clean === 'milliliters' || clean === 'millilitres' || clean === 'milliliter') return 'ml';
  if (clean === 'liters' || clean === 'litres' || clean === 'liter') return 'l';
  if (clean === 'tablespoons' || clean === 'tablespoon') return 'tbsp';
  if (clean === 'teaspoons' || clean === 'teaspoon') return 'tsp';
  if (clean === 'cups') return 'cup';
  if (clean === 'cloves') return 'clove';
  if (clean === 'slices') return 'slice';
  if (clean === 'pieces' || clean === 'piece' || clean === 'pcs') return 'item';
  if (clean === 'items' || clean === 'heads' || clean === 'cans' || clean === 'bottles' || clean === 'jars') {
    return clean.replace(/s$/, '');
  }
  return clean;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function validateAndReconcileMealPlan(
  planInput: {
    plan_id?: string;
    pantry_utilisation_strategy: string;
    daily_plans: { day: number; date?: string | null; meals: PlannedMeal[] }[];
    assumptions?: string[];
  },
  stage1: Stage1AnalysisResult,
  existingPriceMap: Record<string, number | null> = {}
): MealPlanOutput {
  const { resolvedProfile: rp, resolvedPreferences: pref, usablePantry, todayIso } = stage1;
  const warnings: string[] = [...stage1.warnings];
  const assumptions: string[] = Array.from(
    new Set([...stage1.assumptions, ...(planInput.assumptions || [])])
  );

  // Build mutable remaining pantry tracker so we NEVER double-allocate stock
  const pantryPool = usablePantry.map((p) => ({
    ...p,
    remaining: p.quantityValue,
    totalUsed: 0,
  }));

  const groceryBuckets = new Map<
    string,
    {
      ingredient: string;
      category: GroceryCategory;
      required_quantity: number;
      available_quantity: number;
      purchase_quantity: number;
      unit: string;
      used_in_recipes: Set<string>;
    }
  >();

  let recipeCounter = 1;
  const seenRecipeIds = new Set<string>();
  const startDate = new Date(`${todayIso}T00:00:00`);

  const reconciledDays: DailyMealPlan[] = (planInput.daily_plans || []).map((dayObj, dIdx) => {
    const dayNum = dayObj.day || dIdx + 1;
    const dDate = new Date(startDate);
    dDate.setDate(startDate.getDate() + (dayNum - 1));
    const dateIso = dayObj.date || dDate.toISOString().slice(0, 10);

    let dayCalories = 0;
    let dayProtein = 0;
    let dayCarbs = 0;
    let dayFat = 0;
    let dayFibre = 0;
    let hasNutritionData = false;

    const reconciledMeals: PlannedMeal[] = (dayObj.meals || []).map((meal) => {
      // Unique recipe ID guarantee
      let recId = meal.recipe_id || `REC${String(recipeCounter).padStart(3, '0')}`;
      while (seenRecipeIds.has(recId)) {
        recipeCounter += 1;
        recId = `REC${String(recipeCounter).padStart(3, '0')}`;
      }
      seenRecipeIds.add(recId);
      recipeCounter += 1;

      // Equipment check
      const allowedEquipLower = new Set(rp.cookingEquipment.map((e) => e.toLowerCase()));
      const equipUsed = Array.isArray(meal.equipment_used) ? meal.equipment_used : ['Stovetop'];
      for (const eq of equipUsed) {
        if (!allowedEquipLower.has(eq.toLowerCase())) {
          warnings.push(
            `${recId} (${meal.recipe_name}) references "${eq}" which is not in your Family Profile cooking equipment.`
          );
        }
      }

      // Prep + cook time check
      const prepMin = Math.max(0, Math.round(meal.preparation_time_minutes || 10));
      const cookMin = Math.max(0, Math.round(meal.cooking_time_minutes || 15));
      if (prepMin + cookMin > pref.maxCookingTimeMinutes + 10) {
        warnings.push(
          `${recId} (${meal.recipe_name}) takes ${prepMin + cookMin} min, exceeding your ${pref.maxCookingTimeMinutes} min preference.`
        );
      }

      const prioritisedUsedInMeal = new Set<string>();

      const reconciledIngredients: RecipeIngredientLine[] = (meal.ingredients || []).map((ing) => {
        const reqQty = Math.max(0, Number(ing.quantity) || 0);
        const reqUnit = (ing.unit || 'item').trim();
        const normIng = normalizeName(ing.name);

        // Allergy & dislike validation
        const allergyHit = findAllergenConflict(ing.name, rp.allergies);
        if (allergyHit) {
          warnings.push(`Safety check (${recId} - ${meal.recipe_name}): ${allergyHit}. Verify or replace this meal.`);
        }
        for (const dis of rp.dislikedIngredients) {
          if (dis && ing.name.toLowerCase().includes(dis.toLowerCase())) {
            warnings.push(
              `Preference check (${recId} - ${meal.recipe_name}): Contains "${ing.name}" which matches disliked/excluded ingredient "${dis}".`
            );
          }
        }

        // Deterministic pantry matching & stock deduction from pool (never mutates live DB!)
        const matchingEntries = pantryPool.filter(
          (p) =>
            p.normalizedName === normIng ||
            (p.normalizedName.length >= 4 && normIng.includes(p.normalizedName)) ||
            (normIng.length >= 4 && p.normalizedName.includes(normIng))
        );

        let pantryUsedInReqUnit = 0;
        let totalKnownAvailableInReqUnit = 0;

        for (const entry of matchingEntries) {
          const convertedAvailable = convertToCommonUnit(entry.quantityValue, entry.unit, reqUnit);
          if (convertedAvailable !== null) {
            totalKnownAvailableInReqUnit += convertedAvailable;
          }

          if (entry.remaining <= 0) continue;

          const neededRemaining = Math.max(0, reqQty - pantryUsedInReqUnit);
          if (neededRemaining <= 0) break;

          const convertedRemaining = convertToCommonUnit(entry.remaining, entry.unit, reqUnit);
          if (convertedRemaining !== null) {
            const takeInReqUnit = Math.min(neededRemaining, convertedRemaining);
            const takeInEntryUnit = convertToCommonUnit(takeInReqUnit, reqUnit, entry.unit);
            if (takeInEntryUnit !== null && takeInReqUnit > 0) {
              entry.remaining = Math.max(0, round2(entry.remaining - takeInEntryUnit));
              entry.totalUsed = round2(entry.totalUsed + takeInEntryUnit);
              pantryUsedInReqUnit = round2(pantryUsedInReqUnit + takeInReqUnit);
              if (entry.priorityTier <= 3) {
                prioritisedUsedInMeal.add(entry.name);
              }
            }
          } else {
            // Incompatible unit (e.g. pantry has "1 carton", recipe asks "200 ml"):
            // Use up to 1 fractional portion conservatively and record assumption
            const approxFraction = Math.min(entry.remaining, 0.5);
            if (approxFraction > 0 && ing.pantry_available) {
              entry.remaining = round2(entry.remaining - approxFraction);
              entry.totalUsed = round2(entry.totalUsed + approxFraction);
              pantryUsedInReqUnit = reqQty;
              totalKnownAvailableInReqUnit = Math.max(totalKnownAvailableInReqUnit, reqQty);
              if (entry.priorityTier <= 3) {
                prioritisedUsedInMeal.add(entry.name);
              }
              assumptions.push(
                `Unit mismatch for "${ing.name}" (${entry.quantityValue} ${entry.unit} in pantry vs ${reqQty} ${reqUnit} in ${recId}); assumed pantry stock covers this requirement.`
              );
            }
          }
        }

        const additionalNeeded = Math.max(0, round2(reqQty - pantryUsedInReqUnit));
        const gCat = mapToGroceryCategory(ing.category, ing.name);

        if (additionalNeeded > 0) {
          const bucketKey = `${normIng}__${normalizeUnit(reqUnit)}`;
          const existing = groceryBuckets.get(bucketKey);
          if (existing) {
            existing.required_quantity = round2(existing.required_quantity + reqQty);
            existing.purchase_quantity = round2(existing.purchase_quantity + additionalNeeded);
            existing.used_in_recipes.add(recId);
          } else {
            groceryBuckets.set(bucketKey, {
              ingredient: ing.name.trim(),
              category: gCat,
              required_quantity: round2(reqQty),
              available_quantity: round2(totalKnownAvailableInReqUnit),
              purchase_quantity: additionalNeeded,
              unit: reqUnit,
              used_in_recipes: new Set([recId]),
            });
          }
        }

        return {
          name: ing.name.trim(),
          category: gCat,
          quantity: round2(reqQty),
          unit: reqUnit,
          pantry_available: pantryUsedInReqUnit > 0,
          pantry_quantity_used: round2(pantryUsedInReqUnit),
          additional_quantity_required: additionalNeeded,
        };
      });

      // Accumulate daily nutrition per serving * wait: daily summary is per-person daily total
      const nut = meal.nutrition_per_serving || {
        calories_kcal: null,
        protein_g: null,
        carbohydrates_g: null,
        fat_g: null,
        saturated_fat_g: null,
        fibre_g: null,
        sodium_mg: null,
      };
      if (typeof nut.calories_kcal === 'number') {
        hasNutritionData = true;
        dayCalories += nut.calories_kcal;
        dayProtein += nut.protein_g || 0;
        dayCarbs += nut.carbohydrates_g || 0;
        dayFat += nut.fat_g || 0;
        dayFibre += nut.fibre_g || 0;
      }

      const validDifficulty: MealDifficulty =
        meal.difficulty === 'Intermediate' || meal.difficulty === 'Advanced'
          ? meal.difficulty
          : 'Easy';

      return {
        meal_type: meal.meal_type || 'Dinner',
        recipe_id: recId,
        recipe_name: meal.recipe_name || 'Planned Meal',
        description: meal.description || '',
        cuisine: meal.cuisine || 'Balanced',
        servings: Math.max(1, Math.round(meal.servings || rp.typicalServings)),
        preparation_time_minutes: prepMin,
        cooking_time_minutes: cookMin,
        difficulty: validDifficulty,
        equipment_used: equipUsed,
        leftover_note: meal.leftover_note || null,
        allergen_safety_check:
          meal.allergen_safety_check ||
          (rp.allergies.length > 0
            ? `Checked against household allergies: ${rp.allergies.join(', ')}`
            : 'No household allergies listed'),
        ingredients: reconciledIngredients,
        instructions: Array.isArray(meal.instructions)
          ? meal.instructions.map((s, idx) => ({
              step: s.step || idx + 1,
              description: s.description,
              method: s.method || null,
              temperature: s.temperature || null,
              duration_minutes: s.duration_minutes ?? null,
              tip: s.tip || null,
            }))
          : [],
        nutrition_per_serving: {
          calories_kcal: nut.calories_kcal !== null ? Math.round(nut.calories_kcal) : null,
          protein_g: nut.protein_g !== null ? round1(nut.protein_g) : null,
          carbohydrates_g: nut.carbohydrates_g !== null ? round1(nut.carbohydrates_g) : null,
          fat_g: nut.fat_g !== null ? round1(nut.fat_g) : null,
          saturated_fat_g: nut.saturated_fat_g !== null ? round1(nut.saturated_fat_g) : null,
          fibre_g: nut.fibre_g !== null ? round1(nut.fibre_g) : null,
          sodium_mg: nut.sodium_mg !== null ? Math.round(nut.sodium_mg) : null,
        },
        substitutions: Array.isArray(meal.substitutions) ? meal.substitutions : [],
        pantry_items_prioritised: Array.from(
          new Set([...(meal.pantry_items_prioritised || []), ...prioritisedUsedInMeal])
        ).filter((name) =>
          pantryPool.some(
            (p) => p.name.toLowerCase() === name.toLowerCase() && p.totalUsed > 0
          )
        ),
      };
    });

    return {
      day: dayNum,
      date: dateIso,
      meals: reconciledMeals,
      daily_nutrition_summary: {
        calories_kcal: hasNutritionData ? Math.round(dayCalories) : null,
        protein_g: hasNutritionData ? round1(dayProtein) : null,
        carbohydrates_g: hasNutritionData ? round1(dayCarbs) : null,
        fat_g: hasNutritionData ? round1(dayFat) : null,
        fibre_g: hasNutritionData ? round1(dayFibre) : null,
      },
    };
  });

  // Build consolidated grocery list sorted by the 8 required categories
  const categoryOrder = new Map<string, number>([
    ['Vegetables and fruits', 1],
    ['Meat and poultry', 2],
    ['Seafood', 3],
    ['Dairy and eggs', 4],
    ['Grains and dry goods', 5],
    ['Frozen products', 6],
    ['Condiments and seasonings', 7],
    ['Other items', 8],
  ]);

  const groceryList: GroceryListItem[] = Array.from(groceryBuckets.values())
    .map((b) => {
      const priceKey = `${normalizeName(b.ingredient)}__${normalizeUnit(b.unit)}`;
      const userPrice = existingPriceMap[priceKey] ?? null;
      return {
        ingredient: b.ingredient,
        category: b.category,
        required_quantity: b.required_quantity,
        available_quantity: b.available_quantity,
        purchase_quantity: b.purchase_quantity,
        unit: b.unit,
        used_in_recipes: Array.from(b.used_in_recipes),
        estimated_price: userPrice,
      };
    })
    .sort((a, b) => {
      const ca = categoryOrder.get(a.category) || 99;
      const cb = categoryOrder.get(b.category) || 99;
      if (ca !== cb) return ca - cb;
      return a.ingredient.localeCompare(b.ingredient);
    });

  // Compute total grocery cost ONLY from user-entered prices (never invent prices!)
  const pricedItems = groceryList.filter(
    (g) => typeof g.estimated_price === 'number' && g.estimated_price >= 0
  );
  const estimatedTotalCost =
    pricedItems.length > 0
      ? round2(pricedItems.reduce((sum, g) => sum + (g.estimated_price || 0), 0))
      : null;

  if (pref.budgetAmount && estimatedTotalCost !== null) {
    const budgetWeekly =
      pref.budgetPeriod === 'daily'
        ? pref.budgetAmount * reconciledDays.length
        : pref.budgetAmount;
    if (estimatedTotalCost > budgetWeekly) {
      warnings.push(
        `Entered grocery prices total ${pref.currency} ${estimatedTotalCost}, exceeding your ${pref.currency} ${budgetWeekly} budget.`
      );
    }
  }

  // Pantry utilisation metrics
  const ingredientsUsed = pantryPool
    .filter((p) => p.totalUsed > 0)
    .map((p) => ({
      name: p.name,
      quantity_used: p.totalUsed,
      unit: p.unit,
      available_quantity: p.quantityValue,
      priority_tier: p.priorityTier,
    }));

  const ingredientsPrioritised = pantryPool
    .filter((p) => p.totalUsed > 0 && p.priorityTier <= 3)
    .map((p) => p.name);

  const ingredientsNotUsed = pantryPool
    .filter((p) => p.totalUsed === 0)
    .map((p) => p.name);

  const wastePct =
    pantryPool.length > 0
      ? Math.round((ingredientsUsed.length / pantryPool.length) * 100)
      : 0;

  // Weekly nutrition averages
  const daysWithCal = reconciledDays.filter(
    (d) => typeof d.daily_nutrition_summary.calories_kcal === 'number'
  );
  const avgCalories =
    daysWithCal.length > 0
      ? Math.round(
          daysWithCal.reduce((s, d) => s + (d.daily_nutrition_summary.calories_kcal || 0), 0) /
            daysWithCal.length
        )
      : null;
  const avgProtein =
    daysWithCal.length > 0
      ? round1(
          daysWithCal.reduce((s, d) => s + (d.daily_nutrition_summary.protein_g || 0), 0) /
            daysWithCal.length
        )
      : null;
  const avgFibre =
    daysWithCal.length > 0
      ? round1(
          daysWithCal.reduce((s, d) => s + (d.daily_nutrition_summary.fibre_g || 0), 0) /
            daysWithCal.length
        )
      : null;

  assumptions.push(
    'All nutritional figures (calories, macronutrients, fibre, sodium) are estimates per serving and are not medical advice.'
  );

  const document: MealPlanDocument = {
    plan_id: planInput.plan_id || `PLAN_${Date.now().toString().slice(-6)}`,
    duration_days: reconciledDays.length,
    household_size: rp.householdSizeCount,
    planning_status: warnings.some((w) => w.startsWith('Safety check')) ? 'warning' : 'completed',
    family_profile_applied: true,
    planning_summary: {
      primary_goals: rp.healthGoals,
      pantry_utilisation_strategy: planInput.pantry_utilisation_strategy,
      estimated_total_grocery_cost: estimatedTotalCost,
      currency: pref.currency || 'SGD',
    },
    daily_plans: reconciledDays,
    grocery_list: groceryList,
    pantry_utilisation: {
      ingredients_used: ingredientsUsed,
      ingredients_prioritised: ingredientsPrioritised,
      ingredients_not_used: ingredientsNotUsed,
      estimated_food_waste_reduction:
        pantryPool.length > 0
          ? `${ingredientsUsed.length} of ${pantryPool.length} confirmed pantry items utilised (${wastePct}% pantry coverage; ${ingredientsPrioritised.length} priority/expiring item(s) rescued)`
          : null,
    },
    weekly_nutrition_summary: {
      average_daily_calories: avgCalories,
      average_daily_protein_g: avgProtein,
      average_daily_fibre_g: avgFibre,
    },
    warnings: Array.from(new Set(warnings)),
    assumptions: Array.from(new Set(assumptions)),
  };

  return { meal_plan: document };
}

export function scaleMealServings(meal: PlannedMeal, nextServings: number): PlannedMeal {
  const safeNext = Math.max(1, Math.round(nextServings));
  const current = Math.max(1, meal.servings || 1);
  if (safeNext === current) return meal;
  const ratio = safeNext / current;

  return {
    ...meal,
    servings: safeNext,
    ingredients: meal.ingredients.map((ing) => ({
      ...ing,
      quantity: round2(ing.quantity * ratio),
    })),
  };
}

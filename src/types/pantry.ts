export enum StorageLocation {
  REFRIGERATOR = 'Refrigerator',
  FREEZER = 'Freezer',
  DRY_PANTRY = 'Dry pantry',
  COUNTERTOP = 'Kitchen countertop',
  FRESH_PRODUCE = 'Fresh produce storage',
}

export const STORAGE_LOCATIONS: StorageLocation[] = [
  StorageLocation.REFRIGERATOR,
  StorageLocation.FREEZER,
  StorageLocation.DRY_PANTRY,
  StorageLocation.COUNTERTOP,
  StorageLocation.FRESH_PRODUCE,
];

export const FOOD_CATEGORIES: string[] = [
  'Vegetables',
  'Fruits',
  'Dairy & Eggs',
  'Meat & Poultry',
  'Seafood',
  'Grains & Pasta',
  'Canned & Jarred',
  'Oils & Condiments',
  'Nuts & Seeds',
  'Bakery',
  'Beverages',
  'Herbs & Spices',
  'Frozen',
  'Other',
];

export const PANTRY_INTELLIGENCE_CLASSES = [
  'Fresh vegetables',
  'Fresh fruits',
  'Meat and poultry',
  'Seafood',
  'Eggs and dairy',
  'Grains and carbohydrates',
  'Legumes and beans',
  'Frozen food',
  'Canned and preserved food',
  'Condiments, herbs and spices',
  'Other cooking ingredients',
] as const;

export type PantryIntelligenceClass = (typeof PANTRY_INTELLIGENCE_CLASSES)[number];

export const GROCERY_CATEGORIES = [
  'Vegetables and fruits',
  'Meat and poultry',
  'Seafood',
  'Dairy and eggs',
  'Grains and dry goods',
  'Frozen products',
  'Condiments and seasonings',
  'Other items',
] as const;

export type GroceryCategory = (typeof GROCERY_CATEGORIES)[number];

export type FoodState = 'raw' | 'cooked' | 'processed' | 'packaged';
export type FreshnessStatus = 'Good' | 'Use Soon' | 'Inspect Carefully' | 'Uncertain';
export type ExpiryDateType = 'Expiry' | 'Best Before' | 'Use By' | 'Sell By';
export type SpiceTolerance = 'None' | 'Mild' | 'Medium' | 'Hot' | 'Extra Hot';

export type MealCategoryType =
  | 'Breakfast'
  | 'Lunch'
  | 'Dinner'
  | 'Morning snack'
  | 'Afternoon snack';

export type MealDifficulty = 'Easy' | 'Intermediate' | 'Advanced';

export interface ScannedIngredient {
  item_id: string;
  name: string;
  category: string;
  food_state: FoodState;
  brand_or_label: string | null;
  quantity: {
    value: number;
    unit: string;
    estimated: boolean;
  };
  storage_location: StorageLocation;
  condition: string;
  freshness: {
    status: FreshnessStatus;
    confidence: number;
    visual_observations: string;
  };
  expiry: {
    date: string | null;
    date_type: ExpiryDateType | null;
    confidence: number | null;
  };
  identification_confidence: number;
  verification_required: boolean;
  bounding_box?: [number, number, number, number] | null;
}

export interface UnidentifiedItem {
  description: string;
  reason: string;
  visual_location?: string | null;
}

export interface ScanResultJSON {
  pantry_inventory: ScannedIngredient[];
  unidentified_items: (UnidentifiedItem | string)[];
  processing_status: 'completed' | 'partial' | 'failed';
}

export interface StagedReviewItem extends ScannedIngredient {
  reviewId: string;
  photoId: string;
  photoName: string;
  thumbnailDataUrl: string | null;
  includeInSave: boolean;
  duplicateMatchId: string | null;
  duplicateAction: 'merge' | 'separate' | 'replace';
}

export interface PantryItem {
  id: string;
  name: string;
  normalizedName: string;
  category: string;
  foodState: FoodState;
  brandOrLabel: string | null;
  quantity: {
    value: number;
    unit: string;
    estimated: boolean;
  };
  storageLocation: StorageLocation;
  condition: string;
  freshness: {
    status: FreshnessStatus;
    confidence: number | null;
    visualObservations: string;
  };
  expiry: {
    date: string | null;
    dateType: ExpiryDateType | null;
    confidence: number | null;
  };
  identificationConfidence: number | null;
  verificationRequired: boolean;
  thumbnailDataUrl: string | null;
  source: 'ai_scan' | 'manual';
  addedAt: string;
  updatedAt: string;
}

export interface FamilyProfile {
  householdName: string;
  dietaryPreferences: string[];
  healthGoals: string[];
  allergies: string[];
  crossContaminationStrict: boolean;
  crossContaminationNotes: string;
  favoriteFoods: string[];
  dislikedIngredients: string[];
  preferredCuisines: string[];
  spiceTolerance: SpiceTolerance;
  householdSize: {
    adults: number;
    children: number;
    typicalServings: number;
    batchCookingPreferred: boolean;
  };
  cookingEquipment: string[];
  additionalNotes: string;
  updatedAt: string;
}

export interface MealPlanPreferences {
  durationDays: 1 | 3 | 5 | 7;
  mealTypes: MealCategoryType[];
  cuisinePreferences: string[];
  maxCookingTimeMinutes: number;
  difficulty: 'Any' | MealDifficulty;
  budgetAmount: number | null;
  budgetPeriod: 'daily' | 'weekly';
  currency: string;
  mealsCookedAtHome: number | null;
  preferLeftovers: boolean;
  allowNewIngredients: boolean;
  excludedIngredients: string[];
  nutritionGoalsOverride: string[];
  customNote: string;
}

export interface RecipeIngredientLine {
  name: string;
  quantity: number;
  unit: string;
  pantry_available: boolean;
  pantry_quantity_used: number;
  additional_quantity_required: number;
  category?: GroceryCategory | string;
}

export interface RecipeInstructionStep {
  step: number;
  description: string;
  method?: string | null;
  temperature?: string | null;
  duration_minutes?: number | null;
  tip?: string | null;
}

export interface NutritionEstimatePerServing {
  calories_kcal: number | null;
  protein_g: number | null;
  carbohydrates_g: number | null;
  fat_g: number | null;
  saturated_fat_g: number | null;
  fibre_g: number | null;
  sodium_mg: number | null;
}

export interface IngredientSubstitution {
  original_ingredient: string;
  alternative: string;
  reason: string;
}

export interface PlannedMeal {
  meal_type: MealCategoryType | string;
  recipe_id: string;
  recipe_name: string;
  description: string;
  cuisine: string;
  servings: number;
  preparation_time_minutes: number;
  cooking_time_minutes: number;
  difficulty: MealDifficulty;
  equipment_used: string[];
  leftover_note: string | null;
  allergen_safety_check: string;
  ingredients: RecipeIngredientLine[];
  instructions: RecipeInstructionStep[];
  nutrition_per_serving: NutritionEstimatePerServing;
  substitutions: IngredientSubstitution[];
  pantry_items_prioritised: string[];
}

export interface DailyNutritionSummary {
  calories_kcal: number | null;
  protein_g: number | null;
  carbohydrates_g: number | null;
  fat_g: number | null;
  fibre_g: number | null;
}

export interface DailyMealPlan {
  day: number;
  date: string | null;
  meals: PlannedMeal[];
  daily_nutrition_summary: DailyNutritionSummary;
}

export interface GroceryListItem {
  ingredient: string;
  category: GroceryCategory | string;
  required_quantity: number;
  available_quantity: number;
  purchase_quantity: number;
  unit: string;
  used_in_recipes: string[];
  estimated_price?: number | null;
}

export interface PantryUtilisationSummary {
  ingredients_used: {
    name: string;
    quantity_used: number;
    unit: string;
    available_quantity: number;
    priority_tier: number;
  }[];
  ingredients_prioritised: string[];
  ingredients_not_used: string[];
  estimated_food_waste_reduction: string | null;
}

export interface MealPlanDocument {
  plan_id: string;
  duration_days: number;
  household_size: number;
  planning_status: 'completed' | 'partial' | 'warning';
  family_profile_applied: boolean;
  planning_summary: {
    primary_goals: string[];
    pantry_utilisation_strategy: string;
    estimated_total_grocery_cost: number | null;
    currency: string;
  };
  daily_plans: DailyMealPlan[];
  grocery_list: GroceryListItem[];
  pantry_utilisation: PantryUtilisationSummary;
  weekly_nutrition_summary: {
    average_daily_calories: number | null;
    average_daily_protein_g: number | null;
    average_daily_fibre_g: number | null;
  };
  warnings: string[];
  assumptions: string[];
}

export interface MealPlanOutput {
  meal_plan: MealPlanDocument;
}

export interface StoredMealPlanState {
  output: MealPlanOutput;
  preferences: MealPlanPreferences;
  generatedAt: string;
  cookedRecipeIds: string[];
}

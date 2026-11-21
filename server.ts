import 'dotenv/config';
import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import type {
  FamilyProfile,
  MealCategoryType,
  MealPlanPreferences,
  PantryItem,
  ScanResultJSON,
  ScannedIngredient,
  StorageLocation,
  StoredMealPlanState,
} from './src/types/pantry';
import {
  DEFAULT_MEAL_PLAN_PREFERENCES,
  analyseHouseholdAndPantry,
  generateMealPlanWithGemini,
  generateSingleReplacementMealWithGemini,
  normalizeName,
  scaleMealServings,
  validateAndReconcileMealPlan,
} from './server/mealPlannerEngine';

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'household-store.json');

interface HouseholdStore {
  familyProfile: FamilyProfile;
  pantryItems: PantryItem[];
  mealPlanState: StoredMealPlanState | null;
  groceryPrices: Record<string, number | null>;
}

const DEFAULT_PROFILE: FamilyProfile = {
  householdName: 'My Household',
  dietaryPreferences: ['Balanced'],
  healthGoals: ['Balanced nutrition'],
  allergies: [],
  crossContaminationStrict: false,
  crossContaminationNotes: '',
  favoriteFoods: [],
  dislikedIngredients: [],
  preferredCuisines: ['Mediterranean', 'Asian', 'Comfort'],
  spiceTolerance: 'Medium',
  householdSize: {
    adults: 2,
    children: 0,
    typicalServings: 2,
    batchCookingPreferred: false,
  },
  cookingEquipment: ['Stovetop', 'Oven', 'Microwave'],
  additionalNotes: '',
  updatedAt: new Date().toISOString(),
};

let writeLock: Promise<void> = Promise.resolve();

function normalizeNameServer(name: string): string {
  return name
    .toLowerCase()
    .replace(
      /\b(fresh|organic|raw|whole|sliced|chopped|diced|large|small|medium|bag of|carton of|jar of|can of|bottle of|box of)\b/g,
      ''
    )
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/s\b/, '');
}

async function ensureStore(): Promise<HouseholdStore> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(STORE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<HouseholdStore>;
    return {
      familyProfile: {
        ...DEFAULT_PROFILE,
        ...(parsed.familyProfile || {}),
        householdSize: {
          ...DEFAULT_PROFILE.householdSize,
          ...(parsed.familyProfile?.householdSize || {}),
        },
      },
      pantryItems: Array.isArray(parsed.pantryItems) ? parsed.pantryItems : [],
      mealPlanState: parsed.mealPlanState || null,
      groceryPrices: parsed.groceryPrices || {},
    };
  } catch {
    const initial: HouseholdStore = {
      familyProfile: DEFAULT_PROFILE,
      pantryItems: [],
      mealPlanState: null,
      groceryPrices: {},
    };
    await fs.writeFile(STORE_PATH, JSON.stringify(initial, null, 2), 'utf-8');
    return initial;
  }
}

async function mutateStore<T>(fn: (store: HouseholdStore) => Promise<T> | T): Promise<T> {
  let result!: T;
  const run = async () => {
    const store = await ensureStore();
    result = await fn(store);
    await fs.writeFile(STORE_PATH, JSON.stringify(store, null, 2), 'utf-8');
  };
  writeLock = writeLock.then(run, run);
  await writeLock;
  return result;
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in environment secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function clampConfidence(val: unknown, fallback = 0.5): number {
  if (typeof val !== 'number' || Number.isNaN(val)) return fallback;
  return Math.max(0, Math.min(1, Math.round(val * 100) / 100));
}

function sanitizeScanResponse(
  raw: Partial<ScanResultJSON>,
  fallbackLocation: StorageLocation
): ScanResultJSON {
  const validLocations = new Set([
    'Refrigerator',
    'Freezer',
    'Dry pantry',
    'Kitchen countertop',
    'Fresh produce storage',
  ]);
  const validFoodStates = new Set(['raw', 'cooked', 'processed', 'packaged']);
  const validFreshness = new Set(['Good', 'Use Soon', 'Inspect Carefully', 'Uncertain']);
  const validDateTypes = new Set(['Expiry', 'Best Before', 'Use By', 'Sell By']);

  const inventory: ScannedIngredient[] = Array.isArray(raw.pantry_inventory)
    ? raw.pantry_inventory.map((item, idx) => {
        const idConf = clampConfidence(item?.identification_confidence, 0.7);
        const freshStatus = validFreshness.has(item?.freshness?.status as string)
          ? item.freshness.status
          : 'Uncertain';
        const needsVerify =
          Boolean(item?.verification_required) ||
          idConf < 0.8 ||
          freshStatus === 'Inspect Carefully' ||
          freshStatus === 'Uncertain';

        const expiryDate =
          item?.expiry?.date && typeof item.expiry.date === 'string' && item.expiry.date.trim() !== ''
            ? item.expiry.date.trim()
            : null;

        const expiryType =
          expiryDate && validDateTypes.has(item?.expiry?.date_type as string)
            ? item.expiry.date_type
            : expiryDate
              ? 'Best Before'
              : null;

        const rawBox = item?.bounding_box;
        const boundingBox =
          Array.isArray(rawBox) &&
          rawBox.length === 4 &&
          rawBox.every((n) => typeof n === 'number' && !Number.isNaN(n))
            ? (rawBox as [number, number, number, number])
            : null;

        return {
          item_id: item?.item_id || `ING${String(idx + 1).padStart(3, '0')}`,
          name: (item?.name || 'Unidentified Item').trim(),
          category: (item?.category || 'Other').trim(),
          food_state: validFoodStates.has(item?.food_state as string) ? item.food_state : 'raw',
          brand_or_label:
            item?.brand_or_label && String(item.brand_or_label).trim() !== ''
              ? String(item.brand_or_label).trim()
              : null,
          quantity: {
            value:
              typeof item?.quantity?.value === 'number' && item.quantity.value > 0
                ? Math.round(item.quantity.value * 100) / 100
                : 1,
            unit: (item?.quantity?.unit || 'item').trim(),
            estimated: item?.quantity?.estimated !== false,
          },
          storage_location: validLocations.has(item?.storage_location as string)
            ? item.storage_location
            : fallbackLocation,
          condition: (item?.condition || 'Fresh').trim(),
          freshness: {
            status: freshStatus,
            confidence: clampConfidence(item?.freshness?.confidence, 0.7),
            visual_observations:
              (item?.freshness?.visual_observations || 'No specific visual defects observed').trim(),
          },
          expiry: {
            date: expiryDate,
            date_type: expiryType,
            confidence: expiryDate ? clampConfidence(item?.expiry?.confidence, 0.75) : null,
          },
          identification_confidence: idConf,
          verification_required: needsVerify,
          bounding_box: boundingBox,
        };
      })
    : [];

  return {
    pantry_inventory: inventory,
    unidentified_items: Array.isArray(raw.unidentified_items) ? raw.unidentified_items : [],
    processing_status:
      raw.processing_status === 'partial' || raw.processing_status === 'failed'
        ? raw.processing_status
        : 'completed',
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '25mb' }));

  app.get('/api/profile', async (_req, res) => {
    try {
      const store = await ensureStore();
      res.json({ profile: store.familyProfile });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load profile' });
    }
  });

  app.put('/api/profile', async (req, res) => {
    try {
      const incoming = req.body as Partial<FamilyProfile>;
      const updated = await mutateStore((store) => {
        store.familyProfile = {
          ...store.familyProfile,
          ...incoming,
          householdSize: {
            ...store.familyProfile.householdSize,
            ...(incoming.householdSize || {}),
          },
          updatedAt: new Date().toISOString(),
        };
        return store.familyProfile;
      });
      res.json({ profile: updated });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to save profile' });
    }
  });

  app.get('/api/pantry', async (_req, res) => {
    try {
      const store = await ensureStore();
      res.json({ items: store.pantryItems });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load pantry' });
    }
  });

  app.post('/api/pantry/scan', async (req, res) => {
    try {
      const { imageBase64, mimeType, storageLocation } = req.body as {
        imageBase64?: string;
        mimeType?: string;
        storageLocation?: StorageLocation;
      };

      if (!imageBase64 || !mimeType) {
        res.status(400).json({ error: 'Missing imageBase64 or mimeType.' });
        return;
      }

      const targetLocation: StorageLocation =
        storageLocation || ('Refrigerator' as StorageLocation);

      const ai = getGeminiClient();

      const systemInstruction = [
        'You are a meticulous culinary pantry auditor and food vision analyst.',
        'Analyze the uploaded food storage photograph and return ONLY valid JSON matching the provided schema.',
        'Tasks you MUST perform:',
        '1. Identify every visible food ingredient individually. Do NOT lump distinct items into generic groups like "assorted vegetables" or "condiments".',
        '2. Recognise food names as specifically as possible (e.g., "Sharp Cheddar Cheese Block", "Cherry Tomatoes", "Organic Whole Milk", "Rolled Oats").',
        '3. Identify the food category (Vegetables, Fruits, Dairy & Eggs, Meat & Poultry, Seafood, Grains & Pasta, Canned & Jarred, Oils & Condiments, Nuts & Seeds, Bakery, Beverages, Herbs & Spices, Frozen, Other).',
        '4. Estimate the quantity or count clearly with value, unit, and estimated: true.',
        '5. Provide an identification_confidence score between 0 and 1.',
        '6. Assess visible freshness and physical condition (e.g., Fresh, Opened, Packaged, Wilting, Overripe, Bruised, Possible Spoilage).',
        '7. Read visible expiry, best-before, or use-by dates ONLY if clearly legible in YYYY-MM-DD format; otherwise set expiry fields to null.',
        '8. Detect possible spoilage, mould, discolouration, wilting, or packaging damage in visual_observations and set freshness.status to "Inspect Carefully" and verification_required to true.',
        '9. Distinguish between raw, cooked, processed, and packaged food in food_state.',
        '10. Capture visible brand or product label text in brand_or_label when readable, otherwise null.',
        '11. Provide normalized [ymin, xmin, ymax, xmax] bounding_box coordinates (0 to 1000) for each item so the user can see a crop preview.',
        'Strict Rules:',
        '- NEVER invent or guess ingredients that are not visually present.',
        '- NEVER assume or fabricate an expiry date if not clearly readable. Use null.',
        '- NEVER confuse a manufacturing/packed-on date with an expiry date.',
        '- NEVER declare food safe to eat based on appearance alone. Visual observations must stay strictly descriptive of what is seen.',
        '- Set verification_required = true whenever identification_confidence < 0.80, items are partially occluded, labels are blurry, or possible spoilage/damage is observed.',
        '- List any visible containers, jars, or obscured items you cannot reliably identify inside unidentified_items with a brief description and reason.',
      ].join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType,
                data: imageBase64,
              },
            },
            {
              text: `Storage environment context: "${targetLocation}". Identify every visible food item individually following all rules. Today's date for reference is ${new Date().toISOString().slice(0, 10)}.`,
            },
          ],
        },
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              pantry_inventory: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    item_id: { type: Type.STRING },
                    name: { type: Type.STRING },
                    category: { type: Type.STRING },
                    food_state: {
                      type: Type.STRING,
                      enum: ['raw', 'cooked', 'processed', 'packaged'],
                    },
                    brand_or_label: { type: Type.STRING, nullable: true },
                    quantity: {
                      type: Type.OBJECT,
                      properties: {
                        value: { type: Type.NUMBER },
                        unit: { type: Type.STRING },
                        estimated: { type: Type.BOOLEAN },
                      },
                      required: ['value', 'unit', 'estimated'],
                    },
                    storage_location: {
                      type: Type.STRING,
                      enum: [
                        'Refrigerator',
                        'Freezer',
                        'Dry pantry',
                        'Kitchen countertop',
                        'Fresh produce storage',
                      ],
                    },
                    condition: { type: Type.STRING },
                    freshness: {
                      type: Type.OBJECT,
                      properties: {
                        status: {
                          type: Type.STRING,
                          enum: ['Good', 'Use Soon', 'Inspect Carefully', 'Uncertain'],
                        },
                        confidence: { type: Type.NUMBER },
                        visual_observations: { type: Type.STRING },
                      },
                      required: ['status', 'confidence', 'visual_observations'],
                    },
                    expiry: {
                      type: Type.OBJECT,
                      properties: {
                        date: { type: Type.STRING, nullable: true },
                        date_type: {
                          type: Type.STRING,
                          enum: ['Expiry', 'Best Before', 'Use By', 'Sell By'],
                          nullable: true,
                        },
                        confidence: { type: Type.NUMBER, nullable: true },
                      },
                      required: ['date', 'date_type', 'confidence'],
                    },
                    identification_confidence: { type: Type.NUMBER },
                    verification_required: { type: Type.BOOLEAN },
                    bounding_box: {
                      type: Type.ARRAY,
                      items: { type: Type.NUMBER },
                      nullable: true,
                    },
                  },
                  required: [
                    'item_id',
                    'name',
                    'category',
                    'food_state',
                    'quantity',
                    'storage_location',
                    'condition',
                    'freshness',
                    'expiry',
                    'identification_confidence',
                    'verification_required',
                  ],
                },
              },
              unidentified_items: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    description: { type: Type.STRING },
                    reason: { type: Type.STRING },
                    visual_location: { type: Type.STRING, nullable: true },
                  },
                  required: ['description', 'reason'],
                },
              },
              processing_status: {
                type: Type.STRING,
                enum: ['completed', 'partial', 'failed'],
              },
            },
            required: ['pantry_inventory', 'unidentified_items', 'processing_status'],
          },
        },
      });

      const rawText = (response.text ?? '{}').trim();
      const parsed = JSON.parse(rawText) as Partial<ScanResultJSON>;
      const sanitized = sanitizeScanResponse(parsed, targetLocation);
      res.json(sanitized);
    } catch (err) {
      console.error('Gemini Vision scan error:', err);
      const message = err instanceof Error ? err.message : 'Failed to analyze pantry image.';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/pantry/confirm', async (req, res) => {
    try {
      const { items } = req.body as {
        items: Array<{
          name: string;
          category: string;
          foodState: PantryItem['foodState'];
          brandOrLabel: string | null;
          quantity: { value: number; unit: string; estimated: boolean };
          storageLocation: StorageLocation;
          condition: string;
          freshness: PantryItem['freshness'];
          expiry: PantryItem['expiry'];
          identificationConfidence: number | null;
          verificationRequired: boolean;
          thumbnailDataUrl: string | null;
          duplicateAction?: 'merge' | 'separate' | 'replace';
          duplicateMatchId?: string | null;
        }>;
      };

      if (!Array.isArray(items) || items.length === 0) {
        res.status(400).json({ error: 'No items provided to confirm.' });
        return;
      }

      const result = await mutateStore((store) => {
        const now = new Date().toISOString();
        let addedCount = 0;
        let mergedCount = 0;

        for (const incoming of items) {
          const norm = normalizeNameServer(incoming.name);
          const action = incoming.duplicateAction || 'merge';

          let targetExisting: PantryItem | undefined;
          if (incoming.duplicateMatchId) {
            targetExisting = store.pantryItems.find((p) => p.id === incoming.duplicateMatchId);
          }
          if (!targetExisting && action === 'merge') {
            targetExisting = store.pantryItems.find(
              (p) => p.normalizedName === norm && p.storageLocation === incoming.storageLocation
            );
          }

          if (targetExisting && action === 'merge') {
            const sameUnit =
              targetExisting.quantity.unit.toLowerCase() === incoming.quantity.unit.toLowerCase();
            targetExisting.quantity = {
              value: sameUnit
                ? Math.round((targetExisting.quantity.value + incoming.quantity.value) * 100) / 100
                : Math.round((targetExisting.quantity.value + incoming.quantity.value) * 100) / 100,
              unit: targetExisting.quantity.unit || incoming.quantity.unit,
              estimated: targetExisting.quantity.estimated && incoming.quantity.estimated,
            };
            if (!targetExisting.expiry.date && incoming.expiry.date) {
              targetExisting.expiry = incoming.expiry;
            }
            if (!targetExisting.thumbnailDataUrl && incoming.thumbnailDataUrl) {
              targetExisting.thumbnailDataUrl = incoming.thumbnailDataUrl;
            }
            targetExisting.verificationRequired =
              targetExisting.verificationRequired || incoming.verificationRequired;
            targetExisting.updatedAt = now;
            mergedCount += 1;
          } else if (targetExisting && action === 'replace') {
            Object.assign(targetExisting, {
              name: incoming.name.trim(),
              normalizedName: norm,
              category: incoming.category,
              foodState: incoming.foodState,
              brandOrLabel: incoming.brandOrLabel,
              quantity: incoming.quantity,
              storageLocation: incoming.storageLocation,
              condition: incoming.condition,
              freshness: incoming.freshness,
              expiry: incoming.expiry,
              identificationConfidence: incoming.identificationConfidence,
              verificationRequired: incoming.verificationRequired,
              thumbnailDataUrl: incoming.thumbnailDataUrl || targetExisting.thumbnailDataUrl,
              updatedAt: now,
            });
            mergedCount += 1;
          } else {
            const newItem: PantryItem = {
              id: `pantry_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              name: incoming.name.trim(),
              normalizedName: norm,
              category: incoming.category,
              foodState: incoming.foodState || 'raw',
              brandOrLabel: incoming.brandOrLabel || null,
              quantity: incoming.quantity,
              storageLocation: incoming.storageLocation,
              condition: incoming.condition || 'Fresh',
              freshness: incoming.freshness,
              expiry: incoming.expiry,
              identificationConfidence: incoming.identificationConfidence,
              verificationRequired: Boolean(incoming.verificationRequired),
              thumbnailDataUrl: incoming.thumbnailDataUrl || null,
              source: 'ai_scan',
              addedAt: now,
              updatedAt: now,
            };
            store.pantryItems.unshift(newItem);
            addedCount += 1;
          }
        }

        return { items: store.pantryItems, addedCount, mergedCount };
      });

      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to confirm items' });
    }
  });

  app.post('/api/pantry/manual', async (req, res) => {
    try {
      const body = req.body as Partial<PantryItem> & { mergeIfDuplicate?: boolean };
      if (!body.name || !body.name.trim()) {
        res.status(400).json({ error: 'Ingredient name is required.' });
        return;
      }

      const result = await mutateStore((store) => {
        const now = new Date().toISOString();
        const norm = normalizeNameServer(body.name!);
        const storageLocation = (body.storageLocation || 'Dry pantry') as StorageLocation;

        if (body.mergeIfDuplicate !== false) {
          const existing = store.pantryItems.find(
            (p) => p.normalizedName === norm && p.storageLocation === storageLocation
          );
          if (existing) {
            existing.quantity.value =
              Math.round((existing.quantity.value + (body.quantity?.value || 1)) * 100) / 100;
            existing.quantity.estimated = false;
            if (body.expiry?.date) existing.expiry = body.expiry;
            existing.updatedAt = now;
            return { item: existing, items: store.pantryItems, merged: true };
          }
        }

        const item: PantryItem = {
          id: `pantry_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          name: body.name!.trim(),
          normalizedName: norm,
          category: body.category || 'Other',
          foodState: body.foodState || 'raw',
          brandOrLabel: body.brandOrLabel || null,
          quantity: {
            value: body.quantity?.value && body.quantity.value > 0 ? body.quantity.value : 1,
            unit: body.quantity?.unit || 'item',
            estimated: false,
          },
          storageLocation,
          condition: body.condition || 'Fresh',
          freshness: body.freshness || {
            status: 'Good',
            confidence: null,
            visualObservations: 'Added manually by household member',
          },
          expiry: body.expiry || {
            date: null,
            dateType: null,
            confidence: null,
          },
          identificationConfidence: null,
          verificationRequired: false,
          thumbnailDataUrl: null,
          source: 'manual',
          addedAt: now,
          updatedAt: now,
        };
        store.pantryItems.unshift(item);
        return { item, items: store.pantryItems, merged: false };
      });

      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to add ingredient' });
    }
  });

  app.patch('/api/pantry/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const patch = req.body as Partial<PantryItem>;

      const result = await mutateStore((store) => {
        const idx = store.pantryItems.findIndex((i) => i.id === id);
        if (idx === -1) return null;
        const current = store.pantryItems[idx];
        const nextName = patch.name ? patch.name.trim() : current.name;

        const updated: PantryItem = {
          ...current,
          ...patch,
          name: nextName,
          normalizedName: normalizeNameServer(nextName),
          quantity: patch.quantity ? { ...current.quantity, ...patch.quantity } : current.quantity,
          freshness: patch.freshness ? { ...current.freshness, ...patch.freshness } : current.freshness,
          expiry: patch.expiry ? { ...current.expiry, ...patch.expiry } : current.expiry,
          updatedAt: new Date().toISOString(),
        };
        store.pantryItems[idx] = updated;
        return { item: updated, items: store.pantryItems };
      });

      if (!result) {
        res.status(404).json({ error: 'Pantry item not found' });
        return;
      }
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to update item' });
    }
  });

  app.delete('/api/pantry/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const items = await mutateStore((store) => {
        store.pantryItems = store.pantryItems.filter((i) => i.id !== id);
        return store.pantryItems;
      });
      res.json({ items });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to delete item' });
    }
  });

  app.get('/api/meal-plan', async (_req, res) => {
    try {
      const store = await ensureStore();
      const prefs = store.mealPlanState?.preferences || DEFAULT_MEAL_PLAN_PREFERENCES;
      const stage1 = analyseHouseholdAndPantry(store.familyProfile, store.pantryItems, prefs);
      res.json({
        mealPlanState: store.mealPlanState,
        analysisPreview: {
          usableCount: stage1.usablePantry.length,
          priorityItems: stage1.usablePantry.filter((u) => u.priorityTier <= 3),
          excludedItems: stage1.excludedItems,
          warnings: stage1.warnings,
        },
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to load meal plan.',
      });
    }
  });

  app.post('/api/meal-plan/generate', async (req, res) => {
    try {
      const preferences = req.body as Partial<MealPlanPreferences>;
      const store = await ensureStore();

      // Stage 1: Analyse
      const stage1 = analyseHouseholdAndPantry(
        store.familyProfile,
        store.pantryItems,
        preferences
      );

      // Stage 2: Generate with Gemini
      const ai = getGeminiClient();
      const rawPlan = await generateMealPlanWithGemini(ai, stage1);

      // Stage 3: Deterministic Validation, Allocation, Nutrition & Grocery Consolidation
      const validatedOutput = validateAndReconcileMealPlan(
        rawPlan,
        stage1,
        store.groceryPrices || {}
      );

      const nextState: StoredMealPlanState = {
        output: validatedOutput,
        preferences: stage1.resolvedPreferences,
        generatedAt: new Date().toISOString(),
        cookedRecipeIds: [],
      };

      await mutateStore((s) => {
        s.mealPlanState = nextState;
      });

      res.json({ mealPlanState: nextState });
    } catch (err) {
      console.error('Meal plan generation error:', err);
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to generate meal plan.',
      });
    }
  });

  app.post('/api/meal-plan/replace-meal', async (req, res) => {
    try {
      const {
        day,
        recipeId,
        swapCuisine,
        maxMinutes,
        servings,
        excludeIngredient,
        customInstruction,
      } = req.body as {
        day: number;
        recipeId: string;
        swapCuisine?: string;
        maxMinutes?: number;
        servings?: number;
        excludeIngredient?: string;
        customInstruction?: string;
      };

      const store = await ensureStore();
      if (!store.mealPlanState) {
        res.status(400).json({ error: 'No active meal plan to modify.' });
        return;
      }

      const currentDoc = store.mealPlanState.output.meal_plan;
      const dayEntry = currentDoc.daily_plans.find((d) => d.day === day);
      const targetMeal = dayEntry?.meals.find((m) => m.recipe_id === recipeId);
      if (!dayEntry || !targetMeal) {
        res.status(404).json({ error: 'Target meal not found in plan.' });
        return;
      }

      const stage1 = analyseHouseholdAndPantry(
        store.familyProfile,
        store.pantryItems,
        store.mealPlanState.preferences
      );
      const existingMealNames = currentDoc.daily_plans.flatMap((d) =>
        d.meals.map((m) => m.recipe_name)
      );

      const ai = getGeminiClient();
      const replacement = await generateSingleReplacementMealWithGemini(ai, stage1, {
        day,
        mealType: targetMeal.meal_type,
        currentRecipeName: targetMeal.recipe_name,
        swapCuisine,
        maxMinutes,
        servings: servings || targetMeal.servings,
        excludeIngredient,
        customInstruction,
        existingMealNames,
        recipeId,
      });

      const updatedDays = currentDoc.daily_plans.map((d) => {
        if (d.day !== day) return d;
        return {
          ...d,
          meals: d.meals.map((m) => (m.recipe_id === recipeId ? replacement : m)),
        };
      });

      const reconciled = validateAndReconcileMealPlan(
        {
          plan_id: currentDoc.plan_id,
          pantry_utilisation_strategy: currentDoc.planning_summary.pantry_utilisation_strategy,
          daily_plans: updatedDays,
          assumptions: currentDoc.assumptions,
        },
        stage1,
        store.groceryPrices || {}
      );

      const nextState: StoredMealPlanState = {
        ...store.mealPlanState,
        output: reconciled,
        cookedRecipeIds: store.mealPlanState.cookedRecipeIds.filter((id) => id !== recipeId),
      };

      await mutateStore((s) => {
        s.mealPlanState = nextState;
      });

      res.json({ mealPlanState: nextState });
    } catch (err) {
      console.error('Replace meal error:', err);
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to replace meal.',
      });
    }
  });

  app.post('/api/meal-plan/add-meal', async (req, res) => {
    try {
      const { day, mealType, customInstruction } = req.body as {
        day: number;
        mealType: MealCategoryType | string;
        customInstruction?: string;
      };

      const store = await ensureStore();
      if (!store.mealPlanState) {
        res.status(400).json({ error: 'Generate a meal plan before adding meals.' });
        return;
      }

      const currentDoc = store.mealPlanState.output.meal_plan;
      const dayEntry = currentDoc.daily_plans.find((d) => d.day === day);
      if (!dayEntry) {
        res.status(404).json({ error: `Day ${day} not found.` });
        return;
      }

      const existingIds = new Set(
        currentDoc.daily_plans.flatMap((d) => d.meals.map((m) => m.recipe_id))
      );
      let idx = existingIds.size + 1;
      let newId = `REC${String(idx).padStart(3, '0')}`;
      while (existingIds.has(newId)) {
        idx += 1;
        newId = `REC${String(idx).padStart(3, '0')}`;
      }

      const stage1 = analyseHouseholdAndPantry(
        store.familyProfile,
        store.pantryItems,
        store.mealPlanState.preferences
      );
      const existingMealNames = currentDoc.daily_plans.flatMap((d) =>
        d.meals.map((m) => m.recipe_name)
      );

      const ai = getGeminiClient();
      const newMeal = await generateSingleReplacementMealWithGemini(ai, stage1, {
        day,
        mealType: mealType || 'Afternoon snack',
        customInstruction,
        existingMealNames,
        recipeId: newId,
      });

      const updatedDays = currentDoc.daily_plans.map((d) =>
        d.day === day ? { ...d, meals: [...d.meals, newMeal] } : d
      );

      const reconciled = validateAndReconcileMealPlan(
        {
          plan_id: currentDoc.plan_id,
          pantry_utilisation_strategy: currentDoc.planning_summary.pantry_utilisation_strategy,
          daily_plans: updatedDays,
          assumptions: currentDoc.assumptions,
        },
        stage1,
        store.groceryPrices || {}
      );

      const nextState: StoredMealPlanState = {
        ...store.mealPlanState,
        output: reconciled,
      };

      await mutateStore((s) => {
        s.mealPlanState = nextState;
      });

      res.json({ mealPlanState: nextState });
    } catch (err) {
      console.error('Add meal error:', err);
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to add meal.',
      });
    }
  });

  app.post('/api/meal-plan/recalculate', async (req, res) => {
    try {
      const {
        action,
        day,
        recipeId,
        servings,
        priceUpdates,
      } = req.body as {
        action: 'update_servings' | 'remove_meal' | 'update_prices' | 'reconcile_pantry';
        day?: number;
        recipeId?: string;
        servings?: number;
        priceUpdates?: Record<string, number | null>;
      };

      const result = await mutateStore((store) => {
        if (!store.mealPlanState) return null;
        const currentDoc = store.mealPlanState.output.meal_plan;
        let updatedDays = currentDoc.daily_plans;

        if (action === 'update_servings' && day !== undefined && recipeId && servings) {
          updatedDays = currentDoc.daily_plans.map((d) => {
            if (d.day !== day) return d;
            return {
              ...d,
              meals: d.meals.map((m) =>
                m.recipe_id === recipeId ? scaleMealServings(m, servings) : m
              ),
            };
          });
        } else if (action === 'remove_meal' && day !== undefined && recipeId) {
          updatedDays = currentDoc.daily_plans.map((d) => {
            if (d.day !== day) return d;
            return {
              ...d,
              meals: d.meals.filter((m) => m.recipe_id !== recipeId),
            };
          });
        } else if (action === 'update_prices' && priceUpdates) {
          store.groceryPrices = {
            ...(store.groceryPrices || {}),
            ...priceUpdates,
          };
        }

        const stage1 = analyseHouseholdAndPantry(
          store.familyProfile,
          store.pantryItems,
          store.mealPlanState.preferences
        );

        const reconciled = validateAndReconcileMealPlan(
          {
            plan_id: currentDoc.plan_id,
            pantry_utilisation_strategy: currentDoc.planning_summary.pantry_utilisation_strategy,
            daily_plans: updatedDays,
            assumptions: currentDoc.assumptions,
          },
          stage1,
          store.groceryPrices || {}
        );

        store.mealPlanState = {
          ...store.mealPlanState,
          output: reconciled,
        };
        return store.mealPlanState;
      });

      if (!result) {
        res.status(400).json({ error: 'No active meal plan found.' });
        return;
      }

      res.json({ mealPlanState: result });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to recalculate meal plan.',
      });
    }
  });

  app.post('/api/meal-plan/mark-cooked', async (req, res) => {
    try {
      const { day, recipeId } = req.body as { day: number; recipeId: string };
      const result = await mutateStore((store) => {
        if (!store.mealPlanState) return null;
        if (store.mealPlanState.cookedRecipeIds.includes(recipeId)) {
          return {
            mealPlanState: store.mealPlanState,
            pantryItems: store.pantryItems,
            alreadyCooked: true,
          };
        }

        const dayEntry = store.mealPlanState.output.meal_plan.daily_plans.find(
          (d) => d.day === day
        );
        const meal = dayEntry?.meals.find((m) => m.recipe_id === recipeId);
        if (!meal) return null;

        // Explicit user-confirmed pantry deduction only
        const now = new Date().toISOString();
        for (const ing of meal.ingredients) {
          if (ing.pantry_quantity_used <= 0) continue;
          const normIng = normalizeName(ing.name);
          const match = store.pantryItems.find(
            (p) =>
              !p.verificationRequired &&
              (p.normalizedName === normIng ||
                (p.normalizedName.length >= 4 && normIng.includes(p.normalizedName)) ||
                (normIng.length >= 4 && p.normalizedName.includes(normIng)))
          );
          if (match) {
            const nextQty = Math.max(
              0,
              Math.round((match.quantity.value - ing.pantry_quantity_used) * 100) / 100
            );
            match.quantity.value = nextQty;
            match.quantity.estimated = false;
            match.updatedAt = now;
          }
        }
        store.pantryItems = store.pantryItems.filter((p) => p.quantity.value > 0);
        store.mealPlanState.cookedRecipeIds.push(recipeId);

        return {
          mealPlanState: store.mealPlanState,
          pantryItems: store.pantryItems,
          alreadyCooked: false,
        };
      });

      if (!result) {
        res.status(404).json({ error: 'Meal not found in active plan.' });
        return;
      }

      res.json(result);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to deduct cooked ingredients.',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Hearthstock server listening on http://localhost:${PORT}`);
  });
}

startServer();

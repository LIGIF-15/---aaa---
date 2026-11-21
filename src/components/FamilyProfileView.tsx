import React, { useState, useEffect } from 'react';
import { Check, Plus, X, ShieldAlert, Users, Utensils, Flame } from 'lucide-react';
import { FamilyProfile, SpiceTolerance } from '../types/pantry';

interface FamilyProfileViewProps {
  profile: FamilyProfile;
  onSaveProfile: (updated: FamilyProfile) => Promise<void>;
  onGoToMeals: () => void;
}

const DIETARY_OPTIONS = [
  'Balanced',
  'Vegetarian',
  'Vegan',
  'Pescatarian',
  'Halal',
  'Kosher',
  'Low-Carb',
  'Low-Sodium',
  'High-Protein',
  'Gluten-Free',
  'Dairy-Free',
  'Mediterranean',
];

const HEALTH_GOAL_OPTIONS = [
  'Balanced nutrition',
  'Weight management',
  'Cholesterol-conscious meals',
  'Higher fibre intake',
  'Heart health',
  'Blood sugar balance',
  'Muscle recovery',
  'Kid-friendly nutrients',
];

const ALLERGY_OPTIONS = [
  'Peanuts',
  'Tree Nuts',
  'Dairy / Lactose',
  'Eggs',
  'Shellfish',
  'Fish',
  'Wheat / Gluten',
  'Soy',
  'Sesame',
];

const CUISINE_OPTIONS = [
  'Mediterranean',
  'East Asian',
  'Southeast Asian',
  'South Asian',
  'Italian',
  'Mexican',
  'Middle Eastern',
  'American Comfort',
  'French',
];

const EQUIPMENT_OPTIONS = [
  'Stovetop',
  'Oven',
  'Air fryer',
  'Microwave',
  'Rice cooker',
  'Blender',
  'Pressure cooker',
  'Slow cooker',
  'Grill / Grill pan',
  'Food processor',
];

const SPICE_LEVELS: SpiceTolerance[] = ['None', 'Mild', 'Medium', 'Hot', 'Extra Hot'];

export const FamilyProfileView: React.FC<FamilyProfileViewProps> = ({
  profile,
  onSaveProfile,
  onGoToMeals,
}) => {
  const [draft, setDraft] = useState<FamilyProfile>(profile);
  const [saving, setSaving] = useState(false);
  const [savedBanner, setSavedBanner] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [customDietary, setCustomDietary] = useState('');
  const [customGoal, setCustomGoal] = useState('');
  const [customAllergy, setCustomAllergy] = useState('');
  const [customFavorite, setCustomFavorite] = useState('');
  const [customDisliked, setCustomDisliked] = useState('');
  const [customEquipment, setCustomEquipment] = useState('');

  useEffect(() => {
    setDraft(profile);
  }, [profile]);

  const toggleInList = (
    field:
      | 'dietaryPreferences'
      | 'healthGoals'
      | 'allergies'
      | 'preferredCuisines'
      | 'cookingEquipment',
    value: string
  ) => {
    setDraft((prev) => {
      const list = prev[field];
      const exists = list.includes(value);
      return {
        ...prev,
        [field]: exists ? list.filter((v) => v !== value) : [...list, value],
      };
    });
  };

  const addCustomItem = (
    field:
      | 'dietaryPreferences'
      | 'healthGoals'
      | 'allergies'
      | 'favoriteFoods'
      | 'dislikedIngredients'
      | 'cookingEquipment',
    rawValue: string,
    clearInput: () => void
  ) => {
    const trimmed = rawValue.trim();
    if (!trimmed) return;
    setDraft((prev) => {
      const current = prev[field];
      if (current.some((item) => item.toLowerCase() === trimmed.toLowerCase())) {
        return prev;
      }
      return { ...prev, [field]: [...current, trimmed] };
    });
    clearInput();
  };

  const removeItem = (
    field:
      | 'dietaryPreferences'
      | 'healthGoals'
      | 'allergies'
      | 'favoriteFoods'
      | 'dislikedIngredients'
      | 'preferredCuisines'
      | 'cookingEquipment',
    value: string
  ) => {
    setDraft((prev) => ({
      ...prev,
      [field]: prev[field].filter((v) => v !== value),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);
    setSavedBanner(false);
    try {
      await onSaveProfile(draft);
      setSavedBanner(true);
      setTimeout(() => setSavedBanner(false), 3500);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to save family profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-[1360px] mx-auto px-4 sm:px-6 py-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Family Profile
          </h1>
          <p className="mt-1.5 text-sm text-slate-600 max-w-2xl">
            Configure your household dietary rules, health goals, allergies, food preferences,
            servings, and kitchen equipment. Every meal plan and recipe suggestion references this
            profile automatically.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onGoToMeals}
            className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            Open Meal Planner
          </button>
          <button
            type="submit"
            form="family-profile-form"
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-emerald-700 text-white text-sm font-medium hover:bg-emerald-800 disabled:opacity-60 transition-colors whitespace-nowrap"
          >
            <Check className="w-4 h-4" aria-hidden="true" />
            <span>{saving ? 'Saving...' : 'Save Profile'}</span>
          </button>
        </div>
      </div>

      {savedBanner && (
        <div
          role="status"
          className="mt-5 px-4 py-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-900 flex items-center gap-2"
        >
          <Check className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />
          <span>
            Family profile saved. Future meal plans and recipe suggestions will automatically apply
            these preferences.
          </span>
        </div>
      )}

      {errorMsg && (
        <div
          role="alert"
          className="mt-5 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800"
        >
          {errorMsg}
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <form
          id="family-profile-form"
          onSubmit={handleSubmit}
          className="lg:col-span-8 space-y-8"
        >
          {/* 1. Household Size & Serving Requirements */}
          <section className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100">
              <Users className="w-5 h-5 text-slate-700" aria-hidden="true" />
              <h2 className="font-display text-lg font-semibold text-slate-900">
                01. Household Size & Serving Requirements
              </h2>
            </div>

            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label
                  htmlFor="household-name"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  Household Name
                </label>
                <input
                  id="household-name"
                  type="text"
                  value={draft.householdName}
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, householdName: e.target.value }))
                  }
                  placeholder="e.g. The Tan Family"
                  className="w-full px-3.5 py-2 rounded-lg border border-slate-300 text-sm text-slate-900 focus:outline-none focus:border-emerald-700 focus:ring-1 focus:ring-emerald-700"
                />
              </div>

              <div>
                <label
                  htmlFor="typical-servings"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  Typical Servings per Meal
                </label>
                <input
                  id="typical-servings"
                  type="number"
                  min={1}
                  max={20}
                  value={draft.householdSize.typicalServings}
                  onChange={(e) =>
                    setDraft((p) => ({
                      ...p,
                      householdSize: {
                        ...p.householdSize,
                        typicalServings: Math.max(1, Number(e.target.value) || 1),
                      },
                    }))
                  }
                  className="w-full px-3.5 py-2 rounded-lg border border-slate-300 text-sm font-mono tabular-nums text-slate-900 focus:outline-none focus:border-emerald-700 focus:ring-1 focus:ring-emerald-700"
                />
              </div>

              <div>
                <label
                  htmlFor="adults-count"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  Adults
                </label>
                <input
                  id="adults-count"
                  type="number"
                  min={0}
                  max={20}
                  value={draft.householdSize.adults}
                  onChange={(e) =>
                    setDraft((p) => ({
                      ...p,
                      householdSize: {
                        ...p.householdSize,
                        adults: Math.max(0, Number(e.target.value) || 0),
                      },
                    }))
                  }
                  className="w-full px-3.5 py-2 rounded-lg border border-slate-300 text-sm font-mono tabular-nums text-slate-900 focus:outline-none focus:border-emerald-700 focus:ring-1 focus:ring-emerald-700"
                />
              </div>

              <div>
                <label
                  htmlFor="children-count"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  Children
                </label>
                <input
                  id="children-count"
                  type="number"
                  min={0}
                  max={20}
                  value={draft.householdSize.children}
                  onChange={(e) =>
                    setDraft((p) => ({
                      ...p,
                      householdSize: {
                        ...p.householdSize,
                        children: Math.max(0, Number(e.target.value) || 0),
                      },
                    }))
                  }
                  className="w-full px-3.5 py-2 rounded-lg border border-slate-300 text-sm font-mono tabular-nums text-slate-900 focus:outline-none focus:border-emerald-700 focus:ring-1 focus:ring-emerald-700"
                />
              </div>
            </div>

            <label className="mt-4 inline-flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={draft.householdSize.batchCookingPreferred}
                onChange={(e) =>
                  setDraft((p) => ({
                    ...p,
                    householdSize: {
                      ...p.householdSize,
                      batchCookingPreferred: e.target.checked,
                    },
                  }))
                }
                className="w-4 h-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-700"
              />
              <span className="text-sm text-slate-700">
                Prefer batch cooking / extra portions for next-day leftovers
              </span>
            </label>
          </section>

          {/* 2. Dietary Preferences & Health Goals */}
          <section className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="font-display text-lg font-semibold text-slate-900 pb-4 border-b border-slate-100">
              02. Dietary Preferences & Health Goals
            </h2>

            <div className="mt-5">
              <p className="text-sm font-medium text-slate-800 mb-2.5">Dietary Preferences</p>
              <div className="flex flex-wrap gap-2">
                {Array.from(new Set([...DIETARY_OPTIONS, ...draft.dietaryPreferences])).map(
                  (opt) => {
                    const active = draft.dietaryPreferences.includes(opt);
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => toggleInList('dietaryPreferences', opt)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${
                          active
                            ? 'bg-emerald-700 text-white border-emerald-700'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        {opt}
                      </button>
                    );
                  }
                )}
              </div>

              <div className="mt-3 flex gap-2 max-w-md">
                <input
                  type="text"
                  value={customDietary}
                  onChange={(e) => setCustomDietary(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addCustomItem('dietaryPreferences', customDietary, () =>
                        setCustomDietary('')
                      );
                    }
                  }}
                  placeholder="Add custom dietary preference..."
                  className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:border-emerald-700"
                />
                <button
                  type="button"
                  onClick={() =>
                    addCustomItem('dietaryPreferences', customDietary, () => setCustomDietary(''))
                  }
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Add</span>
                </button>
              </div>
            </div>

            <div className="mt-6 pt-5 border-t border-slate-100">
              <p className="text-sm font-medium text-slate-800 mb-2.5">Health & Nutrition Goals</p>
              <div className="flex flex-wrap gap-2">
                {Array.from(new Set([...HEALTH_GOAL_OPTIONS, ...draft.healthGoals])).map((opt) => {
                  const active = draft.healthGoals.includes(opt);
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => toggleInList('healthGoals', opt)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-emerald-700 text-white border-emerald-700'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 flex gap-2 max-w-md">
                <input
                  type="text"
                  value={customGoal}
                  onChange={(e) => setCustomGoal(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addCustomItem('healthGoals', customGoal, () => setCustomGoal(''));
                    }
                  }}
                  placeholder="Add custom nutrition goal..."
                  className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:border-emerald-700"
                />
                <button
                  type="button"
                  onClick={() => addCustomItem('healthGoals', customGoal, () => setCustomGoal(''))}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Add</span>
                </button>
              </div>
            </div>
          </section>

          {/* 3. Food Allergies & Intolerances */}
          <section className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100">
              <ShieldAlert className="w-5 h-5 text-red-600" aria-hidden="true" />
              <h2 className="font-display text-lg font-semibold text-slate-900">
                03. Food Allergies & Cross-Contamination
              </h2>
            </div>

            <div className="mt-5">
              <p className="text-sm font-medium text-slate-800 mb-2.5">
                Ingredients to Strictly Avoid
              </p>
              <div className="flex flex-wrap gap-2">
                {Array.from(new Set([...ALLERGY_OPTIONS, ...draft.allergies])).map((allergy) => {
                  const active = draft.allergies.includes(allergy);
                  return (
                    <button
                      key={allergy}
                      type="button"
                      onClick={() => toggleInList('allergies', allergy)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-red-700 text-white border-red-700'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {allergy}
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 flex gap-2 max-w-md">
                <input
                  type="text"
                  value={customAllergy}
                  onChange={(e) => setCustomAllergy(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addCustomItem('allergies', customAllergy, () => setCustomAllergy(''));
                    }
                  }}
                  placeholder="Add specific allergy or intolerance..."
                  className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:border-emerald-700"
                />
                <button
                  type="button"
                  onClick={() =>
                    addCustomItem('allergies', customAllergy, () => setCustomAllergy(''))
                  }
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Add</span>
                </button>
              </div>
            </div>

            <div className="mt-5 pt-5 border-t border-slate-100 space-y-3">
              <label className="inline-flex items-start gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={draft.crossContaminationStrict}
                  onChange={(e) =>
                    setDraft((p) => ({
                      ...p,
                      crossContaminationStrict: e.target.checked,
                    }))
                  }
                  className="mt-0.5 w-4 h-4 rounded border-slate-300 text-red-700 focus:ring-red-700"
                />
                <span className="text-sm text-slate-800">
                  Enforce strict cross-contamination precautions (exclude trace/shared-line
                  ingredients and include safe surface-prep reminders in recipes)
                </span>
              </label>

              {draft.crossContaminationStrict && (
                <div>
                  <label
                    htmlFor="cc-notes"
                    className="block text-xs font-medium text-slate-600 mb-1"
                  >
                    Cross-contamination notes
                  </label>
                  <input
                    id="cc-notes"
                    type="text"
                    value={draft.crossContaminationNotes}
                    onChange={(e) =>
                      setDraft((p) => ({
                        ...p,
                        crossContaminationNotes: e.target.value,
                      }))
                    }
                    placeholder="e.g. Use separate cutting board for gluten-free prep; avoid soy sauces with wheat"
                    className="w-full px-3.5 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:border-emerald-700"
                  />
                </div>
              )}
            </div>
          </section>

          {/* 4. Food Preferences & Spice Tolerance */}
          <section className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100">
              <Flame className="w-5 h-5 text-amber-600" aria-hidden="true" />
              <h2 className="font-display text-lg font-semibold text-slate-900">
                04. Food Preferences, Cuisines & Spice Tolerance
              </h2>
            </div>

            <div className="mt-5 space-y-6">
              <div>
                <p className="text-sm font-medium text-slate-800 mb-2">Spice Tolerance</p>
                <div className="inline-flex flex-wrap gap-1 p-1 rounded-lg bg-slate-100">
                  {SPICE_LEVELS.map((level) => {
                    const active = draft.spiceTolerance === level;
                    return (
                      <button
                        key={level}
                        type="button"
                        onClick={() => setDraft((p) => ({ ...p, spiceTolerance: level }))}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                          active
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {level}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-slate-800 mb-2.5">Preferred Cuisines</p>
                <div className="flex flex-wrap gap-2">
                  {Array.from(new Set([...CUISINE_OPTIONS, ...draft.preferredCuisines])).map(
                    (cuisine) => {
                      const active = draft.preferredCuisines.includes(cuisine);
                      return (
                        <button
                          key={cuisine}
                          type="button"
                          onClick={() => toggleInList('preferredCuisines', cuisine)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${
                            active
                              ? 'bg-emerald-700 text-white border-emerald-700'
                              : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          {cuisine}
                        </button>
                      );
                    }
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-slate-100">
                <div>
                  <label className="block text-sm font-medium text-slate-800 mb-2">
                    Favourite Foods
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={customFavorite}
                      onChange={(e) => setCustomFavorite(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addCustomItem('favoriteFoods', customFavorite, () =>
                            setCustomFavorite('')
                          );
                        }
                      }}
                      placeholder="e.g. Roasted broccoli, pasta"
                      className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:border-emerald-700"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        addCustomItem('favoriteFoods', customFavorite, () => setCustomFavorite(''))
                      }
                      className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Add
                    </button>
                  </div>
                  {draft.favoriteFoods.length > 0 && (
                    <ul className="mt-2.5 space-y-1.5">
                      {draft.favoriteFoods.map((item) => (
                        <li
                          key={item}
                          className="flex items-center justify-between px-3 py-1.5 rounded-md bg-slate-50 border border-slate-200 text-sm text-slate-800"
                        >
                          <span>{item}</span>
                          <button
                            type="button"
                            onClick={() => removeItem('favoriteFoods', item)}
                            aria-label={`Remove ${item}`}
                            className="text-slate-400 hover:text-slate-700"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-800 mb-2">
                    Disliked Ingredients
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={customDisliked}
                      onChange={(e) => setCustomDisliked(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addCustomItem('dislikedIngredients', customDisliked, () =>
                            setCustomDisliked('')
                          );
                        }
                      }}
                      placeholder="e.g. Cilantro, olives"
                      className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:border-emerald-700"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        addCustomItem('dislikedIngredients', customDisliked, () =>
                          setCustomDisliked('')
                        )
                      }
                      className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Add
                    </button>
                  </div>
                  {draft.dislikedIngredients.length > 0 && (
                    <ul className="mt-2.5 space-y-1.5">
                      {draft.dislikedIngredients.map((item) => (
                        <li
                          key={item}
                          className="flex items-center justify-between px-3 py-1.5 rounded-md bg-slate-50 border border-slate-200 text-sm text-slate-800"
                        >
                          <span>{item}</span>
                          <button
                            type="button"
                            onClick={() => removeItem('dislikedIngredients', item)}
                            aria-label={`Remove ${item}`}
                            className="text-slate-400 hover:text-slate-700"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* 5. Available Cooking Equipment */}
          <section className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100">
              <Utensils className="w-5 h-5 text-slate-700" aria-hidden="true" />
              <h2 className="font-display text-lg font-semibold text-slate-900">
                05. Available Cooking Equipment
              </h2>
            </div>

            <div className="mt-5">
              <div className="flex flex-wrap gap-2">
                {Array.from(new Set([...EQUIPMENT_OPTIONS, ...draft.cookingEquipment])).map(
                  (eq) => {
                    const active = draft.cookingEquipment.includes(eq);
                    return (
                      <button
                        key={eq}
                        type="button"
                        onClick={() => toggleInList('cookingEquipment', eq)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${
                          active
                            ? 'bg-emerald-700 text-white border-emerald-700'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        {eq}
                      </button>
                    );
                  }
                )}
              </div>

              <div className="mt-3 flex gap-2 max-w-md">
                <input
                  type="text"
                  value={customEquipment}
                  onChange={(e) => setCustomEquipment(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addCustomItem('cookingEquipment', customEquipment, () =>
                        setCustomEquipment('')
                      );
                    }
                  }}
                  placeholder="Add other appliance (e.g. Cast iron skillet)..."
                  className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:border-emerald-700"
                />
                <button
                  type="button"
                  onClick={() =>
                    addCustomItem('cookingEquipment', customEquipment, () =>
                      setCustomEquipment('')
                    )
                  }
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Add</span>
                </button>
              </div>
            </div>

            <div className="mt-6 pt-5 border-t border-slate-100">
              <label
                htmlFor="additional-notes"
                className="block text-sm font-medium text-slate-800 mb-1.5"
              >
                Additional Planning Notes
              </label>
              <textarea
                id="additional-notes"
                rows={3}
                value={draft.additionalNotes}
                onChange={(e) => setDraft((p) => ({ ...p, additionalNotes: e.target.value }))}
                placeholder="e.g. Weeknight dinners should take under 35 minutes; packable lunches for school."
                className="w-full px-3.5 py-2 rounded-lg border border-slate-300 text-sm text-slate-900 focus:outline-none focus:border-emerald-700 focus:ring-1 focus:ring-emerald-700"
              />
            </div>
          </section>
        </form>

        {/* Live Profile Reference Summary */}
        <aside className="lg:col-span-4 bg-white rounded-xl border border-slate-200 p-6 lg:sticky lg:top-24 space-y-5">
          <div>
            <p className="text-xs font-medium text-slate-500">Active Household Blueprint</p>
            <h3 className="mt-1 font-display text-xl font-bold text-slate-900">
              {draft.householdName || 'My Household'}
            </h3>
            <p className="mt-1 text-sm text-slate-600 tabular-nums">
              {draft.householdSize.adults} adults · {draft.householdSize.children} children ·{' '}
              {draft.householdSize.typicalServings} servings/meal
            </p>
          </div>

          <div className="pt-4 border-t border-slate-100 space-y-3 text-sm">
            <div>
              <p className="text-xs font-medium text-slate-500">Dietary Rules</p>
              <p className="mt-0.5 text-slate-800">
                {draft.dietaryPreferences.length > 0
                  ? draft.dietaryPreferences.join(' · ')
                  : 'No restrictions'}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium text-slate-500">Health Goals</p>
              <p className="mt-0.5 text-slate-800">
                {draft.healthGoals.length > 0 ? draft.healthGoals.join(' · ') : 'None selected'}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium text-slate-500">Allergies Excluded</p>
              <p
                className={`mt-0.5 ${
                  draft.allergies.length > 0 ? 'font-medium text-red-700' : 'text-slate-600'
                }`}
              >
                {draft.allergies.length > 0 ? draft.allergies.join(' · ') : 'None listed'}
              </p>
              {draft.crossContaminationStrict && (
                <p className="mt-1 text-xs text-red-700">
                  Strict cross-contamination protocol enabled
                </p>
              )}
            </div>

            <div>
              <p className="text-xs font-medium text-slate-500">Cuisines & Spice</p>
              <p className="mt-0.5 text-slate-800">
                {draft.preferredCuisines.length > 0
                  ? draft.preferredCuisines.join(' · ')
                  : 'Any cuisine'}{' '}
                · Spice: {draft.spiceTolerance}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium text-slate-500">Available Equipment</p>
              <p className="mt-0.5 text-slate-800">
                {draft.cookingEquipment.length > 0
                  ? draft.cookingEquipment.join(' · ')
                  : 'None selected'}
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100">
            <button
              type="submit"
              form="family-profile-form"
              disabled={saving}
              className="w-full py-2.5 px-4 rounded-lg bg-emerald-700 text-white text-sm font-medium hover:bg-emerald-800 disabled:opacity-60 transition-colors"
            >
              {saving ? 'Saving Profile...' : 'Save Reusable Profile'}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
};

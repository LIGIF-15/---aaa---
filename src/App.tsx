/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { TopBar, ActiveTab } from './components/TopBar';
import { PantryInventoryView } from './components/PantryInventoryView';
import { ScanPantryView } from './components/ScanPantryView';
import { FamilyProfileView } from './components/FamilyProfileView';
import { MealPlannerView } from './components/MealPlannerView';
import {
  ExpiryDateType,
  FamilyProfile,
  PantryItem,
  StagedReviewItem,
  StorageLocation,
} from './types/pantry';
import { getExpiryStatus } from './utils/pantryHelpers';

const INITIAL_PROFILE: FamilyProfile = {
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

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('inventory');
  const [profile, setProfile] = useState<FamilyProfile>(INITIAL_PROFILE);
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [profileRes, pantryRes] = await Promise.all([
        fetch('/api/profile'),
        fetch('/api/pantry'),
      ]);
      if (!profileRes.ok || !pantryRes.ok) {
        throw new Error('Failed to load household workspace data.');
      }
      const profileData = await profileRes.json();
      const pantryData = await pantryRes.json();
      if (profileData.profile) setProfile(profileData.profile);
      if (Array.isArray(pantryData.items)) setPantryItems(pantryData.items);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Unable to connect to workspace.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  const handleSaveProfile = async (updated: FamilyProfile) => {
    const res = await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to save family profile.');
    }
    setProfile(data.profile);
  };

  const handleConfirmScanSave = async (stagedItems: StagedReviewItem[]) => {
    const payload = {
      items: stagedItems.map((s) => ({
        name: s.name,
        category: s.category,
        foodState: s.food_state,
        brandOrLabel: s.brand_or_label,
        quantity: s.quantity,
        storageLocation: s.storage_location,
        condition: s.condition,
        freshness: {
          status: s.freshness.status,
          confidence: s.freshness.confidence,
          visualObservations: s.freshness.visual_observations,
        },
        expiry: {
          date: s.expiry.date,
          dateType: s.expiry.date_type,
          confidence: s.expiry.confidence,
        },
        identificationConfidence: s.identification_confidence,
        verificationRequired: s.verification_required,
        thumbnailDataUrl: s.thumbnailDataUrl,
        duplicateAction: s.duplicateAction,
        duplicateMatchId: s.duplicateMatchId,
      })),
    };

    const res = await fetch('/api/pantry/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to save scanned ingredients.');
    }
    setPantryItems(data.items);
    return { addedCount: data.addedCount as number, mergedCount: data.mergedCount as number };
  };

  const handleUpdatePantryItem = async (id: string, patch: Partial<PantryItem>) => {
    const res = await fetch(`/api/pantry/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (res.ok && Array.isArray(data.items)) {
      setPantryItems(data.items);
    }
  };

  const handleDeletePantryItem = async (id: string) => {
    const res = await fetch(`/api/pantry/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    const data = await res.json();
    if (res.ok && Array.isArray(data.items)) {
      setPantryItems(data.items);
    }
  };

  const handleAddManualItem = async (payload: {
    name: string;
    category: string;
    quantity: { value: number; unit: string };
    storageLocation: StorageLocation;
    expiry: { date: string | null; dateType: ExpiryDateType | null };
  }) => {
    const res = await fetch('/api/pantry/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (res.ok && Array.isArray(data.items)) {
      setPantryItems(data.items);
    }
  };

  const { verificationCount, expiringCount } = useMemo(() => {
    let verify = 0;
    let expiring = 0;
    for (const item of pantryItems) {
      if (item.verificationRequired) verify += 1;
      const exp = getExpiryStatus(item.expiry.date);
      if (exp.severity === 'expired' || exp.severity === 'urgent' || exp.severity === 'soon') {
        expiring += 1;
      }
    }
    return { verificationCount: verify, expiringCount: expiring };
  }, [pantryItems]);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <TopBar
        activeTab={activeTab}
        onNavigate={setActiveTab}
        verificationCount={verificationCount}
        expiringCount={expiringCount}
      />

      {loadError && (
        <div className="max-w-[1360px] mx-auto w-full px-4 sm:px-6 pt-6">
          <div
            role="alert"
            className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800 flex items-center justify-between gap-4"
          >
            <span>{loadError}</span>
            <button
              type="button"
              onClick={loadWorkspace}
              className="px-3 py-1 rounded-md bg-white border border-red-200 text-xs font-medium text-red-800 hover:bg-red-100"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      <main className="flex-1">
        {activeTab === 'inventory' && (
          <PantryInventoryView
            items={pantryItems}
            loading={loading}
            onUpdateItem={handleUpdatePantryItem}
            onDeleteItem={handleDeletePantryItem}
            onAddManualItem={handleAddManualItem}
            onGoToScan={() => setActiveTab('scan')}
          />
        )}

        {activeTab === 'scan' && (
          <ScanPantryView
            existingPantry={pantryItems}
            onConfirmSave={handleConfirmScanSave}
            onGoToInventory={() => setActiveTab('inventory')}
          />
        )}

        {activeTab === 'profile' && (
          <FamilyProfileView
            profile={profile}
            onSaveProfile={handleSaveProfile}
            onGoToMeals={() => setActiveTab('meals')}
          />
        )}

        {activeTab === 'meals' && (
          <MealPlannerView
            profile={profile}
            pantryItems={pantryItems}
            onEditProfile={() => setActiveTab('profile')}
            onGoToScan={() => setActiveTab('scan')}
            onPantryUpdated={setPantryItems}
          />
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white py-5 mt-12">
        <div className="max-w-[1360px] mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <span>Hearthstock · Household Pantry & Family Profile Workspace</span>
          <span>
            Visual freshness indicators are informational only — always inspect food before
            consuming.
          </span>
        </div>
      </footer>
    </div>
  );
}

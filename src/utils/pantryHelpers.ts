import { PantryItem, ScannedIngredient, ScanResultJSON } from '../types/pantry';

export function normalizeIngredientName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(fresh|organic|raw|whole|sliced|chopped|diced|large|small|medium|bag of|carton of|jar of|can of|bottle of|box of)\b/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/s\b/, '');
}

export function findDuplicatePantryItem(
  candidateName: string,
  storageLocation: string,
  existingItems: PantryItem[]
): PantryItem | null {
  const norm = normalizeIngredientName(candidateName);
  if (!norm) return null;

  const exactSameLocation = existingItems.find(
    (item) => item.normalizedName === norm && item.storageLocation === storageLocation
  );
  if (exactSameLocation) return exactSameLocation;

  const fuzzySameLocation = existingItems.find((item) => {
    if (item.storageLocation !== storageLocation) return false;
    return (
      (item.normalizedName.length >= 4 && norm.includes(item.normalizedName)) ||
      (norm.length >= 4 && item.normalizedName.includes(norm))
    );
  });
  if (fuzzySameLocation) return fuzzySameLocation;

  const exactAnyLocation = existingItems.find((item) => item.normalizedName === norm);
  return exactAnyLocation ?? null;
}

export interface ExpiryStatusInfo {
  label: string;
  severity: 'expired' | 'urgent' | 'soon' | 'ok' | 'none';
  daysRemaining: number | null;
}

export function getExpiryStatus(dateStr: string | null): ExpiryStatusInfo {
  if (!dateStr) {
    return { label: 'No expiry recorded', severity: 'none', daysRemaining: null };
  }

  const parsed = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return { label: dateStr, severity: 'none', daysRemaining: null };
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffMs = parsed.getTime() - today.getTime();
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (days < 0) {
    const abs = Math.abs(days);
    return {
      label: `Expired ${abs}d ago`,
      severity: 'expired',
      daysRemaining: days,
    };
  }
  if (days === 0) {
    return { label: 'Expires today', severity: 'urgent', daysRemaining: 0 };
  }
  if (days <= 3) {
    return { label: `Expires in ${days}d`, severity: 'urgent', daysRemaining: days };
  }
  if (days <= 7) {
    return { label: `Expires in ${days}d`, severity: 'soon', daysRemaining: days };
  }
  return { label: `${days}d remaining`, severity: 'ok', daysRemaining: days };
}

export function formatConfidence(conf: number | null | undefined): string {
  if (conf === null || conf === undefined || Number.isNaN(conf)) return '—';
  return `${Math.round(conf * 100)}%`;
}

export function stripInternalFieldsForSpecJson(result: ScanResultJSON): ScanResultJSON {
  return {
    pantry_inventory: result.pantry_inventory.map((item: ScannedIngredient) => ({
      item_id: item.item_id,
      name: item.name,
      category: item.category,
      food_state: item.food_state,
      brand_or_label: item.brand_or_label,
      quantity: {
        value: item.quantity.value,
        unit: item.quantity.unit,
        estimated: item.quantity.estimated,
      },
      storage_location: item.storage_location,
      condition: item.condition,
      freshness: {
        status: item.freshness.status,
        confidence: item.freshness.confidence,
        visual_observations: item.freshness.visual_observations,
      },
      expiry: {
        date: item.expiry.date,
        date_type: item.expiry.date_type,
        confidence: item.expiry.confidence,
      },
      identification_confidence: item.identification_confidence,
      verification_required: item.verification_required,
    })),
    unidentified_items: result.unidentified_items,
    processing_status: result.processing_status,
  };
}

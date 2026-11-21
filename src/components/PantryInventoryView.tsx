import React, { useState, useMemo } from 'react';
import {
  Search,
  Plus,
  Minus,
  Trash2,
  AlertTriangle,
  Check,
  Upload,
  Package,
  X,
  Edit3,
} from 'lucide-react';
import {
  FOOD_CATEGORIES,
  PantryItem,
  STORAGE_LOCATIONS,
  StorageLocation,
  ExpiryDateType,
} from '../types/pantry';
import { formatConfidence, getExpiryStatus } from '../utils/pantryHelpers';

interface PantryInventoryViewProps {
  items: PantryItem[];
  loading: boolean;
  onUpdateItem: (id: string, patch: Partial<PantryItem>) => Promise<void>;
  onDeleteItem: (id: string) => Promise<void>;
  onAddManualItem: (payload: {
    name: string;
    category: string;
    quantity: { value: number; unit: string };
    storageLocation: StorageLocation;
    expiry: { date: string | null; dateType: ExpiryDateType | null };
  }) => Promise<void>;
  onGoToScan: () => void;
}

type StatusFilter = 'all' | 'expiring' | 'verify';

export const PantryInventoryView: React.FC<PantryInventoryViewProps> = ({
  items,
  loading,
  onUpdateItem,
  onDeleteItem,
  onAddManualItem,
  onGoToScan,
}) => {
  const [locationFilter, setLocationFilter] = useState<'All' | StorageLocation>('All');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState('');

  // Manual Add Modal
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('Vegetables');
  const [newQtyValue, setNewQtyValue] = useState(1);
  const [newQtyUnit, setNewQtyUnit] = useState('item');
  const [newLocation, setNewLocation] = useState<StorageLocation>(StorageLocation.REFRIGERATOR);
  const [newExpiryDate, setNewExpiryDate] = useState('');
  const [newExpiryType, setNewExpiryType] = useState<ExpiryDateType>('Best Before');
  const [submittingManual, setSubmittingManual] = useState(false);

  const metrics = useMemo(() => {
    let expiringSoon = 0;
    let needsVerify = 0;
    const activeZones = new Set<string>();

    for (const item of items) {
      activeZones.add(item.storageLocation);
      if (item.verificationRequired) needsVerify += 1;
      const exp = getExpiryStatus(item.expiry.date);
      if (exp.severity === 'expired' || exp.severity === 'urgent' || exp.severity === 'soon') {
        expiringSoon += 1;
      }
    }

    return {
      total: items.length,
      expiringSoon,
      needsVerify,
      zones: activeZones.size,
    };
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items.filter((item) => {
      if (locationFilter !== 'All' && item.storageLocation !== locationFilter) return false;
      if (statusFilter === 'verify' && !item.verificationRequired) return false;
      if (statusFilter === 'expiring') {
        const exp = getExpiryStatus(item.expiry.date);
        if (exp.severity !== 'expired' && exp.severity !== 'urgent' && exp.severity !== 'soon') {
          return false;
        }
      }
      if (q) {
        const hay = `${item.name} ${item.category} ${item.brandOrLabel || ''} ${item.storageLocation}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, locationFilter, statusFilter, searchQuery]);

  const handleAdjustQty = async (item: PantryItem, delta: number) => {
    const step = item.quantity.value <= 1 && delta < 0 ? 0.5 : 1;
    const next = Math.max(0, Math.round((item.quantity.value + (delta > 0 ? step : -step)) * 100) / 100);
    if (next === 0) {
      await onDeleteItem(item.id);
    } else {
      await onUpdateItem(item.id, {
        quantity: {
          ...item.quantity,
          value: next,
          estimated: false,
        },
      });
    }
  };

  const commitNameEdit = async (item: PantryItem) => {
    const trimmed = editingNameValue.trim();
    setEditingNameId(null);
    if (!trimmed || trimmed === item.name) return;
    await onUpdateItem(item.id, { name: trimmed, verificationRequired: false });
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setSubmittingManual(true);
    try {
      await onAddManualItem({
        name: newName.trim(),
        category: newCategory,
        quantity: { value: Math.max(0.1, newQtyValue), unit: newQtyUnit.trim() || 'item' },
        storageLocation: newLocation,
        expiry: {
          date: newExpiryDate || null,
          dateType: newExpiryDate ? newExpiryType : null,
        },
      });
      setNewName('');
      setNewQtyValue(1);
      setNewQtyUnit('item');
      setNewExpiryDate('');
      setAddModalOpen(false);
    } finally {
      setSubmittingManual(false);
    }
  };

  return (
    <div className="max-w-[1360px] mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Household Digital Pantry
          </h1>
          <p className="mt-1.5 text-sm text-slate-600 max-w-2xl">
            Persistent household ingredient inventory. Track quantities as items are consumed or
            replenished, verify uncertain detections, and prioritize ingredients approaching expiry.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setAddModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>Add Ingredient</span>
          </button>
          <button
            type="button"
            onClick={onGoToScan}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-700 text-white text-sm font-medium hover:bg-emerald-800 transition-colors whitespace-nowrap"
          >
            <Upload className="w-4 h-4" aria-hidden="true" />
            <span>Upload Photos</span>
          </button>
        </div>
      </div>

      {/* KPI Summary Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-medium text-slate-500">Tracked Ingredients</p>
          <p className="mt-1 font-display text-2xl font-bold text-slate-900 tabular-nums">
            {metrics.total}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-medium text-slate-500">Expiring Within 7 Days</p>
          <p
            className={`mt-1 font-display text-2xl font-bold tabular-nums ${
              metrics.expiringSoon > 0 ? 'text-amber-700' : 'text-slate-900'
            }`}
          >
            {metrics.expiringSoon}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-medium text-slate-500">Needs Verification</p>
          <p
            className={`mt-1 font-display text-2xl font-bold tabular-nums ${
              metrics.needsVerify > 0 ? 'text-amber-700' : 'text-slate-900'
            }`}
          >
            {metrics.needsVerify}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-medium text-slate-500">Active Storage Zones</p>
          <p className="mt-1 font-display text-2xl font-bold text-slate-900 tabular-nums">
            {metrics.zones}
          </p>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Storage zone segmented tabs */}
          <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-100">
            {(['All', ...STORAGE_LOCATIONS] as const).map((loc) => {
              const active = locationFilter === loc;
              return (
                <button
                  key={loc}
                  type="button"
                  onClick={() => setLocationFilter(loc)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {loc === 'All' ? 'All Zones' : loc}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Status filter */}
            <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100">
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'expiring', label: 'Expiring Soon' },
                  { id: 'verify', label: 'Needs Verify' },
                ] as { id: StatusFilter; label: string }[]
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                    statusFilter === tab.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative flex-1 sm:w-64">
              <Search
                className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                aria-hidden="true"
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search ingredients..."
                className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-300 text-sm text-slate-900 focus:outline-none focus:border-emerald-700"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Inventory Table / List */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-4">
            {[1, 2, 3, 4].map((row) => (
              <div
                key={row}
                className="h-14 rounded-lg bg-slate-100 animate-pulse"
              />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center max-w-md mx-auto">
            <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
              <Package className="w-6 h-6" aria-hidden="true" />
            </div>
            <h2 className="mt-4 font-display text-lg font-semibold text-slate-900">
              Your digital pantry is empty
            </h2>
            <p className="mt-1.5 text-sm text-slate-600">
              Upload photos of your ingredients, refrigerator, freezer, or dry pantry shelves to
              build a structured inventory automatically.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={onGoToScan}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-700 text-white text-sm font-medium hover:bg-emerald-800"
              >
                <Upload className="w-4 h-4" aria-hidden="true" />
                <span>Upload Ingredient Photos</span>
              </button>
              <button
                type="button"
                onClick={() => setAddModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                <span>Add Manually</span>
              </button>
            </div>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            No ingredients match the current filter. Try clearing the search or switching storage
            zones.
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {filteredItems.map((item) => {
              const expInfo = getExpiryStatus(item.expiry.date);
              const isAlertRow =
                item.verificationRequired ||
                expInfo.severity === 'expired' ||
                expInfo.severity === 'urgent';

              return (
                <div
                  key={item.id}
                  className={`p-4 sm:px-6 flex flex-col xl:flex-row xl:items-center justify-between gap-4 transition-colors hover:bg-slate-50/70 ${
                    isAlertRow ? 'bg-amber-50/30' : ''
                  }`}
                >
                  {/* Thumbnail + Identity */}
                  <div className="flex items-start gap-4 min-w-0 flex-1">
                    {item.thumbnailDataUrl ? (
                      <img
                        src={item.thumbnailDataUrl}
                        alt={item.name}
                        referrerPolicy="no-referrer"
                        className="w-12 h-12 rounded-lg object-cover border border-slate-200 bg-slate-100 shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-lg border border-slate-200 bg-slate-100 flex items-center justify-center text-slate-400 shrink-0">
                        <Package className="w-5 h-5" aria-hidden="true" />
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {editingNameId === item.id ? (
                          <input
                            type="text"
                            autoFocus
                            value={editingNameValue}
                            onChange={(e) => setEditingNameValue(e.target.value)}
                            onBlur={() => commitNameEdit(item)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitNameEdit(item);
                              if (e.key === 'Escape') setEditingNameId(null);
                            }}
                            className="px-2 py-0.5 rounded border border-emerald-700 text-sm font-semibold text-slate-900 focus:outline-none"
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingNameId(item.id);
                              setEditingNameValue(item.name);
                            }}
                            title="Click to rename ingredient"
                            className="group inline-flex items-center gap-1.5 text-left font-semibold text-sm text-slate-900 hover:text-emerald-800"
                          >
                            <span className="truncate">{item.name}</span>
                            <Edit3
                              className="w-3.5 h-3.5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                              aria-hidden="true"
                            />
                          </button>
                        )}

                        {item.verificationRequired && (
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateItem(item.id, { verificationRequired: false })
                            }
                            className="inline-flex items-center gap-1 text-xs font-medium text-amber-800 hover:text-emerald-800"
                            title="Click to mark verified"
                          >
                            <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Needs verification (Confirm)</span>
                          </button>
                        )}
                      </div>

                      {/* Unboxed Metadata with typographic separators */}
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                        <span>{item.category}</span>
                        <span aria-hidden="true">·</span>
                        <span className="capitalize">{item.foodState}</span>
                        {item.brandOrLabel && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{item.brandOrLabel}</span>
                          </>
                        )}
                        <span aria-hidden="true">·</span>
                        <span
                          className={`font-medium ${
                            item.freshness.status === 'Good'
                              ? 'text-emerald-700'
                              : item.freshness.status === 'Use Soon'
                                ? 'text-amber-700'
                                : 'text-red-700'
                          }`}
                        >
                          {item.freshness.status}
                        </span>
                        {item.identificationConfidence !== null && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">
                              AI {formatConfidence(item.identificationConfidence)}
                            </span>
                          </>
                        )}
                      </div>

                      {item.freshness.visualObservations && (
                        <p className="mt-1 text-xs text-slate-500 truncate max-w-xl">
                          {item.freshness.visualObservations}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Controls Cluster: Storage, Quantity, Expiry, Delete */}
                  <div className="flex flex-wrap items-center gap-4 shrink-0">
                    {/* Storage Location Selector */}
                    <div>
                      <label className="sr-only" htmlFor={`loc-${item.id}`}>
                        Storage location for {item.name}
                      </label>
                      <select
                        id={`loc-${item.id}`}
                        value={item.storageLocation}
                        onChange={(e) =>
                          onUpdateItem(item.id, {
                            storageLocation: e.target.value as StorageLocation,
                          })
                        }
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-700 focus:outline-none focus:border-emerald-700"
                      >
                        {STORAGE_LOCATIONS.map((loc) => (
                          <option key={loc} value={loc}>
                            {loc}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Quantity Stepper */}
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleAdjustQty(item, -1)}
                        aria-label={`Consume 1 ${item.quantity.unit} of ${item.name}`}
                        className="w-7 h-7 rounded-md border border-slate-200 bg-white flex items-center justify-center text-slate-600 hover:bg-slate-100"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <div className="min-w-[84px] text-center">
                        <span className="font-mono text-sm font-semibold text-slate-900 tabular-nums">
                          {item.quantity.value}
                        </span>{' '}
                        <span className="text-xs text-slate-600">{item.quantity.unit}</span>
                        <p className="text-[11px] text-slate-400">
                          {item.quantity.estimated ? 'Estimated' : 'Confirmed'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleAdjustQty(item, 1)}
                        aria-label={`Replenish 1 ${item.quantity.unit} of ${item.name}`}
                        className="w-7 h-7 rounded-md border border-slate-200 bg-white flex items-center justify-center text-slate-600 hover:bg-slate-100"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Expiry Date & Countdown */}
                    <div className="flex flex-col items-start sm:items-end min-w-[140px]">
                      <input
                        type="date"
                        aria-label={`Expiry date for ${item.name}`}
                        value={item.expiry.date || ''}
                        onChange={(e) =>
                          onUpdateItem(item.id, {
                            expiry: {
                              ...item.expiry,
                              date: e.target.value || null,
                              dateType: e.target.value
                                ? item.expiry.dateType || 'Best Before'
                                : null,
                            },
                          })
                        }
                        className="px-2 py-1 rounded-md border border-slate-200 bg-white text-xs font-mono tabular-nums text-slate-800 focus:outline-none focus:border-emerald-700"
                      />
                      <span
                        className={`mt-0.5 text-[11px] font-medium tabular-nums ${
                          expInfo.severity === 'expired'
                            ? 'text-red-700'
                            : expInfo.severity === 'urgent'
                              ? 'text-amber-700'
                              : expInfo.severity === 'soon'
                                ? 'text-amber-600'
                                : 'text-slate-500'
                        }`}
                      >
                        {expInfo.label}
                      </span>
                    </div>

                    {/* Verify / Delete */}
                    <div className="flex items-center gap-1">
                      {item.verificationRequired && (
                        <button
                          type="button"
                          onClick={() => onUpdateItem(item.id, { verificationRequired: false })}
                          title="Confirm ingredient"
                          aria-label={`Confirm ${item.name}`}
                          className="p-1.5 rounded-md text-emerald-700 hover:bg-emerald-50"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onDeleteItem(item.id)}
                        title="Remove from pantry"
                        aria-label={`Remove ${item.name}`}
                        className="p-1.5 rounded-md text-slate-400 hover:text-red-700 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Ingredient Manually Modal */}
      {addModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Add ingredient manually"
          className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-xl border border-slate-200 max-w-md w-full overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-slate-900">
                Add Ingredient Manually
              </h3>
              <button
                type="button"
                onClick={() => setAddModalOpen(false)}
                className="text-slate-500 hover:text-slate-800"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleManualSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Ingredient Name
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Baby Spinach"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:border-emerald-700"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Category
                  </label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:border-emerald-700"
                  >
                    {FOOD_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Storage Location
                  </label>
                  <select
                    value={newLocation}
                    onChange={(e) => setNewLocation(e.target.value as StorageLocation)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:border-emerald-700"
                  >
                    {STORAGE_LOCATIONS.map((loc) => (
                      <option key={loc} value={loc}>
                        {loc}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Quantity
                  </label>
                  <input
                    type="number"
                    min={0.1}
                    step="any"
                    value={newQtyValue}
                    onChange={(e) => setNewQtyValue(Number(e.target.value) || 1)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono tabular-nums focus:outline-none focus:border-emerald-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Unit
                  </label>
                  <input
                    type="text"
                    value={newQtyUnit}
                    onChange={(e) => setNewQtyUnit(e.target.value)}
                    placeholder="e.g. heads, cans, g"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:border-emerald-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Expiry Date (Optional)
                  </label>
                  <input
                    type="date"
                    value={newExpiryDate}
                    onChange={(e) => setNewExpiryDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono tabular-nums focus:outline-none focus:border-emerald-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Date Label Type
                  </label>
                  <select
                    value={newExpiryType}
                    onChange={(e) => setNewExpiryType(e.target.value as ExpiryDateType)}
                    disabled={!newExpiryDate}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white disabled:opacity-50"
                  >
                    <option value="Best Before">Best Before</option>
                    <option value="Expiry">Expiry</option>
                    <option value="Use By">Use By</option>
                    <option value="Sell By">Sell By</option>
                  </select>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setAddModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingManual}
                  className="px-4 py-2 rounded-lg bg-emerald-700 text-white text-sm font-medium hover:bg-emerald-800 disabled:opacity-60"
                >
                  {submittingManual ? 'Adding...' : 'Save Ingredient'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

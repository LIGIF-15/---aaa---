import React, { useState, useRef } from 'react';
import {
  Upload,
  Trash2,
  Check,
  AlertTriangle,
  Code2,
  Copy,
  Plus,
  Sparkles,
  X,
  RefreshCw,
} from 'lucide-react';
import {
  FOOD_CATEGORIES,
  PantryItem,
  STORAGE_LOCATIONS,
  ScanResultJSON,
  ScannedIngredient,
  StagedReviewItem,
  StorageLocation,
  ExpiryDateType,
} from '../types/pantry';
import { cropIngredientThumbnail, fileOrUrlToPreparedImage } from '../utils/imageCrop';
import {
  findDuplicatePantryItem,
  formatConfidence,
  normalizeIngredientName,
  stripInternalFieldsForSpecJson,
} from '../utils/pantryHelpers';
import sampleFridgeImg from '../assets/images/sample_fridge_interior_1794644835156.jpg';
import samplePantryImg from '../assets/images/sample_dry_pantry_1794644835542.jpg';
import sampleCountertopImg from '../assets/images/sample_countertop_produce_1794644837049.jpg';

interface QueuedPhoto {
  id: string;
  name: string;
  dataUrl: string;
  base64: string;
  mimeType: string;
  storageLocation: StorageLocation;
  status: 'queued' | 'scanning' | 'done' | 'error';
  errorMessage?: string;
  rawJson?: ScanResultJSON;
}

interface ScanPantryViewProps {
  existingPantry: PantryItem[];
  onConfirmSave: (
    stagedItems: StagedReviewItem[]
  ) => Promise<{ addedCount: number; mergedCount: number }>;
  onGoToInventory: () => void;
}

const SAMPLE_PHOTOS: { label: string; url: string; location: StorageLocation }[] = [
  {
    label: 'Refrigerator Shelf',
    url: sampleFridgeImg,
    location: StorageLocation.REFRIGERATOR,
  },
  {
    label: 'Dry Pantry Shelf',
    url: samplePantryImg,
    location: StorageLocation.DRY_PANTRY,
  },
  {
    label: 'Countertop Produce',
    url: sampleCountertopImg,
    location: StorageLocation.COUNTERTOP,
  },
];

export const ScanPantryView: React.FC<ScanPantryViewProps> = ({
  existingPantry,
  onConfirmSave,
  onGoToInventory,
}) => {
  const [defaultLocation, setDefaultLocation] = useState<StorageLocation>(
    StorageLocation.REFRIGERATOR
  );
  const [photos, setPhotos] = useState<QueuedPhoto[]>([]);
  const [stagedItems, setStagedItems] = useState<StagedReviewItem[]>([]);
  const [unidentifiedList, setUnidentifiedList] = useState<
    { photoName: string; description: string; reason: string }[]
  >([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showJsonPanel, setShowJsonPanel] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);
  const [saveSummary, setSaveSummary] = useState<{
    addedCount: number;
    mergedCount: number;
  } | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFilesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setErrorBanner(null);
    setSaveSummary(null);

    const added: QueuedPhoto[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      try {
        const prepared = await fileOrUrlToPreparedImage(file);
        added.push({
          id: `photo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: file.name,
          dataUrl: prepared.dataUrl,
          base64: prepared.base64,
          mimeType: prepared.mimeType,
          storageLocation: defaultLocation,
          status: 'queued',
        });
      } catch {
        setErrorBanner(`Could not read image "${file.name}". Please try a JPEG or PNG file.`);
      }
    }
    if (added.length > 0) {
      setPhotos((prev) => [...prev, ...added]);
    }
  };

  const handleLoadSample = async (sample: (typeof SAMPLE_PHOTOS)[number]) => {
    setErrorBanner(null);
    setSaveSummary(null);
    try {
      const prepared = await fileOrUrlToPreparedImage(sample.url);
      setPhotos((prev) => [
        ...prev,
        {
          id: `photo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: `${sample.label} (Sample)`,
          dataUrl: prepared.dataUrl,
          base64: prepared.base64,
          mimeType: prepared.mimeType,
          storageLocation: sample.location,
          status: 'queued',
        },
      ]);
    } catch {
      setErrorBanner('Failed to load sample photo.');
    }
  };

  const analyzeQueuedPhotos = async () => {
    const targets = photos.filter((p) => p.status === 'queued' || p.status === 'error');
    if (targets.length === 0) return;

    setIsAnalyzing(true);
    setErrorBanner(null);
    setSaveSummary(null);

    const newlyStaged: StagedReviewItem[] = [];
    const newUnidentified: { photoName: string; description: string; reason: string }[] = [];

    for (const photo of targets) {
      setPhotos((prev) =>
        prev.map((p) => (p.id === photo.id ? { ...p, status: 'scanning', errorMessage: undefined } : p))
      );

      try {
        const res = await fetch('/api/pantry/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64: photo.base64,
            mimeType: photo.mimeType,
            storageLocation: photo.storageLocation,
            photoName: photo.name,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Vision scan failed');
        }

        const scanResult = data as ScanResultJSON;

        for (const item of scanResult.pantry_inventory) {
          const thumb = await cropIngredientThumbnail(photo.dataUrl, item.bounding_box);
          const existingMatch = findDuplicatePantryItem(
            item.name,
            item.storage_location,
            existingPantry
          );

          // Also check if another staged item in this batch already matches
          const batchMatch = [...stagedItems, ...newlyStaged].find(
            (s) =>
              normalizeIngredientName(s.name) === normalizeIngredientName(item.name) &&
              s.storage_location === item.storage_location
          );

          newlyStaged.push({
            ...item,
            reviewId: `rev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            photoId: photo.id,
            photoName: photo.name,
            thumbnailDataUrl: thumb,
            includeInSave: true,
            duplicateMatchId: existingMatch?.id || null,
            duplicateAction: existingMatch || batchMatch ? 'merge' : 'separate',
          });
        }

        for (const u of scanResult.unidentified_items || []) {
          if (typeof u === 'string') {
            newUnidentified.push({
              photoName: photo.name,
              description: u,
              reason: 'Obscured or unreadable label',
            });
          } else {
            newUnidentified.push({
              photoName: photo.name,
              description: u.description,
              reason: u.reason,
            });
          }
        }

        setPhotos((prev) =>
          prev.map((p) =>
            p.id === photo.id ? { ...p, status: 'done', rawJson: scanResult } : p
          )
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Scan failed';
        setPhotos((prev) =>
          prev.map((p) =>
            p.id === photo.id ? { ...p, status: 'error', errorMessage: message } : p
          )
        );
        setErrorBanner(message);
      }
    }

    if (newlyStaged.length > 0) {
      setStagedItems((prev) => [...prev, ...newlyStaged]);
    }
    if (newUnidentified.length > 0) {
      setUnidentifiedList((prev) => [...prev, ...newUnidentified]);
    }

    setIsAnalyzing(false);
  };

  const updateStagedItem = (reviewId: string, updater: (item: StagedReviewItem) => StagedReviewItem) => {
    setStagedItems((prev) => prev.map((item) => (item.reviewId === reviewId ? updater(item) : item)));
  };

  const removeStagedItem = (reviewId: string) => {
    setStagedItems((prev) => prev.filter((item) => item.reviewId !== reviewId));
  };

  const addManualStagedItem = (initialName = '') => {
    const nextIdx = stagedItems.length + 1;
    const blank: StagedReviewItem = {
      reviewId: `rev_manual_${Date.now()}`,
      photoId: 'manual',
      photoName: 'Manual Entry',
      thumbnailDataUrl: null,
      includeInSave: true,
      duplicateMatchId: null,
      duplicateAction: 'merge',
      item_id: `ING${String(nextIdx).padStart(3, '0')}`,
      name: initialName,
      category: 'Other',
      food_state: 'raw',
      brand_or_label: null,
      quantity: { value: 1, unit: 'item', estimated: false },
      storage_location: defaultLocation,
      condition: 'Fresh',
      freshness: {
        status: 'Good',
        confidence: 1,
        visual_observations: 'Manually entered by user',
      },
      expiry: {
        date: null,
        date_type: null,
        confidence: null,
      },
      identification_confidence: 1,
      verification_required: false,
    };
    setStagedItems((prev) => [blank, ...prev]);
  };

  const handleConfirmAll = async () => {
    const selected = stagedItems.filter((i) => i.includeInSave && i.name.trim() !== '');
    if (selected.length === 0) return;
    setIsSaving(true);
    setErrorBanner(null);
    try {
      const res = await onConfirmSave(selected);
      setSaveSummary(res);
      setStagedItems([]);
      setUnidentifiedList([]);
      setPhotos([]);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to save items to pantry.');
    } finally {
      setIsSaving(false);
    }
  };

  const combinedSpecJson: ScanResultJSON = {
    pantry_inventory: photos
      .filter((p) => p.rawJson)
      .flatMap((p) => stripInternalFieldsForSpecJson(p.rawJson!).pantry_inventory),
    unidentified_items: photos
      .filter((p) => p.rawJson)
      .flatMap((p) => p.rawJson!.unidentified_items),
    processing_status: photos.some((p) => p.status === 'error')
      ? 'partial'
      : photos.some((p) => p.status === 'done')
        ? 'completed'
        : 'completed',
  };

  const copyRawJson = () => {
    navigator.clipboard.writeText(JSON.stringify(combinedSpecJson, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  const queuedCount = photos.filter((p) => p.status === 'queued' || p.status === 'error').length;
  const verifyCount = stagedItems.filter((i) => i.verification_required).length;

  return (
    <div className="max-w-[1360px] mx-auto px-4 sm:px-6 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Smart Pantry AI Scan
          </h1>
          <p className="mt-1.5 text-sm text-slate-600 max-w-2xl">
            Upload one or multiple photos of your ingredients, refrigerator, freezer, dry pantry, or
            countertop. Gemini Vision identifies each ingredient, estimates quantities, checks
            visible dates, and stages items for your confirmation.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {photos.some((p) => p.rawJson) && (
            <button
              type="button"
              onClick={() => setShowJsonPanel((v) => !v)}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              <Code2 className="w-4 h-4" aria-hidden="true" />
              <span>{showJsonPanel ? 'Hide JSON' : 'Inspect Step 3 JSON'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={onGoToInventory}
            className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            View Pantry
          </button>
        </div>
      </div>

      {saveSummary && (
        <div
          role="status"
          className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2.5 text-sm text-emerald-900">
            <Check className="w-5 h-5 text-emerald-700 shrink-0" aria-hidden="true" />
            <span>
              Saved to persistent pantry: <strong className="tabular-nums">{saveSummary.addedCount}</strong> new
              ingredient{saveSummary.addedCount === 1 ? '' : 's'} added and{' '}
              <strong className="tabular-nums">{saveSummary.mergedCount}</strong> duplicate
              {saveSummary.mergedCount === 1 ? '' : 's'} merged.
            </span>
          </div>
          <button
            type="button"
            onClick={onGoToInventory}
            className="px-4 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-medium hover:bg-emerald-800 whitespace-nowrap self-start sm:self-auto"
          >
            Open Digital Pantry
          </button>
        </div>
      )}

      {errorBanner && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800 flex items-start justify-between gap-4"
        >
          <span>{errorBanner}</span>
          <button
            type="button"
            onClick={() => setErrorBanner(null)}
            className="text-red-600 hover:text-red-900"
            aria-label="Dismiss error"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Step 1: Upload Zone */}
      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-100">
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900">
              01. Upload Ingredient & Pantry Photos
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Select the default storage zone below, then tag individual photos if uploading multiple
              areas at once.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="default-location" className="text-xs font-medium text-slate-600">
              Default Zone:
            </label>
            <select
              id="default-location"
              value={defaultLocation}
              onChange={(e) => setDefaultLocation(e.target.value as StorageLocation)}
              className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-800 focus:outline-none focus:border-emerald-700"
            >
              {STORAGE_LOCATIONS.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Dropzone + Upload Button */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            handleFilesSelected(e.dataTransfer.files);
          }}
          className="mt-5 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/70 p-8 text-center hover:border-emerald-600 transition-colors"
        >
          <p className="font-display text-base font-semibold text-slate-900">
            Drop ingredient, pantry, or fridge photos here
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Supports multiple JPEG, PNG, or WebP images across shelves, drawers, and countertops.
          </p>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-700 text-white text-sm font-medium hover:bg-emerald-800 transition-colors whitespace-nowrap"
            >
              <Upload className="w-4 h-4" aria-hidden="true" />
              <span>Upload Ingredient Photos</span>
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              handleFilesSelected(e.target.files);
              e.target.value = '';
            }}
          />

          {/* Quick Sample Photos for Immediate Testing */}
          <div className="mt-6 pt-5 border-t border-slate-200/80">
            <p className="text-xs font-medium text-slate-500 mb-3">
              Or test recognition immediately with sample kitchen photos:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl mx-auto">
              {SAMPLE_PHOTOS.map((sample) => (
                <button
                  key={sample.label}
                  type="button"
                  onClick={() => handleLoadSample(sample)}
                  className="group flex items-center gap-3 p-2 rounded-lg border border-slate-200 bg-white hover:border-emerald-600 text-left transition-colors"
                >
                  <img
                    src={sample.url}
                    alt={sample.label}
                    referrerPolicy="no-referrer"
                    className="w-12 h-12 rounded-md object-cover shrink-0 bg-slate-100"
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900 truncate group-hover:text-emerald-800">
                      {sample.label}
                    </p>
                    <p className="text-xs text-slate-500 truncate">{sample.location}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Queued Photo Batch */}
        {photos.length > 0 && (
          <div className="mt-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-900 tabular-nums">
                Photo Queue ({photos.length})
              </h3>
              <button
                type="button"
                disabled={isAnalyzing || queuedCount === 0}
                onClick={analyzeQueuedPhotos}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-emerald-700 text-white text-sm font-medium hover:bg-emerald-800 disabled:opacity-50 transition-colors whitespace-nowrap self-start sm:self-auto"
              >
                {isAnalyzing ? (
                  <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Sparkles className="w-4 h-4" aria-hidden="true" />
                )}
                <span>
                  {isAnalyzing
                    ? 'Analyzing with Gemini Vision...'
                    : queuedCount > 0
                      ? `Analyze ${queuedCount} Photo${queuedCount === 1 ? '' : 's'}`
                      : 'All Photos Analyzed'}
                </span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {photos.map((photo) => (
                <div
                  key={photo.id}
                  className="rounded-xl border border-slate-200 bg-white overflow-hidden flex flex-col"
                >
                  <div className="relative h-40 bg-slate-100">
                    <img
                      src={photo.dataUrl}
                      alt={photo.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setPhotos((prev) => prev.filter((p) => p.id !== photo.id))}
                      aria-label={`Remove ${photo.name}`}
                      className="absolute top-2 right-2 p-1.5 rounded-md bg-slate-900/75 text-white hover:bg-slate-900"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-slate-900 truncate">{photo.name}</p>
                      <span
                        className={`text-xs font-medium shrink-0 ${
                          photo.status === 'done'
                            ? 'text-emerald-700'
                            : photo.status === 'error'
                              ? 'text-red-700'
                              : photo.status === 'scanning'
                                ? 'text-amber-700'
                                : 'text-slate-500'
                        }`}
                      >
                        {photo.status === 'done'
                          ? `${photo.rawJson?.pantry_inventory.length ?? 0} found`
                          : photo.status === 'scanning'
                            ? 'Scanning...'
                            : photo.status === 'error'
                              ? 'Failed'
                              : 'Ready'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <label className="text-xs text-slate-500 shrink-0">Environment:</label>
                      <select
                        value={photo.storageLocation}
                        disabled={photo.status === 'scanning'}
                        onChange={(e) =>
                          setPhotos((prev) =>
                            prev.map((p) =>
                              p.id === photo.id
                                ? { ...p, storageLocation: e.target.value as StorageLocation }
                                : p
                            )
                          )
                        }
                        className="flex-1 px-2.5 py-1 rounded-md border border-slate-300 text-xs text-slate-800 bg-white focus:outline-none focus:border-emerald-700"
                      >
                        {STORAGE_LOCATIONS.map((loc) => (
                          <option key={loc} value={loc}>
                            {loc}
                          </option>
                        ))}
                      </select>
                    </div>

                    {photo.errorMessage && (
                      <p className="text-xs text-red-700">{photo.errorMessage}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Optional Step 3 Raw JSON Inspector */}
      {showJsonPanel && photos.some((p) => p.rawJson) && (
        <section className="bg-slate-900 text-slate-100 rounded-xl border border-slate-800 p-5">
          <div className="flex items-center justify-between gap-4 pb-3 border-b border-slate-800">
            <div>
              <h2 className="font-display text-sm font-semibold text-white">
                Structured Gemini Vision JSON Output
              </h2>
              <p className="text-xs text-slate-400">
                Machine-readable schema returned by Gemini Vision prior to user edits.
              </p>
            </div>
            <button
              type="button"
              onClick={copyRawJson}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition-colors"
            >
              <Copy className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{copiedJson ? 'Copied' : 'Copy JSON'}</span>
            </button>
          </div>
          <pre className="mt-3 max-h-80 overflow-auto text-xs font-mono text-emerald-300 leading-relaxed">
            {JSON.stringify(combinedSpecJson, null, 2)}
          </pre>
        </section>
      )}

      {/* Unidentified Items Warning */}
      {unidentifiedList.length > 0 && (
        <section className="bg-amber-50/70 rounded-xl border border-amber-200 p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-amber-700 mt-0.5 shrink-0" aria-hidden="true" />
              <div>
                <h2 className="font-display text-sm font-semibold text-slate-900">
                  Unidentified or Partially Obscured Items ({unidentifiedList.length})
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  Gemini Vision declined to guess these items. Review and add them manually if
                  needed.
                </p>
              </div>
            </div>
          </div>
          <ul className="mt-3 space-y-2">
            {unidentifiedList.map((u, i) => (
              <li
                key={`${u.description}-${i}`}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3.5 py-2.5 rounded-lg bg-white border border-amber-200 text-sm"
              >
                <div>
                  <span className="font-medium text-slate-900">{u.description}</span>
                  <span className="text-slate-400 mx-2" aria-hidden="true">
                    ·
                  </span>
                  <span className="text-xs text-slate-600">
                    {u.reason} ({u.photoName})
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => addManualStagedItem(u.description)}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-md border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50 self-start sm:self-auto whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Add Manually</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Step 4 & 5: Staged Review & Confirmation Table */}
      {(stagedItems.length > 0 || photos.some((p) => p.status === 'done')) && (
        <section className="bg-white rounded-xl border border-slate-200">
          <div className="p-6 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-lg font-semibold text-slate-900">
                02. Review, Verify & Confirm Recognised Ingredients
              </h2>
              <p className="text-xs text-slate-600 mt-1">
                Edit names, confirm quantities, set expiry dates, or resolve duplicates before
                saving to your persistent pantry.
                {verifyCount > 0 && (
                  <span className="ml-1.5 font-medium text-amber-700 tabular-nums">
                    {verifyCount} item{verifyCount === 1 ? '' : 's'} flagged for verification.
                  </span>
                )}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => addManualStagedItem('')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                <span>Add Missing Item</span>
              </button>

              <button
                type="button"
                disabled={isSaving || stagedItems.filter((i) => i.includeInSave).length === 0}
                onClick={handleConfirmAll}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-emerald-700 text-white text-sm font-medium hover:bg-emerald-800 disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                <Check className="w-4 h-4" aria-hidden="true" />
                <span>
                  {isSaving
                    ? 'Saving...'
                    : `Confirm & Save (${stagedItems.filter((i) => i.includeInSave && i.name.trim()).length})`}
                </span>
              </button>
            </div>
          </div>

          <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
            Safety Note: AI freshness observations reflect visible appearance only and cannot verify
            food safety. Always inspect, smell, and follow storage guidelines before consuming.
          </div>

          {stagedItems.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              No ingredients were detected in the analyzed photos. Click &ldquo;Add Missing Item&rdquo; to
              enter items manually.
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {stagedItems.map((item) => {
                const matchedExisting = item.duplicateMatchId
                  ? existingPantry.find((p) => p.id === item.duplicateMatchId)
                  : null;
                const batchDuplicates = stagedItems.filter(
                  (other) =>
                    other.reviewId !== item.reviewId &&
                    normalizeIngredientName(other.name) === normalizeIngredientName(item.name) &&
                    other.storage_location === item.storage_location
                );

                return (
                  <div
                    key={item.reviewId}
                    className={`p-5 transition-colors ${
                      item.verification_required ? 'bg-amber-50/40' : 'bg-white'
                    }`}
                  >
                    <div className="flex flex-col lg:flex-row gap-5">
                      {/* Include toggle & thumbnail */}
                      <div className="flex items-start gap-3.5 shrink-0">
                        <input
                          type="checkbox"
                          checked={item.includeInSave}
                          onChange={(e) =>
                            updateStagedItem(item.reviewId, (cur) => ({
                              ...cur,
                              includeInSave: e.target.checked,
                            }))
                          }
                          aria-label={`Include ${item.name || 'item'}`}
                          className="mt-2 w-4 h-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-700"
                        />

                        {item.thumbnailDataUrl ? (
                          <img
                            src={item.thumbnailDataUrl}
                            alt={item.name}
                            referrerPolicy="no-referrer"
                            className="w-16 h-16 rounded-lg object-cover border border-slate-200 bg-slate-100 shrink-0"
                          />
                        ) : (
                          <div className="w-16 h-16 rounded-lg border border-slate-200 bg-slate-100 flex items-center justify-center text-xs font-medium text-slate-500 shrink-0">
                            No img
                          </div>
                        )}
                      </div>

                      {/* Editable fields grid */}
                      <div className="flex-1 min-w-0 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-3">
                          {/* Name */}
                          <div className="xl:col-span-2">
                            <label className="block text-xs font-medium text-slate-500 mb-1">
                              Ingredient Name
                            </label>
                            <input
                              type="text"
                              value={item.name}
                              onChange={(e) =>
                                updateStagedItem(item.reviewId, (cur) => ({
                                  ...cur,
                                  name: e.target.value,
                                }))
                              }
                              placeholder="Enter ingredient name"
                              className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-sm font-medium text-slate-900 focus:outline-none focus:border-emerald-700"
                            />
                          </div>

                          {/* Category */}
                          <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1">
                              Category
                            </label>
                            <select
                              value={
                                FOOD_CATEGORIES.includes(item.category) ? item.category : 'Other'
                              }
                              onChange={(e) =>
                                updateStagedItem(item.reviewId, (cur) => ({
                                  ...cur,
                                  category: e.target.value,
                                }))
                              }
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-sm text-slate-800 bg-white focus:outline-none focus:border-emerald-700"
                            >
                              {FOOD_CATEGORIES.map((cat) => (
                                <option key={cat} value={cat}>
                                  {cat}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Quantity + Unit */}
                          <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1">
                              Qty ({item.quantity.estimated ? 'Estimated' : 'Confirmed'})
                            </label>
                            <div className="flex gap-1.5">
                              <input
                                type="number"
                                min={0.1}
                                step="any"
                                value={item.quantity.value}
                                onChange={(e) =>
                                  updateStagedItem(item.reviewId, (cur) => ({
                                    ...cur,
                                    quantity: {
                                      ...cur.quantity,
                                      value: Math.max(0.1, Number(e.target.value) || 0.1),
                                      estimated: false,
                                    },
                                  }))
                                }
                                className="w-16 px-2 py-1.5 rounded-lg border border-slate-300 text-sm font-mono tabular-nums text-slate-900 focus:outline-none focus:border-emerald-700"
                              />
                              <input
                                type="text"
                                value={item.quantity.unit}
                                onChange={(e) =>
                                  updateStagedItem(item.reviewId, (cur) => ({
                                    ...cur,
                                    quantity: {
                                      ...cur.quantity,
                                      unit: e.target.value,
                                      estimated: false,
                                    },
                                  }))
                                }
                                className="flex-1 min-w-0 px-2 py-1.5 rounded-lg border border-slate-300 text-sm text-slate-800 focus:outline-none focus:border-emerald-700"
                              />
                            </div>
                          </div>

                          {/* Storage Location */}
                          <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1">
                              Storage Location
                            </label>
                            <select
                              value={item.storage_location}
                              onChange={(e) =>
                                updateStagedItem(item.reviewId, (cur) => ({
                                  ...cur,
                                  storage_location: e.target.value as StorageLocation,
                                }))
                              }
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-sm text-slate-800 bg-white focus:outline-none focus:border-emerald-700"
                            >
                              {STORAGE_LOCATIONS.map((loc) => (
                                <option key={loc} value={loc}>
                                  {loc}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Expiry Date */}
                          <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1">
                              Expiry / Best Before
                            </label>
                            <div className="flex gap-1.5">
                              <input
                                type="date"
                                value={item.expiry.date || ''}
                                onChange={(e) =>
                                  updateStagedItem(item.reviewId, (cur) => ({
                                    ...cur,
                                    expiry: {
                                      ...cur.expiry,
                                      date: e.target.value || null,
                                      date_type: e.target.value
                                        ? cur.expiry.date_type || 'Best Before'
                                        : null,
                                    },
                                  }))
                                }
                                className="flex-1 min-w-0 px-2 py-1.5 rounded-lg border border-slate-300 text-xs font-mono tabular-nums text-slate-800 focus:outline-none focus:border-emerald-700"
                              />
                              {item.expiry.date && (
                                <select
                                  value={item.expiry.date_type || 'Best Before'}
                                  onChange={(e) =>
                                    updateStagedItem(item.reviewId, (cur) => ({
                                      ...cur,
                                      expiry: {
                                        ...cur.expiry,
                                        date_type: e.target.value as ExpiryDateType,
                                      },
                                    }))
                                  }
                                  className="px-1.5 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-700 bg-white"
                                >
                                  <option value="Expiry">Exp</option>
                                  <option value="Best Before">BB</option>
                                  <option value="Use By">Use</option>
                                  <option value="Sell By">Sell</option>
                                </select>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Metadata & Verification Row */}
                        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                            <span
                              className={`font-medium inline-flex items-center gap-1 ${
                                item.freshness.status === 'Good'
                                  ? 'text-emerald-700'
                                  : item.freshness.status === 'Use Soon'
                                    ? 'text-amber-700'
                                    : 'text-red-700'
                              }`}
                            >
                              {item.freshness.status}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{item.condition}</span>
                            <span aria-hidden="true">·</span>
                            <span className="capitalize">{item.food_state}</span>
                            {item.brand_or_label && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>Label: {item.brand_or_label}</span>
                              </>
                            )}
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">
                              AI Conf: {formatConfidence(item.identification_confidence)}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="text-slate-500">
                              {item.freshness.visual_observations}
                            </span>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            {item.verification_required ? (
                              <button
                                type="button"
                                onClick={() =>
                                  updateStagedItem(item.reviewId, (cur) => ({
                                    ...cur,
                                    verification_required: false,
                                  }))
                                }
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-100 text-amber-900 text-xs font-medium hover:bg-amber-200 transition-colors"
                              >
                                <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>Verify & Confirm</span>
                              </button>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                                <Check className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>Verified</span>
                              </span>
                            )}

                            <button
                              type="button"
                              onClick={() => removeStagedItem(item.reviewId)}
                              aria-label={`Remove ${item.name}`}
                              className="p-1.5 rounded-md text-slate-400 hover:text-red-700 hover:bg-red-50 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Duplicate Resolution Controls */}
                        {(matchedExisting || batchDuplicates.length > 0) && (
                          <div className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs">
                            <span className="text-slate-700">
                              {matchedExisting
                                ? `Matches existing pantry item "${matchedExisting.name}" (${matchedExisting.quantity.value} ${matchedExisting.quantity.unit} in ${matchedExisting.storageLocation}).`
                                : `Also detected in another photo in this batch (${batchDuplicates.length} match).`}
                            </span>
                            <div className="flex items-center gap-2">
                              <label className="text-slate-500">Duplicate handling:</label>
                              <select
                                value={item.duplicateAction}
                                onChange={(e) =>
                                  updateStagedItem(item.reviewId, (cur) => ({
                                    ...cur,
                                    duplicateAction: e.target.value as
                                      | 'merge'
                                      | 'separate'
                                      | 'replace',
                                  }))
                                }
                                className="px-2 py-1 rounded border border-slate-300 bg-white text-xs font-medium text-slate-800"
                              >
                                <option value="merge">Merge & Add Quantity</option>
                                {matchedExisting && (
                                  <option value="replace">Replace Existing Entry</option>
                                )}
                                <option value="separate">Keep as Separate Entry</option>
                              </select>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

    </div>
  );
};

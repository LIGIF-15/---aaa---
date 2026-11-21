export interface PreparedImage {
  dataUrl: string;
  base64: string;
  mimeType: string;
}

export async function fileOrUrlToPreparedImage(source: File | Blob | string): Promise<PreparedImage> {
  let objectUrl: string;
  let shouldRevoke = false;

  if (typeof source === 'string') {
    objectUrl = source;
  } else {
    objectUrl = URL.createObjectURL(source);
    shouldRevoke = true;
  }

  try {
    const img = await loadImage(objectUrl);
    const maxDimension = 1440;
    const scale = Math.min(1, maxDimension / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
    const width = Math.max(1, Math.round((img.naturalWidth || 800) * scale));
    const height = Math.max(1, Math.round((img.naturalHeight || 600) * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D context unavailable');
    }
    ctx.drawImage(img, 0, 0, width, height);

    const mimeType = 'image/jpeg';
    const dataUrl = canvas.toDataURL(mimeType, 0.86);
    const base64 = dataUrl.split(',')[1] || '';
    return { dataUrl, base64, mimeType };
  } finally {
    if (shouldRevoke) {
      URL.revokeObjectURL(objectUrl);
    }
  }
}

export async function cropIngredientThumbnail(
  sourceDataUrl: string,
  boundingBox?: [number, number, number, number] | null
): Promise<string> {
  const img = await loadImage(sourceDataUrl);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;

  const targetSize = 160;
  const canvas = document.createElement('canvas');
  canvas.width = targetSize;
  canvas.height = targetSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) return sourceDataUrl;

  if (
    boundingBox &&
    Array.isArray(boundingBox) &&
    boundingBox.length === 4 &&
    boundingBox.every((n) => typeof n === 'number' && !Number.isNaN(n))
  ) {
    const [ymin, xmin, ymax, xmax] = boundingBox;
    const pad = 35;
    const clampedYMin = Math.max(0, ymin - pad) / 1000;
    const clampedXMin = Math.max(0, xmin - pad) / 1000;
    const clampedYMax = Math.min(1000, ymax + pad) / 1000;
    const clampedXMax = Math.min(1000, xmax + pad) / 1000;

    const sx = clampedXMin * w;
    const sy = clampedYMin * h;
    const sw = Math.max(24, (clampedXMax - clampedXMin) * w);
    const sh = Math.max(24, (clampedYMax - clampedYMin) * h);

    // Preserve aspect ratio inside square thumbnail
    const ratio = Math.min(targetSize / sw, targetSize / sh);
    const dw = sw * ratio;
    const dh = sh * ratio;
    const dx = (targetSize - dw) / 2;
    const dy = (targetSize - dh) / 2;

    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(0, 0, targetSize, targetSize);
    ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
    return canvas.toDataURL('image/jpeg', 0.8);
  }

  // Fallback: center-crop full photo into small thumbnail
  const minSide = Math.min(w, h);
  const sx = (w - minSide) / 2;
  const sy = (h - minSide) / 2;
  ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, targetSize, targetSize);
  return canvas.toDataURL('image/jpeg', 0.78);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}

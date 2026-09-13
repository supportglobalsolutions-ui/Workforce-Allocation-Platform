import { supabase } from './supabase';
import { api } from './api';

const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const ALLOWED_EXT   = /\.(jpe?g|png|webp)$/i;
const MAX_SOURCE_MB = 2;
const TARGET_MAX_PX = 1400;  // longest edge after resize
const JPEG_QUALITY  = 0.82;

export function validateImageFile(file: File): string | null {
  if (!ALLOWED_TYPES.includes(file.type) && !ALLOWED_EXT.test(file.name)) {
    return 'Only JPG, PNG, and WebP files are allowed';
  }
  if (file.size > MAX_SOURCE_MB * 1024 * 1024) {
    return `File must be under ${MAX_SOURCE_MB} MB`;
  }
  return null;
}

/**
 * Resize + re-encode to JPEG via Canvas.
 * Shrinks the longest edge to TARGET_MAX_PX if the image is larger.
 * Progress callback: 0 → 30 %.
 */
function compressImage(file: File, onProgress?: (pct: number) => void): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      onProgress?.(15);

      const scale = Math.min(1, TARGET_MAX_PX / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);

      const canvas = document.createElement('canvas');
      canvas.width  = w;
      canvas.height = h;
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
      onProgress?.(25);

      canvas.toBlob(
        (blob) => {
          if (blob) { onProgress?.(30); resolve(blob); }
          else reject(new Error('Image compression failed'));
        },
        'image/jpeg',
        JPEG_QUALITY,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image for compression'));
    };

    img.src = objectUrl;
  });
}

export const SESSION_IMAGE_BUCKET = 'session-images';

/** How long a generated view link stays valid. */
const SIGNED_URL_TTL_SECONDS = 60 * 60;

/**
 * The bucket is private, so the database stores the object PATH
 * ("<sessionId>/start.jpg") rather than a URL.
 *
 * Rows written before the bucket was made private hold a full public URL —
 * everything after "/session-images/" is still the object path, so those keep
 * working without a data migration.
 */
export function storagePathFromValue(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const marker = `/${SESSION_IMAGE_BUCKET}/`;
  const idx = trimmed.indexOf(marker);
  if (idx !== -1) {
    return trimmed.slice(idx + marker.length).split('?')[0];
  }
  if (/^https?:\/\//i.test(trimmed)) return null; // foreign URL — cannot sign
  return trimmed.replace(/^\/+/, '');
}

/**
 * Turn a stored value into a temporary viewable URL.
 * Returns the original value unchanged if it is a URL we cannot sign.
 */
export async function getSessionImageUrl(
  value: string | null | undefined,
): Promise<string | null> {
  const path = storagePathFromValue(value);
  if (!path) return value ?? null;

  const { data, error } = await supabase.storage
    .from(SESSION_IMAGE_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    // A legacy public URL still renders even if signing failed.
    return /^https?:\/\//i.test(value ?? '') ? (value as string) : null;
  }
  return data.signedUrl;
}

/**
 * Upload compressed blob to Supabase Storage.
 * Progress callback: 30 → 85 %.
 * Returns the object path, which is what gets persisted.
 */
async function uploadToStorage(
  sessionId: string,
  imageType: 'start' | 'end',
  blob: Blob,
  onProgress?: (pct: number) => void,
): Promise<string> {
  onProgress?.(50);
  const path = `${sessionId}/${imageType}.jpg`;
  const { error } = await supabase.storage
    .from(SESSION_IMAGE_BUCKET)
    .upload(path, blob, {
      contentType: 'image/jpeg',
      upsert: true,
    });

  if (error) {
    throw error;
  }

  onProgress?.(80);
  return path;
}

/**
 * Full pipeline:
 *   1. Validate original file (max 2 MB)
 *   2. Compress — resize to 1400 px longest edge, re-encode JPEG at 0.82
 *   3. Upload to the private Supabase Storage bucket
 *   4. Persist the object path to PostgreSQL via PATCH /sessions/{id}
 *
 * Returns a signed URL for immediate display. Call getSessionImageUrl() to
 * view the image later — signed links expire.
 */
export async function uploadSessionImage(
  sessionId: string,
  imageType: 'start' | 'end',
  file: File,
  onProgress?: (pct: number) => void,
): Promise<string> {
  const validationError = validateImageFile(file);
  if (validationError) throw new Error(validationError);

  onProgress?.(0);

  // 1 — compress in browser (0 → 30 %)
  const compressed = await compressImage(file, onProgress);

  // 2 — upload to Supabase Storage (30 → 85 %)
  const path = await uploadToStorage(sessionId, imageType, compressed, onProgress);

  // 3 — persist the object path to PostgreSQL (85 → 100 %)
  onProgress?.(90);
  const field = `${imageType}_image_url` as const;
  await api.patch(`/sessions/${sessionId}`, { [field]: path });

  onProgress?.(100);
  // Signed link so the caller can render it straight away.
  return (await getSessionImageUrl(path)) ?? path;
}

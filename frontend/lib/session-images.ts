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

/**
 * Upload compressed blob to Supabase Storage.
 * Progress callback: 30 → 85 %.
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
    .from('session-images')
    .upload(path, blob, {
      contentType: 'image/jpeg',
      upsert: true,
    });

  if (error) {
    throw error;
  }

  onProgress?.(80);
  const { data: urlData } = supabase.storage.from('session-images').getPublicUrl(path);
  return urlData.publicUrl;
}

/**
 * Full pipeline:
 *   1. Validate original file (max 2 MB)
 *   2. Compress — resize to 1400 px longest edge, re-encode JPEG at 0.82
 *   3. Upload to Supabase Storage → get public URL
 *   4. Persist URL to PostgreSQL via PATCH /sessions/{id}
 *
 * Returns the Supabase Storage download URL (used directly as <img src>).
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
  const downloadUrl = await uploadToStorage(sessionId, imageType, compressed, onProgress);

  // 3 — persist URL to PostgreSQL (85 → 100 %)
  onProgress?.(90);
  const field = `${imageType}_image_url` as const;
  await api.patch(`/sessions/${sessionId}`, { [field]: downloadUrl });

  onProgress?.(100);
  return downloadUrl;
}

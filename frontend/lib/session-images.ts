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
 * ("<sessionId>/shot-<stamp>.jpg") rather than a URL.
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

/** Must match MAX_SESSION_IMAGES in backend/services/session_evidence.py. */
export const MAX_SESSION_IMAGES = 8;

export interface SessionImagesResult {
  image_urls: string[];
  max_images: number;
}

/** Append a stored path to the session gallery. The cap is enforced server-side. */
export async function addSessionImage(
  sessionId: string,
  imagePath: string,
): Promise<SessionImagesResult> {
  return api.post<SessionImagesResult>(`/sessions/${sessionId}/images`, {
    image_url: imagePath,
  });
}

/** Drop one screenshot so a bad capture can be retaken. */
export async function removeSessionImage(
  sessionId: string,
  imagePath: string,
): Promise<SessionImagesResult> {
  return api.delete<SessionImagesResult>(
    `/sessions/${sessionId}/images?image_url=${encodeURIComponent(imagePath)}`,
  );
}

/**
 * Upload compressed blob to Supabase Storage.
 * Progress callback: 30 → 85 %.
 * Returns the object path, which is what gets persisted.
 *
 * Each shot gets its own object name — the gallery keeps every capture, so
 * reusing one name per session would overwrite the previous screenshot.
 */
async function uploadToStorage(
  sessionId: string,
  blob: Blob,
  onProgress?: (pct: number) => void,
): Promise<string> {
  onProgress?.(50);
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const path = `${sessionId}/shot-${stamp}.jpg`;
  const { error } = await supabase.storage
    .from(SESSION_IMAGE_BUCKET)
    .upload(path, blob, {
      contentType: 'image/jpeg',
      upsert: false,
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
  file: File,
  onProgress?: (pct: number) => void,
): Promise<SessionImagesResult> {
  const validationError = validateImageFile(file);
  if (validationError) throw new Error(validationError);

  onProgress?.(0);

  // 1 — compress in browser (0 → 30 %)
  const compressed = await compressImage(file, onProgress);

  // 2 — upload to Supabase Storage (30 → 85 %)
  const path = await uploadToStorage(sessionId, compressed, onProgress);

  // 3 — append to the session gallery (85 → 100 %)
  onProgress?.(90);
  const result = await addSessionImage(sessionId, path);

  onProgress?.(100);
  // The server's list is authoritative — it owns ordering and the cap.
  return result;
}

/**
 * Full pipeline from an in-browser capture Blob (getDisplayMedia / canvas flatten).
 * Skips the file-type gate used for disk uploads — captures are always JPEG.
 */
export async function uploadSessionImageBlob(
  sessionId: string,
  blob: Blob,
  onProgress?: (pct: number) => void,
): Promise<SessionImagesResult> {
  onProgress?.(0);
  const file = new File([blob], 'shot.jpg', { type: blob.type || 'image/jpeg' });
  const compressed = await compressImage(file, onProgress);
  const path = await uploadToStorage(sessionId, compressed, onProgress);
  onProgress?.(90);
  const result = await addSessionImage(sessionId, path);
  onProgress?.(100);
  return result;
}

/**
 * Ask the browser to share a screen/window, grab one frame, then stop the stream.
 * Returns null when the worker cancels the picker (NotAllowedError is rethrown
 * only for real failures — AbortError resolves to null).
 */
export async function captureDisplayFrame(): Promise<Blob | null> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) {
    throw new Error('Screen capture is not available in this browser.');
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 1 },
      audio: false,
    });
  } catch (err) {
    const name = err instanceof DOMException ? err.name : '';
    if (name === 'NotAllowedError' || name === 'AbortError') return null;
    throw err;
  }
  try {
    const track = stream.getVideoTracks()[0];
    if (!track) return null;
    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    await video.play();
    await new Promise<void>((resolve) => {
      if (video.readyState >= 2) resolve();
      else video.onloadeddata = () => resolve();
    });
    const w = video.videoWidth || 1280;
    const h = video.videoHeight || 720;
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 1400 / Math.max(w, h));
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.82);
    });
  } finally {
    stream.getTracks().forEach((t) => t.stop());
  }
}

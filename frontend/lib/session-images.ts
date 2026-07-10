import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { api } from './api';

const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const ALLOWED_EXT = /\.(jpe?g|png|webp)$/i;

export function validateImageFile(file: File): string | null {
  if (!ALLOWED_TYPES.includes(file.type) && !ALLOWED_EXT.test(file.name)) {
    return 'Only JPG, PNG, and WebP files are allowed';
  }
  if (file.size > 5 * 1024 * 1024) {
    return 'File must be under 5 MB';
  }
  return null;
}

function readFileAsBase64(file: File, onProgress?: (pct: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) {
        onProgress?.(Math.round((e.loaded / e.total) * 45));
      }
    };

    reader.onload = () => {
      onProgress?.(50);
      resolve(reader.result as string); // data:image/jpeg;base64,...
    };

    reader.onerror = () => reject(new Error('Failed to read file'));

    reader.readAsDataURL(file);
  });
}

/**
 * Convert image to base64 and persist it in two places:
 *   1. Firestore  → session_images/{sessionId}
 *   2. PostgreSQL → sessions.start_image_url / end_image_url
 *
 * Returns the base64 data URI (usable directly as img src).
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

  // Step 1 — read file as base64 (progress 0→50 %)
  const base64 = await readFileAsBase64(file, onProgress);

  // Step 2 — write to Firestore (progress 60 %)
  onProgress?.(60);
  const field = `${imageType}_image_url` as const;
  await setDoc(
    doc(db, 'session_images', sessionId),
    { [field]: base64, updated_at: serverTimestamp() },
    { merge: true },
  );

  // Step 3 — write to PostgreSQL via backend (progress 85 %)
  onProgress?.(85);
  await api.patch(`/sessions/${sessionId}`, { [field]: base64 });

  onProgress?.(100);
  return base64;
}

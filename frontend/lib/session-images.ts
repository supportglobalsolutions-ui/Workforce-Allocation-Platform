import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { storage, db } from './firebase';
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
 * Upload compressed blob to Firebase Storage.
 * Progress callback: 30 → 85 %.
 */
function uploadToStorage(
  sessionId: string,
  imageType: 'start' | 'end',
  blob: Blob,
  onProgress?: (pct: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const storageRef = ref(storage, `session-images/${sessionId}/${imageType}.jpg`);
    const task = uploadBytesResumable(storageRef, blob, { contentType: 'image/jpeg' });

    task.on(
      'state_changed',
      (snap) => {
        if (snap.totalBytes > 0) {
          const pct = Math.round(30 + (snap.bytesTransferred / snap.totalBytes) * 55);
          onProgress?.(pct);
        }
      },
      reject,
      async () => {
        try { resolve(await getDownloadURL(task.snapshot.ref)); }
        catch (e) { reject(e); }
      },
    );
  });
}

/**
 * Full pipeline:
 *   1. Validate original file (max 2 MB)
 *   2. Compress — resize to 1400 px longest edge, re-encode JPEG at 0.82
 *   3. Upload to Firebase Storage → get download URL
 *   4. Mirror URL to Firestore (session_images/{sessionId})
 *   5. Persist URL to PostgreSQL via PATCH /sessions/{id}
 *
 * Returns the Firebase Storage download URL (used directly as <img src>).
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

  // 1 — compress in browser  (0 → 30 %)
  const compressed = await compressImage(file, onProgress);

  // 2 — upload to Firebase Storage  (30 → 85 %)
  const downloadUrl = await uploadToStorage(sessionId, imageType, compressed, onProgress);

  // 3 — mirror URL to Firestore  (85 → 92 %)
  onProgress?.(85);
  const field = `${imageType}_image_url` as const;
  await setDoc(
    doc(db, 'session_images', sessionId),
    { [field]: downloadUrl, updated_at: serverTimestamp() },
    { merge: true },
  );

  // 4 — persist URL to PostgreSQL  (92 → 100 %)
  onProgress?.(92);
  await api.patch(`/sessions/${sessionId}`, { [field]: downloadUrl });

  onProgress?.(100);
  return downloadUrl;
}

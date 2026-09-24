/**
 * Absence reports — a worker telling us ahead of time they cannot work.
 *
 * Evidence follows the same storage contract as session screenshots: the
 * bucket is private, the database stores the object PATH, and viewing goes
 * through a short-lived signed URL. The one difference is PDFs, which cannot
 * be canvas-compressed and so upload as-is behind a stricter size gate.
 */
import { supabase } from './supabase';
import { api } from './api';

export const ABSENCE_BUCKET = 'absence-evidence';

/** Must match MAX_ABSENCE_ATTACHMENTS in backend/models/absence_report.py. */
export const MAX_ABSENCE_ATTACHMENTS = 3;

/** Must match MIN_REASON_CHARS in backend/schemas/absence_report.py. */
export const MIN_REASON_CHARS = 20;

const SIGNED_URL_TTL_SECONDS = 60 * 60;

const IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png'];
const IMAGE_EXT = /\.(jpe?g|png)$/i;
const PDF_EXT = /\.pdf$/i;
const DOC_EXT = /\.docx?$/i;
const DOC_TYPES = [
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

/**
 * Extension → MIME, mirroring the bucket's allow-list in
 * backend/scripts/setup_absence_evidence_bucket.py. Storage refuses anything
 * outside that list, so the type we send cannot be a guess.
 */
const EXT_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
};

/** One ceiling for every accepted type, enforced again by the bucket. */
export const MAX_ATTACHMENT_MB = 5;

/**
 * What a phone camera may hand us before compression.
 *
 * A photo of a sick note routinely lands at 8-12 MB. Rejecting it for being
 * over the 5 MB ceiling would be wrong — compression is what the ceiling is
 * there to be measured after, so images are only checked once resized.
 */
const MAX_IMAGE_SOURCE_MB = 25;

const TARGET_MAX_PX = 1400;
const JPEG_QUALITY = 0.82;

export type AbsenceStatus = 'pending' | 'accepted' | 'declined' | 'withdrawn';

export type AbsenceReason =
  | 'illness'
  | 'family_emergency'
  | 'bereavement'
  | 'power_outage'
  | 'internet_outage'
  | 'transport'
  | 'other';

/** Order drives the picker; keep the vaguest option last. */
export const ABSENCE_REASONS: { value: AbsenceReason; label: string }[] = [
  { value: 'illness', label: 'Illness' },
  { value: 'family_emergency', label: 'Family emergency' },
  { value: 'bereavement', label: 'Bereavement' },
  { value: 'power_outage', label: 'Power outage' },
  { value: 'internet_outage', label: 'Internet outage' },
  { value: 'transport', label: 'Transport problem' },
  { value: 'other', label: 'Other' },
];

export const ABSENCE_REASON_LABELS: Record<string, string> = Object.fromEntries(
  ABSENCE_REASONS.map((r) => [r.value, r.label]),
);

export interface AbsenceReport {
  id: string;
  worker_id: string;
  shift_id: string | null;
  absence_start: string;
  absence_end: string;
  reason_category: AbsenceReason;
  reason_text: string;
  attachment_paths: string[];
  status: AbsenceStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
  worker_name: string | null;
  reviewer_name: string | null;
  /** The linked shift's own window — an admin needs a time, not a UUID. */
  shift_start: string | null;
  shift_end: string | null;
  shift_status: string | null;
}

/** "Thu, 24 Sep · 09:00–17:00" for a linked shift, or null when standalone. */
export function shiftWindowLabel(report: AbsenceReport): string | null {
  if (!report.shift_start || !report.shift_end) return null;
  const start = new Date(report.shift_start);
  const end = new Date(report.shift_end);
  const day = start.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const time = (d: Date) =>
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${day} · ${time(start)}–${time(end)}`;
}

export interface AbsenceAttachmentsResult {
  attachment_paths: string[];
  max_attachments: number;
}

export interface AbsenceSummary {
  pending: number;
  flagged_shift_ids: string[];
}

export interface AbsenceReportInput {
  shift_id?: string | null;
  absence_start: string;
  absence_end: string;
  reason_category: AbsenceReason;
  reason_text: string;
}

/** Everything a worker may correct on a report they already filed. */
export type AbsenceReportAmendInput = Omit<AbsenceReportInput, 'shift_id'>;

/** Reports that still count — they mark a shift and block a second filing. */
export const OPEN_ABSENCE_STATUSES: AbsenceStatus[] = ['pending', 'accepted'];

export function isOpenAbsence(report: AbsenceReport): boolean {
  return OPEN_ABSENCE_STATUSES.includes(report.status);
}

// ── API ─────────────────────────────────────────────────────────────────────

export function listAbsenceReports(params?: {
  status?: AbsenceStatus;
  workerId?: string;
  shiftId?: string;
}): Promise<AbsenceReport[]> {
  const q = new URLSearchParams();
  if (params?.status) q.set('status', params.status);
  if (params?.workerId) q.set('worker_id', params.workerId);
  if (params?.shiftId) q.set('shift_id', params.shiftId);
  const qs = q.toString();
  return api.get<AbsenceReport[]>(`/absence-reports${qs ? `?${qs}` : ''}`);
}

export function getAbsenceReport(id: string): Promise<AbsenceReport> {
  return api.get<AbsenceReport>(`/absence-reports/${id}`);
}

/** Counts behind the ! markers. Cheap enough to call on every dashboard load. */
export function absenceSummary(): Promise<AbsenceSummary> {
  return api.get<AbsenceSummary>('/absence-reports/summary');
}

export function createAbsenceReport(body: AbsenceReportInput): Promise<AbsenceReport> {
  return api.post<AbsenceReport>('/absence-reports', body);
}

/**
 * Correct a report that is still pending.
 *
 * The counterpart to the 409 on create: rather than telling a worker off for
 * submitting twice, we send them here with their existing report loaded.
 */
export function amendAbsenceReport(
  id: string,
  body: AbsenceReportAmendInput,
): Promise<AbsenceReport> {
  return api.put<AbsenceReport>(`/absence-reports/${id}`, body);
}

/**
 * The open report already covering a shift, if there is one.
 *
 * Workers only ever see their own rows, so this needs no worker filter.
 */
export async function findOpenReportForShift(
  shiftId: string,
): Promise<AbsenceReport | null> {
  const rows = await listAbsenceReports({ shiftId }).catch(() => [] as AbsenceReport[]);
  return rows.find(isOpenAbsence) ?? null;
}

export function reviewAbsenceReport(
  id: string,
  body: { status: AbsenceStatus; admin_note?: string; cancel_shift?: boolean },
): Promise<AbsenceReport> {
  return api.patch<AbsenceReport>(`/absence-reports/${id}`, body);
}

export function removeAbsenceAttachment(
  id: string,
  path: string,
): Promise<AbsenceAttachmentsResult> {
  return api.delete<AbsenceAttachmentsResult>(
    `/absence-reports/${id}/attachments?path=${encodeURIComponent(path)}`,
  );
}

// ── files ───────────────────────────────────────────────────────────────────

export function isPdf(value: string): boolean {
  return PDF_EXT.test(value.split('?')[0]);
}

export function isDoc(value: string): boolean {
  return DOC_EXT.test(value.split('?')[0]);
}

export function isImageFile(file: File): boolean {
  return IMAGE_TYPES.includes(file.type) || IMAGE_EXT.test(file.name);
}

/** True for anything that cannot be re-encoded in the browser. */
function isDocFile(file: File): boolean {
  return DOC_TYPES.includes(file.type) || DOC_EXT.test(file.name);
}

function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || PDF_EXT.test(file.name);
}

/** Returns an error message, or null when the file is acceptable. */
export function validateAttachment(file: File): string | null {
  const image = isImageFile(file);
  const pdf = isPdfFile(file);
  const doc = isDocFile(file);

  if (!image && !pdf && !doc) {
    return 'Only PDF, Word, JPG, JPEG and PNG files are allowed';
  }

  // Images are measured after compression, not before — see uploadAbsenceAttachment.
  const limitMb = image ? MAX_IMAGE_SOURCE_MB : MAX_ATTACHMENT_MB;
  if (file.size > limitMb * 1024 * 1024) {
    return image
      ? `Image is too large to compress — keep it under ${MAX_IMAGE_SOURCE_MB} MB`
      : `${doc ? 'Document' : 'PDF'} must be under ${MAX_ATTACHMENT_MB} MB`;
  }
  return null;
}

/** Resize + re-encode an image to JPEG via Canvas. PDFs never reach this. */
function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, TARGET_MAX_PX / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);

      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Image compression failed'))),
        'image/jpeg',
        JPEG_QUALITY,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image'));
    };

    img.src = objectUrl;
  });
}

/**
 * Upload one file into the report's folder and register it on the report.
 *
 * Two steps on purpose — the object name is keyed by report id, so the row has
 * to exist first. The form hides that by holding files in the browser until
 * submit, then creating the report and uploading in one go.
 */
export async function uploadAbsenceAttachment(
  reportId: string,
  file: File,
): Promise<AbsenceAttachmentsResult> {
  const validationError = validateAttachment(file);
  if (validationError) throw new Error(validationError);

  const image = isImageFile(file);
  // Only images can be re-encoded in the browser. A PDF or Word file goes up
  // byte-for-byte, which is why their gate is on the source size.
  const body: Blob = image ? await compressImage(file) : file;

  if (body.size > MAX_ATTACHMENT_MB * 1024 * 1024) {
    throw new Error(
      `File is still over ${MAX_ATTACHMENT_MB} MB after compression — please send a smaller one`,
    );
  }

  const ext = image ? 'jpg' : (file.name.split('.').pop() || '').toLowerCase();
  // Derived from the extension, not from `file.type`: browsers hand back an
  // empty type often enough for .doc, and the bucket's MIME allow-list would
  // refuse the upload outright rather than guess.
  const contentType = image ? 'image/jpeg' : (EXT_MIME[ext] ?? file.type);
  if (!contentType) {
    throw new Error('Could not determine the file type — please re-save it as a PDF');
  }
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const path = `${reportId}/evidence-${stamp}.${ext}`;

  const { error } = await supabase.storage.from(ABSENCE_BUCKET).upload(path, body, {
    contentType,
    upsert: false,
  });
  if (error) {
    // The bucket is created by scripts/setup_absence_evidence_bucket.py; say so
    // rather than surfacing Supabase's bare "Bucket not found".
    if (/bucket not found/i.test(error.message)) {
      throw new Error(
        'Evidence storage is not set up yet. Ask an admin to run the absence-evidence bucket setup.',
      );
    }
    throw error;
  }

  // The server's list is authoritative — it owns the cap.
  return api.post<AbsenceAttachmentsResult>(`/absence-reports/${reportId}/attachments`, {
    path,
  });
}

/** Turn a stored object path into a temporary viewable URL. */
export async function getAbsenceAttachmentUrl(path: string): Promise<string | null> {
  const clean = (path || '').trim().replace(/^\/+/, '');
  if (!clean) return null;

  const { data, error } = await supabase.storage
    .from(ABSENCE_BUCKET)
    .createSignedUrl(clean, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

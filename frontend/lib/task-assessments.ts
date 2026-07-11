/**
 * Task assessment data layer.
 * Reads from Firestore first; falls back to the REST API on any error.
 * Writes always go through the API (backend syncs to Firestore after commit).
 */
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage, COLLECTIONS } from './firebase';
import { api } from './api';

export type MediaType = 'image' | 'video';

export interface TaskMedia {
  type:         MediaType;
  url:          string;
  name:         string;
  storage_path: string;
}

export interface TaskAssessment {
  id:                  string;
  title:               string;
  category:            string;
  description:         string;
  instructions:        string;
  media_urls:          TaskMedia[];
  is_timed:            boolean;
  time_limit_minutes:  number | null;
  passing_score_pct:   number;
  is_active:           boolean;
  created_by:          string;
  created_at:          string | null;
  result_count:        number;
}

export type TaskResultStatus = 'pending' | 'in_progress' | 'submitted' | 'graded';

export interface TaskResult {
  id:                    string;
  task_assessment_id:    string;
  worker_id:             string;
  status:                TaskResultStatus;
  submission_notes:      string | null;
  submission_media_urls: TaskMedia[] | null;
  score_pct:             number | null;
  passed:                boolean | null;
  grader_notes:          string | null;
  started_at:            string | null;
  submitted_at:          string | null;
  graded_at:             string | null;
  graded_by:             string | null;
  time_taken_seconds:    number | null;
  created_at:            string | null;
  worker_display_name:   string;
  worker_country:        string;
}

// ── Read (Firestore-first) ────────────────────────────────────────────────────

export async function fetchTaskAssessments(): Promise<TaskAssessment[]> {
  try {
    const snap = await getDocs(
      query(collection(db, COLLECTIONS.TASK_ASSESSMENTS), orderBy('title'))
    );
    if (!snap.empty) {
      return snap.docs.map((d) => ({ result_count: 0, ...d.data() } as TaskAssessment));
    }
  } catch {
    // Firestore unavailable or empty — fall through to API
  }
  return api.get<TaskAssessment[]>('/task-assessments');
}

export async function fetchTaskResults(assessmentId: string): Promise<TaskResult[]> {
  try {
    const snap = await getDocs(
      query(
        collection(db, COLLECTIONS.TASK_RESULTS),
        where('task_assessment_id', '==', assessmentId),
        orderBy('created_at', 'desc'),
      )
    );
    if (!snap.empty) {
      return snap.docs.map((d) => d.data() as TaskResult);
    }
  } catch {
    // fall through
  }
  return api.get<TaskResult[]>(`/task-assessments/${assessmentId}/results`);
}

// ── Firebase Storage upload ───────────────────────────────────────────────────

export interface UploadProgress {
  name: string;
  progress: number; // 0-100
}

export async function uploadTaskMedia(
  file: File,
  onProgress?: (p: UploadProgress) => void,
): Promise<TaskMedia> {
  const ext          = file.name.split('.').pop() ?? '';
  const safeTimestamp = Date.now();
  const storagePath  = `task-assessments/uploads/${safeTimestamp}-${file.name}`;
  const storageRef   = ref(storage, storagePath);
  const mediaType: MediaType = file.type.startsWith('video/') ? 'video' : 'image';

  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, file);
    task.on(
      'state_changed',
      (snap) => {
        const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
        onProgress?.({ name: file.name, progress: pct });
      },
      reject,
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        resolve({ type: mediaType, url, name: file.name, storage_path: storagePath });
      },
    );
  });
}

export async function deleteTaskMedia(storagePath: string): Promise<void> {
  try {
    await deleteObject(ref(storage, storagePath));
  } catch {
    // best-effort; Postgres record is the truth
  }
}

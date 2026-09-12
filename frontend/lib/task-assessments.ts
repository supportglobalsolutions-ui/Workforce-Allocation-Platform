/**
 * Task assessment data layer.
 * All records are canonical in PostgreSQL and served via the FastAPI REST API.
 * Media files are stored in Supabase Storage.
 */
import { supabase } from './supabase';
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
  allow_retakes?:      boolean;
  max_attempts?:       number;
  created_by:          string;
  created_at:          string | null;
  result_count:        number;
}

export type TaskResultStatus = 'pending' | 'in_progress' | 'submitted' | 'graded';

export interface TaskResult {
  id:                    string;
  task_assessment_id:    string | null;
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

// ── Read operations ─────────────────────────────────────────────────────────

export async function fetchTaskAssessments(): Promise<TaskAssessment[]> {
  return api.get<TaskAssessment[]>('/task-assessments');
}

export async function fetchTaskResults(assessmentId: string): Promise<TaskResult[]> {
  return api.get<TaskResult[]>(`/task-assessments/${assessmentId}/results`);
}

// ── Supabase Storage upload ─────────────────────────────────────────────────

export interface UploadProgress {
  name: string;
  progress: number; // 0-100
}

export async function uploadTaskMedia(
  file: File,
  onProgress?: (p: UploadProgress) => void,
): Promise<TaskMedia> {
  const safeTimestamp = Date.now();
  const storagePath = `uploads/${safeTimestamp}-${file.name}`;
  const mediaType: MediaType = file.type.startsWith('video/') ? 'video' : 'image';

  onProgress?.({ name: file.name, progress: 30 });

  const { error } = await supabase.storage
    .from('task-media')
    .upload(storagePath, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: true,
    });

  if (error) {
    throw error;
  }

  onProgress?.({ name: file.name, progress: 90 });
  const { data: urlData } = supabase.storage.from('task-media').getPublicUrl(storagePath);
  onProgress?.({ name: file.name, progress: 100 });

  return {
    type: mediaType,
    url: urlData.publicUrl,
    name: file.name,
    storage_path: storagePath,
  };
}

export async function deleteTaskMedia(storagePath: string): Promise<void> {
  try {
    await supabase.storage.from('task-media').remove([storagePath]);
  } catch {
    // best-effort; Postgres record is the truth
  }
}

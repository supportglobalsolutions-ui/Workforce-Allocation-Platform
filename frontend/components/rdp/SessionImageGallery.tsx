'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ImageIcon, Plus, Search, Trash2 } from 'lucide-react';
import ConfirmModal from '@/components/platform/ConfirmModal';
import {
  MAX_SESSION_IMAGES,
  getSessionImageUrl,
  removeSessionImage,
  uploadSessionImage,
  validateImageFile,
} from '@/lib/session-images';
import ImageInspector from './ImageInspector';

interface Props {
  sessionId: string;
  /** Stored object paths, in capture order. */
  initialUrls?: string[] | null;
  label?: string;
  /** Called with the new stored-path list after any add or remove. */
  onChanged?: (paths: string[]) => void;
  /** Admin inspect-only: no upload / delete. Workers keep the default. */
  readOnly?: boolean;
}

/** A stored path plus the short-lived signed URL used to render it. */
interface Shot {
  path: string;
  signed: string | null;
}

/** The bucket is private, so every path needs a signed URL before it renders. */
async function signAll(paths: string[]): Promise<Shot[]> {
  return Promise.all(
    paths.map(async (path) => ({ path, signed: await getSessionImageUrl(path) })),
  );
}

export default function SessionImageGallery({
  sessionId,
  initialUrls,
  label = 'Session screenshot',
  onChanged,
  readOnly = false,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [inspecting, setInspecting] = useState<Shot | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Shot | null>(null);

  // Join on the value, not the array identity: a parent that rebuilds the
  // prop array on every render would otherwise re-sign on every render.
  const initialKey = (initialUrls ?? []).filter(Boolean).join('|');

  useEffect(() => {
    let cancelled = false;
    const paths = initialKey ? initialKey.split('|') : [];
    if (paths.length === 0) {
      setShots([]);
      return;
    }
    signAll(paths)
      .then((rows) => { if (!cancelled) setShots(rows); })
      .catch(() => {
        if (!cancelled) setShots(paths.map((path) => ({ path, signed: null })));
      });
    return () => { cancelled = true; };
  }, [initialKey]);

  /** Adopt the server's list — it owns ordering and the cap. */
  const adopt = useCallback(async (paths: string[]) => {
    setShots(await signAll(paths));
    onChanged?.(paths);
  }, [onChanged]);

  const full = shots.length >= MAX_SESSION_IMAGES;

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (readOnly) return;
    const file = e.target.files?.[0];
    if (!file) return;
    const validErr = validateImageFile(file);
    if (validErr) { setErrorMsg(validErr); return; }
    setUploading(true);
    setProgress(0);
    setErrorMsg(null);
    try {
      const result = await uploadSessionImage(sessionId, file, (pct) => setProgress(pct));
      await adopt(result.image_urls);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const confirmDelete = async () => {
    const target = pendingDelete;
    setPendingDelete(null);
    if (!target) return;
    try {
      const result = await removeSessionImage(sessionId, target.path);
      await adopt(result.image_urls);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not remove that screenshot.');
    }
  };

  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-gray-500">
            {shots.length} of {MAX_SESSION_IMAGES} screenshots
          </p>
          {full && !readOnly && (
            <p className="text-[11px] text-amber-600">Limit reached</p>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {shots.map((shot, idx) => (
            <div key={shot.path} className="relative group">
              <button
                type="button"
                onClick={() => setInspecting(shot)}
                disabled={!shot.signed}
                className="relative w-full h-24 rounded-lg overflow-hidden border border-gray-200 disabled:opacity-50"
              >
                {shot.signed ? (
                  <img
                    src={shot.signed}
                    alt={`${label} ${idx + 1}`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gray-50">
                    <ImageIcon size={16} className="text-gray-300" />
                  </div>
                )}
                <span className="absolute bottom-1 left-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold text-white bg-black/60">
                  <Search size={9} />
                  {idx + 1}
                </span>
              </button>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => setPendingDelete(shot)}
                  title="Remove this screenshot"
                  aria-label={`Remove screenshot ${idx + 1}`}
                  className="absolute top-1 right-1 p-1 rounded bg-black/60 text-white opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                >
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          ))}

          {uploading && (
            <div className="h-24 flex flex-col items-center justify-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2">
              <span className="text-[11px] font-mono text-emerald-600">{progress}%</span>
              <div className="h-1.5 w-full rounded-full bg-gray-200 overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {!readOnly && !full && !uploading && (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="h-24 flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 hover:border-emerald-400 hover:bg-emerald-50/50 transition-colors"
            >
              <Plus size={16} className="text-gray-300" />
              <span className="text-[11px] text-gray-400">Add</span>
            </button>
          )}

          {readOnly && shots.length === 0 && (
            <div className="col-span-2 sm:col-span-4 h-24 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-200 bg-gray-50">
              <ImageIcon size={18} className="text-gray-300" />
              <span className="text-xs text-gray-400">No screenshots uploaded yet</span>
            </div>
          )}
        </div>

        {errorMsg && (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-xs bg-red-50 border border-red-200 text-red-700">
            <AlertTriangle size={12} className="shrink-0 mt-0.5" />
            <span className="flex-1">{errorMsg}</span>
          </div>
        )}
      </div>

      {!readOnly && (
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFile}
        />
      )}

      {inspecting?.signed && (
        <ImageInspector
          url={inspecting.signed}
          label={label}
          onClose={() => setInspecting(null)}
        />
      )}

      <ConfirmModal
        open={pendingDelete !== null}
        title="Remove this screenshot?"
        body="It comes off this session's evidence. You can capture another in its place."
        confirmLabel="Remove"
        tone="danger"
        onConfirm={() => { void confirmDelete(); }}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}

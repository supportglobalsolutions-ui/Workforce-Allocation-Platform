'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ImageIcon, RefreshCw, Search } from 'lucide-react';
import { uploadSessionImage, validateImageFile } from '@/lib/session-images';
import ImageInspector from './ImageInspector';

interface Props {
  sessionId: string;
  imageType: 'start' | 'end';
  label: string;
  initialUrl?: string | null;
  onUploaded?: (url: string) => void;
  /** Admin inspect-only: no upload / replace. Workers keep the default. */
  readOnly?: boolean;
}

type Status = 'idle' | 'uploading' | 'success' | 'error';

export default function SessionImageUpload({
  sessionId,
  imageType,
  label,
  initialUrl,
  onUploaded,
  readOnly = false,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState<string | null>(initialUrl ?? null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<Status>(initialUrl ? 'success' : 'idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [inspecting, setInspecting] = useState(false);

  useEffect(() => {
    setUrl(initialUrl ?? null);
    setStatus(initialUrl ? 'success' : 'idle');
  }, [initialUrl]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (readOnly) return;
    const file = e.target.files?.[0];
    if (!file) return;
    const validErr = validateImageFile(file);
    if (validErr) { setStatus('error'); setErrorMsg(validErr); return; }
    setStatus('uploading');
    setProgress(0);
    setErrorMsg(null);
    try {
      const downloadUrl = await uploadSessionImage(sessionId, imageType, file, (pct) => setProgress(pct));
      setUrl(downloadUrl);
      setStatus('success');
      onUploaded?.(downloadUrl);
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <>
      <div className="space-y-2">
        {url ? (
          <button
            type="button"
            onClick={() => setInspecting(true)}
            className="relative group w-full h-40 rounded-xl overflow-hidden border border-gray-200 text-left"
          >
            <img src={url} alt={label} className="w-full h-full object-cover" />
            <div className="absolute inset-0 flex items-end justify-between p-2 bg-gradient-to-t from-black/60 via-black/10 to-transparent">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-white bg-emerald-600/90">
                <Search size={11} />
                Inspect · lens
              </span>
              {!readOnly && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    inputRef.current?.click();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      inputRef.current?.click();
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-white bg-white/20 hover:bg-white/30"
                >
                  <RefreshCw size={11} />
                  Replace
                </span>
              )}
            </div>
            {status === 'success' && !readOnly && (
              <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 size={9} />
                Saved
              </div>
            )}
          </button>
        ) : status !== 'uploading' ? (
          readOnly ? (
            <div className="w-full h-40 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50">
              <ImageIcon size={20} className="text-gray-300" />
              <span className="text-xs text-gray-400">No image uploaded yet</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="w-full h-40 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 hover:border-emerald-400 hover:bg-emerald-50/50 transition-colors"
            >
              <ImageIcon size={20} className="text-gray-300" />
              <span className="text-xs text-gray-400">Click to upload</span>
            </button>
          )
        ) : null}

        {status === 'uploading' && (
          <div className="w-full h-40 flex flex-col items-center justify-center gap-3 rounded-xl border border-gray-200 bg-gray-50">
            <div className="w-full max-w-[140px] space-y-1.5 px-2">
              <div className="flex justify-between text-[11px]">
                <span className="text-gray-400">Uploading…</span>
                <span className="font-mono text-emerald-600">{progress}%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-gray-200 overflow-hidden">
                {progress > 0 ? (
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                ) : (
                  <div className="h-full rounded-full bg-emerald-400 animate-[indeterminate_1.4s_ease-in-out_infinite]"
                    style={{ width: '40%' }} />
                )}
              </div>
            </div>
          </div>
        )}

        {status === 'error' && !readOnly && (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-xs bg-red-50 border border-red-200 text-red-700">
            <AlertTriangle size={12} className="shrink-0 mt-0.5" />
            <span className="flex-1">{errorMsg}</span>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="shrink-0 underline underline-offset-2 hover:text-red-900 transition-colors"
            >
              Retry
            </button>
          </div>
        )}
      </div>

      {!readOnly && (
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      )}

      {inspecting && url && (
        <ImageInspector url={url} label={label} onClose={() => setInspecting(false)} />
      )}
    </>
  );
}

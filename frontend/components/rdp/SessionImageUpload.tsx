'use client';

import { useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ImageIcon, RefreshCw, Search } from 'lucide-react';
import { uploadSessionImage, validateImageFile } from '@/lib/session-images';
import ImageInspector from './ImageInspector';

interface Props {
  sessionId: string;
  imageType: 'start' | 'end';
  label: string;
  initialUrl?: string | null;
  onUploaded?: (url: string) => void;
}

type Status = 'idle' | 'uploading' | 'success' | 'error';

export default function SessionImageUpload({ sessionId, imageType, label, initialUrl, onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState<string | null>(initialUrl ?? null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<Status>(initialUrl ? 'success' : 'idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [inspecting, setInspecting] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
        {/* ── Image area ── */}
        {url ? (
          <div className="relative group w-full h-32 rounded-xl overflow-hidden border border-gray-200">
            <img src={url} alt={label} className="w-full h-full object-cover" />
            {/* Hover overlay */}
            <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={() => setInspecting(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-emerald-600/80 hover:bg-emerald-600 transition-colors"
              >
                <Search size={11} />
                Inspect
              </button>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-white/20 hover:bg-white/30 transition-colors"
              >
                <RefreshCw size={11} />
                Replace
              </button>
            </div>
            {/* Saved badge */}
            {status === 'success' && (
              <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 size={9} />
                Saved
              </div>
            )}
          </div>
        ) : status !== 'uploading' ? (
          /* Empty drop zone */
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="w-full h-32 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 hover:border-emerald-400 hover:bg-emerald-50/50 transition-colors"
          >
            <ImageIcon size={20} className="text-gray-300" />
            <span className="text-xs text-gray-400">Click to upload</span>
          </button>
        ) : null}

        {/* ── Uploading state ── */}
        {status === 'uploading' && (
          <div className="w-full h-32 flex flex-col items-center justify-center gap-3 rounded-xl border border-gray-200 bg-gray-50">
            <div className="w-full max-w-[140px] space-y-1.5 px-2">
              <div className="flex justify-between text-[11px]">
                <span className="text-gray-400">Uploading…</span>
                <span className="font-mono text-emerald-600">{progress}%</span>
              </div>
              {/* Determinate bar */}
              <div className="h-1.5 w-full rounded-full bg-gray-200 overflow-hidden">
                {progress > 0 ? (
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                ) : (
                  /* Indeterminate shimmer while waiting for first progress event */
                  <div className="h-full rounded-full bg-emerald-400 animate-[indeterminate_1.4s_ease-in-out_infinite]"
                    style={{ width: '40%' }} />
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Error state ── */}
        {status === 'error' && (
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

      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />

      {inspecting && url && (
        <ImageInspector url={url} label={label} onClose={() => setInspecting(false)} />
      )}
    </>
  );
}

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Crop, Maximize, X } from 'lucide-react';

interface Props {
  /** Full-screen frame already captured from the remote desktop. */
  source: Blob;
  /** Receives the cropped JPEG, or the untouched frame for "whole screen". */
  onConfirm: (blob: Blob) => void;
  onCancel: () => void;
  busy?: boolean;
}

interface Rect { x: number; y: number; w: number; h: number }

/** Drag in image space so the crop stays exact whatever the preview is scaled to. */
function normalise(a: { x: number; y: number }, b: { x: number; y: number }): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  };
}

/** Anything smaller than this is a stray click, not a selection. */
const MIN_SIDE_PX = 8;

export default function RegionSnipOverlay({ source, onConfirm, onCancel, busy = false }: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [cropping, setCropping] = useState(false);

  useEffect(() => {
    const url = URL.createObjectURL(source);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [source]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (rect) setRect(null);
        else onCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, rect]);

  /** Pointer position in natural image pixels. */
  const toImageSpace = useCallback((e: React.PointerEvent): { x: number; y: number } | null => {
    const el = imgRef.current;
    if (!el || !natural) return null;
    const box = el.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return null;
    const scaleX = natural.w / box.width;
    const scaleY = natural.h / box.height;
    return {
      x: Math.min(Math.max(e.clientX - box.left, 0), box.width) * scaleX,
      y: Math.min(Math.max(e.clientY - box.top, 0), box.height) * scaleY,
    };
  }, [natural]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (busy || cropping) return;
    const pt = toImageSpace(e);
    if (!pt) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragStart(pt);
    setRect(null);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragStart) return;
    const pt = toImageSpace(e);
    if (pt) setRect(normalise(dragStart, pt));
  };

  const onPointerUp = () => {
    setDragStart(null);
    setRect((r) => (r && r.w >= MIN_SIDE_PX && r.h >= MIN_SIDE_PX ? r : null));
  };

  /** Selection expressed as percentages so it tracks any preview size. */
  const overlayStyle = useMemo(() => {
    if (!rect || !natural) return null;
    return {
      left: `${(rect.x / natural.w) * 100}%`,
      top: `${(rect.y / natural.h) * 100}%`,
      width: `${(rect.w / natural.w) * 100}%`,
      height: `${(rect.h / natural.h) * 100}%`,
    };
  }, [natural, rect]);

  const confirmCrop = async () => {
    if (!rect || !natural || !objectUrl) return;
    setCropping(true);
    try {
      const img = new Image();
      img.src = objectUrl;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(rect.w));
      canvas.height = Math.max(1, Math.round(rect.h));
      canvas.getContext('2d')!.drawImage(
        img,
        Math.round(rect.x), Math.round(rect.y),
        Math.round(rect.w), Math.round(rect.h),
        0, 0, canvas.width, canvas.height,
      );
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.9);
      });
      // A failed encode should not silently drop the shot — keep the frame.
      onConfirm(blob ?? source);
    } finally {
      setCropping(false);
    }
  };

  const working = busy || cropping;

  return (
    <div className="on-dark-surface fixed inset-0 z-[200] flex flex-col bg-black/90 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white flex items-center gap-2">
            <Crop size={14} /> Select the area to save
          </p>
          <p className="text-[11px] text-white/60 truncate">
            Drag a box over the part you want, or save the whole screen. Esc clears.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          disabled={working}
          aria-label="Cancel capture"
          className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-50"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 min-h-0 flex items-center justify-center p-3">
        <div className="relative max-w-full max-h-full">
          {objectUrl && (
            <img
              ref={imgRef}
              src={objectUrl}
              alt="Captured screen"
              onLoad={(e) => setNatural({
                w: e.currentTarget.naturalWidth,
                h: e.currentTarget.naturalHeight,
              })}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              draggable={false}
              className="max-w-full max-h-[calc(100vh-11rem)] object-contain select-none cursor-crosshair touch-none"
            />
          )}
          {overlayStyle && (
            /* The huge spread dims everything outside the box while leaving
               the selection itself untouched — the snipping-tool look. */
            <div
              className="absolute border-2 border-emerald-400 pointer-events-none"
              style={{ ...overlayStyle, boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.55)' }}
            />
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 px-4 py-3 border-t border-white/10">
        {rect && (
          <span className="mr-auto text-[11px] text-white/60">
            {Math.round(rect.w)} × {Math.round(rect.h)} px
          </span>
        )}
        <button
          type="button"
          onClick={() => onConfirm(source)}
          disabled={working}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold text-white bg-red-700 hover:bg-red-600 border border-red-900/50 disabled:opacity-40"
        >
          <Maximize size={13} /> Whole screen
        </button>
        <button
          type="button"
          onClick={() => { void confirmCrop(); }}
          disabled={working || !rect}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold text-white bg-red-700 hover:bg-red-600 border border-red-900/50 disabled:opacity-40"
        >
          <Check size={13} /> {working ? 'Saving…' : 'Save selection'}
        </button>
      </div>
    </div>
  );
}

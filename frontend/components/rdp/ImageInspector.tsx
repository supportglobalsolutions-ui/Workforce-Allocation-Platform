'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, ZoomIn, ZoomOut, Download, Maximize2 } from 'lucide-react';

interface Props {
  url: string;
  label: string;
  onClose: () => void;
}

const LENS_SIZE = 180;
const ZOOM_MIN = 1;
const ZOOM_MAX = 6;
const ZOOM_STEP = 0.5;

function clampZoom(z: number) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 2) / 2));
}

export default function ImageInspector({ url, label, onClose }: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [zoom, setZoom] = useState(1);
  const [lens, setLens] = useState<{ x: number; y: number } | null>(null);
  const [displaySize, setDisplaySize] = useState({ w: 0, h: 0 });
  const [fitSize, setFitSize] = useState({ w: 0, h: 0 });

  const captureFitSize = () => {
    if (!imgRef.current) return;
    const r = imgRef.current.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      setFitSize({ w: r.width, h: r.height });
      setDisplaySize({ w: r.width, h: r.height });
      setZoom(1);
    }
  };

  useEffect(() => {
    setZoom(1);
    setFitSize({ w: 0, h: 0 });
    setDisplaySize({ w: 0, h: 0 });
  }, [url]);

  useEffect(() => {
    if (imgRef.current?.complete) captureFitSize();
  }, [url]);

  const bumpZoom = useCallback((delta: number) => {
    setZoom((z) => {
      const next = clampZoom(z + delta);
      if (fitSize.w > 0) {
        setDisplaySize({ w: fitSize.w * next, h: fitSize.h * next });
      }
      return next;
    });
  }, [fitSize.w, fitSize.h]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const imgRect = imgRef.current?.getBoundingClientRect();
    if (!imgRect) return;
    const x = e.clientX - imgRect.left;
    const y = e.clientY - imgRect.top;
    if (x < 0 || y < 0 || x > imgRect.width || y > imgRect.height) {
      setLens(null);
      return;
    }
    setLens({ x, y });
  };

  const lensZoom = Math.max(2, zoom + 2);
  const bgX = lens ? -(lens.x * (lensZoom / zoom) - LENS_SIZE / 2) : 0;
  const bgY = lens ? -(lens.y * (lensZoom / zoom) - LENS_SIZE / 2) : 0;

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col"
      style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(12px)' }}
    >
      <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="flex items-center gap-3">
          <Maximize2 size={16} className="text-emerald-400" />
          <span className="text-sm font-semibold text-white">{label}</span>
          <span className="text-xs px-2 py-0.5 rounded-full font-mono"
            style={{ background: 'rgba(63,199,160,0.12)', color: 'var(--emerald-accent)', border: '1px solid rgba(63,199,160,0.2)' }}>
            Inspector
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 px-2 py-1 rounded-xl mr-2"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <button
              type="button"
              onClick={() => bumpZoom(-ZOOM_STEP)}
              disabled={zoom <= ZOOM_MIN}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors disabled:opacity-30 disabled:pointer-events-none"
              title="Zoom out"
            >
              <ZoomOut size={14} />
            </button>
            <span className="text-xs font-mono text-white/70 w-10 text-center">{zoom}×</span>
            <button
              type="button"
              onClick={() => bumpZoom(ZOOM_STEP)}
              disabled={zoom >= ZOOM_MAX}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors disabled:opacity-30 disabled:pointer-events-none"
              title="Zoom in"
            >
              <ZoomIn size={14} />
            </button>
          </div>
          <a
            href={url}
            download
            className="w-8 h-8 flex items-center justify-center rounded-xl text-white/60 hover:text-white transition-colors"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
            title="Download original"
          >
            <Download size={14} />
          </a>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl text-white/60 hover:text-white transition-colors"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div
        className="flex-1 overflow-auto p-6"
        onWheel={(e) => {
          e.preventDefault();
          bumpZoom(e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP);
        }}
      >
        <div
          className="relative select-none mx-auto my-0 w-max min-h-full flex items-center justify-center"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setLens(null)}
          style={{ cursor: lens ? 'none' : 'crosshair' }}
        >
          <img
            ref={imgRef}
            src={url}
            alt={label}
            onLoad={captureFitSize}
            className="object-contain rounded-xl"
            style={{
              width: displaySize.w > 0 ? displaySize.w : undefined,
              height: displaySize.h > 0 ? displaySize.h : undefined,
              maxHeight: zoom === 1 ? 'calc(100vh - 160px)' : 'none',
              maxWidth: zoom === 1 ? '100%' : 'none',
              boxShadow: '0 0 60px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.06)',
            }}
            draggable={false}
          />

          {lens && displaySize.w > 0 && (
            <div
              style={{
                position: 'absolute',
                left: lens.x - LENS_SIZE / 2,
                top: lens.y - LENS_SIZE / 2,
                width: LENS_SIZE,
                height: LENS_SIZE,
                borderRadius: '50%',
                backgroundImage: `url("${url.replace(/"/g, '\\"')}")`,
                backgroundSize: `${displaySize.w * (lensZoom / zoom)}px ${displaySize.h * (lensZoom / zoom)}px`,
                backgroundPosition: `${bgX}px ${bgY}px`,
                backgroundRepeat: 'no-repeat',
                border: '2px solid var(--emerald-accent)',
                boxShadow: '0 0 0 1px rgba(63,199,160,0.3), 0 8px 32px rgba(0,0,0,0.8), inset 0 0 0 1px rgba(255,255,255,0.1)',
                pointerEvents: 'none',
                zIndex: 10,
              }}
            />
          )}
        </div>
      </div>

      <div className="text-center pb-4 shrink-0">
        <p className="text-xs text-white/25">
          + / − or scroll to zoom · hover for a closer lens · Download for full resolution
        </p>
      </div>
    </div>
  );
}

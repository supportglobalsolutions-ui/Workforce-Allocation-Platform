'use client';

import { useRef, useState, useCallback } from 'react';
import { X, ZoomIn, ZoomOut, Download, Maximize2 } from 'lucide-react';

interface Props {
  url: string;
  label: string;
  onClose: () => void;
}

const LENS_SIZE = 180;
const ZOOM_LEVELS = [2, 3, 4, 6];

export default function ImageInspector({ url, label, onClose }: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(3);
  const [lens, setLens] = useState<{ x: number; y: number } | null>(null);
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });

  const handleImageLoad = () => {
    if (imgRef.current) {
      const r = imgRef.current.getBoundingClientRect();
      setImgSize({ w: r.width, h: r.height });
    }
  };

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    const imgRect = imgRef.current?.getBoundingClientRect();
    if (!rect || !imgRect) return;
    const x = e.clientX - imgRect.left;
    const y = e.clientY - imgRect.top;
    if (x < 0 || y < 0 || x > imgRect.width || y > imgRect.height) {
      setLens(null);
      return;
    }
    setLens({ x, y });
    if (imgSize.w === 0) setImgSize({ w: imgRect.width, h: imgRect.height });
  }, [imgSize]);

  const handleMouseLeave = () => setLens(null);

  const bgX = lens ? -(lens.x * zoom - LENS_SIZE / 2) : 0;
  const bgY = lens ? -(lens.y * zoom - LENS_SIZE / 2) : 0;

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col"
      style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(12px)' }}
    >
      {/* Top bar */}
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
          {/* Zoom controls */}
          <div className="flex items-center gap-1 px-2 py-1 rounded-xl mr-2"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <button
              onClick={() => setZoom(z => ZOOM_LEVELS[Math.max(0, ZOOM_LEVELS.indexOf(z) - 1)])}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
            >
              <ZoomOut size={14} />
            </button>
            <span className="text-xs font-mono text-white/70 w-8 text-center">{zoom}×</span>
            <button
              onClick={() => setZoom(z => ZOOM_LEVELS[Math.min(ZOOM_LEVELS.length - 1, ZOOM_LEVELS.indexOf(z) + 1)])}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
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
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl text-white/60 hover:text-white transition-colors"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Image area */}
      <div className="flex-1 flex items-center justify-center overflow-hidden p-6" ref={containerRef}>
        <div
          className="relative select-none"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          style={{ cursor: lens ? 'none' : 'crosshair' }}
        >
          <img
            ref={imgRef}
            src={url}
            alt={label}
            onLoad={handleImageLoad}
            className="max-h-[calc(100vh-120px)] max-w-full object-contain rounded-xl"
            style={{ boxShadow: '0 0 60px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.06)' }}
            draggable={false}
          />

          {/* Magnifying lens */}
          {lens && imgSize.w > 0 && (
            <div
              style={{
                position: 'absolute',
                left: lens.x - LENS_SIZE / 2,
                top: lens.y - LENS_SIZE / 2,
                width: LENS_SIZE,
                height: LENS_SIZE,
                borderRadius: '50%',
                backgroundImage: `url(${url})`,
                backgroundSize: `${imgSize.w * zoom}px ${imgSize.h * zoom}px`,
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

      {/* Bottom hint */}
      <div className="text-center pb-4 shrink-0">
        <p className="text-xs text-white/25">Hover over the image to inspect · {zoom}× zoom active · Download for full resolution</p>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, FileText, ImageIcon } from 'lucide-react';

import { getAbsenceAttachmentUrl, isDoc, isPdf } from '@/lib/absence-reports';

interface AbsenceAttachmentsProps {
  paths: string[];
  /** Override for worker-facing surfaces — the default addresses an admin. */
  emptyMessage?: string;
}

interface Resolved {
  path: string;
  url: string | null;
  pdf: boolean;
}

/**
 * Evidence on a report. The bucket is private, so every item is resolved to a
 * short-lived signed URL on mount — links go stale, which is the point.
 */
export default function AbsenceAttachments({
  paths,
  emptyMessage = 'No evidence attached. The worker may still send it — evidence is optional.',
}: AbsenceAttachmentsProps) {
  const [items, setItems] = useState<Resolved[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all(
      paths.map(async (path) => ({
        path,
        // Word cannot render in a browser tab either — both get the file row.
        pdf: isPdf(path) || isDoc(path),
        url: await getAbsenceAttachmentUrl(path).catch(() => null),
      })),
    ).then((resolved) => {
      if (cancelled) return;
      setItems(resolved);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [paths]);

  if (paths.length === 0) {
    return <p className="text-sm text-theme-muted">{emptyMessage}</p>;
  }

  if (loading) {
    return <p className="text-sm text-theme-muted animate-pulse">Loading evidence…</p>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {items.map(({ path, url, pdf }) => {
        const name = path.split('/').pop() ?? path;

        if (!url) {
          return (
            <div
              key={path}
              className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-3 text-xs text-theme-muted"
            >
              {name} — could not be loaded
            </div>
          );
        }

        if (pdf) {
          return (
            <a
              key={path}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-3 transition-colors hover:border-emerald-accent/25"
            >
              <FileText size={18} className="shrink-0 text-theme-muted" />
              <span className="min-w-0 flex-1 truncate text-xs text-white">{name}</span>
              <ExternalLink
                size={13}
                className="shrink-0 text-theme-muted group-hover:text-emerald-accent"
              />
            </a>
          );
        }

        return (
          <a
            key={path}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="group block overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02] transition-colors hover:border-emerald-accent/25"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={name} className="h-40 w-full object-cover" />
            <span className="flex items-center gap-2 px-3 py-2">
              <ImageIcon size={13} className="shrink-0 text-theme-muted" />
              <span className="min-w-0 flex-1 truncate text-[11px] text-theme-muted">{name}</span>
            </span>
          </a>
        );
      })}
    </div>
  );
}

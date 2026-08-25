import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  besideTitle?: ReactNode;
  actions?: ReactNode;
}

export default function PageHeader({ title, description, besideTitle, actions }: PageHeaderProps) {
  return (
    <div className="mb-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4 min-w-0">
          <h1 className="text-2xl md:text-3xl font-black text-theme-heading tracking-tight">{title}</h1>
          {besideTitle}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
      </div>
      {description ? (
        <p className="text-sm text-theme-muted mt-1 max-w-2xl">{description}</p>
      ) : null}
    </div>
  );
}

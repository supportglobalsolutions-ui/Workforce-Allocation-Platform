'use client';

import Image from 'next/image';
import Link from 'next/link';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  /** Hide gold OPERATIONS subtitle (landing / login only). */
  showOperations?: boolean;
  className?: string;
}

export default function GlobalSolutionsLogo({
  size = 'md',
  showText = true,
  showOperations = false,
  className = '',
}: LogoProps) {
  const markDimensions = {
    sm: { w: 26, h: 26 },
    md: { w: 34, h: 34 },
    lg: { w: 44, h: 44 },
  }[size];

  const wordmarkDimensions = {
    sm: { text: 'text-base', sub: 'text-[7px]', gap: 'gap-1.5' },
    md: { text: 'text-xl', sub: 'text-[8px]', gap: 'gap-2' },
    lg: { text: 'text-2xl', sub: 'text-[9px]', gap: 'gap-2.5' },
  }[size];

  return (
    <Link href="/" className={`inline-flex items-center ${wordmarkDimensions.gap} group transition-transform hover:scale-[1.02] ${className}`}>
      <div className="relative flex items-center justify-center shrink-0">
        <div className="absolute -inset-1.5 rounded-full bg-emerald-400/20 blur-md opacity-70 group-hover:opacity-100 transition-opacity" />
        <Image
          src="/images/logo-mark.png"
          alt="Global Solutions"
          width={markDimensions.w}
          height={markDimensions.h}
          sizes={`${markDimensions.w}px`}
          className="relative rounded-[12%] object-cover drop-shadow-[0_0_12px_rgba(13,245,196,0.6)]"
          priority
        />
      </div>

      {showText && (
        <span className="flex flex-col leading-none">
          <span className={`${wordmarkDimensions.text} font-display font-extrabold tracking-tight text-white`}>
            Global Solutions
          </span>
          {showOperations && (
            <span className={`mt-1 ${wordmarkDimensions.sub} font-bold tracking-[0.24em] text-[#d5b34a]`}>
              OPERATIONS
            </span>
          )}
        </span>
      )}
    </Link>
  );
}

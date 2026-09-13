'use client';

import Image from 'next/image';
import Link from 'next/link';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  className?: string;
}

export default function GlobalSolutionsLogo({
  size = 'md',
  showText = true,
  className = '',
}: LogoProps) {
  const markDimensions = {
    sm: { w: 26, h: 26 },
    md: { w: 34, h: 34 },
    lg: { w: 44, h: 44 },
  }[size];

  const fullLogoDimensions = {
    sm: { w: 150, h: 38 },
    md: { w: 205, h: 52 },
    lg: { w: 260, h: 66 },
  }[size];

  return (
    <Link href="/" className={`inline-flex items-center group transition-transform hover:scale-[1.02] ${className}`}>
      {showText ? (
        <div
          className="relative shrink-0 overflow-hidden"
          style={{ width: fullLogoDimensions.w, height: fullLogoDimensions.h }}
        >
          <Image
            src="/images/logo.png"
            alt="GlobalSolutions — Remote, Smart, Global"
            fill
            sizes={`${fullLogoDimensions.w}px`}
            className="object-cover object-center drop-shadow-[0_0_12px_rgba(13,245,196,0.35)]"
            priority
          />
        </div>
      ) : (
        <div className="relative flex items-center justify-center shrink-0">
          <div className="absolute -inset-1.5 rounded-full bg-emerald-400/20 blur-md opacity-70 group-hover:opacity-100 transition-opacity" />
          <Image
            src="/images/logo-mark.png"
            alt="Global Solutions"
            width={markDimensions.w}
            height={markDimensions.h}
            sizes={`${markDimensions.w}px`}
            className="relative rounded-[22%] object-cover drop-shadow-[0_0_12px_rgba(13,245,196,0.6)]"
            priority
          />
        </div>
      )}
    </Link>
  );
}

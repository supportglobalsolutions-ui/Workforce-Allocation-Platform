'use client';

import Link from 'next/link';
import { useTheme } from '@/lib/theme/ThemeProvider';

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
  const { isDark } = useTheme();

  const iconDimensions = {
    sm: { w: 26, h: 26, stroke: 3.5 },
    md: { w: 34, h: 34, stroke: 4.5 },
    lg: { w: 44, h: 44, stroke: 5.5 },
  }[size];

  const textSize = {
    sm: 'text-base font-semibold',
    md: 'text-lg font-bold',
    lg: 'text-2xl font-extrabold',
  }[size];

  return (
    <Link
      href="/"
      className={`inline-flex items-center gap-2.5 group transition-transform hover:scale-[1.02] ${className}`}
    >
      <div className="relative flex items-center justify-center shrink-0">
        <div className="absolute -inset-1.5 rounded-full bg-emerald-400/20 blur-md opacity-70 group-hover:opacity-100 transition-opacity" />
        <svg
          width={iconDimensions.w}
          height={iconDimensions.h}
          viewBox="0 0 36 36"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="relative drop-shadow-[0_0_12px_rgba(13,245,196,0.6)]"
        >
          <path
            d="M9 25L21 11"
            stroke="url(#gs_logo_cyan)"
            strokeWidth={iconDimensions.stroke}
            strokeLinecap="round"
          />
          <path
            d="M15 29L27 15"
            stroke="url(#gs_logo_emerald)"
            strokeWidth={iconDimensions.stroke}
            strokeLinecap="round"
          />
          <defs>
            <linearGradient id="gs_logo_cyan" x1="9" y1="25" x2="21" y2="11" gradientUnits="userSpaceOnUse">
              <stop stopColor="#0df5c4" />
              <stop offset="1" stopColor="#3fc7a0" />
            </linearGradient>
            <linearGradient id="gs_logo_emerald" x1="15" y1="29" x2="27" y2="15" gradientUnits="userSpaceOnUse">
              <stop stopColor="#10e7b2" />
              <stop offset="1" stopColor="#05c596" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {showText && (
        <span
          className={`font-display tracking-tight ${textSize} transition-colors ${
            isDark
              ? 'text-white group-hover:text-emerald-300 drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]'
              : 'text-emerald-950 group-hover:text-emerald-700'
          }`}
        >
          Global Solutions
        </span>
      )}
    </Link>
  );
}

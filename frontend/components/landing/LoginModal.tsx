'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import LoginCard from './LoginCard';
import {
  GlobalWorkforceCard,
  GlobalReachCard,
  RemoteTeamsCard,
  ProjectsDeliveredCard,
  FeaturePillList,
} from './FloatingWidgets';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function LoginModal({ isOpen, onClose }: LoginModalProps) {
  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      {/* Blurred dark backdrop with cyber glow */}
      <div
        className="fixed inset-0 bg-[#010c09]/85 backdrop-blur-xl transition-opacity animate-fade-in"
        onClick={onClose}
      />

      {/* Floating background Earth horizon graphics */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden opacity-40">
        <div className="absolute -bottom-24 left-1/2 -translate-x-1/2 w-[900px] h-[500px] rounded-full bg-[radial-gradient(ellipse_at_center,#0df5c4_0%,#03251e_40%,transparent_70%)] blur-2xl" />
      </div>

      {/* Modal Dialog Content Container */}
      <div className="relative z-10 w-full max-w-5xl my-auto flex flex-col items-center">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute -top-12 right-0 sm:right-4 w-9 h-9 rounded-full bg-[#031d17]/80 border border-[#0df5c4]/30 text-[#98b7af] hover:text-white hover:border-[#0df5c4] flex items-center justify-center transition-colors shadow-[0_0_15px_rgba(13,245,196,0.2)]"
          aria-label="Close modal"
        >
          <X size={18} />
        </button>

        {/* Header title above modal (from Image 1) */}
        <div className="text-center mb-6">
          <div className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#0df5c4] mb-1">
            WELCOME TO
          </div>
          <h1 className="text-3xl sm:text-4xl font-display font-extrabold text-white tracking-tight drop-shadow-[0_0_20px_rgba(13,245,196,0.3)]">
            Global Solutions
          </h1>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#0df5c4] mt-1">
            REMOTE • SMART • GLOBAL
          </p>
          <p className="text-xs text-[#8cb2a6] mt-1.5 max-w-md mx-auto hidden sm:block">
            Connect talent. Empower teams. Build a smarter, more connected world.
          </p>
        </div>

        {/* Central Grid with surrounding cards (Image 1 layout) */}
        <div className="relative w-full flex items-center justify-center">
          {/* Left Floating Cards (Desktop) */}
          <div className="hidden xl:flex flex-col gap-6 absolute -left-2 top-1/2 -translate-y-1/2 w-72">
            <GlobalWorkforceCard className="animate-[pulse_4s_ease-in-out_infinite]" />
            <GlobalReachCard />
          </div>

          {/* Central Login Card */}
          <LoginCard isModal onSuccess={onClose} />

          {/* Right Floating Cards (Desktop) */}
          <div className="hidden xl:flex flex-col gap-4 absolute -right-2 top-1/2 -translate-y-1/2 w-72">
            <RemoteTeamsCard />
            <ProjectsDeliveredCard />
            <FeaturePillList />
          </div>
        </div>
      </div>
    </div>
  );
}

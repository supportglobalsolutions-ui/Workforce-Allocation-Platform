'use client';
import Image from 'next/image';

export default function ActiveWorkSession() {
  return (
    <div className="p-8 min-h-screen bg-[#001712] text-[#cbe9df]">
      <h1 className="text-3xl font-bold text-white mb-4">Active Work Session</h1>
      <p className="mb-4 text-[#bbcac2]">Converted from the original HTML design.</p>
      <Image src="/images/active_work_session/screen.png" alt="Active Work Session" width={800} height={600} className="rounded-lg" />
    </div>
  );
}

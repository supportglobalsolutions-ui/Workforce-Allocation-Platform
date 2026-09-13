'use client';

/** Standalone HQ globe — no overlay cards. */
export default function GlobeShowcase() {
  return (
    <div className="relative w-full max-w-[480px] xl:max-w-[520px] mx-auto aspect-square select-none">
      <div className="absolute inset-[8%] rounded-full bg-[radial-gradient(circle,rgba(13,245,196,0.28)_0%,rgba(13,245,196,0.06)_50%,transparent_72%)] blur-2xl pointer-events-none" />

      <div className="absolute inset-[4%] rounded-full overflow-hidden shadow-[0_0_70px_rgba(13,245,196,0.32)] ring-1 ring-[#0df5c4]/25">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/landing-globe-hq.png"
          alt="Global Solutions network globe"
          className="w-full h-full object-cover object-center"
          draggable={false}
        />
        <div className="absolute inset-0 rounded-full pointer-events-none shadow-[inset_0_0_40px_rgba(13,245,196,0.28)] border border-[#0df5c4]/20" />
      </div>
    </div>
  );
}

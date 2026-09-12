'use client';

import { Users, Target, Layers, Globe, Shield, Terminal, Cpu, Cloud, Compass } from 'lucide-react';

export default function WhySection() {
  const cards = [
    {
      icon: Users,
      title: 'Talent Network',
      description: 'Access a vetted pool of remote professionals.',
    },
    {
      icon: Target,
      title: 'Smart Matching',
      description: 'Find the right skills, fast and easy.',
    },
    {
      icon: Layers,
      title: 'Project Management',
      description: 'Keep your team aligned and productive.',
    },
    {
      icon: Globe,
      title: 'Global Growth',
      description: 'Expand your reach. Build without borders.',
    },
  ];

  const partners = [
    { name: 'TechFlow', icon: Compass },
    { name: 'NovaGrid', icon: Layers },
    { name: 'PixelForge', icon: Shield },
    { name: 'Summit Media', icon: Terminal },
    { name: 'ByteCraft', icon: Cpu },
    { name: 'CloudNest', icon: Cloud },
  ];

  return (
    <section id="about" className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
      {/* Why Global Solutions Intro */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-12">
        <div className="max-w-2xl">
          <div className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#0df5c4] mb-2.5">
            WHY GLOBAL SOLUTIONS?
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-display font-bold text-white tracking-tight leading-tight">
            Everything you need to build a{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#0df5c4] to-[#4df4cf] drop-shadow-[0_0_20px_rgba(13,245,196,0.3)]">
              global team.
            </span>
          </h2>
        </div>
        <p className="max-w-md text-sm sm:text-base text-[#8cb2a6] leading-relaxed">
          From talent acquisition to seamless collaboration, we provide the tools and support to
          help your business thrive in a digital world.
        </p>
      </div>

      {/* 4 Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {cards.map((c, i) => (
          <div
            key={i}
            className="p-6 rounded-3xl bg-[#031513]/70 backdrop-blur-xl border border-[#0df5c4]/25 hover:border-[#0df5c4]/60 transition-all duration-300 hover:-translate-y-1 group shadow-[0_0_30px_rgba(13,245,196,0.06)]"
          >
            <div className="w-12 h-12 rounded-2xl bg-[#0df5c4]/15 border border-[#0df5c4]/30 flex items-center justify-center text-[#0df5c4] mb-5 group-hover:scale-110 group-hover:shadow-[0_0_15px_#0df5c4] transition-all">
              <c.icon size={22} />
            </div>
            <h3 className="text-base font-display font-bold text-white group-hover:text-[#0df5c4] transition-colors">
              {c.title}
            </h3>
            <p className="text-sm text-[#8cb2a6] mt-2 leading-relaxed">
              {c.description}
            </p>
          </div>
        ))}
      </div>

      {/* Trusted Partners Strip */}
      <div className="mt-20 pt-10 border-t border-[#0df5c4]/15">
        <div className="text-center text-[11px] font-bold uppercase tracking-[0.25em] text-[#789d92] mb-8">
          TRUSTED BY INNOVATIVE TEAMS WORLDWIDE
        </div>
        <div className="flex flex-wrap items-center justify-center gap-8 sm:gap-14 opacity-75 grayscale hover:grayscale-0 transition-all">
          {partners.map((p, idx) => (
            <div key={idx} className="flex items-center gap-2 text-white/80 hover:text-[#0df5c4] transition-colors">
              <p.icon size={18} className="text-[#0df5c4]" />
              <span className="font-display font-bold text-sm tracking-wide">{p.name}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

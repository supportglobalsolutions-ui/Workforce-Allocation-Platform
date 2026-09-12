'use client';

import { Users, Zap, ShieldCheck, Clock, TrendingUp } from 'lucide-react';

export default function FeatureStrip() {
  const features = [
    {
      icon: Users,
      title: 'Global Talent',
      description: 'Access skilled professionals from 50+ countries.',
    },
    {
      icon: Zap,
      title: 'Flexible Teams',
      description: 'Scale up or down with complete flexibility.',
    },
    {
      icon: ShieldCheck,
      title: 'Secure & Reliable',
      description: 'Your data, our priority. Always.',
    },
    {
      icon: Clock,
      title: 'Real-Time Collaboration',
      description: 'Stay connected. Get more done.',
    },
    {
      icon: TrendingUp,
      title: 'Boost Productivity',
      description: 'Smarter workflows. Greater results.',
    },
  ];

  return (
    <section id="features" className="w-full max-w-7xl mx-auto px-4 sm:px-6 my-10 sm:my-14">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 p-3 sm:p-4 rounded-3xl bg-[#031513]/70 backdrop-blur-2xl border border-[#0df5c4]/20 shadow-[0_0_40px_rgba(13,245,196,0.08)]">
        {features.map((item, idx) => (
          <div
            key={idx}
            className="flex items-start gap-3.5 p-4 rounded-2xl bg-[#04201a]/40 hover:bg-[#04201a]/70 border border-[#0df5c4]/15 hover:border-[#0df5c4]/40 transition-all group"
          >
            <div className="w-10 h-10 rounded-xl bg-[#0df5c4]/15 border border-[#0df5c4]/25 flex items-center justify-center shrink-0 text-[#0df5c4] group-hover:scale-105 group-hover:shadow-[0_0_12px_#0df5c4] transition-all">
              <item.icon size={20} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight group-hover:text-[#0df5c4] transition-colors">
                {item.title}
              </h3>
              <p className="text-xs text-[#8cb2a6] mt-1 leading-relaxed">
                {item.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Bot, LayoutDashboard, Users, Clock, Bell, BarChart3 } from 'lucide-react';
import { FEATURES } from '../data/demoData';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Bot,
  LayoutDashboard,
  Users,
  Clock,
  Bell,
  BarChart3,
};

export default function FeaturesGrid() {
  const navigate = useNavigate();
  return (
    <section id="features" className="relative py-24 bg-[#0a0a0f] overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 section-gradient-1 opacity-50" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            <span className="gradient-text">Everything You Need</span> in One Platform
          </h2>
          <p className="text-xl text-gray-400 max-w-3xl mx-auto">
            Powerful features designed to streamline your restaurant operations and enhance
            customer experience
          </p>
        </motion.div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((feature, index) => {
            const IconComponent = ICON_MAP[feature.icon];

            return (
              <motion.div
                key={index}
                className="glass-card p-6 group cursor-pointer"
              >
                {/* Icon with gradient background */}
                <div
                  className={`w-14 h-14 rounded-xl bg-gradient-to-br ${feature.gradient} p-0.5 mb-4 group-hover:scale-110 transition-transform`}
                >
                  <div className="w-full h-full rounded-xl bg-[#0a0a0f] flex items-center justify-center">
                    {IconComponent && <IconComponent className="w-7 h-7 text-white" />}
                  </div>
                </div>

                {/* Feature Title */}
                <h3 className="text-xl font-bold text-white mb-3">{feature.title}</h3>

                {/* Feature Description */}
                <p className="text-gray-400 mb-4 leading-relaxed">{feature.description}</p>

                {/* Demo Badge */}
                <div className="inline-flex items-center gap-2 px-3 py-1 glass-subtle rounded-lg text-xs text-gray-300">
                  <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                  {feature.demo}
                </div>

                {/* Hover glow effect */}
                <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  <div
                    className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${feature.gradient} opacity-10 blur-xl`}
                  />
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Bottom CTA */}
        <motion.div
          className="text-center mt-16"
        >
          <button
            onClick={() => navigate('/live-demo')}
            className="px-8 py-4 glass-button-primary text-white font-semibold text-lg inline-flex items-center gap-2"
          >
            See It In Action
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </button>
        </motion.div>
      </div>
    </section>
  );
}

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
    <section id="features" className="relative py-24 bg-cream-100 overflow-hidden">
      {/* Subtle Background Pattern */}
      <div className="absolute inset-0 bg-parchment-texture opacity-20" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="font-display text-4xl md:text-5xl font-bold text-burgundy-900 mb-4">
            Everything You Need to{' '}
            <span className="text-gold-600">Excel</span>
          </h2>
          <p className="font-sans text-xl text-charcoal-600 max-w-3xl mx-auto">
            Powerful features designed to streamline operations and elevate every guest experience
          </p>
        </motion.div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {FEATURES.map((feature, index) => {
            const IconComponent = ICON_MAP[feature.icon];

            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="group bg-cream-50 border-2 border-cream-300 hover:border-burgundy-400 rounded-2xl p-8 shadow-md hover:shadow-burgundy transition-all duration-400 ease-out-expo hover:-translate-y-2 cursor-pointer"
                style={{ '--index': index } as React.CSSProperties}
              >
                {/* Icon */}
                <div className="w-16 h-16 bg-burgundy-50 rounded-xl flex items-center justify-center mb-6 group-hover:bg-gold-50 transition-colors duration-300">
                  {IconComponent && <IconComponent className="w-8 h-8 text-burgundy-700 group-hover:text-gold-600 transition-colors" />}
                </div>

                {/* Feature Title */}
                <h3 className="font-display font-semibold text-2xl text-burgundy-900 mb-4">
                  {feature.title}
                </h3>

                {/* Feature Description */}
                <p className="font-sans text-base text-charcoal-600 leading-relaxed mb-4">
                  {feature.description}
                </p>

                {/* Demo Badge */}
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-cream-100 border border-burgundy-200 rounded-lg">
                  <div className="w-1.5 h-1.5 bg-success-500 rounded-full animate-pulse" />
                  <span className="font-sans text-xs text-charcoal-700 font-medium">{feature.demo}</span>
                </div>

                {/* Hover glow effect */}
                <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-burgundy-300/10 to-gold-300/10 blur-xl" />
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Bottom CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="text-center mt-16"
        >
          <button
            onClick={() => navigate('/live-demo')}
            className="px-8 py-4 font-sans font-semibold text-lg bg-gradient-to-r from-burgundy-700 to-burgundy-800 text-cream-50 rounded-xl shadow-burgundy hover:-translate-y-1 hover:shadow-2xl transition-all duration-300 inline-flex items-center gap-2"
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

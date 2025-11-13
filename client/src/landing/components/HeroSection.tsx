import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Sparkles, CheckCircle } from 'lucide-react';
import { DEMO_RESTAURANT, STATS } from '../data/demoData';

export default function HeroSection() {
  const navigate = useNavigate();

  const scrollToContact = () => {
    const element = document.getElementById('contact');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-cream-200 pt-16">
      {/* Mesh Gradient Background Overlay */}
      <div className="absolute inset-0 bg-mesh-gradient opacity-30" />

      {/* Parchment Texture Overlay */}
      <div className="absolute inset-0 bg-parchment-texture opacity-40" />

      {/* Subtle Animated Gradient Orbs */}
      <motion.div
        animate={{
          scale: [1, 1.1, 1],
          opacity: [0.2, 0.3, 0.2],
        }}
        transition={{
          duration: 10,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="absolute top-1/4 left-1/4 w-96 h-96 bg-burgundy-300/20 rounded-full blur-3xl"
      />
      <motion.div
        animate={{
          scale: [1.1, 1, 1.1],
          opacity: [0.15, 0.25, 0.15],
        }}
        transition={{
          duration: 12,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-gold-300/20 rounded-full blur-3xl"
      />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left Column - Hero Text */}
          <div className="space-y-8">
            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-cream-50 border-2 border-gold-400 rounded-full shadow-sm"
            >
              <Sparkles className="w-4 h-4 text-gold-600" />
              <span className="font-sans text-sm font-medium text-charcoal-800">AI-Powered Restaurant Excellence</span>
            </motion.div>

            {/* Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="font-display font-bold text-5xl md:text-6xl lg:text-7xl text-burgundy-900 leading-tight tracking-tight"
            >
              Restaurant Management
              <br />
              <span className="text-gold-600">Elevated</span>
            </motion.h1>

            {/* Subheadline */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="font-sans text-lg md:text-xl text-charcoal-700 leading-relaxed max-w-2xl"
            >
              AI-powered reservation system for Michelin-star restaurants. Transform every guest interaction into a premium experience with natural conversation and intelligent automation.
            </motion.p>

            {/* Key Benefits */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="grid grid-cols-1 sm:grid-cols-2 gap-4"
            >
              {[
                'Voice & text reservations',
                'Real-time table management',
                'Smart wait predictions',
                '40+ hours saved monthly',
              ].map((benefit, index) => (
                <div
                  key={index}
                  className="flex items-start gap-3"
                  style={{ '--index': index } as React.CSSProperties}
                >
                  <CheckCircle className="w-5 h-5 text-success-500 flex-shrink-0 mt-0.5" />
                  <span className="font-sans text-base text-charcoal-700">{benefit}</span>
                </div>
              ))}
            </motion.div>

            {/* CTA Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="flex flex-col sm:flex-row gap-4 pt-4"
            >
              <button
                onClick={() => navigate('/live-demo')}
                className="px-8 py-4 font-sans font-bold text-lg bg-gradient-to-r from-burgundy-700 to-burgundy-800 text-cream-50 rounded-xl shadow-burgundy hover:-translate-y-1 hover:shadow-2xl active:scale-[0.98] transition-all duration-300 ease-out-expo flex items-center justify-center gap-2 group"
              >
                Start Free Trial
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
              <button
                onClick={scrollToContact}
                className="px-8 py-4 font-sans font-semibold text-lg bg-cream-100 text-burgundy-800 border-2 border-burgundy-300 rounded-xl hover:bg-cream-200 hover:border-burgundy-400 transition-all duration-200 flex items-center justify-center gap-2"
              >
                Schedule Demo
              </button>
            </motion.div>

            {/* Social Proof Stats */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="grid grid-cols-3 gap-8 pt-8 border-t-2 border-burgundy-200"
            >
              {STATS.slice(0, 3).map((stat, index) => (
                <div key={index} className="text-center">
                  <div className="font-display text-3xl md:text-4xl font-bold text-burgundy-800">{stat.value}</div>
                  <div className="font-sans text-xs text-charcoal-600 mt-1">{stat.label}</div>
                </div>
              ))}
            </motion.div>
          </div>

          {/* Right Column - Elegant Dashboard Preview */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 }}
            className="relative"
          >
            {/* Main Dashboard Card with Elegant Frame */}
            <motion.div
              animate={{ y: [-8, 8, -8] }}
              transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
              className="relative bg-cream-50 border-2 border-gold-400 rounded-2xl shadow-gold p-8 overflow-hidden"
            >
              {/* Decorative Corner Accents */}
              <div className="absolute top-0 left-0 w-16 h-16 border-t-4 border-l-4 border-gold-500 rounded-tl-2xl" />
              <div className="absolute top-0 right-0 w-16 h-16 border-t-4 border-r-4 border-gold-500 rounded-tr-2xl" />
              <div className="absolute bottom-0 left-0 w-16 h-16 border-b-4 border-l-4 border-gold-500 rounded-bl-2xl" />
              <div className="absolute bottom-0 right-0 w-16 h-16 border-b-4 border-r-4 border-gold-500 rounded-br-2xl" />

              {/* Dashboard Header */}
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="font-display text-2xl font-bold text-burgundy-900">{DEMO_RESTAURANT.name}</h3>
                  <p className="font-sans text-sm text-charcoal-600">{DEMO_RESTAURANT.tagline}</p>
                </div>
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-gold-400 to-gold-600 flex items-center justify-center shadow-gold">
                  <span className="text-2xl">✨</span>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-cream-100 border border-burgundy-200 p-4 rounded-xl">
                  <div className="font-mono text-3xl font-bold text-burgundy-900">{DEMO_RESTAURANT.active_parties}</div>
                  <div className="font-sans text-sm text-charcoal-600 mt-1">Active Parties</div>
                </div>
                <div className="bg-cream-100 border border-burgundy-200 p-4 rounded-xl">
                  <div className="font-mono text-3xl font-bold text-success-500">{DEMO_RESTAURANT.reservations}</div>
                  <div className="font-sans text-sm text-charcoal-600 mt-1">Reservations</div>
                </div>
                <div className="bg-cream-100 border border-burgundy-200 p-4 rounded-xl">
                  <div className="font-mono text-3xl font-bold text-burgundy-900">{DEMO_RESTAURANT.tables}</div>
                  <div className="font-sans text-sm text-charcoal-600 mt-1">Total Tables</div>
                </div>
                <div className="bg-cream-100 border border-burgundy-200 p-4 rounded-xl">
                  <div className="font-mono text-3xl font-bold text-gold-600">{DEMO_RESTAURANT.occupancy}%</div>
                  <div className="font-sans text-sm text-charcoal-600 mt-1">Occupancy</div>
                </div>
              </div>

              {/* Live Indicator */}
              <div className="flex items-center gap-2 justify-center">
                <div className="w-2 h-2 bg-success-500 rounded-full animate-pulse" />
                <span className="font-sans text-xs font-medium text-charcoal-600">Live Dashboard</span>
              </div>
            </motion.div>

            {/* Floating Mini Cards */}
            <motion.div
              animate={{ y: [-4, 4, -4] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -top-6 -left-6 bg-cream-50 border-2 border-burgundy-300 p-5 rounded-xl shadow-lg"
            >
              <div className="font-sans text-sm text-charcoal-700 font-medium">AI Response</div>
              <div className="font-display text-2xl font-bold text-burgundy-900 mt-1">2.3s avg</div>
            </motion.div>

            <motion.div
              animate={{ y: [4, -4, 4] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -bottom-6 -right-6 bg-gradient-to-br from-gold-500 to-gold-600 p-5 rounded-xl shadow-gold"
            >
              <div className="font-sans text-sm text-cream-50 font-medium">Guest Satisfaction</div>
              <div className="font-display text-2xl font-bold text-cream-50 mt-1">94%</div>
            </motion.div>
          </motion.div>
        </div>
      </div>

      {/* Scroll Indicator */}
      <motion.div
        animate={{ y: [0, 12, 0] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
        className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-20"
      >
        <div className="w-6 h-10 border-2 border-burgundy-300 rounded-full flex items-start justify-center p-1.5">
          <motion.div
            animate={{ y: [0, 16, 0] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
            className="w-1.5 h-1.5 bg-burgundy-700 rounded-full"
          />
        </div>
      </motion.div>
    </section>
  );
}

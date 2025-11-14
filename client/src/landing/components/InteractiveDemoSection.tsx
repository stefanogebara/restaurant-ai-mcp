import { motion } from 'framer-motion';
import { ExternalLink, Phone, MessageSquare } from 'lucide-react';
import { DEMO_RESTAURANT } from '../data/demoData';

export default function InteractiveDemoSection() {
  const scrollToContact = () => {
    const element = document.getElementById('contact');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section id="demo" className="relative py-24 bg-[#0a0a0f] overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 section-gradient-2 opacity-50" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            <span className="gradient-text">Experience</span> the Platform Live
          </h2>
          <p className="text-xl text-gray-400 max-w-3xl mx-auto">
            Interact with our demo restaurant and see how the AI handles reservations in real-time
          </p>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left Column - Demo Dashboard Embed */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="glass-card p-2 relative overflow-hidden"
          >
            {/* Dashboard Wrapper */}
            <div className="aspect-[16/10] bg-[#0a0a0f] rounded-xl overflow-hidden relative">
              {/* Embedded iframe or screenshot */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center space-y-4 p-8">
                  <div className="w-20 h-20 rounded-2xl glass-strong mx-auto flex items-center justify-center">
                    <span className="text-4xl">🎯</span>
                  </div>
                  <h3 className="text-2xl font-bold text-white">Live Dashboard Demo</h3>
                  <p className="text-gray-400">
                    Open the host dashboard to see real-time table management
                  </p>
                  <a
                    href="/host-dashboard"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-6 py-3 glass-button-primary text-white font-semibold"
                  >
                    Open Dashboard
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>

              {/* Decorative grid overlay */}
              <div className="absolute inset-0 opacity-5">
                <div className="grid grid-cols-6 grid-rows-4 h-full">
                  {Array.from({ length: 24 }).map((_, i) => (
                    <div key={i} className="border border-white/10" />
                  ))}
                </div>
              </div>
            </div>

            {/* Live Indicator */}
            <div className="absolute top-6 right-6 flex items-center gap-2 px-3 py-2 glass-strong rounded-lg">
              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
              <span className="text-xs text-white font-medium">LIVE DEMO</span>
            </div>

            {/* Glow effect */}
            <div className="absolute -inset-4 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 rounded-2xl blur-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
          </motion.div>

          {/* Right Column - Demo Actions */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="space-y-6"
          >
            {/* Call AI Assistant */}
            <div className="glass-card p-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center flex-shrink-0">
                  <Phone className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-white mb-2">Call Our AI Assistant</h3>
                  <p className="text-gray-400 mb-4">
                    Try making a reservation by calling our demo restaurant number
                  </p>
                  <div className="flex items-center gap-3">
                    <a
                      href={`tel:${DEMO_RESTAURANT.phone}`}
                      className="px-6 py-3 glass-button-primary text-white font-semibold flex items-center gap-2"
                    >
                      <Phone className="w-4 h-4" />
                      {DEMO_RESTAURANT.phone}
                    </a>
                  </div>
                </div>
              </div>
            </div>

            {/* Chat with AI */}
            <div className="glass-card p-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center flex-shrink-0">
                  <MessageSquare className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-white mb-2">Text Reservation</h3>
                  <p className="text-gray-400 mb-4">
                    Or try making a reservation via our text-based chat interface
                  </p>
                  <a
                    href="/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-6 py-3 glass-button text-white font-semibold inline-flex items-center gap-2"
                  >
                    Start Chat
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>
            </div>

            {/* Demo Restaurant Info */}
            <div className="glass-subtle p-6 rounded-2xl">
              <h4 className="text-lg font-bold text-white mb-4">Demo Restaurant</h4>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Name</span>
                  <span className="text-white font-semibold">{DEMO_RESTAURANT.name}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Tables</span>
                  <span className="text-white font-semibold">{DEMO_RESTAURANT.tables}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Capacity</span>
                  <span className="text-white font-semibold">{DEMO_RESTAURANT.capacity} seats</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Occupancy</span>
                  <span className="gradient-text-emerald font-semibold">{DEMO_RESTAURANT.occupancy}%</span>
                </div>
              </div>
            </div>

            {/* CTA */}
            <div className="text-center pt-4">
              <p className="text-gray-400 mb-4">
                Ready to implement this for your restaurant?
              </p>
              <button
                onClick={scrollToContact}
                className="px-8 py-3 glass-button-primary text-white font-semibold"
              >
                Get Started Today
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

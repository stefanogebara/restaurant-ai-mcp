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
    <section id="demo" className="relative py-24 bg-cream-200 overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-parchment-texture opacity-30" />

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
            <span className="text-gold-600">Experience</span> the Platform Live
          </h2>
          <p className="font-sans text-xl text-charcoal-600 max-w-3xl mx-auto">
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
            className="bg-cream-50 border-2 border-gold-400 rounded-2xl p-4 relative overflow-hidden shadow-gold"
          >
            {/* Dashboard Wrapper */}
            <div className="aspect-[16/10] bg-cream-100 rounded-xl overflow-hidden relative border border-burgundy-200">
              {/* Embedded iframe or screenshot */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center space-y-4 p-8">
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-burgundy-700 to-burgundy-900 mx-auto flex items-center justify-center shadow-burgundy">
                    <span className="text-4xl">🎯</span>
                  </div>
                  <h3 className="font-display text-2xl font-bold text-burgundy-900">Live Dashboard Demo</h3>
                  <p className="font-sans text-charcoal-600">
                    Open the host dashboard to see real-time table management
                  </p>
                  <a
                    href="/host-dashboard"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-6 py-3 font-sans font-semibold bg-gradient-to-r from-burgundy-700 to-burgundy-800 text-cream-50 rounded-xl shadow-burgundy hover:-translate-y-1 transition-all duration-200"
                  >
                    Open Dashboard
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>
            </div>

            {/* Live Indicator */}
            <div className="absolute top-8 right-8 flex items-center gap-2 px-3 py-2 bg-cream-50 border border-burgundy-300 rounded-lg shadow-sm">
              <div className="w-2 h-2 bg-success-500 rounded-full animate-pulse" />
              <span className="font-sans text-xs text-burgundy-900 font-bold">LIVE DEMO</span>
            </div>
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
            <div className="bg-cream-50 border-2 border-cream-300 hover:border-burgundy-400 rounded-2xl p-6 transition-all duration-300">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-burgundy-600 to-burgundy-800 flex items-center justify-center flex-shrink-0 shadow-burgundy">
                  <Phone className="w-6 h-6 text-cream-50" />
                </div>
                <div className="flex-1">
                  <h3 className="font-display text-xl font-bold text-burgundy-900 mb-2">Call Our AI Assistant</h3>
                  <p className="font-sans text-charcoal-600 mb-4">
                    Try making a reservation by calling our demo restaurant number
                  </p>
                  <div className="flex items-center gap-3">
                    <a
                      href={`tel:${DEMO_RESTAURANT.phone}`}
                      className="px-6 py-3 font-sans font-semibold bg-gradient-to-r from-burgundy-700 to-burgundy-800 text-cream-50 rounded-xl shadow-burgundy hover:-translate-y-1 transition-all duration-200 flex items-center gap-2"
                    >
                      <Phone className="w-4 h-4" />
                      {DEMO_RESTAURANT.phone}
                    </a>
                  </div>
                </div>
              </div>
            </div>

            {/* Chat with AI */}
            <div className="bg-cream-50 border-2 border-cream-300 hover:border-burgundy-400 rounded-2xl p-6 transition-all duration-300">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-success-500 to-success-600 flex items-center justify-center flex-shrink-0 shadow-lg">
                  <MessageSquare className="w-6 h-6 text-cream-50" />
                </div>
                <div className="flex-1">
                  <h3 className="font-display text-xl font-bold text-burgundy-900 mb-2">Text Reservation</h3>
                  <p className="font-sans text-charcoal-600 mb-4">
                    Or try making a reservation via our text-based chat interface
                  </p>
                  <a
                    href="/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-6 py-3 bg-cream-100 border-2 border-burgundy-300 text-burgundy-800 font-sans font-semibold rounded-xl hover:bg-cream-200 hover:border-burgundy-400 transition-all duration-200 inline-flex items-center gap-2"
                  >
                    Start Chat
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>
            </div>

            {/* Demo Restaurant Info */}
            <div className="bg-cream-50 border-2 border-gold-300 p-6 rounded-2xl">
              <h4 className="font-display text-lg font-bold text-burgundy-900 mb-4">Demo Restaurant</h4>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="font-sans text-charcoal-600">Name</span>
                  <span className="font-sans text-burgundy-900 font-semibold">{DEMO_RESTAURANT.name}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-sans text-charcoal-600">Tables</span>
                  <span className="font-sans text-burgundy-900 font-semibold">{DEMO_RESTAURANT.tables}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-sans text-charcoal-600">Capacity</span>
                  <span className="font-sans text-burgundy-900 font-semibold">{DEMO_RESTAURANT.capacity} seats</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-sans text-charcoal-600">Occupancy</span>
                  <span className="font-sans text-success-500 font-bold">{DEMO_RESTAURANT.occupancy}%</span>
                </div>
              </div>
            </div>

            {/* CTA */}
            <div className="text-center pt-4">
              <p className="font-sans text-charcoal-600 mb-4">
                Ready to implement this for your restaurant?
              </p>
              <button
                onClick={scrollToContact}
                className="px-8 py-3 font-sans font-semibold bg-gradient-to-r from-burgundy-700 to-burgundy-800 text-cream-50 rounded-xl shadow-burgundy hover:-translate-y-1 transition-all duration-200"
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

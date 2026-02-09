import { motion } from 'framer-motion';
import { ExternalLink, Phone, MessageSquare, ArrowRight } from 'lucide-react';
import { DEMO_RESTAURANT } from '../data/demoData';

export default function InteractiveDemoSection() {
  const scrollToContact = () => {
    const element = document.getElementById('contact');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section id="demo" className="py-24 px-6 bg-[#F5F5F4]">
      <div className="max-w-6xl mx-auto">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="font-serif text-3xl md:text-4xl italic mb-4 text-[#1C1917]">
            Experience the Platform Live
          </h2>
          <div className="w-16 h-0.5 bg-[#9F1239] mx-auto opacity-50 mb-6"></div>
          <p className="text-lg text-[#57534E] max-w-2xl mx-auto font-light">
            Interact with our demo restaurant and see how the AI handles reservations in real-time
          </p>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-10 items-start">
          {/* Left Column - Demo Dashboard Embed */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="bg-white p-3 rounded-[2rem] border border-[#E7E5E4] shadow-lg relative"
          >
            {/* Dashboard Wrapper */}
            <div className="aspect-[16/10] bg-[#1C1917] rounded-[1.5rem] overflow-hidden relative">
              {/* Embedded iframe or screenshot */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center space-y-4 p-8">
                  <div className="w-16 h-16 rounded-2xl bg-[#9F1239]/20 mx-auto flex items-center justify-center">
                    <div className="w-8 h-8 rounded-full bg-[#9F1239]"></div>
                  </div>
                  <h3 className="font-serif text-2xl text-white">Live Dashboard Demo</h3>
                  <p className="text-gray-400 font-light text-sm max-w-xs mx-auto">
                    Open the host dashboard to see real-time table management
                  </p>
                  <a
                    href="/host-dashboard"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-6 py-3 bg-[#9F1239] text-white text-sm tracking-widest uppercase font-bold hover:bg-[#881337] transition-all duration-300 rounded-xl"
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
                    <div key={i} className="border border-white/20" />
                  ))}
                </div>
              </div>
            </div>

            {/* Live Indicator */}
            <div className="absolute top-6 right-6 flex items-center gap-2 px-3 py-2 bg-white/90 rounded-full shadow-md">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-xs text-[#1C1917] font-bold tracking-wider">LIVE</span>
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
            {/* Call AI Assistant - Coming Soon */}
            <div className="bg-white p-6 rounded-[2rem] border border-[#E7E5E4] shadow-md opacity-60">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-[#A8A29E] flex items-center justify-center flex-shrink-0">
                  <Phone className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="font-serif text-xl text-[#1C1917] mb-2">Call Our AI Assistant</h3>
                  <p className="text-[#57534E] mb-4 font-light text-sm">
                    Voice reservations via phone are coming soon. Try the text chat below!
                  </p>
                  <span
                    className="px-5 py-3 bg-[#A8A29E] text-white text-xs tracking-widest uppercase font-bold rounded-xl inline-flex items-center gap-2 cursor-not-allowed"
                  >
                    <Phone className="w-4 h-4" />
                    Coming Soon
                  </span>
                </div>
              </div>
            </div>

            {/* Chat with AI */}
            <div className="bg-white p-6 rounded-[2rem] border border-[#E7E5E4] shadow-md hover:shadow-lg transition-shadow">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-[#1C1917] flex items-center justify-center flex-shrink-0">
                  <MessageSquare className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="font-serif text-xl text-[#1C1917] mb-2">Text Reservation</h3>
                  <p className="text-[#57534E] mb-4 font-light text-sm">
                    Or try making a reservation via our text-based chat interface
                  </p>
                  <a
                    href="/live-demo"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-5 py-3 border border-[#1C1917] text-[#1C1917] text-xs tracking-widest uppercase font-bold hover:bg-[#1C1917] hover:text-white transition-all duration-300 rounded-xl inline-flex items-center gap-2"
                  >
                    Start Chat
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>
            </div>

            {/* Demo Restaurant Info */}
            <div className="bg-[#FAFAF9] p-6 rounded-[2rem] border border-[#E7E5E4]">
              <h4 className="font-serif text-lg text-[#1C1917] mb-4">Demo Restaurant</h4>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-[#57534E] text-sm font-light">Name</span>
                  <span className="text-[#1C1917] font-medium">{DEMO_RESTAURANT.name}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#57534E] text-sm font-light">Tables</span>
                  <span className="text-[#1C1917] font-medium">{DEMO_RESTAURANT.tables}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#57534E] text-sm font-light">Capacity</span>
                  <span className="text-[#1C1917] font-medium">{DEMO_RESTAURANT.capacity} seats</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#57534E] text-sm font-light">Occupancy</span>
                  <span className="text-[#9F1239] font-bold">{DEMO_RESTAURANT.occupancy}%</span>
                </div>
              </div>
            </div>

            {/* CTA */}
            <div className="text-center pt-2">
              <p className="text-[#57534E] mb-4 font-light text-sm">
                Ready to implement this for your restaurant?
              </p>
              <button
                onClick={scrollToContact}
                className="bg-[#9F1239] text-white px-8 py-4 text-sm tracking-widest uppercase font-bold hover:bg-[#881337] transition-all duration-300 rounded-2xl shadow-xl shadow-[#9F1239]/20 inline-flex items-center gap-2"
              >
                Get Started Today
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

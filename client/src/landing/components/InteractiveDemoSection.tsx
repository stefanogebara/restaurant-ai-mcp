import { motion } from 'framer-motion';
import { ExternalLink, Phone, MessageSquare, ArrowRight, LayoutDashboard, Clock, Users } from 'lucide-react';
import { DEMO_RESTAURANT } from '../data/demoData';

export default function InteractiveDemoSection() {
  const scrollToContact = () => {
    const element = document.getElementById('contact');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section id="demo" className="py-24 px-6 bg-[#F5F5F4] border-t border-[#E7E5E4]">
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
          {/* Left Column - Dashboard Preview */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="bg-white p-3 rounded-[2rem] border border-[#E7E5E4] shadow-lg relative"
          >
            <div className="rounded-[1.5rem] overflow-hidden border border-[#E7E5E4]">
              {/* Mini Browser Chrome */}
              <div className="flex items-center gap-2 px-3 py-2 bg-[#F5F5F4] border-b border-[#E7E5E4]">
                <div className="flex gap-1">
                  <div className="w-2 h-2 rounded-full bg-[#E7E5E4]" />
                  <div className="w-2 h-2 rounded-full bg-[#E7E5E4]" />
                  <div className="w-2 h-2 rounded-full bg-[#E7E5E4]" />
                </div>
                <div className="flex-1 mx-2">
                  <div className="bg-white rounded px-3 py-1 text-[10px] text-[#A8A29E] text-center border border-[#E7E5E4]">
                    app.seatable.io/host-dashboard
                  </div>
                </div>
              </div>

              {/* Dashboard Content */}
              <div className="flex bg-[#FAFAF9]">
                {/* Tiny Sidebar */}
                <div className="hidden sm:flex flex-col w-36 bg-white border-r border-[#E7E5E4] p-3 gap-1.5">
                  <div className="flex items-center gap-1.5 px-2 py-1.5 bg-[#9F1239] text-white rounded text-[10px] font-medium">
                    <LayoutDashboard className="w-3 h-3" />
                    Overview
                  </div>
                  <div className="flex items-center gap-1.5 px-2 py-1.5 text-[#A8A29E] text-[10px]">
                    <Users className="w-3 h-3" />
                    Customers
                  </div>
                  <div className="flex items-center gap-1.5 px-2 py-1.5 text-[#A8A29E] text-[10px]">
                    <Clock className="w-3 h-3" />
                    Analytics
                  </div>
                </div>

                {/* Main Area */}
                <div className="flex-1 p-3 md:p-4">
                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="bg-white rounded-lg p-2 text-center border border-[#E7E5E4]">
                      <div className="text-sm font-bold text-[#1C1917]">8/12</div>
                      <div className="text-[9px] text-[#A8A29E] uppercase">Tables</div>
                    </div>
                    <div className="bg-white rounded-lg p-2 text-center border border-[#E7E5E4]">
                      <div className="text-sm font-bold text-[#9F1239]">67%</div>
                      <div className="text-[9px] text-[#A8A29E] uppercase">Occupancy</div>
                    </div>
                    <div className="bg-white rounded-lg p-2 text-center border border-[#E7E5E4]">
                      <div className="text-sm font-bold text-[#1C1917]">24</div>
                      <div className="text-[9px] text-[#A8A29E] uppercase">Today</div>
                    </div>
                  </div>

                  {/* Table Grid */}
                  <div className="grid grid-cols-4 gap-1.5">
                    {[
                      'available', 'occupied', 'occupied', 'available',
                      'reserved', 'occupied', 'cleaning', 'occupied',
                    ].map((status, i) => {
                      const colors: Record<string, string> = {
                        available: 'bg-emerald-50 border-emerald-200',
                        occupied: 'bg-red-50 border-red-200',
                        reserved: 'bg-purple-50 border-purple-200',
                        cleaning: 'bg-amber-50 border-amber-200',
                      };
                      const dots: Record<string, string> = {
                        available: 'bg-emerald-400',
                        occupied: 'bg-red-400',
                        reserved: 'bg-purple-400',
                        cleaning: 'bg-amber-400',
                      };
                      return (
                        <div key={i} className={`${colors[status]} border rounded p-1.5 text-center`}>
                          <div className="text-[10px] font-bold text-[#57534E]">T{i + 1}</div>
                          <div className={`w-1 h-1 rounded-full ${dots[status]} mx-auto mt-0.5`} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Open Dashboard CTA overlay */}
            <a
              href="/live-demo"
              className="absolute inset-0 rounded-[2rem] flex items-end justify-center pb-6 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 hover:opacity-100 transition-opacity duration-300"
            >
              <span className="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-[#1C1917] text-xs tracking-widest uppercase font-bold rounded-xl shadow-lg">
                Try Live Demo
                <ExternalLink className="w-3.5 h-3.5" />
              </span>
            </a>

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
            {/* Try the AI Chat */}
            <div className="bg-white p-6 rounded-[2rem] border border-[#E7E5E4] shadow-lg hover:shadow-xl transition-shadow">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-[#9F1239] flex items-center justify-center flex-shrink-0">
                  <MessageSquare className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="font-serif text-xl text-[#1C1917] mb-2">Chat with Our AI</h3>
                  <p className="text-[#57534E] mb-4 font-light text-sm">
                    Try making a reservation via our AI-powered chat. Speak naturally or type your request.
                  </p>
                  <a
                    href="/live-demo"
                    className="px-5 py-3 bg-[#9F1239] text-white text-xs tracking-widest uppercase font-bold hover:bg-[#881337] transition-all duration-300 rounded-xl inline-flex items-center gap-2 shadow-md shadow-[#9F1239]/20"
                  >
                    Start Chat
                    <ArrowRight className="w-4 h-4" />
                  </a>
                </div>
              </div>
            </div>

            {/* Voice Reservations */}
            <div className="bg-white p-6 rounded-[2rem] border border-[#E7E5E4] shadow-md hover:shadow-lg transition-shadow">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-[#1C1917] flex items-center justify-center flex-shrink-0">
                  <Phone className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="font-serif text-xl text-[#1C1917] mb-2">Voice Reservations</h3>
                  <p className="text-[#57534E] mb-4 font-light text-sm">
                    Our AI handles phone calls in 6+ languages, takes reservations, and confirms bookings automatically.
                  </p>
                  <a
                    href="/live-demo"
                    className="px-5 py-3 border border-[#1C1917] text-[#1C1917] text-xs tracking-widest uppercase font-bold hover:bg-[#1C1917] hover:text-white transition-all duration-300 rounded-xl inline-flex items-center gap-2"
                  >
                    Try Live Demo
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

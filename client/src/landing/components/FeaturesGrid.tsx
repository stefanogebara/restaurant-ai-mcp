import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ChefHat, Utensils, Wine, Clock, Globe, Bell, ArrowRight } from 'lucide-react';

export default function FeaturesGrid() {
  const navigate = useNavigate();

  return (
    <section id="features" className="py-20 px-6 bg-[#F5F5F4]">
      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="font-serif text-3xl md:text-4xl italic mb-4 text-[#1C1917]">
            Everything You Need
          </h2>
          <div className="w-16 h-0.5 bg-[#9F1239] mx-auto opacity-50"></div>
        </motion.div>

        {/* Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 auto-rows-[240px]">
          {/* Feature 1 - Large Card: AI Reservations */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="md:col-span-2 bg-white p-8 md:p-10 relative overflow-hidden group hover:shadow-2xl transition-all duration-500 rounded-[2rem] border border-[#E7E5E4]"
          >
            <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity duration-500 transform group-hover:rotate-12">
              <ChefHat size={160} />
            </div>
            <h3 className="font-serif text-2xl md:text-3xl mb-3 relative z-10 text-[#1C1917]">
              AI-Powered Reservations
            </h3>
            <p className="text-[#57534E] text-sm md:text-base max-w-md relative z-10 font-light">
              Natural conversation interface for customers to book tables via voice or text.
            </p>
            <button
              onClick={() => navigate('/live-demo')}
              className="absolute bottom-8 left-8 md:bottom-10 md:left-10 flex items-center gap-2 text-[#9F1239] font-bold text-sm uppercase tracking-wider cursor-pointer group-hover:translate-x-2 transition-transform"
            >
              Experience Demo <ArrowRight size={16} />
            </button>
          </motion.div>

          {/* Feature 2 - Dark Card: Host Dashboard */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="bg-[#1C1917] text-[#FAFAF9] p-8 flex flex-col justify-between group hover:shadow-2xl transition-all duration-500 rounded-[2rem] border border-[#1C1917]"
          >
            <Utensils className="text-[#9F1239]" size={28} />
            <div>
              <h3 className="font-serif text-xl mb-2">Host Dashboard</h3>
              <p className="text-gray-400 font-light text-sm">
                Real-time view of floor status, occupancy, and active parties.
              </p>
            </div>
          </motion.div>

          {/* Feature 3 - Burgundy Card: Smart Analytics */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.15 }}
            className="bg-[#9F1239] text-white p-8 flex flex-col justify-between group hover:shadow-2xl transition-all duration-500 rounded-[2rem] border border-[#9F1239]"
          >
            <Wine className="text-white/80" size={28} />
            <div>
              <h3 className="font-serif text-xl mb-2">Smart Analytics</h3>
              <p className="text-white/80 font-light text-sm">
                Track peak hours, customer trends, and revenue patterns.
              </p>
            </div>
          </motion.div>

          {/* Feature 4 - Multilingual */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="bg-white p-8 flex flex-col justify-between group hover:shadow-2xl transition-all duration-500 rounded-[2rem] border border-[#E7E5E4]"
          >
            <Globe className="text-[#9F1239]" size={28} />
            <div>
              <h3 className="font-serif text-xl mb-2 text-[#1C1917]">6+ Languages</h3>
              <p className="text-[#57534E] font-light text-sm">
                AI handles calls and chats in English, Spanish, French, Italian, Portuguese, and more.
              </p>
            </div>
          </motion.div>

          {/* Feature 5 - Large Card: Live Wait Times */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.25 }}
            className="md:col-span-2 bg-white p-8 md:p-10 relative overflow-hidden flex items-center group hover:shadow-2xl transition-all duration-500 rounded-[2rem] border border-[#E7E5E4]"
          >
            <div className="z-10 relative max-w-lg">
              <div className="flex gap-3 mb-5">
                <div className="bg-[#F5F5F4] p-2.5 rounded-xl">
                  <Clock size={18} className="text-[#1C1917]" />
                </div>
                <div className="bg-[#F5F5F4] p-2.5 rounded-xl">
                  <Bell size={18} className="text-[#1C1917]" />
                </div>
              </div>
              <h3 className="font-serif text-2xl md:text-3xl mb-2 text-[#1C1917]">Live Wait Times</h3>
              <p className="text-[#57534E] font-light text-sm md:text-base">
                Automatic calculations based on table turnover. Keep walk-ins informed with real-time estimates.
              </p>
            </div>
            <div className="absolute -right-16 -bottom-16 w-56 h-56 border-[24px] border-[#F5F5F4] rounded-full opacity-50 group-hover:scale-110 transition-transform duration-700" />
          </motion.div>
        </div>

        {/* Bottom CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mt-16"
        >
          <button
            onClick={() => navigate('/live-demo')}
            className="bg-[#9F1239] text-white px-8 py-4 text-sm tracking-widest uppercase font-bold hover:bg-[#881337] transition-all duration-300 shadow-xl shadow-[#9F1239]/20 rounded-2xl inline-flex items-center gap-2"
          >
            See It In Action
            <ArrowRight size={16} />
          </button>
        </motion.div>
      </div>
    </section>
  );
}

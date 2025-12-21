import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ChefHat, Utensils, Wine, Clock, MapPin, Star, ArrowRight } from 'lucide-react';

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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-[300px]">
          {/* Feature 1 - Large Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="md:col-span-2 bg-white p-8 md:p-12 relative overflow-hidden group hover:shadow-2xl transition-all duration-500 rounded-[2rem] border border-[#E7E5E4]"
          >
            <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity duration-500 transform group-hover:rotate-12">
              <ChefHat size={200} />
            </div>
            <h3 className="font-serif text-3xl mb-4 relative z-10 text-[#1C1917]">
              AI-Powered Reservations
            </h3>
            <p className="text-[#57534E] text-lg max-w-md relative z-10 font-light">
              Natural conversation interface for customers to book tables via voice or text.
            </p>
            <button
              onClick={() => navigate('/live-demo')}
              className="absolute bottom-12 left-12 flex items-center gap-2 text-[#9F1239] font-bold text-sm uppercase tracking-wider cursor-pointer group-hover:translate-x-2 transition-transform"
            >
              Experience Demo <ArrowRight size={16} />
            </button>
          </motion.div>

          {/* Feature 2 - Dark Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="bg-[#1C1917] text-[#FAFAF9] p-8 flex flex-col justify-between group hover:shadow-2xl transition-all duration-500 rounded-[2rem] border border-[#1C1917]"
          >
            <Utensils className="text-[#9F1239] mb-4" size={32} />
            <div>
              <h3 className="font-serif text-2xl mb-2">Host Dashboard</h3>
              <p className="text-gray-400 font-light text-sm">
                Real-time view of floor status & occupancy.
              </p>
            </div>
          </motion.div>

          {/* Feature 3 - Burgundy Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="bg-[#9F1239] text-white p-8 flex flex-col justify-between group hover:shadow-2xl transition-all duration-500 rounded-[2rem] border border-[#9F1239]"
          >
            <Wine className="text-white/80 mb-4" size={32} />
            <div>
              <h3 className="font-serif text-2xl mb-2">Smart Analytics</h3>
              <p className="text-white/80 font-light text-sm">
                Track peak hours & customer preferences.
              </p>
            </div>
          </motion.div>

          {/* Feature 4 - Large White Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
            className="md:col-span-2 bg-white p-8 relative overflow-hidden flex items-center group hover:shadow-2xl transition-all duration-500 rounded-[2rem] border border-[#E7E5E4]"
          >
            <div className="z-10 relative max-w-lg">
              <div className="flex gap-4 mb-6">
                <div className="bg-[#F5F5F4] p-3 rounded-full">
                  <Clock size={20} className="text-[#1C1917]" />
                </div>
                <div className="bg-[#F5F5F4] p-3 rounded-full">
                  <MapPin size={20} className="text-[#1C1917]" />
                </div>
                <div className="bg-[#F5F5F4] p-3 rounded-full">
                  <Star size={20} className="text-[#1C1917]" />
                </div>
              </div>
              <h3 className="font-serif text-3xl mb-3 text-[#1C1917]">Live Wait Times</h3>
              <p className="text-[#57534E] font-light">
                Automatic calculations based on table turnover. Keep walk-ins informed.
              </p>
            </div>
            <div className="absolute -right-20 -bottom-20 w-64 h-64 border-[30px] border-[#F5F5F4] rounded-full opacity-50 group-hover:scale-110 transition-transform duration-700" />
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

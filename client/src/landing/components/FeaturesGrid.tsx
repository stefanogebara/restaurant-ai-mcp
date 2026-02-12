import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import ThiingsIcon from '../../components/common/ThiingsIcon';

export default function FeaturesGrid() {
  const navigate = useNavigate();

  return (
    <section id="features" className="py-20 px-6 bg-[#FAFAF9]">
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
            Everything You Need
          </h2>
          <div className="w-16 h-0.5 bg-[#9F1239] mx-auto opacity-50"></div>
        </motion.div>

        {/* Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 auto-rows-[240px]">
          {/* Row 1: AI Reservations (span-2) + Host Dashboard (1) = 3 */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="md:col-span-2 bg-white p-8 md:p-10 relative overflow-hidden group hover:shadow-2xl hover:-translate-y-1 transition-all duration-500 rounded-[2rem] border border-[#E7E5E4]"
          >
            <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-all duration-500 transform group-hover:rotate-12 group-hover:scale-110">
              <ThiingsIcon name="chef-hat" size="xl" pxSize={160} />
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
              Experience Demo <ThiingsIcon name="arrow-right" size="xs" />
            </button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="bg-[#1C1917] text-[#FAFAF9] p-8 flex flex-col justify-between group hover:shadow-2xl hover:-translate-y-1 transition-all duration-500 rounded-[2rem] border border-[#1C1917]"
          >
            <ThiingsIcon name="utensils" pxSize={28} />
            <div>
              <h3 className="font-serif text-xl mb-2">Host Dashboard</h3>
              <p className="text-gray-400 font-light text-sm">
                Real-time view of floor status, occupancy, and active parties.
              </p>
            </div>
          </motion.div>

          {/* Row 2: Smart Analytics (1) + Live Wait Times (span-2) = 3 */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.15 }}
            className="bg-[#9F1239] text-white p-8 flex flex-col justify-between group hover:shadow-2xl hover:-translate-y-1 transition-all duration-500 rounded-[2rem] border border-[#9F1239]"
          >
            <ThiingsIcon name="wine" pxSize={28} />
            <div>
              <h3 className="font-serif text-xl mb-2">Smart Analytics</h3>
              <p className="text-white/80 font-light text-sm">
                Track peak hours, customer trends, and revenue patterns.
              </p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="md:col-span-2 bg-white p-8 md:p-10 relative overflow-hidden flex items-center group hover:shadow-2xl hover:-translate-y-1 transition-all duration-500 rounded-[2rem] border border-[#E7E5E4]"
          >
            <div className="z-10 relative max-w-lg">
              <div className="flex gap-3 mb-5">
                <div className="bg-[#F5F5F4] p-2.5 rounded-xl">
                  <ThiingsIcon name="clock" size="xs" pxSize={18} />
                </div>
                <div className="bg-[#F5F5F4] p-2.5 rounded-xl">
                  <ThiingsIcon name="bell" size="xs" pxSize={18} />
                </div>
              </div>
              <h3 className="font-serif text-2xl md:text-3xl mb-2 text-[#1C1917]">Live Wait Times</h3>
              <p className="text-[#57534E] font-light text-sm md:text-base">
                Automatic calculations based on table turnover. Keep walk-ins informed with real-time estimates.
              </p>
            </div>
            <div className="absolute -right-16 -bottom-16 w-56 h-56 border-[24px] border-[#F5F5F4] rounded-full opacity-50 group-hover:scale-110 transition-transform duration-700" />
          </motion.div>

          {/* Row 3: 6+ Languages (span-3, full width) = 3 */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.25 }}
            className="md:col-span-3 bg-white p-8 md:p-10 relative overflow-hidden flex items-center group hover:shadow-2xl hover:-translate-y-1 transition-all duration-500 rounded-[2rem] border border-[#E7E5E4]"
          >
            <div className="z-10 relative flex-1">
              <ThiingsIcon name="globe" pxSize={28} className="mb-4" />
              <h3 className="font-serif text-2xl md:text-3xl mb-2 text-[#1C1917]">6+ Languages</h3>
              <p className="text-[#57534E] font-light text-sm md:text-base max-w-xl">
                AI handles calls and chats in English, Spanish, French, Italian, Portuguese, and more. Your customers speak their language, our AI understands.
              </p>
            </div>
            <div className="hidden md:flex gap-3 text-center">
              {['EN', 'ES', 'FR', 'IT', 'PT', 'DE'].map((lang) => (
                <div key={lang} className="w-12 h-12 rounded-xl bg-[#F5F5F4] flex items-center justify-center text-xs font-bold text-[#57534E]">
                  {lang}
                </div>
              ))}
            </div>
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
            <ThiingsIcon name="arrow-right" size="xs" />
          </button>
        </motion.div>
      </div>
    </section>
  );
}

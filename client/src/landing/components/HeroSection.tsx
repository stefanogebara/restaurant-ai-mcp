import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, Clock, TrendingUp } from 'lucide-react';

export default function HeroSection() {
  const navigate = useNavigate();

  const fadeIn = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: "easeOut" as const } }
  };

  const stagger = {
    visible: { transition: { staggerChildren: 0.1 } }
  };

  return (
    <section className="relative flex flex-col items-center justify-center overflow-hidden px-6 pt-28 pb-20">
      {/* Background Circle */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80vw] h-[80vw] md:w-[700px] md:h-[700px] bg-[#E7E5E4] rounded-full opacity-20 blur-3xl" />

      <motion.div
        initial="hidden"
        animate="visible"
        variants={stagger}
        className="relative z-10 text-center max-w-4xl mx-auto"
      >
        {/* Badge */}
        <motion.div variants={fadeIn} className="inline-block mb-6">
          <span className="text-[#9F1239] font-bold tracking-[0.2em] text-xs md:text-sm uppercase border-b border-[#9F1239] pb-1">
            AI-Powered Management
          </span>
        </motion.div>

        {/* Main Heading */}
        <motion.h1
          variants={fadeIn}
          className="font-serif text-5xl md:text-7xl lg:text-8xl leading-[1.1] mb-8 text-[#1C1917]"
        >
          Transform <span className="italic font-light">Your Restaurant</span>
          <br /> With AI
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          variants={fadeIn}
          className="text-lg md:text-xl text-[#57534E] mb-10 max-w-2xl mx-auto font-light leading-relaxed"
        >
          Automate reservations, optimize table management, and delight customers
          with our AI-powered conversational platform.
        </motion.p>

        {/* CTA Buttons */}
        <motion.div
          variants={fadeIn}
          className="flex flex-col sm:flex-row gap-4 justify-center"
        >
          <button
            onClick={() => navigate('/live-demo')}
            className="bg-[#9F1239] text-white px-8 py-4 text-sm tracking-widest uppercase font-bold hover:bg-[#881337] transition-all duration-300 shadow-xl shadow-[#9F1239]/20 rounded-2xl"
          >
            Try Live Demo
          </button>
          <button
            onClick={() => navigate('/login')}
            className="border border-[#1C1917] text-[#1C1917] px-8 py-4 text-sm tracking-widest uppercase font-bold hover:bg-[#1C1917] hover:text-white transition-all duration-300 rounded-2xl"
          >
            Start Free Trial
          </button>
        </motion.div>

        {/* Stats Row */}
        <motion.div
          variants={fadeIn}
          className="mt-16 pt-10 border-t border-[#E7E5E4] grid grid-cols-3 gap-6 max-w-lg mx-auto"
        >
          <div className="text-center">
            <div className="text-2xl md:text-3xl font-serif font-bold text-[#1C1917]">2.3s</div>
            <div className="text-xs text-[#57534E] mt-1 uppercase tracking-wider">Avg Response</div>
          </div>
          <div className="text-center">
            <div className="text-2xl md:text-3xl font-serif font-bold text-[#9F1239]">6+</div>
            <div className="text-xs text-[#57534E] mt-1 uppercase tracking-wider">Languages</div>
          </div>
          <div className="text-center">
            <div className="text-2xl md:text-3xl font-serif font-bold text-[#1C1917]">94%</div>
            <div className="text-xs text-[#57534E] mt-1 uppercase tracking-wider">Accuracy</div>
          </div>
        </motion.div>
      </motion.div>

      {/* Dashboard Preview Mockup */}
      <motion.div
        initial={{ opacity: 0, y: 60 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, delay: 0.6, ease: "easeOut" }}
        className="relative z-10 mt-20 w-full max-w-5xl mx-auto"
      >
        <div className="bg-white rounded-2xl md:rounded-[2rem] border border-[#E7E5E4] shadow-2xl shadow-black/5 overflow-hidden">
          {/* Browser Chrome */}
          <div className="flex items-center gap-2 px-4 py-3 bg-[#F5F5F4] border-b border-[#E7E5E4]">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-[#E7E5E4]" />
              <div className="w-3 h-3 rounded-full bg-[#E7E5E4]" />
              <div className="w-3 h-3 rounded-full bg-[#E7E5E4]" />
            </div>
            <div className="flex-1 mx-4">
              <div className="bg-white rounded-lg px-4 py-1.5 text-xs text-[#A8A29E] text-center border border-[#E7E5E4]">
                app.seatable.io/host-dashboard
              </div>
            </div>
          </div>

          {/* Dashboard Content */}
          <div className="flex">
            {/* Mini Sidebar */}
            <div className="hidden md:flex flex-col w-48 bg-[#FAFAF9] border-r border-[#E7E5E4] p-4 gap-2">
              <div className="flex items-center gap-2 px-3 py-2 bg-[#9F1239] text-white rounded-lg text-xs font-medium">
                <LayoutDashboard className="w-3.5 h-3.5" />
                Overview
              </div>
              <div className="flex items-center gap-2 px-3 py-2 text-[#A8A29E] text-xs">
                <Users className="w-3.5 h-3.5" />
                Customer DNA
              </div>
              <div className="flex items-center gap-2 px-3 py-2 text-[#A8A29E] text-xs">
                <TrendingUp className="w-3.5 h-3.5" />
                Analytics
              </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 p-4 md:p-6">
              {/* Stats Row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                {[
                  { label: 'Tables', value: '8/12', color: 'text-[#1C1917]' },
                  { label: 'Occupancy', value: '67%', color: 'text-[#9F1239]' },
                  { label: 'Reservations', value: '24', color: 'text-[#1C1917]' },
                  { label: 'Avg Wait', value: '12m', color: 'text-[#1C1917]' },
                ].map((stat) => (
                  <div key={stat.label} className="bg-[#FAFAF9] rounded-xl p-3 text-center">
                    <div className={`text-lg md:text-xl font-bold ${stat.color}`}>{stat.value}</div>
                    <div className="text-[10px] text-[#A8A29E] uppercase tracking-wider mt-0.5">{stat.label}</div>
                  </div>
                ))}
              </div>

              {/* Table Grid Preview */}
              <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                {[
                  { id: 1, status: 'available' },
                  { id: 2, status: 'occupied' },
                  { id: 3, status: 'occupied' },
                  { id: 4, status: 'available' },
                  { id: 5, status: 'reserved' },
                  { id: 6, status: 'occupied' },
                  { id: 7, status: 'cleaning' },
                  { id: 8, status: 'occupied' },
                  { id: 9, status: 'available' },
                  { id: 10, status: 'occupied' },
                ].map((table) => {
                  const colors: Record<string, string> = {
                    available: 'bg-emerald-50 border-emerald-200 text-emerald-700',
                    occupied: 'bg-red-50 border-red-200 text-red-700',
                    reserved: 'bg-purple-50 border-purple-200 text-purple-700',
                    cleaning: 'bg-amber-50 border-amber-200 text-amber-700',
                  };
                  const dots: Record<string, string> = {
                    available: 'bg-emerald-400',
                    occupied: 'bg-red-400',
                    reserved: 'bg-purple-400',
                    cleaning: 'bg-amber-400',
                  };
                  return (
                    <div key={table.id} className={`${colors[table.status]} border rounded-lg p-2.5 text-center`}>
                      <div className="text-xs font-bold">T{table.id}</div>
                      <div className={`w-1.5 h-1.5 rounded-full ${dots[table.status]} mx-auto mt-1`} />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Floating accent */}
        <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-3/4 h-8 bg-[#9F1239]/5 rounded-full blur-2xl" />
      </motion.div>

      {/* Scroll Indicator */}
      <motion.div
        animate={{ y: [0, 10, 0] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        className="mt-16"
      >
        <div className="w-6 h-10 border-2 border-[#1C1917]/20 rounded-full flex items-start justify-center p-1">
          <motion.div
            animate={{ y: [0, 16, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            className="w-1.5 h-1.5 bg-[#1C1917]/40 rounded-full"
          />
        </div>
      </motion.div>
    </section>
  );
}

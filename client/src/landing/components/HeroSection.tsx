import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
// lucide icons no longer needed for sidebar mockup

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
            className="bg-[#9F1239] text-white px-8 py-4 text-[15px] font-semibold hover:bg-[#881337] transition-all duration-300 shadow-xl shadow-[#9F1239]/20 rounded-full"
          >
            Try Live Demo
          </button>
          <button
            onClick={() => navigate('/onboarding')}
            className="border border-[#1C1917] text-[#1C1917] px-8 py-4 text-[15px] font-semibold hover:bg-[#1C1917] hover:text-white transition-all duration-300 rounded-full"
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
            {/* Mini Sidebar (Dark) */}
            <div className="hidden md:flex flex-col w-48 bg-[#1C1917] p-4 gap-1">
              <div className="font-serif text-sm font-semibold text-white mb-4 px-2">
                seatable<span className="text-[#9F1239]">.</span>
              </div>
              <div className="text-[9px] font-semibold tracking-[1.5px] uppercase text-[#57534E] px-2 mb-1">Main</div>
              <div className="flex items-center gap-2 px-3 py-1.5 text-white bg-[rgba(159,18,57,0.1)] border-l-2 border-[#9F1239] text-xs font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-[#9F1239]" />
                Dashboard
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 text-[#A8A29E] text-xs border-l-2 border-transparent">
                <span className="w-1.5 h-1.5 rounded-full bg-current opacity-40" />
                Tables
              </div>
              <div className="text-[9px] font-semibold tracking-[1.5px] uppercase text-[#57534E] px-2 mt-3 mb-1">AI</div>
              <div className="flex items-center gap-2 px-3 py-1.5 text-[#A8A29E] text-xs border-l-2 border-transparent">
                <span className="w-1.5 h-1.5 rounded-full bg-current opacity-40" />
                Voice Agent
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 text-[#A8A29E] text-xs border-l-2 border-transparent">
                <span className="w-1.5 h-1.5 rounded-full bg-current opacity-40" />
                Call History
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
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
                {[
                  { id: 1, status: 'available', seats: 2, label: 'Window' },
                  { id: 2, status: 'occupied', seats: 4, guest: 'Garcia', time: '45m', pax: 3 },
                  { id: 3, status: 'occupied', seats: 6, guest: 'Laurent', time: '1h 12m', pax: 5 },
                  { id: 4, status: 'available', seats: 4, label: 'Patio' },
                  { id: 5, status: 'reserved', seats: 2, guest: 'Rossi', time: '19:30', pax: 2 },
                  { id: 6, status: 'occupied', seats: 4, guest: 'Schmidt', time: '28m', pax: 4 },
                  { id: 7, status: 'cleaning', seats: 6, label: '~5 min' },
                  { id: 8, status: 'occupied', seats: 8, guest: 'Chen', time: '1h 35m', pax: 7 },
                  { id: 9, status: 'available', seats: 2, label: 'Bar' },
                  { id: 10, status: 'occupied', seats: 4, guest: 'Dubois', time: '15m', pax: 2 },
                ].map((table) => {
                  const cardStyles: Record<string, string> = {
                    available: 'bg-[#10b981]/10 border-[#10b981]/20',
                    occupied: 'bg-white border-[#dc2626]/20',
                    reserved: 'bg-[#8b5cf6]/10 border-[#8b5cf6]/20',
                    cleaning: 'bg-[#f59e0b]/10 border-[#f59e0b]/20',
                  };
                  const statusColors: Record<string, string> = {
                    available: 'bg-[#34d399]',
                    occupied: 'bg-[#f87171]',
                    reserved: 'bg-[#a78bfa]',
                    cleaning: 'bg-[#fbbf24]',
                  };
                  const statusLabels: Record<string, string> = {
                    available: 'Open',
                    occupied: 'Seated',
                    reserved: 'Reserved',
                    cleaning: 'Cleaning',
                  };
                  return (
                    <div key={table.id} className={`${cardStyles[table.status]} border rounded-xl p-2.5 relative overflow-hidden`}>
                      {/* Header row */}
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[11px] font-bold text-[#1C1917]">T{table.id}</span>
                        <div className={`w-1.5 h-1.5 rounded-full ${statusColors[table.status]} ${table.status === 'occupied' ? 'animate-pulse' : ''}`} />
                      </div>
                      {/* Content */}
                      {table.status === 'occupied' || table.status === 'reserved' ? (
                        <>
                          <div className="text-[10px] font-medium text-[#1C1917] truncate">{table.guest}</div>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-[9px] text-[#A8A29E]">{table.pax}/{table.seats}</span>
                            <span className="text-[9px] text-[#57534E] font-medium">{table.time}</span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="text-[10px] text-[#57534E]">{table.label}</div>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-[9px] text-[#A8A29E]">{table.seats} seats</span>
                            <span className="text-[9px] text-[#A8A29E]">{statusLabels[table.status]}</span>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="flex items-center gap-4 mt-3 justify-end">
                {[
                  { color: 'bg-[#34d399]', label: 'Open' },
                  { color: 'bg-[#f87171]', label: 'Seated' },
                  { color: 'bg-[#a78bfa]', label: 'Reserved' },
                  { color: 'bg-[#fbbf24]', label: 'Cleaning' },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-1">
                    <div className={`w-1.5 h-1.5 rounded-full ${item.color}`} />
                    <span className="text-[8px] text-[#A8A29E] uppercase tracking-wider">{item.label}</span>
                  </div>
                ))}
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

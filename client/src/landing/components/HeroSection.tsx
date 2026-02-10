import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

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
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden px-6 pt-20">
      {/* Background Circle */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80vw] h-[80vw] md:w-[600px] md:h-[600px] bg-[#E7E5E4] rounded-full opacity-30 blur-3xl" />

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
            <div className="text-2xl md:text-3xl font-serif font-bold text-[#1C1917]">24/7</div>
            <div className="text-xs text-[#57534E] mt-1 uppercase tracking-wider">AI Booking</div>
          </div>
          <div className="text-center">
            <div className="text-2xl md:text-3xl font-serif font-bold text-[#9F1239]">6+</div>
            <div className="text-xs text-[#57534E] mt-1 uppercase tracking-wider">Languages</div>
          </div>
          <div className="text-center">
            <div className="text-2xl md:text-3xl font-serif font-bold text-[#1C1917]">Real-Time</div>
            <div className="text-xs text-[#57534E] mt-1 uppercase tracking-wider">Dashboard</div>
          </div>
        </motion.div>
      </motion.div>

      {/* Scroll Indicator */}
      <motion.div
        animate={{ y: [0, 10, 0] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        className="absolute bottom-8 left-1/2 transform -translate-x-1/2"
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

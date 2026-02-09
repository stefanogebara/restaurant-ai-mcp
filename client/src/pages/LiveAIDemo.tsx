/// <reference path="../types/elevenlabs.d.ts" />
import { useEffect } from 'react';
import ElevenLabsWidget from '../components/ElevenLabsWidget';
import RecentReservations from '../components/RecentReservations';
import { motion } from 'framer-motion';
import { ArrowLeft, Phone, MessageSquare, Mic, Volume2, Sparkles, ArrowRight, ArrowDownRight, Keyboard } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';

export default function LiveAIDemo() {
  const navigate = useNavigate();

  useEffect(() => {
    // Load ElevenLabs widget script
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/@elevenlabs/convai-widget-embed';
    script.async = true;
    script.type = 'text/javascript';
    document.body.appendChild(script);

    return () => {
      // Cleanup script when component unmounts
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#FAFAF9]">
      {/* Navigation Bar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-[#E7E5E4]">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-[#57534E] hover:text-[#1C1917] transition-colors text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>

          <Link to="/" className="font-serif text-xl tracking-tight text-[#1C1917]">
            Seatable<span className="text-[#9F1239]">.</span>
          </Link>

          <Link
            to="/login"
            className="px-5 py-2 bg-[#1C1917] text-white text-xs tracking-widest uppercase font-bold hover:bg-[#9F1239] transition-all duration-300 rounded-xl"
          >
            Get Started
          </Link>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 pt-28 pb-20">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#9F1239]/10 rounded-full mb-6">
            <Sparkles className="w-4 h-4 text-[#9F1239]" />
            <span className="text-sm text-[#9F1239] font-medium">Live AI Demonstration</span>
          </div>

          <h1 className="font-serif text-4xl md:text-5xl italic text-[#1C1917] mb-6">
            Talk to Our AI Restaurant Assistant
          </h1>

          <div className="w-16 h-0.5 bg-[#9F1239] mx-auto opacity-50 mb-6"></div>

          <p className="text-lg text-[#57534E] max-w-2xl mx-auto font-light">
            Experience the future of restaurant reservations. Our AI understands natural language,
            checks real-time availability, and books your table—all through conversation.
          </p>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-12">
          {/* Left Column - Instructions */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="space-y-6"
          >
            {/* How It Works */}
            <div className="bg-white p-8 rounded-[2rem] border border-[#E7E5E4] shadow-md">
              <h2 className="font-serif text-2xl text-[#1C1917] mb-6 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#9F1239] flex items-center justify-center">
                  <Mic className="w-5 h-5 text-white" />
                </div>
                How It Works
              </h2>

              <div className="space-y-5">
                {[
                  { step: 1, title: 'Open the Chat Widget', desc: 'Look for the chat bubble in the bottom-right corner of your screen and click it', color: 'bg-[#9F1239]' },
                  { step: 2, title: 'Allow Microphone Access', desc: 'Grant permission to use your microphone for voice interaction', color: 'bg-[#1C1917]' },
                  { step: 3, title: 'Start Talking', desc: 'Speak naturally - say "I\'d like to make a reservation for 2 people tonight at 7 PM"', color: 'bg-[#57534E]' },
                  { step: 4, title: 'Watch the Magic', desc: 'Our AI will check availability, confirm details, and complete your reservation', color: 'bg-[#9F1239]' },
                ].map((item) => (
                  <div key={item.step} className="flex gap-4">
                    <div className={`w-8 h-8 rounded-lg ${item.color} flex items-center justify-center flex-shrink-0 font-bold text-white text-sm`}>
                      {item.step}
                    </div>
                    <div>
                      <h3 className="text-[#1C1917] font-medium mb-1">{item.title}</h3>
                      <p className="text-[#57534E] text-sm font-light">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* No microphone note */}
              <div className="mt-6 flex items-start gap-3 p-4 bg-[#FAFAF9] rounded-xl border border-[#E7E5E4]">
                <Keyboard className="w-5 h-5 text-[#9F1239] flex-shrink-0 mt-0.5" />
                <p className="text-[#57534E] text-sm font-light">
                  <span className="font-medium text-[#1C1917]">No microphone?</span> You can also type your request in the chat widget.
                </p>
              </div>
            </div>

            {/* Sample Phrases */}
            <div className="bg-white p-8 rounded-[2rem] border border-[#E7E5E4] shadow-md">
              <h2 className="font-serif text-2xl text-[#1C1917] mb-6 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#1C1917] flex items-center justify-center">
                  <MessageSquare className="w-5 h-5 text-white" />
                </div>
                Try Saying...
              </h2>

              <div className="space-y-3">
                {[
                  "I'd like to make a reservation for 4 people this Friday at 7 PM",
                  "Do you have any tables available for 2 tonight?",
                  "Book a table for 6 people tomorrow at 8 o'clock",
                  "I need a reservation for 3 on Saturday evening",
                  "Can I reserve a table for my anniversary dinner?",
                ].map((phrase, index) => (
                  <div
                    key={index}
                    className="bg-[#FAFAF9] p-4 rounded-xl flex items-start gap-3 hover:bg-[#F5F5F4] transition-all cursor-pointer group border border-[#E7E5E4]"
                  >
                    <Volume2 className="w-4 h-4 text-[#9F1239] flex-shrink-0 mt-0.5" />
                    <span className="text-[#57534E] text-sm italic font-light">"{phrase}"</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Demo Restaurant Info */}
            <div className="bg-[#1C1917] p-6 rounded-[2rem]">
              <h3 className="font-serif text-lg text-white mb-4">Demo Restaurant</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm font-light">Name</span>
                  <span className="text-white font-medium">La Bella Vista</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm font-light">Cuisine</span>
                  <span className="text-white font-medium">Fine Italian Dining</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm font-light">Tables</span>
                  <span className="text-white font-medium">12 tables</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm font-light">Current Occupancy</span>
                  <span className="text-[#9F1239] font-bold">67%</span>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Right Column - AI Widget */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 }}
            className="relative"
          >
            <div className="bg-white p-8 rounded-[2rem] border border-[#E7E5E4] shadow-lg min-h-[600px] relative">
              <div className="absolute top-6 right-6 flex items-center gap-2 px-3 py-2 bg-emerald-50 rounded-full border border-emerald-200">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-xs text-emerald-700 font-bold tracking-wider">AI READY</span>
              </div>

              <div className="text-center space-y-4 mb-8">
                <div className="w-20 h-20 rounded-[1.5rem] bg-[#9F1239]/10 mx-auto flex items-center justify-center">
                  <div className="w-10 h-10 rounded-full bg-[#9F1239] flex items-center justify-center">
                    <Mic className="w-5 h-5 text-white" />
                  </div>
                </div>
                <h3 className="font-serif text-2xl text-[#1C1917]">AI Reservation Assistant</h3>
                <p className="text-[#57534E] font-light text-sm">
                  Use the chat widget in the bottom-right corner to start your conversation
                </p>

                {/* Animated indicator pointing to the chat widget */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1 }}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-[#9F1239]/10 rounded-full border border-[#9F1239]/20"
                >
                  <motion.div
                    animate={{ x: [0, 4, 0], y: [0, 4, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    <ArrowDownRight className="w-4 h-4 text-[#9F1239]" />
                  </motion.div>
                  <span className="text-xs text-[#9F1239] font-medium">
                    Look for the chat bubble in the bottom-right corner
                  </span>
                  <motion.div
                    animate={{ x: [0, 4, 0], y: [0, 4, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    <ArrowDownRight className="w-4 h-4 text-[#9F1239]" />
                  </motion.div>
                </motion.div>
              </div>

              {/* ElevenLabs Widget Container */}
              <div className="flex items-center justify-center min-h-[300px]">
                <ElevenLabsWidget agentId={import.meta.env.VITE_ELEVENLABS_AGENT_ID || 'YOUR_AGENT_ID_HERE'} />
              </div>

              {/* Widget Not Configured Notice */}
              {!import.meta.env.VITE_ELEVENLABS_AGENT_ID && (
                <div className="mt-6 p-4 bg-amber-50 rounded-xl border border-amber-200">
                  <div className="flex items-start gap-3">
                    <Sparkles className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-[#1C1917] font-medium mb-1">Configuration Required</h4>
                      <p className="text-[#57534E] text-sm font-light mb-2">
                        To activate the live AI demo, add your ElevenLabs Agent ID to the environment variables:
                      </p>
                      <code className="text-xs text-[#9F1239] bg-[#FAFAF9] px-2 py-1 rounded border border-[#E7E5E4]">
                        VITE_ELEVENLABS_AGENT_ID=your_agent_id
                      </code>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Info Cards */}
            <div className="grid grid-cols-2 gap-4 mt-6">
              <div className="bg-white p-5 rounded-2xl border border-[#E7E5E4] text-center shadow-md">
                <div className="text-2xl font-serif font-bold text-[#9F1239] mb-1">2.3s</div>
                <div className="text-xs text-[#57534E] uppercase tracking-wider">Avg Response Time</div>
              </div>
              <div className="bg-white p-5 rounded-2xl border border-[#E7E5E4] text-center shadow-md">
                <div className="text-2xl font-serif font-bold text-[#1C1917] mb-1">94%</div>
                <div className="text-xs text-[#57534E] uppercase tracking-wider">Accuracy Rate</div>
              </div>
            </div>

            {/* AI Capabilities */}
            <div className="bg-white p-6 rounded-[2rem] border border-[#E7E5E4] shadow-md mt-6">
              <h3 className="font-serif text-lg text-[#1C1917] mb-4">AI Capabilities</h3>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { icon: Phone, label: 'Voice Recognition' },
                  { icon: MessageSquare, label: 'Natural Language' },
                  { icon: Sparkles, label: 'Smart Responses' },
                  { icon: Volume2, label: 'Text-to-Speech' },
                ].map((feature, index) => (
                  <div key={index} className="bg-[#FAFAF9] p-4 rounded-xl text-center border border-[#E7E5E4]">
                    <div className="w-10 h-10 rounded-xl bg-[#9F1239]/10 mx-auto mb-2 flex items-center justify-center">
                      <feature.icon className="w-5 h-5 text-[#9F1239]" />
                    </div>
                    <div className="text-sm text-[#57534E]">{feature.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>

        {/* Recent Reservations Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mt-16"
        >
          <RecentReservations />
        </motion.div>

        {/* Bottom CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="text-center mt-16"
        >
          <div className="bg-[#1C1917] p-10 rounded-[2rem] max-w-2xl mx-auto">
            <h3 className="font-serif text-2xl text-white mb-3">
              Ready to Implement This in Your Restaurant?
            </h3>
            <p className="text-gray-400 font-light mb-6">
              Schedule a personalized demo and discover how our AI can transform your operations
            </p>
            <button
              onClick={() => navigate('/#contact')}
              className="bg-[#9F1239] text-white px-8 py-4 text-sm tracking-widest uppercase font-bold hover:bg-[#881337] transition-all duration-300 rounded-2xl shadow-xl shadow-[#9F1239]/20 inline-flex items-center gap-2"
            >
              Contact Sales
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      </div>

      {/* Fixed pulsing indicator pointing to the ElevenLabs chat widget */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 2 }}
        className="fixed bottom-24 right-6 z-40 flex items-center gap-2 pointer-events-none"
      >
        <motion.div
          animate={{ opacity: [1, 0.6, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          className="bg-[#9F1239] text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg shadow-[#9F1239]/30 pointer-events-none whitespace-nowrap"
        >
          Start your demo here
        </motion.div>
        <motion.div
          animate={{ y: [0, 6, 0] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <ArrowDownRight className="w-5 h-5 text-[#9F1239]" />
        </motion.div>
      </motion.div>
    </div>
  );
}

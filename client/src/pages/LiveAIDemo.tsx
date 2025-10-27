/// <reference path="../types/elevenlabs.d.ts" />
import { useEffect } from 'react';
import ElevenLabsWidget from '../components/ElevenLabsWidget';
import { motion } from 'framer-motion';
import { ArrowLeft, Phone, MessageSquare, Mic, Volume2, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import '../landing/styles/glass-morphism.css';

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
      document.body.removeChild(script);
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0a0f] overflow-x-hidden">
      {/* Back Button */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="fixed top-4 left-4 z-50"
      >
        <button
          onClick={() => navigate('/')}
          className="px-4 py-2 glass-button text-white font-semibold flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </button>
      </motion.div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 glass-subtle rounded-full mb-6">
            <Sparkles className="w-4 h-4 text-yellow-400" />
            <span className="text-sm text-gray-300">Live AI Demonstration</span>
          </div>

          <h1 className="text-5xl md:text-6xl font-bold mb-6">
            <span className="gradient-text">Talk to Our AI</span> Restaurant Assistant
          </h1>

          <p className="text-xl text-gray-400 max-w-3xl mx-auto mb-8">
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
            <div className="glass-card p-6">
              <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
                <Mic className="w-6 h-6 text-indigo-400" />
                How It Works
              </h2>

              <div className="space-y-4">
                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center flex-shrink-0 font-bold text-white">
                    1
                  </div>
                  <div>
                    <h3 className="text-white font-semibold mb-1">Click the Widget Below</h3>
                    <p className="text-gray-400 text-sm">
                      Start the conversation by clicking the AI assistant button
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0 font-bold text-white">
                    2
                  </div>
                  <div>
                    <h3 className="text-white font-semibold mb-1">Allow Microphone Access</h3>
                    <p className="text-gray-400 text-sm">
                      Grant permission to use your microphone for voice interaction
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center flex-shrink-0 font-bold text-white">
                    3
                  </div>
                  <div>
                    <h3 className="text-white font-semibold mb-1">Start Talking</h3>
                    <p className="text-gray-400 text-sm">
                      Speak naturally - say "I'd like to make a reservation for 2 people tonight at 7 PM"
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center flex-shrink-0 font-bold text-white">
                    4
                  </div>
                  <div>
                    <h3 className="text-white font-semibold mb-1">Watch the Magic</h3>
                    <p className="text-gray-400 text-sm">
                      Our AI will check availability, confirm details, and complete your reservation
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Sample Phrases */}
            <div className="glass-card p-6">
              <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
                <MessageSquare className="w-6 h-6 text-emerald-400" />
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
                    className="glass-subtle p-3 rounded-lg flex items-start gap-2 hover:bg-white/10 transition-all cursor-pointer group"
                  >
                    <Volume2 className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5 group-hover:text-indigo-300" />
                    <span className="text-gray-300 text-sm italic">"{phrase}"</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Demo Restaurant Info */}
            <div className="glass-subtle p-6 rounded-2xl">
              <h3 className="text-lg font-bold text-white mb-4">Demo Restaurant</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Name</span>
                  <span className="text-white font-semibold">La Bella Vista</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Cuisine</span>
                  <span className="text-white font-semibold">Fine Italian Dining</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Tables</span>
                  <span className="text-white font-semibold">12 tables</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Current Occupancy</span>
                  <span className="gradient-text-emerald font-semibold">67%</span>
                </div>
              </div>
            </div>

            {/* Features */}
            <div className="glass-card p-6">
              <h2 className="text-2xl font-bold text-white mb-4">AI Capabilities</h2>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { icon: Phone, label: 'Voice Recognition' },
                  { icon: MessageSquare, label: 'Natural Language' },
                  { icon: Sparkles, label: 'Smart Responses' },
                  { icon: Volume2, label: 'Text-to-Speech' },
                ].map((feature, index) => (
                  <div key={index} className="glass-subtle p-4 rounded-xl text-center">
                    <feature.icon className="w-8 h-8 text-indigo-400 mx-auto mb-2" />
                    <div className="text-sm text-gray-300">{feature.label}</div>
                  </div>
                ))}
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
            <div className="glass-card p-8 min-h-[600px] relative">
              <div className="absolute top-6 right-6 flex items-center gap-2 px-3 py-2 glass-strong rounded-lg">
                <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                <span className="text-xs text-white font-medium">AI READY</span>
              </div>

              <div className="text-center space-y-4 mb-8">
                <div className="w-20 h-20 rounded-2xl glass-strong mx-auto flex items-center justify-center">
                  <span className="text-4xl">🤖</span>
                </div>
                <h3 className="text-2xl font-bold text-white">AI Reservation Assistant</h3>
                <p className="text-gray-400">
                  Click the button below to start your conversation
                </p>
              </div>

              {/* ElevenLabs Widget Container */}
              <div className="flex items-center justify-center min-h-[300px]">
                <ElevenLabsWidget agentId={import.meta.env.VITE_ELEVENLABS_AGENT_ID || 'YOUR_AGENT_ID_HERE'} />
              </div>

              {/* Widget Not Configured Notice */}
              {!import.meta.env.VITE_ELEVENLABS_AGENT_ID && (
                <div className="mt-6 p-4 glass-subtle rounded-xl border border-amber-500/30">
                  <div className="flex items-start gap-3">
                    <Sparkles className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-white font-semibold mb-1">Configuration Required</h4>
                      <p className="text-gray-400 text-sm mb-2">
                        To activate the live AI demo, add your ElevenLabs Agent ID to the environment variables:
                      </p>
                      <code className="text-xs text-indigo-400 bg-black/30 px-2 py-1 rounded">
                        VITE_ELEVENLABS_AGENT_ID=your_agent_id
                      </code>
                    </div>
                  </div>
                </div>
              )}

              {/* Decorative glow */}
              <div className="absolute -inset-4 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 rounded-2xl blur-2xl opacity-50 -z-10" />
            </div>

            {/* Info Cards */}
            <div className="grid grid-cols-2 gap-4 mt-6">
              <div className="glass-subtle p-4 rounded-xl text-center">
                <div className="text-2xl font-bold gradient-text mb-1">2.3s</div>
                <div className="text-xs text-gray-400">Avg Response Time</div>
              </div>
              <div className="glass-subtle p-4 rounded-xl text-center">
                <div className="text-2xl font-bold gradient-text-emerald mb-1">94%</div>
                <div className="text-xs text-gray-400">Accuracy Rate</div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Bottom CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="text-center mt-16"
        >
          <div className="glass-card p-8 max-w-2xl mx-auto">
            <h3 className="text-2xl font-bold text-white mb-3">
              Ready to Implement This in Your Restaurant?
            </h3>
            <p className="text-gray-400 mb-6">
              Schedule a personalized demo and discover how our AI can transform your operations
            </p>
            <button
              onClick={() => navigate('/#contact')}
              className="px-8 py-4 glass-button-primary text-white font-semibold text-lg"
            >
              Contact Sales
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

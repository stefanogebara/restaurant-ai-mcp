import { motion } from 'framer-motion';
import { Bot, User, CheckCircle2, Clock, Globe, Sparkles } from 'lucide-react';

const chatMessages = [
  {
    role: 'customer' as const,
    text: "Hi, I'd like to book a table for 4 tonight at 8pm please.",
    delay: 0,
  },
  {
    role: 'ai' as const,
    text: "I'd be happy to help! I have a lovely window table available at 8pm for 4 guests. Shall I reserve it for you?",
    delay: 0.4,
  },
  {
    role: 'customer' as const,
    text: "Perfect. Under Maria, and one guest is vegetarian.",
    delay: 0.8,
  },
  {
    role: 'ai' as const,
    text: "All set! Table for 4 at 8pm, confirmed for Maria. I've noted the vegetarian preference for the kitchen. See you tonight!",
    delay: 1.2,
  },
];

export default function SocialProofSection() {
  return (
    <section className="py-20 px-6 bg-white border-y border-[#E7E5E4]">
      <div className="max-w-6xl mx-auto">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-14"
        >
          <h2 className="font-serif text-3xl md:text-4xl italic mb-4 text-[#1C1917]">
            See the AI in Action
          </h2>
          <div className="w-16 h-0.5 bg-[#9F1239] mx-auto opacity-50 mb-6"></div>
          <p className="text-lg text-[#57534E] max-w-2xl mx-auto font-light">
            A real conversation between a customer and your AI assistant
          </p>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-10 items-center">
          {/* Left: Chat Preview */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="bg-[#FAFAF9] rounded-[2rem] border border-[#E7E5E4] shadow-lg overflow-hidden"
          >
            {/* Chat Header */}
            <div className="flex items-center gap-3 px-6 py-4 bg-white border-b border-[#E7E5E4]">
              <div className="w-9 h-9 rounded-xl bg-[#9F1239] flex items-center justify-center">
                <Bot className="w-4.5 h-4.5 text-white" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-bold text-[#1C1917]">seatable AI</div>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 bg-[#10b981] rounded-full" />
                  <span className="text-[10px] text-[#A8A29E] uppercase tracking-wider">Online</span>
                </div>
              </div>
              <div className="flex items-center gap-1 px-2 py-1 bg-[#F5F5F4] rounded-lg">
                <Globe className="w-3 h-3 text-[#A8A29E]" />
                <span className="text-[10px] text-[#A8A29E] font-medium">EN</span>
              </div>
            </div>

            {/* Chat Messages */}
            <div className="p-5 space-y-4 min-h-[320px]">
              {chatMessages.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: msg.delay }}
                  className={`flex gap-2.5 ${msg.role === 'customer' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.role === 'ai' && (
                    <div className="w-7 h-7 rounded-lg bg-[#9F1239]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Sparkles className="w-3.5 h-3.5 text-[#9F1239]" />
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] px-4 py-3 text-sm leading-relaxed ${
                      msg.role === 'customer'
                        ? 'bg-[#1C1917] text-white rounded-2xl rounded-br-md'
                        : 'bg-white text-[#1C1917] rounded-2xl rounded-bl-md border border-[#E7E5E4] shadow-sm'
                    }`}
                  >
                    {msg.text}
                  </div>
                  {msg.role === 'customer' && (
                    <div className="w-7 h-7 rounded-lg bg-[#E7E5E4] flex items-center justify-center flex-shrink-0 mt-0.5">
                      <User className="w-3.5 h-3.5 text-[#57534E]" />
                    </div>
                  )}
                </motion.div>
              ))}

              {/* Confirmation Badge */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: 1.8 }}
                className="flex justify-center pt-2"
              >
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#10b981]/10 border border-[#10b981]/20 rounded-full">
                  <CheckCircle2 className="w-4 h-4 text-[#059669]" />
                  <span className="text-xs font-bold text-[#065f46] uppercase tracking-wider">Reservation Confirmed</span>
                </div>
              </motion.div>
            </div>
          </motion.div>

          {/* Right: Capability Cards */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="space-y-5"
          >
            {[
              {
                icon: Clock,
                title: 'Instant Response',
                description: 'Answers calls and chats in under 3 seconds, 24 hours a day. No hold music, no missed calls.',
                accent: 'bg-[#9F1239]',
              },
              {
                icon: Globe,
                title: '6+ Languages',
                description: 'Handles reservations in English, Spanish, French, Italian, Portuguese, German, and more.',
                accent: 'bg-[#1C1917]',
              },
              {
                icon: Sparkles,
                title: 'Understands Context',
                description: 'Remembers dietary preferences, special occasions, and seating requests. Not just booking, but caring.',
                accent: 'bg-[#9F1239]',
              },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: 0.3 + i * 0.15 }}
                className="flex items-start gap-4 bg-[#FAFAF9] p-5 rounded-2xl border border-[#E7E5E4] hover:shadow-md transition-shadow duration-300"
              >
                <div className={`w-10 h-10 ${item.accent} rounded-xl flex items-center justify-center flex-shrink-0`}>
                  <item.icon className="w-4.5 h-4.5 text-white" />
                </div>
                <div>
                  <h3 className="font-serif text-lg text-[#1C1917] mb-1">{item.title}</h3>
                  <p className="text-sm text-[#57534E] font-light leading-relaxed">{item.description}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}

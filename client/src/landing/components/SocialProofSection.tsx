import { motion } from 'framer-motion';
import { Star, Quote } from 'lucide-react';

const testimonials = [
  {
    quote: "Our no-show rate dropped by 35% in the first month. The AI handles calls better than most hosts.",
    author: "Marco R.",
    role: "Owner, Fine Dining",
    rating: 5,
  },
  {
    quote: "We went from missing 40% of after-hours calls to capturing every single one. Game changer.",
    author: "Sofia L.",
    role: "Manager, Bistro",
    rating: 5,
  },
  {
    quote: "Setup took 15 minutes. The AI was taking reservations in 6 languages by dinner service.",
    author: "James T.",
    role: "Owner, Seafood Restaurant",
    rating: 5,
  },
];

export default function SocialProofSection() {
  return (
    <section className="py-20 px-6 bg-white border-y border-[#E7E5E4]">
      <div className="max-w-6xl mx-auto">
        {/* Section Label */}
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-center text-xs text-[#A8A29E] uppercase tracking-[0.2em] mb-12"
        >
          Trusted by restaurants across Europe
        </motion.p>

        {/* Testimonials Grid */}
        <div className="grid md:grid-cols-3 gap-8">
          {testimonials.map((t, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.15 }}
              className="relative bg-[#FAFAF9] rounded-2xl p-6 border border-[#E7E5E4]"
            >
              {/* Quote Icon */}
              <Quote className="w-5 h-5 text-[#9F1239]/30 mb-4" />

              {/* Stars */}
              <div className="flex gap-0.5 mb-4">
                {Array.from({ length: t.rating }).map((_, j) => (
                  <Star key={j} className="w-3.5 h-3.5 fill-[#9F1239] text-[#9F1239]" />
                ))}
              </div>

              {/* Quote Text */}
              <p className="text-[#1C1917] text-sm leading-relaxed mb-6 font-light">
                "{t.quote}"
              </p>

              {/* Author */}
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-[#9F1239]/10 flex items-center justify-center">
                  <span className="text-xs font-bold text-[#9F1239]">
                    {t.author.split(' ').map(n => n[0]).join('')}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-medium text-[#1C1917]">{t.author}</p>
                  <p className="text-xs text-[#A8A29E]">{t.role}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Bottom Stat Bar */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4 }}
          className="mt-12 flex flex-wrap justify-center gap-8 md:gap-16 text-center"
        >
          <div>
            <div className="text-2xl font-serif font-bold text-[#1C1917]">35%</div>
            <div className="text-xs text-[#A8A29E] uppercase tracking-wider mt-1">Fewer No-Shows</div>
          </div>
          <div className="hidden md:block w-px h-10 bg-[#E7E5E4]" />
          <div>
            <div className="text-2xl font-serif font-bold text-[#9F1239]">100%</div>
            <div className="text-xs text-[#A8A29E] uppercase tracking-wider mt-1">Calls Captured</div>
          </div>
          <div className="hidden md:block w-px h-10 bg-[#E7E5E4]" />
          <div>
            <div className="text-2xl font-serif font-bold text-[#1C1917]">15 min</div>
            <div className="text-xs text-[#A8A29E] uppercase tracking-wider mt-1">Setup Time</div>
          </div>
          <div className="hidden md:block w-px h-10 bg-[#E7E5E4]" />
          <div>
            <div className="text-2xl font-serif font-bold text-[#1C1917]">4.9/5</div>
            <div className="text-xs text-[#A8A29E] uppercase tracking-wider mt-1">User Rating</div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

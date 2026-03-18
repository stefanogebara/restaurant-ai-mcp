import { useState, useEffect, useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { useTranslation } from 'react-i18next';

// ─── ShineFx — shimmer sweep on stat values ─────────────────────
function ShineFx({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`relative inline-block overflow-hidden ${className}`}>
      {children}
      <motion.span
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(105deg, transparent 40%, rgba(139,26,74,0.18) 50%, transparent 60%)',
          backgroundSize: '200% 100%',
        }}
        animate={{ backgroundPosition: ['200% 0', '-200% 0'] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'linear', repeatDelay: 2 }}
      />
    </span>
  );
}

export default function BeforeAfterSection() {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });
  const [showAfter, setShowAfter] = useState(false);

  useEffect(() => {
    if (isInView) {
      const timer = setTimeout(() => setShowAfter(true), 1200);
      return () => clearTimeout(timer);
    }
  }, [isInView]);

  return (
    <section className="py-24 px-6 sm:px-16 bg-[#0d0d14]">
      <div className="max-w-[1100px] mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-14"
        >
          <div className="text-xs font-semibold tracking-[3px] uppercase text-white/25 mb-4">
            {t('landing.beforeAfter.label', 'The Difference')}
          </div>
          <h2 className="font-serif text-4xl sm:text-[48px] font-medium tracking-tight text-white mb-3">
            {t('landing.beforeAfter.heading', 'Same restaurant. Different night.')}
          </h2>
          <p className="text-lg text-white/30 font-light max-w-2xl mx-auto">
            {t('landing.beforeAfter.subtitle', 'Watch what happens when AI handles the front of house.')}
          </p>
        </motion.div>

        {/* Side-by-side panels */}
        <div ref={ref} className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* ── BEFORE — Chaotic restaurant ── */}
          <motion.div
            className={`rounded-2xl overflow-hidden border transition-colors duration-1000 ${
              showAfter ? 'border-red-500/10' : 'border-white/[0.07]'
            }`}
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <div className="bg-[#1a1a22] px-4 py-2 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-400/60" />
              <span className="text-[10px] text-red-400/40 uppercase tracking-widest font-medium">
                {t('landing.beforeAfter.withoutAi', 'Without AI')}
              </span>
            </div>
            <div className="bg-[#12121a] p-5 min-h-[300px]">
              {/* Phone ringing animation */}
              <div className="flex items-center gap-3 mb-4">
                <motion.div
                  className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center"
                  animate={!showAfter ? { rotate: [-5, 5, -5, 5, 0], scale: [1, 1.1, 1] } : {}}
                  transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 1.5 }}
                >
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                    <path d="M3 5a2 2 0 012-2h2.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V17a2 2 0 01-2 2h-1C8.716 19 1 11.284 1 5V4z" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </motion.div>
                <div>
                  <div className="text-[12px] text-white/60">
                    {t('landing.beforeAfter.phoneRinging', 'Phone ringing...')}
                  </div>
                  <div className="text-[10px] text-red-400/40">
                    {t('landing.beforeAfter.staffBusy', 'Staff busy with dinner service')}
                  </div>
                </div>
              </div>

              {/* Missed calls */}
              <div className="space-y-2.5 mb-5">
                {[
                  t('landing.beforeAfter.missed1', 'Missed call — 19:32'),
                  t('landing.beforeAfter.missed2', 'Missed call — 19:45'),
                  t('landing.beforeAfter.missed3', 'Missed call — 20:01'),
                ].map((msg, i) => (
                  <motion.div
                    key={i}
                    className="flex items-center gap-2 py-1.5 px-3 rounded-lg bg-red-500/[0.04] border border-red-500/[0.06]"
                    initial={{ opacity: 0, x: -10 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.3 + i * 0.4 }}
                  >
                    <span className="text-red-400/50 text-[10px]">{'\u2715'}</span>
                    <span className="text-[11px] text-white/30">{msg}</span>
                  </motion.div>
                ))}
              </div>

              {/* Paper notepad scribble */}
              <div className="rounded-lg bg-amber-900/[0.06] border border-amber-500/[0.08] p-3">
                <div className="text-[9px] text-amber-400/30 uppercase tracking-wider mb-1.5">
                  {t('landing.beforeAfter.paperNotepad', 'Paper notepad')}
                </div>
                <div className="space-y-1 text-[11px] text-white/20 italic font-mono">
                  <div>{t('landing.beforeAfter.note1', 'Table 5 — Giovanni? 4ppl??')}</div>
                  <div className="line-through opacity-40">{t('landing.beforeAfter.note2', 'Table 3 — cancelled')}</div>
                  <div>{t('landing.beforeAfter.note3', '8pm — someone called (name??)')}</div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* ── AFTER — Seatable AI calm & organized ── */}
          <motion.div
            className={`rounded-2xl overflow-hidden border transition-colors duration-1000 ${
              showAfter ? 'border-burgundy/20' : 'border-white/[0.07]'
            }`}
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <div className="bg-[#1a1a22] px-4 py-2 flex items-center gap-2">
              <motion.div
                className="w-2 h-2 rounded-full bg-burgundy"
                animate={{ boxShadow: ['0 0 4px #8B1A4A', '0 0 12px #8B1A4A', '0 0 4px #8B1A4A'] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
              <span className="text-[10px] text-burgundy/60 uppercase tracking-widest font-medium">
                {t('landing.beforeAfter.withAi', 'With Seatable AI')}
              </span>
            </div>
            <div className="bg-[#12121a] p-5 min-h-[300px]">
              {/* AI handling channels */}
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-burgundy/10 flex items-center justify-center">
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                    <path d="M8 12h.01M12 12h.01M10 16c4.418 0 8-3.134 8-7s-3.582-7-8-7-8 3.134-8 7c0 1.76.743 3.37 1.97 4.6-.097 1.016-.417 2.13-.771 2.966-.079.186.074.394.272.362a9.67 9.67 0 002.79-.907A9.05 9.05 0 0010 16z" stroke="#8B1A4A" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </div>
                <div>
                  <div className="text-[12px] text-white/60">
                    {t('landing.beforeAfter.aiHandling', 'AI handling all channels')}
                  </div>
                  <div className="text-[10px] text-burgundy/50">WhatsApp · Voice · Web</div>
                </div>
              </div>

              {/* Auto-confirmed reservations */}
              <div className="space-y-2.5 mb-5">
                {[
                  { name: 'Giovanni B.', time: '19:30', size: 4, via: 'WhatsApp' },
                  { name: 'Maria S.', time: '20:00', size: 2, via: 'Voice' },
                  { name: 'Alessandro R.', time: '20:30', size: 6, via: 'Web' },
                ].map((r, i) => (
                  <motion.div
                    key={r.name}
                    className="flex items-center justify-between py-2 px-3 rounded-lg bg-burgundy/[0.03] border border-burgundy/[0.06]"
                    initial={{ opacity: 0, x: 10 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.5 + i * 0.3 }}
                  >
                    <div>
                      <div className="text-[12px] text-white/70">{r.name}</div>
                      <div className="text-[9px] text-white/25">{r.time} · {r.size}p · via {r.via}</div>
                    </div>
                    <motion.span
                      className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-burgundy/10 text-burgundy/70"
                      initial={{ scale: 0 }}
                      whileInView={{ scale: 1 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.8 + i * 0.3, type: 'spring' }}
                    >
                      {t('landing.beforeAfter.confirmed', 'confirmed')}
                    </motion.span>
                  </motion.div>
                ))}
              </div>

              {/* Revenue prediction */}
              <motion.div
                className="rounded-lg bg-burgundy/[0.04] border border-burgundy/[0.08] p-3"
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 1.4 }}
              >
                <div className="flex items-center justify-between">
                  <div className="text-[9px] text-burgundy/40 uppercase tracking-wider">
                    {t('landing.beforeAfter.predictedRevenue', 'Predicted Revenue')}
                  </div>
                  <ShineFx>
                    <span className="text-sm font-bold text-burgundy/80">{'\u20AC'}1,596</span>
                  </ShineFx>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-burgundy/40 to-burgundy/70"
                    initial={{ width: '0%' }}
                    whileInView={{ width: '78%' }}
                    viewport={{ once: true }}
                    transition={{ delay: 1.6, duration: 1.2, ease: 'easeOut' }}
                  />
                </div>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { currencyFromLanguage } from '../../utils/currency';

/**
 * Animated Dashboard Walkthrough — a dynamic "silent movie" showing 4 moments
 * of the AI dashboard being smart. Liquid glass, zoom focus, ambient motion.
 *
 * Scenes:
 *  0: Revenue prediction appears on a new reservation
 *  1: No-show risk detected → deposit captured
 *  2: Manager AI sends a proactive insight
 *  3: Staffing forecast recommends +1 FOH
 */

const SCENE_DURATION = 7000;
const SCENE_COUNT = 4;

// ─── Scene Labels (i18n) ────────────────────────────────────────
const SCENE_LABEL_KEYS = [
  'landing.walkthrough.sceneRevenue',
  'landing.walkthrough.sceneNoShow',
  'landing.walkthrough.sceneManagerAI',
  'landing.walkthrough.sceneStaffing',
] as const;

// ─── Glass helpers ──────────────────────────────────────────────
const glass = 'backdrop-blur-xl bg-white/[0.03] border border-white/[0.07]';
const glassGreen = 'backdrop-blur-xl bg-rose-500/[0.06] border border-rose-400/[0.12]';
const glassRed = 'backdrop-blur-xl bg-red-500/[0.06] border border-red-400/[0.12]';
const glassAmber = 'backdrop-blur-xl bg-amber-500/[0.06] border border-amber-400/[0.12]';
const glassBurgundy = 'backdrop-blur-xl bg-burgundy/[0.06] border border-burgundy/[0.15]';

// ─── Blur-in transition preset ──────────────────────────────────
const blurIn = {
  initial: { opacity: 0, y: 20, scale: 0.96, filter: 'blur(12px)' },
  animate: { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' },
  exit: { opacity: 0, y: -12, scale: 0.97, filter: 'blur(8px)' },
  transition: { type: 'spring' as const, stiffness: 200, damping: 22 },
};

// ─── Pulsing status dot ─────────────────────────────────────────
function StatusDot({ color = '#22c55e' }: { color?: string }) {
  return (
    <motion.span
      className="inline-block w-2 h-2 rounded-full mr-1.5"
      style={{ background: color }}
      animate={{
        boxShadow: [`0 0 4px ${color}`, `0 0 12px ${color}`, `0 0 4px ${color}`],
      }}
      transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
    />
  );
}

// ─── Animated icon (replaces emojis) ────────────────────────────
function PulsingIcon({ children, color, size = 28 }: { children: React.ReactNode; color: string; size?: number }) {
  return (
    <motion.div
      className="rounded-full flex items-center justify-center shrink-0"
      style={{ width: size, height: size, background: `${color}20` }}
      animate={{
        boxShadow: [`0 0 0px ${color}00`, `0 0 16px ${color}40`, `0 0 0px ${color}00`],
      }}
      transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
    >
      <span style={{ color, fontSize: size * 0.4, fontWeight: 700, lineHeight: 1 }}>{children}</span>
    </motion.div>
  );
}

// ─── Floating ambient orbs ──────────────────────────────────────
function AmbientOrbs() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {[
        { x: '15%', y: '20%', size: 200, color: 'rgba(139,26,74,0.06)', dur: 18 },
        { x: '75%', y: '60%', size: 160, color: 'rgba(52,211,153,0.05)', dur: 22 },
        { x: '50%', y: '80%', size: 120, color: 'rgba(139,26,74,0.04)', dur: 15 },
      ].map((orb, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            width: orb.size,
            height: orb.size,
            left: orb.x,
            top: orb.y,
            background: `radial-gradient(circle, ${orb.color}, transparent 70%)`,
            filter: 'blur(40px)',
          }}
          animate={{
            x: [0, 30, -20, 0],
            y: [0, -20, 15, 0],
            scale: [1, 1.15, 0.9, 1],
          }}
          transition={{ duration: orb.dur, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}

// ─── Dashboard Chrome ───────────────────────────────────────────
function DashboardChrome({ children, accentColor }: { children: React.ReactNode; accentColor: string }) {
  return (
    <div className="relative rounded-2xl overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
      {/* Animated border glow */}
      <motion.div
        className="absolute inset-0 rounded-2xl pointer-events-none z-10"
        style={{
          background: `linear-gradient(135deg, ${accentColor}15, transparent 40%, transparent 60%, ${accentColor}10)`,
          border: `1px solid ${accentColor}20`,
        }}
        animate={{
          background: [
            `linear-gradient(135deg, ${accentColor}15, transparent 40%, transparent 60%, ${accentColor}10)`,
            `linear-gradient(225deg, ${accentColor}10, transparent 40%, transparent 60%, ${accentColor}15)`,
            `linear-gradient(135deg, ${accentColor}15, transparent 40%, transparent 60%, ${accentColor}10)`,
          ],
        }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      />
      {/* Browser bar */}
      <div className="bg-[#1a1a22] px-4 py-2.5 flex items-center gap-2.5 relative z-20">
        <div className="flex gap-1.5">
          {['#ff5f57', '#febc2e', '#28c840'].map(c => (
            <div key={c} className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />
          ))}
        </div>
        <div className="flex-1 mx-3 bg-black/30 rounded-md px-3 py-1 text-[10px] text-white/50 text-center font-mono">
          seatable.one/dashboard
        </div>
      </div>
      {/* Dashboard body */}
      <div className="bg-[#0d0d14] p-5 relative overflow-hidden z-20">
        <AmbientOrbs />
        <div className="relative z-10">{children}</div>
      </div>
    </div>
  );
}

// ─── Sparkline (animated draw) ──────────────────────────────────
function Sparkline() {
  const points = [20, 32, 28, 45, 38, 52, 60, 55, 68, 72, 65, 78];
  const max = 80;
  const w = 130;
  const h = 36;
  const d = points.map((p, i) => {
    const x = (i / (points.length - 1)) * w;
    const y = h - (p / max) * h;
    return `${i === 0 ? 'M' : 'L'}${x},${y}`;
  }).join(' ');
  const pathLength = 400;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <defs>
        <linearGradient id="sparkGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="rgba(52,211,153,0.15)" />
          <stop offset="100%" stopColor="#34d399" />
        </linearGradient>
        <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(52,211,153,0.15)" />
          <stop offset="100%" stopColor="rgba(52,211,153,0)" />
        </linearGradient>
        <filter id="sparkGlow">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {/* Area fill */}
      <motion.path
        d={`${d} L${w},${h} L0,${h} Z`}
        fill="url(#sparkFill)"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3, duration: 0.6 }}
      />
      {/* Animated line draw */}
      <motion.path
        d={d}
        fill="none"
        stroke="url(#sparkGrad)"
        strokeWidth="2"
        strokeLinecap="round"
        filter="url(#sparkGlow)"
        strokeDasharray={pathLength}
        initial={{ strokeDashoffset: pathLength }}
        animate={{ strokeDashoffset: 0 }}
        transition={{ duration: 1.2, ease: 'easeOut' }}
      />
      {/* Glowing tip dot */}
      <motion.circle
        cx={(11 / 11) * w}
        cy={h - (78 / max) * h}
        r="3"
        fill="#34d399"
        filter="url(#sparkGlow)"
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 1.0, type: 'spring' }}
      />
    </svg>
  );
}

// ─── Scene 0: Revenue Intelligence ─────────────────────────────
function SceneRevenue({ progress }: { progress: number }) {
  const { t, i18n } = useTranslation();
  const currency = currencyFromLanguage(i18n.language);
  const isBRL = currency === 'BRL';
  const isEUR = currency === 'EUR';
  const showScan = progress > 0.06;
  const showPrediction1 = progress > 0.18;
  const showPrediction2 = progress > 0.35;
  const showRevenue = progress > 0.52;
  const showSparkline = progress > 0.65;

  const focusActive = showPrediction1 && !showRevenue;

  return (
    <div>
      {/* Top stats */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {[
          { label: t('landing.walkthrough.reservations', 'Reservations'), value: '11', sub: t('landing.walkthrough.today', 'today') },
          { label: t('landing.walkthrough.covers', 'Covers'), value: '38', sub: t('landing.walkthrough.expected', 'expected') },
          { label: t('landing.walkthrough.avgSpend', 'Avg Spend'), value: isBRL ? 'R$42' : isEUR ? '€38' : '$42', sub: isBRL ? '/couvert' : '/cover' },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            className={`rounded-xl px-3 py-2.5 ${glass}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
          >
            <div className="text-[9px] uppercase tracking-wider text-white/50">{s.label}</div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-base font-bold text-white/85">{s.value}</span>
              <span className="text-[9px] text-white/50">{s.sub}</span>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Reservation list */}
      <div className="relative">
        <motion.div
          animate={{ scale: focusActive ? 1.02 : 1, y: focusActive ? -4 : 0 }}
          transition={{ type: 'spring', stiffness: 140, damping: 18 }}
          className="origin-center"
        >
          <div className="text-[11px] font-semibold text-white/50 uppercase tracking-wider mb-2">
            {t('landing.walkthrough.todaysReservations', "Today's Reservations")}
          </div>

          {/* Scanning line */}
          <AnimatePresence>
            {showScan && !showPrediction1 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-x-0 top-[24px] h-[150px] pointer-events-none z-10 rounded-xl overflow-hidden"
              >
                <motion.div
                  className="absolute inset-x-0 h-[1px]"
                  style={{ background: 'linear-gradient(to right, transparent, rgba(52,211,153,0.7), transparent)' }}
                  animate={{ top: ['0%', '100%'] }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
                />
                <motion.div
                  className="absolute inset-x-0 h-8"
                  style={{ background: 'linear-gradient(to bottom, rgba(52,211,153,0.04), transparent)' }}
                  animate={{ top: ['0%', '100%'] }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
                />
              </motion.div>
            )}
          </AnimatePresence>

          <div className="space-y-1">
            {/* Dim rows */}
            {[
              { name: 'Giovanni B.', time: '12:00', size: 4 },
              { name: 'Sophia M.', time: '13:00', size: 2 },
            ].map(r => (
              <motion.div
                key={r.name}
                animate={{ opacity: focusActive ? 0.3 : 0.9 }}
                transition={{ duration: 0.5 }}
                className="flex items-center justify-between py-2 px-3 rounded-lg"
              >
                <div>
                  <div className="text-[13px] font-medium text-white/80">{r.name}</div>
                  <div className="text-[10px] text-white/50">{r.time} - {r.size}p</div>
                </div>
                <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-400/70">{t('landing.walkthrough.confirmed', 'confirmed')}</span>
              </motion.div>
            ))}

            {/* Maria Santos — prediction row */}
            <motion.div
              animate={{ scale: showPrediction1 && !showRevenue ? 1.01 : 1 }}
              transition={{ type: 'spring', stiffness: 250, damping: 20 }}
              className={`flex items-center justify-between py-2.5 px-3 rounded-xl transition-all duration-500 ${
                showPrediction1 ? `${glassGreen} shadow-[0_0_20px_rgba(52,211,153,0.08)]` : ''
              }`}
            >
              <div>
                <div className="text-[13px] font-medium text-white/90 flex items-center gap-2">
                  Maria Santos
                  <AnimatePresence>
                    {showPrediction1 && (
                      <motion.span
                        initial={{ opacity: 0, scale: 0.3, filter: 'blur(10px)', width: 0 }}
                        animate={{ opacity: 1, scale: 1, filter: 'blur(0px)', width: 'auto' }}
                        exit={{ opacity: 0, scale: 0.5, width: 0 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 18 }}
                        className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${glassGreen} text-rose-400 overflow-hidden whitespace-nowrap`}
                      >
                        +168
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>
                <div className="text-[10px] text-white/50">20:00 - 4p - 3 {t('landing.walkthrough.visits', 'visits')}</div>
              </div>
              <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-rose-500/15 text-rose-400">{t('landing.walkthrough.confirmed', 'confirmed')}</span>
            </motion.div>

            {/* Alessandro — second prediction */}
            <motion.div
              animate={{ scale: showPrediction2 && !showRevenue ? 1.01 : 1 }}
              transition={{ type: 'spring', stiffness: 250, damping: 20 }}
              className={`flex items-center justify-between py-2.5 px-3 rounded-xl transition-all duration-500 ${
                showPrediction2 ? `${glassGreen} shadow-[0_0_20px_rgba(52,211,153,0.08)]` : ''
              }`}
            >
              <div>
                <div className="text-[13px] font-medium text-white/90 flex items-center gap-2">
                  Alessandro R.
                  <AnimatePresence>
                    {showPrediction2 && (
                      <motion.span
                        initial={{ opacity: 0, scale: 0.3, filter: 'blur(10px)', width: 0 }}
                        animate={{ opacity: 1, scale: 1, filter: 'blur(0px)', width: 'auto' }}
                        exit={{ opacity: 0, scale: 0.5, width: 0 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 18 }}
                        className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${glassGreen} text-rose-400 overflow-hidden whitespace-nowrap`}
                      >
                        +252
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>
                <div className="text-[10px] text-white/50">19:30 - 6p - VIP</div>
              </div>
              <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-rose-500/15 text-rose-400">{t('landing.walkthrough.confirmed', 'confirmed')}</span>
            </motion.div>
          </div>
        </motion.div>
      </div>

      {/* Revenue summary — below content, not overlapping */}
      <AnimatePresence>
        {showRevenue && (
          <motion.div
            {...blurIn}
            className={`mt-4 rounded-2xl p-4 ${glassGreen} shadow-[0_12px_40px_rgba(16,185,129,0.12)]`}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[9px] uppercase tracking-widest text-rose-400/80 mb-1">
                  {t('landing.walkthrough.predictedRevenue', 'Predicted Daily Revenue')}
                </div>
                <div className="flex items-baseline gap-2.5">
                  <motion.span
                    className="text-3xl font-bold text-rose-400"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
                  >
                    1,247
                  </motion.span>
                  <motion.span
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.25 }}
                    className="text-sm font-bold text-rose-400/60"
                  >
                    +18%
                  </motion.span>
                </div>
              </div>
              <AnimatePresence>
                {showSparkline && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.05, duration: 0.3 }}
                  >
                    <Sparkline />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Scene 1: No-Show Protection ────────────────────────────────
function SceneNoShow({ progress }: { progress: number }) {
  const { t } = useTranslation();
  const showRisk = progress > 0.12;
  const showDeposit = progress > 0.4;
  const showResolved = progress > 0.68;

  return (
    <div>
      <div className="text-[11px] font-semibold text-white/50 uppercase tracking-wider mb-3">
        {t('landing.walkthrough.todaysReservations', "Today's Reservations")}
      </div>
      <div className="space-y-1">
        <motion.div
          animate={{ opacity: showRisk ? 0.4 : 0.9 }}
          transition={{ duration: 0.5 }}
          className="flex items-center justify-between py-2 px-3 rounded-lg"
        >
          <div>
            <div className="text-[13px] font-medium text-white/80">Giovanni B.</div>
            <div className="text-[10px] text-white/50">12:00 - 4p</div>
          </div>
          <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-400/70">{t('landing.walkthrough.confirmed', 'confirmed')}</span>
        </motion.div>

        {/* Risk row — zooms in with pulsing red glow */}
        <motion.div
          animate={{
            scale: showRisk && !showResolved ? 1.02 : 1,
          }}
          transition={{ type: 'spring', stiffness: 200, damping: 18 }}
          className={`flex items-center justify-between py-2.5 px-3 rounded-xl transition-all duration-500 ${
            showRisk && !showResolved ? `${glassRed} shadow-[0_0_24px_rgba(239,68,68,0.08)]` : ''
          }`}
        >
          <div>
            <div className="text-[13px] font-medium text-white/90 flex items-center gap-2">
              Lucas Ferreira
              <AnimatePresence>
                {showRisk && !showResolved && (
                  <motion.span
                    initial={{ opacity: 0, scale: 0.3, filter: 'blur(10px)' }}
                    animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, scale: 0.5 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 18 }}
                    className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${glassRed} text-red-400`}
                  >
                    78% {t('landing.walkthrough.risk', 'risk')}
                  </motion.span>
                )}
              </AnimatePresence>
              <AnimatePresence>
                {showResolved && (
                  <motion.span
                    initial={{ opacity: 0, scale: 0.3, filter: 'blur(10px)' }}
                    animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                    transition={{ type: 'spring', stiffness: 300, damping: 18 }}
                    className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${glassGreen} text-rose-400`}
                  >
                    {t('landing.walkthrough.arrived', 'arrived')}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
            <div className="text-[10px] text-white/50">19:00 - 3p - 2 no-shows</div>
          </div>
          <span
            className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full transition-all duration-500"
            style={{
              background: showResolved ? 'rgba(52,211,153,0.15)' : showRisk ? 'rgba(239,68,68,0.12)' : 'rgba(52,211,153,0.1)',
              color: showResolved ? '#4ade80' : showRisk ? '#f87171' : '#4ade80',
            }}
          >
            {showResolved ? t('landing.walkthrough.checkedIn', 'checked in') : t('landing.walkthrough.confirmed', 'confirmed')}
          </span>
        </motion.div>

        <motion.div
          animate={{ opacity: showRisk ? 0.4 : 0.9 }}
          transition={{ duration: 0.5 }}
          className="flex items-center justify-between py-2 px-3 rounded-lg"
        >
          <div>
            <div className="text-[13px] font-medium text-white/80">Maria Santos</div>
            <div className="text-[10px] text-white/50">20:00 - 4p</div>
          </div>
          <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-400/70">{t('landing.walkthrough.confirmed', 'confirmed')}</span>
        </motion.div>
      </div>

      {/* Deposit / resolved panel — below content */}
      <AnimatePresence mode="wait">
        {showDeposit && !showResolved && (
          <motion.div
            key="deposit"
            {...blurIn}
            className={`mt-4 rounded-2xl p-4 ${glassAmber} shadow-[0_12px_40px_rgba(245,158,11,0.1)]`}
          >
            <div className="flex items-center gap-3">
              <PulsingIcon color="#f59e0b" size={32}>$</PulsingIcon>
              <div>
                <div className="text-[12px] font-semibold text-amber-400">{t('landing.walkthrough.depositRequested', 'Deposit hold requested')}</div>
                <div className="text-[10px] text-white/50">{t('landing.walkthrough.depositDetail', '$25 hold - auto-triggered by risk score')}</div>
              </div>
            </div>
          </motion.div>
        )}
        {showResolved && (
          <motion.div
            key="resolved"
            {...blurIn}
            className={`mt-4 rounded-2xl p-4 ${glassGreen} shadow-[0_12px_40px_rgba(16,185,129,0.12)]`}
          >
            <div className="flex items-center gap-3">
              <PulsingIcon color="#34d399" size={32}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-6" stroke="#34d399" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </PulsingIcon>
              <div>
                <div className="text-[12px] font-semibold text-rose-400">{t('landing.walkthrough.guestArrived', 'Guest arrived - deposit released')}</div>
                <div className="text-[10px] text-white/50">{t('landing.walkthrough.checkedInDetail', 'Lucas Ferreira checked in at 18:52')}</div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Scene 2: Manager AI ────────────────────────────────────────
function SceneManagerAI({ progress }: { progress: number }) {
  const { t } = useTranslation();
  const showChat = progress > 0.08;
  const showTyping = progress > 0.08 && progress < 0.3;
  const showMessage = progress > 0.3;
  const showAction = progress > 0.6;

  return (
    <div>
      {/* Stats row */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        {[
          { label: t('landing.walkthrough.tables', 'Tables'), value: '5/8' },
          { label: t('landing.walkthrough.today', 'Today'), value: '11' },
          { label: t('landing.walkthrough.waitlist', 'Waitlist'), value: '2' },
          { label: t('landing.walkthrough.guests', 'Guests'), value: '24', highlight: true },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            className={`rounded-xl px-3 py-2 ${glass} ${s.highlight && showChat ? 'ring-1 ring-burgundy/30' : ''}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
          >
            <div className="text-[9px] uppercase tracking-wider text-white/50">{s.label}</div>
            <div className="text-base font-bold text-white/85">{s.value}</div>
          </motion.div>
        ))}
      </div>

      <div className="text-[11px] font-semibold text-white/50 uppercase tracking-wider mb-2">
        {t('landing.walkthrough.todaysReservations', "Today's Reservations")}
      </div>
      <div className="space-y-0.5">
        {[
          { name: 'Giovanni B.', time: '12:00', size: 4 },
          { name: 'Sophia M.', time: '13:00', size: 2 },
        ].map(r => (
          <motion.div
            key={r.name}
            animate={{ opacity: showChat ? 0.35 : 0.9 }}
            transition={{ duration: 0.5 }}
            className="flex items-center justify-between py-2 px-3 rounded-lg"
          >
            <div>
              <div className="text-[13px] font-medium text-white/80">{r.name}</div>
              <div className="text-[10px] text-white/50">{r.time} - {r.size}p</div>
            </div>
            <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-400/70">{t('landing.walkthrough.confirmed', 'confirmed')}</span>
          </motion.div>
        ))}
      </div>

      {/* Manager AI chat — below content */}
      <AnimatePresence>
        {showChat && (
          <motion.div
            {...blurIn}
            className={`mt-4 rounded-2xl ${glassBurgundy} shadow-[0_12px_40px_rgba(139,26,74,0.12)] overflow-hidden`}
          >
            {/* Header */}
            <div className="px-4 py-2.5 border-b border-white/[0.05] flex items-center gap-2">
              <PulsingIcon color="#8B1A4A" size={22}>AI</PulsingIcon>
              <span className="text-[11px] font-semibold text-white/60">Manager AI</span>
              <StatusDot color="#8B1A4A" />
            </div>
            <div className="p-4">
              {/* Typing indicator */}
              {showTyping && !showMessage && (
                <div className="flex gap-1.5 items-center h-5">
                  {[0, 1, 2].map(i => (
                    <motion.div
                      key={i}
                      className="w-1.5 h-1.5 rounded-full bg-white/25"
                      animate={{ y: [0, -4, 0], opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
                    />
                  ))}
                </div>
              )}
              {/* Message */}
              <AnimatePresence>
                {showMessage && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: 'spring', stiffness: 200, damping: 20 }}
                    className="text-[12px] text-white/60 leading-relaxed"
                  >
                    {t('landing.walkthrough.aiMessage1', "Tonight's covers are")} <span className="text-amber-400 font-semibold">{t('landing.walkthrough.aiMessage2', '15% below average')}</span>.
                    {' '}{t('landing.walkthrough.aiMessage3', "I found 23 past guests who haven't visited in 30+ days. Want me to send them a special offer?")}
                  </motion.div>
                )}
              </AnimatePresence>
              {/* Actions */}
              <AnimatePresence>
                {showAction && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15, type: 'spring', stiffness: 200 }}
                    className="mt-3 flex gap-2"
                  >
                    <motion.span
                      className="text-[10px] font-semibold px-3.5 py-1.5 rounded-full bg-burgundy/80 text-white cursor-default"
                      whileHover={{ scale: 1.05 }}
                    >
                      {t('landing.walkthrough.sendCampaign', 'Send campaign')}
                    </motion.span>
                    <motion.span
                      className="text-[10px] font-semibold px-3.5 py-1.5 rounded-full bg-white/[0.05] text-white/50 cursor-default"
                      whileHover={{ scale: 1.05 }}
                    >
                      {t('landing.walkthrough.showList', 'Show me the list')}
                    </motion.span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Scene 3: Smart Staffing ────────────────────────────────────
function SceneStaffing({ progress }: { progress: number }) {
  const { t } = useTranslation();
  const showForecast = progress >= 0;
  const showGrid = progress > 0.35;
  const showRecommendation = progress > 0.6;

  const days = [
    t('landing.walkthrough.mon', 'Mon'), t('landing.walkthrough.tue', 'Tue'),
    t('landing.walkthrough.wed', 'Wed'), t('landing.walkthrough.thu', 'Thu'),
    t('landing.walkthrough.fri', 'Fri'), t('landing.walkthrough.sat', 'Sat'),
    t('landing.walkthrough.sun', 'Sun'),
  ];
  const covers = [28, 32, 25, 38, 42, 55, 48];
  const maxCovers = 60;

  return (
    <div>
      <div className="text-[11px] font-semibold text-white/50 uppercase tracking-wider mb-3">
        {t('landing.walkthrough.staffingForecast', '7-Day Staffing Forecast')}
      </div>

      {/* Bar chart */}
      <AnimatePresence>
        {showForecast && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-end gap-2 h-[130px] mb-4"
          >
            {days.map((day, i) => {
              const height = (covers[i] / maxCovers) * 100;
              const isFriday = i === 4;
              const isHighlight = isFriday && showGrid;
              return (
                <div key={day} className="flex-1 flex flex-col items-center gap-1">
                  <motion.div
                    className="text-[9px] font-bold"
                    style={{ color: isHighlight ? '#8B1A4A' : 'rgba(255,255,255,0.35)' }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.06 + 0.3 }}
                  >
                    {covers[i]}
                  </motion.div>
                  <motion.div
                    className="w-full rounded-t-lg relative overflow-hidden"
                    initial={{ height: 0 }}
                    animate={{ height: `${height}%` }}
                    transition={{ duration: 0.6, delay: i * 0.07, type: 'spring', stiffness: 100 }}
                  >
                    <div
                      className="absolute inset-0 rounded-t-lg"
                      style={{
                        background: isHighlight
                          ? 'linear-gradient(to top, rgba(139,26,74,0.7), rgba(139,26,74,0.2))'
                          : 'linear-gradient(to top, rgba(255,255,255,0.12), rgba(255,255,255,0.03))',
                      }}
                    />
                    {isHighlight && (
                      <motion.div
                        className="absolute inset-0"
                        style={{ background: 'linear-gradient(to top, rgba(139,26,74,0.3), transparent)' }}
                        animate={{ opacity: [0.5, 1, 0.5] }}
                        transition={{ duration: 2, repeat: Infinity }}
                      />
                    )}
                  </motion.div>
                  <motion.div
                    className="text-[9px]"
                    style={{ color: isHighlight ? '#8B1A4A' : 'rgba(255,255,255,0.25)' }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.06 + 0.2 }}
                  >
                    {day}
                  </motion.div>
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Staffing grid */}
      <AnimatePresence>
        {showGrid && (
          <motion.div
            initial={{ opacity: 0, y: 12, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 20 }}
            className="grid grid-cols-3 gap-2"
          >
            {[
              { role: 'FOH', count: 3, need: showRecommendation ? 4 : 3 },
              { role: t('landing.walkthrough.kitchen', 'Kitchen'), count: 2, need: 2 },
              { role: 'Bar', count: 1, need: 1 },
            ].map((s, i) => {
              const isHighlight = s.role === 'FOH' && showRecommendation;
              return (
                <motion.div
                  key={s.role}
                  className={`rounded-xl p-2.5 ${isHighlight ? glassBurgundy : glass} transition-all duration-500`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08 }}
                >
                  <div className="text-[9px] uppercase tracking-wider text-white/50">{s.role}</div>
                  <div className="text-lg font-bold text-white/80 flex items-center">
                    {s.count}
                    {isHighlight && (
                      <motion.span
                        initial={{ opacity: 0, x: -8, filter: 'blur(6px)' }}
                        animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                        className="text-burgundy ml-1.5 text-sm font-bold"
                      >
                        {'\u2192'} {s.need}
                      </motion.span>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* AI recommendation — below content */}
      <AnimatePresence>
        {showRecommendation && (
          <motion.div
            {...blurIn}
            className={`mt-4 rounded-2xl ${glassBurgundy} shadow-[0_12px_40px_rgba(139,26,74,0.12)] p-3.5 flex items-center gap-3`}
          >
            <PulsingIcon color="#8B1A4A" size={28}>AI</PulsingIcon>
            <div className="text-[11px] text-white/60">
              <span className="text-burgundy font-semibold">{t('landing.walkthrough.staffRecommendation', 'Friday needs +1 FOH')}</span> — {t('landing.walkthrough.staffDetail', '42 covers predicted, current team handles up to 35.')}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Scene accent colors ────────────────────────────────────────
const SCENE_ACCENTS = ['#34d399', '#ef4444', '#8B1A4A', '#8B1A4A'];

// ─── Main Component ─────────────────────────────────────────────
export default function DashboardWalkthroughSection() {
  const { t } = useTranslation();
  const [scene, setScene] = useState(0);
  const [progress, setProgress] = useState(0);
  const labels = SCENE_LABEL_KEYS.map(key => t(key));

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress(p => {
        if (p >= 1) {
          setScene(s => (s + 1) % SCENE_COUNT);
          return 0;
        }
        return p + 50 / SCENE_DURATION;
      });
    }, 50);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setProgress(0);
  }, [scene]);

  const scenes = [SceneRevenue, SceneNoShow, SceneManagerAI, SceneStaffing];
  const ActiveScene = scenes[scene];

  return (
    <section className="py-24 px-6 bg-deep-charcoal relative overflow-hidden">
      {/* Background grid */}
      <div
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />
      {/* Section-level ambient glow */}
      <motion.div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{ background: `radial-gradient(circle, ${SCENE_ACCENTS[scene]}08, transparent 70%)`, filter: 'blur(60px)' }}
        animate={{ scale: [1, 1.1, 1], opacity: [0.5, 0.8, 0.5] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      />

      <div className="max-w-4xl mx-auto relative overflow-x-hidden">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <div className="text-xs font-semibold tracking-[3px] uppercase text-rose-400 mb-4">
            {t('landing.walkthrough.label', 'Beyond Reservations')}
          </div>
          <h2 className="font-serif text-4xl sm:text-[48px] font-medium tracking-tight text-white mb-3">
            {t('landing.walkthrough.heading', 'Watch the AI work.')}
          </h2>
          <p className="text-lg text-white/60 font-light max-w-2xl mx-auto">
            {t('landing.walkthrough.subtitle', 'Revenue predictions, no-show protection, proactive insights, and smart staffing — all happening automatically.')}
          </p>
        </motion.div>

        {/* Scene pills */}
        <div className="flex flex-wrap justify-center gap-2 mb-8">
          {labels.map((label, i) => (
            <motion.button
              key={i}
              type="button"
              onClick={() => { setScene(i); setProgress(0); }}
              className={`px-4 py-1.5 rounded-full text-[11px] font-medium transition-all duration-300 ${
                i === scene
                  ? 'bg-white/[0.08] text-white ring-1 ring-white/[0.12]'
                  : 'text-white/50 hover:text-white/70 hover:bg-white/[0.03]'
              }`}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.97 }}
            >
              {label}
            </motion.button>
          ))}
        </div>

        {/* Dashboard */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <DashboardChrome accentColor={SCENE_ACCENTS[scene]}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-[14px] font-semibold text-white/85">{t('landing.walkthrough.dashboard', 'Dashboard')}</div>
                <div className="text-[10px] text-white/50">{t('landing.walkthrough.today', 'today')}</div>
              </div>
              <div className="flex items-center gap-1.5">
                <StatusDot />
                <span className="text-[10px] text-rose-400/60 font-medium">{t('landing.walkthrough.aiActive', 'AI Active')}</span>
              </div>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={scene}
                initial={{ opacity: 0, scale: 0.98, filter: 'blur(6px)' }}
                animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                exit={{ opacity: 0, scale: 1.02, filter: 'blur(4px)' }}
                transition={{ duration: 0.35 }}
              >
                <ActiveScene progress={progress} />
              </motion.div>
            </AnimatePresence>
          </DashboardChrome>

          {/* Progress bars */}
          <div className="mt-5 flex gap-2 justify-center">
            {Array.from({ length: SCENE_COUNT }).map((_, i) => (
              <div
                key={i}
                className="h-[3px] rounded-full overflow-hidden"
                style={{ width: 52, background: 'rgba(255,255,255,0.06)' }}
              >
                <motion.div
                  className="h-full rounded-full"
                  style={{
                    background: i === scene
                      ? `linear-gradient(to right, ${SCENE_ACCENTS[scene]}80, ${SCENE_ACCENTS[scene]})`
                      : 'rgba(255,255,255,0.1)',
                  }}
                  animate={{
                    width: i === scene ? `${progress * 100}%` : i < scene ? '100%' : '0%',
                  }}
                  transition={{ duration: 0.05 }}
                />
              </div>
            ))}
          </div>
        </motion.div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4 }}
          className="text-center mt-10"
        >
          <motion.a
            href="/demo/setup"
            className="inline-block px-7 py-3 bg-burgundy hover:bg-burgundy-dark text-white text-sm font-semibold rounded-full transition-colors"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.97 }}
          >
            {t('landing.walkthrough.cta', 'Try it free')}
          </motion.a>
        </motion.div>
      </div>
    </section>
  );
}

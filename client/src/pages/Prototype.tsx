import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, useInView } from 'framer-motion';

/**
 * PROTOTYPE PAGE — Once UI-inspired patterns for Seatable
 * Route: /prototype
 *
 * Patterns showcased:
 *  1. TypeFx — cycling hero text
 *  2. ShineFx — shimmer on key stats
 *  3. 3D Perspective dashboard chrome
 *  4. Cursor spotlight on dark sections
 *  5. Staggered whileInView reveals
 *  6. CompareImage before/after slider
 *  7. Dot matrix animated background
 *  8. Nested radius audit
 */

// ─── Glass helpers ──────────────────────────────────────────────
const glass = 'backdrop-blur-xl bg-white/[0.03] border border-white/[0.07]';
const glassBurgundy = 'backdrop-blur-xl bg-burgundy/[0.06] border border-burgundy/[0.12]';

// ─── 1. TypeFx — Cycling text ───────────────────────────────────
function TypeFx({ words, className = '' }: { words: string[]; className?: string }) {
  const [index, setIndex] = useState(0);
  const [displayed, setDisplayed] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const word = words[index];
    const speed = isDeleting ? 40 : 70;
    const holdTime = 2000;

    if (!isDeleting && displayed === word) {
      const timeout = setTimeout(() => setIsDeleting(true), holdTime);
      return () => clearTimeout(timeout);
    }

    if (isDeleting && displayed === '') {
      setIsDeleting(false);
      setIndex((index + 1) % words.length);
      return;
    }

    const timeout = setTimeout(() => {
      setDisplayed(
        isDeleting ? word.slice(0, displayed.length - 1) : word.slice(0, displayed.length + 1)
      );
    }, speed);

    return () => clearTimeout(timeout);
  }, [displayed, isDeleting, index, words]);

  return (
    <span className={className}>
      {displayed}
      <motion.span
        animate={{ opacity: [1, 0, 1] }}
        transition={{ duration: 0.8, repeat: Infinity }}
        className="inline-block w-[3px] h-[1em] bg-current ml-0.5 align-middle"
      />
    </span>
  );
}

// ─── 2. ShineFx — Shimmer sweep ────────────────────────────────
function ShineFx({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`relative inline-block overflow-hidden ${className}`}>
      {children}
      <motion.span
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.15) 50%, transparent 60%)',
          backgroundSize: '200% 100%',
        }}
        animate={{ backgroundPosition: ['200% 0', '-200% 0'] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'linear', repeatDelay: 2 }}
      />
    </span>
  );
}

// ─── 3. 3D Perspective Dashboard Chrome ─────────────────────────
function PerspectiveDashboard() {
  const [mouse, setMouse] = useState({ x: 0.5, y: 0.5 });
  const ref = useRef<HTMLDivElement>(null);

  const handleMouse = useCallback((e: React.MouseEvent) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setMouse({
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    });
  }, []);

  const rotateX = (mouse.y - 0.5) * -8;
  const rotateY = (mouse.x - 0.5) * 8;

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouse}
      onMouseLeave={() => setMouse({ x: 0.5, y: 0.5 })}
      className="relative mx-auto max-w-3xl"
      style={{ perspective: 1200 }}
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.8, delay: 0.3 }}
    >
      <motion.div
        animate={{ rotateX, rotateY }}
        transition={{ type: 'spring', stiffness: 100, damping: 20 }}
        className="relative rounded-2xl overflow-hidden shadow-[0_30px_80px_rgba(0,0,0,0.6)]"
        style={{ transformStyle: 'preserve-3d' }}
      >
        {/* Animated border glow */}
        <motion.div
          className="absolute inset-0 rounded-2xl pointer-events-none z-10"
          style={{ border: '1px solid rgba(139,26,74,0.15)' }}
          animate={{
            background: [
              'linear-gradient(135deg, rgba(139,26,74,0.12), transparent 40%, transparent 60%, rgba(139,26,74,0.08))',
              'linear-gradient(225deg, rgba(139,26,74,0.08), transparent 40%, transparent 60%, rgba(139,26,74,0.12))',
              'linear-gradient(135deg, rgba(139,26,74,0.12), transparent 40%, transparent 60%, rgba(139,26,74,0.08))',
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
          <div className="flex-1 mx-3 bg-black/30 rounded-md px-3 py-1 text-[10px] text-white/20 text-center font-mono">
            seatable.one/dashboard
          </div>
        </div>
        {/* Dashboard body */}
        <div className="bg-[#0d0d14] p-5 relative z-20">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-[14px] font-semibold text-white/85">Dashboard</div>
              <div className="text-[10px] text-white/25">Today</div>
            </div>
            <div className="flex items-center gap-1.5">
              <motion.span
                className="inline-block w-2 h-2 rounded-full bg-burgundy"
                animate={{ boxShadow: ['0 0 4px #8B1A4A', '0 0 12px #8B1A4A', '0 0 4px #8B1A4A'] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
              <span className="text-[10px] text-burgundy/60 font-medium">AI Active</span>
            </div>
          </div>
          {/* Stats with ShineFx */}
          <div className="grid grid-cols-4 gap-2 mb-4">
            {[
              { label: 'RESERVATIONS', value: '11', sub: 'today' },
              { label: 'COVERS', value: '38', sub: 'expected' },
              { label: 'AVG SPEND', value: '\u20AC42', sub: '/cover' },
              { label: 'PREDICTED', value: '\u20AC1,596', sub: 'revenue' },
            ].map((s, i) => (
              <motion.div
                key={s.label}
                className={`rounded-lg px-3 py-2.5 ${glass}`}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.4 + i * 0.1 }}
              >
                <div className="text-[8px] uppercase tracking-wider text-white/25">{s.label}</div>
                <div className="flex items-baseline gap-1">
                  <ShineFx>
                    <span className="text-sm font-bold text-white/85">{s.value}</span>
                  </ShineFx>
                  <span className="text-[8px] text-white/20">{s.sub}</span>
                </div>
              </motion.div>
            ))}
          </div>
          {/* Reservation rows */}
          <div className="text-[10px] font-semibold text-white/25 uppercase tracking-wider mb-2">Today's Reservations</div>
          <div className="space-y-1">
            {[
              { name: 'Giovanni B.', time: '12:00', size: 4, status: 'confirmed' },
              { name: 'Maria Santos', time: '20:00', size: 4, status: 'confirmed', highlight: true, badge: '+168' },
              { name: 'Alessandro R.', time: '19:30', size: 6, status: 'pending' },
            ].map((r) => (
              <div
                key={r.name}
                className={`flex items-center justify-between py-2 px-3 rounded-lg ${
                  r.highlight ? `${glassBurgundy} shadow-[0_0_20px_rgba(139,26,74,0.06)]` : ''
                }`}
              >
                <div>
                  <div className="text-[12px] font-medium text-white/80 flex items-center gap-2">
                    {r.name}
                    {r.badge && (
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${glassBurgundy} text-burgundy`}>
                        {r.badge}
                      </span>
                    )}
                  </div>
                  <div className="text-[9px] text-white/25">{r.time} - {r.size}p</div>
                </div>
                <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full ${
                  r.status === 'confirmed' ? 'bg-burgundy/10 text-burgundy/70' : 'bg-amber-500/10 text-amber-400/70'
                }`}>{r.status}</span>
              </div>
            ))}
          </div>
        </div>
        {/* Bottom gradient fade */}
        <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-[#0a0a0f] to-transparent z-30 pointer-events-none" />
      </motion.div>
    </motion.div>
  );
}

// ─── 4. Cursor Spotlight ────────────────────────────────────────
function CursorSpotlight({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: -200, y: -200 });

  const handleMouse = useCallback((e: React.MouseEvent) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }, []);

  return (
    <div ref={ref} onMouseMove={handleMouse} className={`relative overflow-hidden ${className}`}>
      {/* Spotlight overlay */}
      <div
        className="absolute inset-0 pointer-events-none z-0 transition-opacity duration-300"
        style={{
          background: `radial-gradient(500px circle at ${pos.x}px ${pos.y}px, rgba(139,26,74,0.04), transparent 60%)`,
        }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

// ─── 5. Staggered Reveal ────────────────────────────────────────
function StaggerReveal({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24, filter: 'blur(8px)' }}
      whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.6, delay, type: 'spring', stiffness: 100, damping: 20 }}
    >
      {children}
    </motion.div>
  );
}

// ─── 6. Before/After — Animated Side-by-Side ────────────────────
function BeforeAfterDemo() {
  const [showAfter, setShowAfter] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  useEffect(() => {
    if (isInView) {
      const timer = setTimeout(() => setShowAfter(true), 1200);
      return () => clearTimeout(timer);
    }
  }, [isInView]);

  return (
    <div ref={ref} className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* BEFORE — Chaotic restaurant scene */}
      <motion.div
        className={`rounded-2xl overflow-hidden border ${showAfter ? 'border-red-500/10' : 'border-white/[0.07]'} transition-colors duration-1000`}
        initial={{ opacity: 0, x: -30 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
      >
        <div className="bg-[#1a1a22] px-4 py-2 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-red-400/60" />
          <span className="text-[10px] text-red-400/40 uppercase tracking-widest font-medium">Without AI</span>
        </div>
        <div className="bg-[#12121a] p-5 min-h-[300px]">
          {/* Phone ringing animation */}
          <div className="flex items-center gap-3 mb-4">
            <motion.div
              className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center"
              animate={!showAfter ? { rotate: [-5, 5, -5, 5, 0], scale: [1, 1.1, 1] } : {}}
              transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 1.5 }}
            >
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M3 5a2 2 0 012-2h2.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V17a2 2 0 01-2 2h-1C8.716 19 1 11.284 1 5V4z" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </motion.div>
            <div>
              <div className="text-[12px] text-white/60">Phone ringing...</div>
              <div className="text-[10px] text-red-400/40">Staff busy with dinner service</div>
            </div>
          </div>

          {/* Missed calls counter */}
          <div className="space-y-2.5 mb-5">
            {['Missed call — 19:32', 'Missed call — 19:45', 'Missed call — 20:01'].map((msg, i) => (
              <motion.div
                key={i}
                className="flex items-center gap-2 py-1.5 px-3 rounded-lg bg-red-500/[0.04] border border-red-500/[0.06]"
                initial={{ opacity: 0, x: -10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.3 + i * 0.4 }}
              >
                <span className="text-red-400/50 text-[10px]">✕</span>
                <span className="text-[11px] text-white/30">{msg}</span>
              </motion.div>
            ))}
          </div>

          {/* Paper notepad scribble */}
          <div className="rounded-lg bg-amber-900/[0.06] border border-amber-500/[0.08] p-3">
            <div className="text-[9px] text-amber-400/30 uppercase tracking-wider mb-1.5">Paper notepad</div>
            <div className="space-y-1 text-[11px] text-white/20 italic font-mono">
              <div>Table 5 — Giovanni? 4ppl??</div>
              <div className="line-through opacity-40">Table 3 — cancelled</div>
              <div>8pm — someone called (name??)</div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* AFTER — Seatable AI calm & organized */}
      <motion.div
        className={`rounded-2xl overflow-hidden border ${showAfter ? 'border-burgundy/20' : 'border-white/[0.07]'} transition-colors duration-1000`}
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
          <span className="text-[10px] text-burgundy/60 uppercase tracking-widest font-medium">With Seatable AI</span>
        </div>
        <div className="bg-[#12121a] p-5 min-h-[300px]">
          {/* AI handling messages */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-burgundy/10 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M8 12h.01M12 12h.01M10 16c4.418 0 8-3.134 8-7s-3.582-7-8-7-8 3.134-8 7c0 1.76.743 3.37 1.97 4.6-.097 1.016-.417 2.13-.771 2.966-.079.186.074.394.272.362a9.67 9.67 0 002.79-.907A9.05 9.05 0 0010 16z" stroke="#8B1A4A" strokeWidth="1.5" strokeLinecap="round" /></svg>
            </div>
            <div>
              <div className="text-[12px] text-white/60">AI handling all channels</div>
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
                  confirmed
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
              <div className="text-[9px] text-burgundy/40 uppercase tracking-wider">Predicted Revenue</div>
              <ShineFx><span className="text-sm font-bold text-burgundy/80">{'\u20AC'}1,596</span></ShineFx>
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
  );
}

// ─── 7. Dot Matrix Background ───────────────────────────────────
function DotMatrix({ color = 'rgba(139,26,74,0.3)', dotSize = 1.5, gap = 24 }: { color?: string; dotSize?: number; gap?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const timeRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };
    resize();
    window.addEventListener('resize', resize);

    const animate = () => {
      timeRef.current += 0.008;
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      ctx.clearRect(0, 0, w, h);

      const cols = Math.ceil(w / gap);
      const rows = Math.ceil(h / gap);

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = c * gap + gap / 2;
          const y = r * gap + gap / 2;
          const dist = Math.sqrt((x - w / 2) ** 2 + (y - h / 2) ** 2);
          const wave = Math.sin(dist * 0.015 - timeRef.current * 2) * 0.5 + 0.5;
          const flicker = Math.sin(timeRef.current * 3 + c * 0.5 + r * 0.7) * 0.15 + 0.85;
          const alpha = wave * flicker * 0.6;

          ctx.beginPath();
          ctx.arc(x, y, dotSize, 0, Math.PI * 2);
          ctx.fillStyle = color.replace(/[\d.]+\)$/, `${alpha})`);
          ctx.fill();
        }
      }

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animRef.current);
    };
  }, [color, dotSize, gap]);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />;
}

// ─── Feature Card with Stagger ──────────────────────────────────
function FeatureCard({ icon, title, description, delay }: { icon: React.ReactNode; title: string; description: string; delay: number }) {
  return (
    <StaggerReveal delay={delay}>
      <div className={`rounded-2xl p-5 ${glass} hover:bg-white/[0.05] transition-colors duration-300 h-full`}>
        <div className="w-10 h-10 rounded-xl bg-burgundy/10 flex items-center justify-center mb-3 text-burgundy">
          {icon}
        </div>
        <h3 className="text-[15px] font-semibold text-white/85 mb-1.5">{title}</h3>
        <p className="text-[12px] text-white/35 leading-relaxed">{description}</p>
      </div>
    </StaggerReveal>
  );
}

// ─── Main Prototype Page ────────────────────────────────────────
export default function Prototype() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* ── HERO SECTION with Cursor Spotlight + TypeFx + Dot Matrix ── */}
      <CursorSpotlight className="relative min-h-[90vh] flex flex-col items-center justify-center px-6">
        <DotMatrix />

        {/* Badge */}
        <StaggerReveal delay={0}>
          <div className="mb-6 px-4 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-[11px] text-white/40 tracking-wide">
            Powered by AI that never sleeps
          </div>
        </StaggerReveal>

        {/* Headline with TypeFx */}
        <StaggerReveal delay={0.1} className="text-center">
          <h1 className="font-serif text-5xl sm:text-6xl lg:text-7xl font-medium tracking-tight text-white leading-[1.1] mb-4 max-w-4xl">
            Your AI answered{' '}
            <TypeFx
              words={['a reservation', 'a WhatsApp message', 'a phone call', 'a walk-in question']}
              className="text-burgundy"
            />
          </h1>
        </StaggerReveal>

        {/* Subheadline */}
        <StaggerReveal delay={0.2} className="text-center">
          <p className="text-lg sm:text-xl text-white/30 font-light max-w-2xl mb-8">
            Last night at 2 AM, someone booked a table at your restaurant.
            Seatable handled it — by voice, text, and WhatsApp.
          </p>
        </StaggerReveal>

        {/* CTAs */}
        <StaggerReveal delay={0.3} className="flex gap-3">
          <motion.a
            href="/demo/setup"
            className="px-7 py-3 bg-burgundy hover:bg-burgundy-dark text-white text-sm font-semibold rounded-full transition-colors"
            whileHover={{ scale: 1.05, boxShadow: '0 0 30px rgba(139,26,74,0.3)' }}
            whileTap={{ scale: 0.97 }}
          >
            Try it free
          </motion.a>
          <motion.a
            href="#walkthrough"
            className="px-7 py-3 bg-white/[0.04] hover:bg-white/[0.08] text-white/60 text-sm font-medium rounded-full border border-white/[0.08] transition-colors"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.97 }}
          >
            See it live
          </motion.a>
        </StaggerReveal>

        {/* Scroll indicator */}
        <motion.div
          className="absolute bottom-8"
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M10 4v12m0 0l-4-4m4 4l4-4" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </motion.div>
      </CursorSpotlight>

      {/* ── 3D PERSPECTIVE DASHBOARD ── */}
      <section id="walkthrough" className="py-24 px-6 relative overflow-hidden">
        <div className="max-w-4xl mx-auto">
          <StaggerReveal className="text-center mb-14">
            <div className="text-xs font-semibold tracking-[3px] uppercase text-burgundy/60 mb-4">
              Live Dashboard
            </div>
            <h2 className="font-serif text-4xl sm:text-5xl font-medium tracking-tight text-white mb-3">
              Everything in <ShineFx className="text-burgundy">real time</ShineFx>.
            </h2>
            <p className="text-lg text-white/30 font-light max-w-xl mx-auto">
              Watch reservations flow in, revenue predictions update, and your AI handle everything.
            </p>
          </StaggerReveal>

          <PerspectiveDashboard />
        </div>
      </section>

      {/* ── BEFORE / AFTER — Animated Side-by-Side ── */}
      <section className="py-24 px-6 relative">
        <CursorSpotlight className="max-w-4xl mx-auto">
          <StaggerReveal className="text-center mb-10">
            <div className="text-xs font-semibold tracking-[3px] uppercase text-white/25 mb-4">
              The Difference
            </div>
            <h2 className="font-serif text-4xl sm:text-5xl font-medium tracking-tight text-white mb-3">
              Same restaurant. Different night.
            </h2>
            <p className="text-base text-white/30 font-light">
              Watch what happens when AI handles the front of house.
            </p>
          </StaggerReveal>

          <StaggerReveal delay={0.2}>
            <BeforeAfterDemo />
          </StaggerReveal>
        </CursorSpotlight>
      </section>

      {/* ── FEATURE GRID with Staggered Reveals ── */}
      <section className="py-24 px-6 relative overflow-hidden">
        <DotMatrix color="rgba(139,26,74,0.2)" dotSize={1} gap={32} />
        <div className="max-w-4xl mx-auto relative">
          <StaggerReveal className="text-center mb-14">
            <div className="text-xs font-semibold tracking-[3px] uppercase text-burgundy/60 mb-4">
              Beyond Reservations
            </div>
            <h2 className="font-serif text-4xl sm:text-5xl font-medium tracking-tight text-white mb-3">
              AI that runs the floor.
            </h2>
          </StaggerReveal>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <FeatureCard
              delay={0}
              icon={<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3 10l2-8h10l2 8M3 10h14M3 10l1 6h12l1-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
              title="Revenue Intelligence"
              description="Predict daily revenue from confirmed reservations. See spend estimates per booking before guests arrive."
            />
            <FeatureCard
              delay={0.1}
              icon={<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 2a8 8 0 100 16 8 8 0 000-16zm0 0v8l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
              title="No-Show Protection"
              description="AI predicts no-show risk per reservation. Auto-trigger deposit holds for high-risk bookings."
            />
            <FeatureCard
              delay={0.2}
              icon={<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M4 4h12v12H4zM8 8h4M8 12h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
              title="Manager AI"
              description="Proactive briefings, campaign suggestions, and operational insights delivered to WhatsApp."
            />
            <FeatureCard
              delay={0.3}
              icon={<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M2 14l4-4 3 3 4-5 5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
              title="Smart Staffing"
              description="7-day staffing forecast based on reservation patterns. Know when you need +1 FOH before Friday."
            />
            <FeatureCard
              delay={0.4}
              icon={<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M14 2l4 4-8 8H6v-4l8-8z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
              title="Voice AI Agent"
              description="Natural phone conversations. Books tables, answers questions, and handles special requests 24/7."
            />
            <FeatureCard
              delay={0.5}
              icon={<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" /><path d="M6 10l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
              title="WhatsApp Bookings"
              description="Customers text your AI on WhatsApp. Reservations confirmed in seconds, synced to your dashboard."
            />
          </div>
        </div>
      </section>

      {/* ── PATTERN INDEX (for quick reference) ── */}
      <section className="py-16 px-6 border-t border-white/[0.05]">
        <div className="max-w-2xl mx-auto">
          <h3 className="text-sm font-semibold text-white/25 uppercase tracking-widest mb-6 text-center">Patterns Used on This Page</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            {[
              'TypeFx', 'ShineFx', '3D Perspective', 'Cursor Spotlight',
              'Stagger Reveal', 'Before/After', 'Dot Matrix', 'Nested Radius',
            ].map(p => (
              <div key={p} className={`rounded-xl py-2.5 px-3 ${glass} text-[11px] text-white/40`}>{p}</div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer spacer */}
      <div className="h-20" />
    </div>
  );
}

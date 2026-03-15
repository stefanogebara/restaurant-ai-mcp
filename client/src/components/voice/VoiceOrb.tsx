/**
 * VoiceOrb — Sesame-style audio-reactive orb
 *
 * CSS + Framer Motion. No Three.js overhead.
 * The orb breathes when idle, pulses with voice amplitude when active,
 * and shifts color between states.
 */
import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import type { AgentState } from './useVoiceAgent';

interface VoiceOrbProps {
  agentState: AgentState;
  getInputVolume: () => number;
  getOutputVolume: () => number;
  onClick: () => void;
  size?: number;
  /** Override default English status labels (for i18n) */
  labels?: Partial<Record<AgentState, string>>;
}

/** Color palette per state */
const STATE_COLORS: Record<AgentState, { from: string; to: string; glow: string }> = {
  idle: { from: '#9f1239', to: '#be123c', glow: 'rgba(159,18,57,0.25)' },
  connecting: { from: '#9f1239', to: '#f59e0b', glow: 'rgba(245,158,11,0.3)' },
  listening: { from: '#2563eb', to: '#7c3aed', glow: 'rgba(37,99,235,0.35)' },
  thinking: { from: '#7c3aed', to: '#a855f7', glow: 'rgba(124,58,237,0.35)' },
  talking: { from: '#9f1239', to: '#dc2626', glow: 'rgba(159,18,57,0.45)' },
};

const STATE_LABELS: Record<AgentState, string> = {
  idle: 'Tap to talk',
  connecting: 'Connecting...',
  listening: 'Listening...',
  thinking: 'Thinking...',
  talking: 'Speaking...',
};

export default function VoiceOrb({
  agentState,
  getInputVolume,
  getOutputVolume,
  onClick,
  size = 180,
  labels,
}: VoiceOrbProps) {
  const orbRef = useRef<HTMLButtonElement>(null);
  const [volume, setVolume] = useState(0);
  const smoothVolumeRef = useRef(0);

  // Smooth volume polling via rAF
  useEffect(() => {
    if (agentState === 'idle' || agentState === 'connecting') {
      setVolume(0);
      return;
    }

    let animId: number;
    const poll = () => {
      const raw = agentState === 'talking'
        ? getOutputVolume()
        : getInputVolume();

      // Exponential smoothing — fast rise, slow decay
      const target = Math.min(raw * 2.5, 1); // amplify
      const speed = target > smoothVolumeRef.current ? 0.3 : 0.08;
      smoothVolumeRef.current += (target - smoothVolumeRef.current) * speed;

      setVolume(smoothVolumeRef.current);
      animId = requestAnimationFrame(poll);
    };
    animId = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(animId);
  }, [agentState, getInputVolume, getOutputVolume]);

  const colors = STATE_COLORS[agentState];
  const isActive = agentState !== 'idle' && agentState !== 'connecting';
  const mergedLabels = { ...STATE_LABELS, ...labels };

  // Dynamic scale: volume boost on top of base
  const volumeScale = 1 + volume * 0.15;

  // Dynamic glow
  const glowSize = 40 + volume * 60;
  const glowOpacity = isActive ? 0.3 + volume * 0.4 : 0.2;

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Outer glow ring */}
      <div className="relative" style={{ width: size + 60, height: size + 60 }}>
        {/* Ripple rings — only when active */}
        {isActive && [0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="absolute inset-0 rounded-full"
            style={{
              border: `1px solid ${colors.from}`,
              opacity: 0,
            }}
            animate={{
              scale: [1, 1.6 + i * 0.2],
              opacity: [0.3 - i * 0.08, 0],
            }}
            transition={{
              duration: 2.5 + i * 0.3,
              repeat: Infinity,
              ease: 'easeOut',
              delay: i * 0.5,
            }}
          />
        ))}

        {/* Ambient glow */}
        <motion.div
          className="absolute rounded-full"
          style={{
            inset: 10,
            background: `radial-gradient(circle, ${colors.glow} 0%, transparent 70%)`,
            filter: `blur(${glowSize}px)`,
            opacity: glowOpacity,
          }}
          animate={{ opacity: glowOpacity }}
          transition={{ duration: 0.15 }}
        />

        {/* The orb button */}
        <motion.button
          ref={orbRef}
          onClick={onClick}
          className="absolute rounded-full cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-4 focus-visible:ring-offset-[#1a1a2e]"
          style={{
            width: size,
            height: size,
            top: '50%',
            left: '50%',
            marginTop: -size / 2,
            marginLeft: -size / 2,
            background: `radial-gradient(circle at 35% 35%, ${colors.from}, ${colors.to})`,
          }}
          animate={{
            scale: agentState === 'connecting'
              ? [1, 1.05, 1]
              : isActive
                ? volumeScale
                : [1, 1.03, 1],
            boxShadow: `0 0 ${glowSize}px ${colors.glow}`,
          }}
          transition={
            agentState === 'connecting'
              ? { duration: 1.2, repeat: Infinity, ease: 'easeInOut' }
              : isActive
                ? { duration: 0.1, ease: 'linear' }
                : { duration: 3, repeat: Infinity, ease: 'easeInOut' }
          }
          aria-label={mergedLabels[agentState]}
        >
          {/* Inner microphone icon */}
          <motion.div
            className="flex items-center justify-center w-full h-full"
            animate={{ opacity: agentState === 'connecting' ? [0.5, 1, 0.5] : 1 }}
            transition={
              agentState === 'connecting'
                ? { duration: 1.2, repeat: Infinity }
                : { duration: 0.3 }
            }
          >
            {agentState === 'idle' || agentState === 'connecting' ? (
              <MicIcon size={size * 0.28} />
            ) : agentState === 'talking' ? (
              <WaveIcon size={size * 0.28} volume={volume} />
            ) : (
              <MicIcon size={size * 0.28} />
            )}
          </motion.div>
        </motion.button>
      </div>

      {/* Status label */}
      <motion.div
        initial={false}
        animate={{ opacity: 1 }}
        className="flex items-center gap-2"
      >
        {isActive && (
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>
        )}
        <span className="text-sm text-white/50 font-medium">
          {mergedLabels[agentState]}
        </span>
      </motion.div>
    </div>
  );
}

function MicIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-white/90"
    >
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

function WaveIcon({ size, volume }: { size: number; volume: number }) {
  // Animated sound wave bars
  const barCount = 5;
  const barWidth = size * 0.08;
  const maxHeight = size * 0.6;
  const gap = size * 0.06;
  const totalWidth = barCount * barWidth + (barCount - 1) * gap;
  const startX = (size - totalWidth) / 2;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="text-white/90">
      {Array.from({ length: barCount }).map((_, i) => {
        const centerDist = Math.abs(i - Math.floor(barCount / 2));
        const heightFactor = 1 - centerDist * 0.2;
        const h = Math.max(size * 0.1, maxHeight * heightFactor * (0.3 + volume * 0.7));
        const x = startX + i * (barWidth + gap);
        const y = (size - h) / 2;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={barWidth}
            height={h}
            rx={barWidth / 2}
            fill="currentColor"
            opacity={0.85}
          />
        );
      })}
    </svg>
  );
}

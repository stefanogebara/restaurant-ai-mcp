import { Player } from '@remotion/player';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Sequence,
} from 'remotion';

// ─── Constants ───────────────────────────────────────────────────
const FPS = 30;
const DURATION_FRAMES = 10 * FPS; // 10s total
const COMP_WIDTH = 900;
const COMP_HEIGHT = 500;

const BG_GRADIENT_FROM = '#fafaf9';
const BG_GRADIENT_TO = '#f5f5f4';
const BURGUNDY = '#9F1239';
const BURGUNDY_LIGHT = '#be123c';
const GLASS_BG = 'rgba(0,0,0,0.03)';
const GLASS_BORDER = 'rgba(0,0,0,0.08)';
const TEXT_PRIMARY = '#1c1917';
const TEXT_SECONDARY = 'rgba(0,0,0,0.5)';
const TEXT_MUTED = 'rgba(0,0,0,0.35)';

// ─── Helpers ─────────────────────────────────────────────────────
function fadeIn(frame: number, start: number, duration = 10): number {
  return interpolate(frame, [start, start + duration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
}

function slideUp(frame: number, fps: number, delay: number): number {
  return spring({ frame: frame - delay, fps, config: { damping: 18, stiffness: 120 } });
}

// ─── Scene 1: WhatsApp Conversation (0-3s) ───────────────────────
function Scene1() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const messages = [
    { text: 'Oi, quero reservar uma mesa pra 4 amanha as 20h', fromUser: true, delay: 8 },
    { text: 'Encontrei disponibilidade! Qual o seu nome?', fromUser: false, delay: 28 },
    { text: 'Maria Silva', fromUser: true, delay: 48 },
    { text: 'Reserva confirmada no Brasa & Alma!', fromUser: false, delay: 62, confirmed: true },
  ];

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(135deg, ${BG_GRADIENT_FROM}, ${BG_GRADIENT_TO})`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* iPhone frame */}
      <div
        style={{
          width: 280,
          height: 420,
          borderRadius: 32,
          border: '3px solid rgba(0,0,0,0.1)',
          background: '#ffffff',
          boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
        }}
      >
        {/* Notch */}
        <div
          style={{
            width: 100,
            height: 24,
            background: '#1c1917',
            borderRadius: '0 0 16px 16px',
            margin: '0 auto',
          }}
        />
        {/* WhatsApp header */}
        <div
          style={{
            padding: '8px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            borderBottom: '1px solid rgba(0,0,0,0.06)',
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              background: '#25D366',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
              color: TEXT_PRIMARY,
              fontWeight: 700,
            }}
          >
            S
          </div>
          <div>
            <div style={{ color: TEXT_PRIMARY, fontSize: 12, fontWeight: 600 }}>Brasa & Alma</div>
            <div style={{ color: TEXT_SECONDARY, fontSize: 9 }}>Seatable AI</div>
          </div>
        </div>
        {/* Messages */}
        <div
          style={{
            flex: 1,
            padding: '10px 10px',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            overflow: 'hidden',
          }}
        >
          {messages.map((msg, i) => {
            const progress = slideUp(frame, fps, msg.delay);
            const opacity = fadeIn(frame, msg.delay, 8);
            return (
              <div
                key={i}
                style={{
                  alignSelf: msg.fromUser ? 'flex-end' : 'flex-start',
                  maxWidth: '80%',
                  opacity,
                  transform: `translateY(${(1 - progress) * 20}px)`,
                }}
              >
                <div
                  style={{
                    padding: '7px 10px',
                    borderRadius: msg.fromUser ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                    background: msg.fromUser ? '#dcf8c6' : '#f0f0f0',
                    color: TEXT_PRIMARY,
                    fontSize: 11,
                    lineHeight: 1.4,
                  }}
                >
                  {'confirmed' in msg && msg.confirmed ? (
                    <span>
                      <span style={{ color: '#4ade80' }}>&#10003; </span>
                      {msg.text}
                    </span>
                  ) : (
                    msg.text
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* "WhatsApp AI" label */}
      <div
        style={{
          position: 'absolute',
          bottom: 40,
          left: '50%',
          transform: 'translateX(-50%)',
          color: TEXT_MUTED,
          fontSize: 12,
          letterSpacing: 2,
          textTransform: 'uppercase',
          opacity: fadeIn(frame, 10, 15),
        }}
      >
        WhatsApp AI
      </div>
    </AbsoluteFill>
  );
}

// ─── Scene 2: Dashboard View (3-6s) ─────────────────────────────
function Scene2() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const reservasHoje = Math.round(interpolate(frame, [10, 40], [0, 12], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  }));

  const clientesEsperados = Math.round(interpolate(frame, [15, 45], [0, 48], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  }));

  const cardProgress = slideUp(frame, fps, 5);
  const statsProgress = slideUp(frame, fps, 15);
  const waveOpacity = fadeIn(frame, 35, 15);

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(135deg, ${BG_GRADIENT_FROM}, ${BG_GRADIENT_TO})`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
      }}
    >
      <div style={{ width: '100%', maxWidth: 700, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Reservation card */}
        <div
          style={{
            background: GLASS_BG,
            border: `1px solid ${GLASS_BORDER}`,
            borderRadius: 16,
            padding: '16px 20px',
            opacity: cardProgress,
            transform: `translateY(${(1 - cardProgress) * 30}px)`,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ color: TEXT_PRIMARY, fontSize: 16, fontWeight: 600 }}>Maria Silva</div>
              <div style={{ color: TEXT_SECONDARY, fontSize: 12, marginTop: 2 }}>
                4 pessoas &middot; 20:00 &middot; Amanha
              </div>
            </div>
            <div
              style={{
                background: 'rgba(74,222,128,0.15)',
                color: '#4ade80',
                fontSize: 11,
                fontWeight: 600,
                padding: '4px 10px',
                borderRadius: 8,
              }}
            >
              Confirmada
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: 12, opacity: statsProgress, transform: `translateY(${(1 - statsProgress) * 20}px)` }}>
          <StatCard label="Reservas hoje" value={reservasHoje} color={BURGUNDY} />
          <StatCard label="Clientes esperados" value={clientesEsperados} color={BURGUNDY_LIGHT} />
        </div>

        {/* Voice waveform */}
        <div
          style={{
            background: GLASS_BG,
            border: `1px solid ${GLASS_BORDER}`,
            borderRadius: 12,
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            opacity: waveOpacity,
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              background: BURGUNDY,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <WaveformIcon frame={frame} />
          </div>
          <div>
            <div style={{ color: TEXT_PRIMARY, fontSize: 12, fontWeight: 600 }}>AI Ativa</div>
            <div style={{ color: TEXT_MUTED, fontSize: 10 }}>Pronta para atender</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 2, alignItems: 'flex-end', height: 20 }}>
            <WaveformBars frame={frame} />
          </div>
        </div>
      </div>

      {/* "Dashboard" label */}
      <div
        style={{
          position: 'absolute',
          bottom: 40,
          left: '50%',
          transform: 'translateX(-50%)',
          color: TEXT_MUTED,
          fontSize: 12,
          letterSpacing: 2,
          textTransform: 'uppercase',
          opacity: fadeIn(frame, 5, 15),
        }}
      >
        Dashboard
      </div>
    </AbsoluteFill>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div
      style={{
        flex: 1,
        background: GLASS_BG,
        border: `1px solid ${GLASS_BORDER}`,
        borderRadius: 12,
        padding: '14px 16px',
      }}
    >
      <div style={{ color: TEXT_SECONDARY, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
        {label}
      </div>
      <div style={{ color, fontSize: 28, fontWeight: 700, marginTop: 4, fontFamily: 'JetBrains Mono, monospace' }}>
        {value}
      </div>
    </div>
  );
}

function WaveformIcon({ frame }: { frame: number }) {
  const scale = interpolate(Math.sin(frame * 0.3), [-1, 1], [0.85, 1.15]);
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ transform: `scale(${scale})` }}>
      <path d="M12 1v22M8 4v16M16 4v16M4 8v8M20 8v8" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function WaveformBars({ frame }: { frame: number }) {
  const bars = [0, 1, 2, 3, 4, 5, 6];
  return (
    <>
      {bars.map((i) => {
        const height = interpolate(
          Math.sin(frame * 0.25 + i * 1.2),
          [-1, 1],
          [4, 18]
        );
        return (
          <div
            key={i}
            style={{
              width: 3,
              height,
              borderRadius: 2,
              background: BURGUNDY,
              opacity: 0.7,
            }}
          />
        );
      })}
    </>
  );
}

// ─── Scene 3: Voice Note Confirmation (6-8s) ────────────────────
function Scene3() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const cardProgress = slideUp(frame, fps, 5);

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(135deg, ${BG_GRADIENT_FROM}, ${BG_GRADIENT_TO})`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
      }}
    >
      <div
        style={{
          maxWidth: 500,
          width: '100%',
          opacity: cardProgress,
          transform: `translateY(${(1 - cardProgress) * 30}px)`,
        }}
      >
        {/* Voice note card */}
        <div
          style={{
            background: GLASS_BG,
            border: `1px solid ${GLASS_BORDER}`,
            borderRadius: 20,
            padding: '24px 28px',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          {/* Play button + waveform */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                background: BURGUNDY,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff">
                <polygon points="6,3 20,12 6,21" />
              </svg>
            </div>
            <div style={{ flex: 1, display: 'flex', gap: 2, alignItems: 'center', height: 32 }}>
              <VoiceNoteWaveform frame={frame} />
            </div>
            <div style={{ color: TEXT_MUTED, fontSize: 11, flexShrink: 0 }}>0:08</div>
          </div>

          {/* Transcription text */}
          <div style={{ color: TEXT_SECONDARY, fontSize: 13, lineHeight: 1.6, fontStyle: 'italic' }}>
            &quot;Oi Maria! Confirmada sua reserva para amanha as 20h, mesa para 4 no Brasa & Alma. Ate la!&quot;
          </div>

          {/* Status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                background: '#4ade80',
              }}
            />
            <span style={{ color: '#4ade80', fontSize: 11, fontWeight: 600 }}>
              Enviada via WhatsApp
            </span>
          </div>
        </div>
      </div>

      {/* "Voice AI" label */}
      <div
        style={{
          position: 'absolute',
          bottom: 40,
          left: '50%',
          transform: 'translateX(-50%)',
          color: TEXT_MUTED,
          fontSize: 12,
          letterSpacing: 2,
          textTransform: 'uppercase',
          opacity: fadeIn(frame, 5, 15),
        }}
      >
        Voice AI
      </div>
    </AbsoluteFill>
  );
}

function VoiceNoteWaveform({ frame }: { frame: number }) {
  const bars = Array.from({ length: 30 }, (_, i) => i);
  return (
    <>
      {bars.map((i) => {
        const baseHeight = Math.abs(Math.sin(i * 0.6)) * 20 + 4;
        const animated = interpolate(
          Math.sin(frame * 0.2 + i * 0.5),
          [-1, 1],
          [baseHeight * 0.6, baseHeight]
        );
        return (
          <div
            key={i}
            style={{
              width: 2.5,
              height: animated,
              borderRadius: 2,
              background: BURGUNDY,
              opacity: 0.6,
            }}
          />
        );
      })}
    </>
  );
}

// ─── Scene 4: Logo Pause (8-10s) ────────────────────────────────
function Scene4() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const logoProgress = slideUp(frame, fps, 10);

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(135deg, ${BG_GRADIENT_FROM}, ${BG_GRADIENT_TO})`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      <div
        style={{
          opacity: logoProgress,
          transform: `scale(${0.8 + logoProgress * 0.2})`,
        }}
      >
        <div
          style={{
            fontSize: 40,
            fontWeight: 700,
            color: TEXT_PRIMARY,
            letterSpacing: -1,
            fontFamily: 'Inter, system-ui, sans-serif',
          }}
        >
          <span style={{ color: BURGUNDY }}>sea</span>table
        </div>
      </div>
      <div
        style={{
          color: TEXT_MUTED,
          fontSize: 14,
          opacity: fadeIn(frame, 20, 15),
          letterSpacing: 1,
        }}
      >
        AI que atende seu restaurante
      </div>
    </AbsoluteFill>
  );
}

// ─── Main Composition ────────────────────────────────────────────
function SeatableHeroComposition() {
  return (
    <AbsoluteFill>
      <Sequence from={0} durationInFrames={3 * FPS}>
        <Scene1 />
      </Sequence>
      <Sequence from={3 * FPS} durationInFrames={3 * FPS}>
        <Scene2 />
      </Sequence>
      <Sequence from={6 * FPS} durationInFrames={2 * FPS}>
        <Scene3 />
      </Sequence>
      <Sequence from={8 * FPS} durationInFrames={2 * FPS}>
        <Scene4 />
      </Sequence>
    </AbsoluteFill>
  );
}

// ─── Exported Player wrapper ─────────────────────────────────────
export default function HeroAnimation() {
  return (
    <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
      <Player
        component={SeatableHeroComposition}
        durationInFrames={DURATION_FRAMES}
        compositionWidth={COMP_WIDTH}
        compositionHeight={COMP_HEIGHT}
        fps={FPS}
        autoPlay
        loop
        controls={false}
        acknowledgeRemotionLicense
        style={{
          width: '100%',
          maxWidth: COMP_WIDTH,
          borderRadius: 16,
          overflow: 'hidden',
        }}
      />
    </div>
  );
}

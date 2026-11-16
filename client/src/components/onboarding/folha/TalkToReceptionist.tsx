import { useEffect, useRef } from 'react';
import ThiingsIcon from '../../common/ThiingsIcon';
import { useVoiceAgent } from '../../voice/useVoiceAgent';
import type { getSheetCopy } from './sheetCopy';
import { bookingCodeFrom } from '../../../lib/onboardingLaunch';

type Copy = ReturnType<typeof getSheetCopy>;


/**
 * The owner's first call with the receptionist they just created, from the
 * browser. Uses a signed URL for THIS agent (useVoiceAgent → the signed-URL
 * endpoint checks ownership). One click is the consent: the button says it
 * calls, and the browser then asks for the microphone itself.
 *
 * A glass object on purpose (Liquid Glass v2: glass is for objects you use).
 * The halo follows her voice volume; no colour stands for a state here.
 */
export default function TalkToReceptionist({ agentId, copy, onEnded }: {
  agentId: string;
  copy: Copy;
  /** A call that really connected has ended (she hung up, or the owner did). */
  onEnded?: (result: { bookingCode: string | null }) => void;
}) {
  const { agentState, error, transcript, start, stop, getInputVolume, getOutputVolume } =
    useVoiceAgent({ agentId, useSignedUrl: true, requireConfirmation: false });
  const active = agentState !== 'idle' && agentState !== 'ready';
  const halo = useRef<HTMLSpanElement>(null);

  // Scale the halo from the live volume without re-rendering every frame.
  useEffect(() => {
    if (!active) return;
    let frame = 0;
    const tick = () => {
      const level = agentState === 'talking' ? getOutputVolume() : getInputVolume() * 0.6;
      if (halo.current) halo.current.style.transform = `scale(${1 + Math.min(level, 1) * 0.35})`;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, agentState, getInputVolume, getOutputVolume]);

  // A connected call that returns to idle has ended: the onboarding moves on.
  // A call that never connected (microphone refused, network) does not count.
  const connected = useRef(false);
  const transcriptRef = useRef(transcript);
  transcriptRef.current = transcript;
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;
  useEffect(() => {
    if (agentState === 'listening' || agentState === 'talking' || agentState === 'thinking') connected.current = true;
    if (agentState === 'idle' && connected.current) {
      connected.current = false;
      onEndedRef.current?.({ bookingCode: bookingCodeFrom(transcriptRef.current) });
    }
  }, [agentState]);

  // Leaving the screen ends the call.
  const stopRef = useRef(stop);
  stopRef.current = stop;
  const activeRef = useRef(active);
  activeRef.current = active;
  useEffect(() => () => { if (activeRef.current) void stopRef.current(); }, []);

  const status = agentState === 'connecting' ? copy.callConnecting
    : agentState === 'talking' ? copy.callTalking
      : active ? copy.callListening : copy.callCta;

  return (
    <section className="liquid-capsule mt-8 p-6 sm:p-7" data-testid="talk-to-receptionist">
      <div className="flex items-center gap-5">
        <span className="relative flex h-16 w-16 shrink-0 items-center justify-center">
          {active && (
            <span ref={halo} aria-hidden="true"
              className="absolute inset-0 rounded-full bg-deep-charcoal/10 transition-transform duration-75 motion-reduce:hidden" />
          )}
          <button
            type="button"
            onClick={() => { void (active ? stop() : start()); }}
            aria-label={active ? copy.callEnd : copy.callCta}
            className={`relative flex h-16 w-16 items-center justify-center rounded-full text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
              active ? 'bg-deep-charcoal hover:bg-stone-gray focus-visible:ring-deep-charcoal/50' : 'bg-burgundy hover:bg-burgundy-dark focus-visible:ring-burgundy/60'
            }`}
          >
            <ThiingsIcon name={active ? 'phone-off' : 'phone-call'} pxSize={24} />
          </button>
        </span>
        <div className="min-w-0">
          <p className="text-[17px] text-deep-charcoal" aria-live="polite">{status}</p>
          <p className="mt-0.5 text-[14px] text-muted-stone">{active ? copy.callEnd : copy.callHint}</p>
        </div>
      </div>

      {transcript.length > 0 && (
        <ol className="mt-5 space-y-2 border-t border-glass-border-dark pt-4 text-[15px] leading-relaxed">
          {transcript.slice(-4).map((line, i) => (
            <li key={`${transcript.length - 4 + i}`} className={line.role === 'agent' ? 'text-deep-charcoal' : 'text-muted-stone'}>
              {line.text}
            </li>
          ))}
        </ol>
      )}

      {error && <p role="alert" className="mt-4 text-[14px] text-red-700">{copy.callError}</p>}
    </section>
  );
}

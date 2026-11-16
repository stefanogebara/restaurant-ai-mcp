/**
 * Reads the answer of POST /api/onboarding/complete.
 *
 * Since 2026-11-16 the endpoint can stream one event per setup result
 * (`Accept: text/event-stream`), so the sheet shows what really happened
 * instead of timed guesses. Without the stream the answer is the same JSON as
 * always, and this reader returns it unchanged.
 *
 * One rule matters more than the rest: once the `restaurant` event arrived,
 * the restaurant EXISTS. If the connection then drops, or the server reports
 * an error, a retry would only meet the "already exists" refusal. So the
 * reader returns a finished result built from the events it got, and the
 * steps it never heard about stay unknown on the final screen.
 */
import { readSseFrames } from './sseStream';

export const LAUNCH_STEPS = ['restaurant', 'whatsapp_registry', 'voice_agent', 'knowledge_base', 'subscription'] as const;
export type LaunchStepKey = typeof LAUNCH_STEPS[number];

export interface LaunchStep {
  status: string;
  tables?: number;
  seats?: number;
  language?: string;
  agent_id?: string | null;
  plan?: 'free' | 'trial';
  trial_end?: string | null;
  restaurant_id?: string;
  booking_url?: string;
}
export type LaunchSteps = Partial<Record<LaunchStepKey, LaunchStep>>;

export interface LaunchResult {
  ok: boolean;
  // The endpoint's JSON body (or the `done` event, which carries the same body).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
  /** True when the result was rebuilt from the events after the stream broke. */
  partial?: boolean;
}

function withoutKeys(frame: Record<string, unknown>, ...keys: string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(frame).filter(([name]) => !keys.includes(name)));
}

function isStepKey(key: unknown): key is LaunchStepKey {
  return typeof key === 'string' && (LAUNCH_STEPS as readonly string[]).includes(key);
}

export async function readLaunchResponse(
  response: Response,
  onStep: (key: LaunchStepKey, step: LaunchStep) => void,
): Promise<LaunchResult> {
  const contentType = response.headers?.get?.('content-type') || '';
  if (!response.ok || !contentType.includes('text/event-stream') || !response.body) {
    const data = await response.json().catch(() => null);
    return { ok: response.ok, data };
  }

  const steps: LaunchSteps = {};
  let done: Record<string, unknown> | null = null;
  try {
    await readSseFrames(response.body, (frame) => {
      if (frame.type === 'step' && isStepKey(frame.key)) {
        const key = frame.key;
        const step = withoutKeys(frame, 'type', 'key') as unknown as LaunchStep;
        steps[key] = step;
        onStep(key, step);
      } else if (frame.type === 'done') {
        done = withoutKeys(frame, 'type');
      }
    });
  } catch (error) {
    if (!steps.restaurant?.restaurant_id) throw error;
  }
  if (done) return { ok: true, data: done };

  const restaurant = steps.restaurant;
  if (!restaurant?.restaurant_id) {
    throw new Error('The setup connection closed before the restaurant was saved.');
  }
  const setup: Record<string, string> = {};
  for (const key of LAUNCH_STEPS) setup[key] = steps[key]?.status ?? 'unknown';
  return {
    ok: true,
    partial: true,
    data: {
      success: true,
      restaurant: {
        restaurant_id: restaurant.restaurant_id,
        booking_url: restaurant.booking_url ?? null,
        voice_agent_id: steps.voice_agent?.status === 'ok' ? steps.voice_agent.agent_id ?? null : null,
      },
      setup,
    },
  };
}

/**
 * The last booking code the receptionist said in the test call, e.g.
 * "RES-20261116-H-zB-VQKj-FS", so the final screen can name it.
 */
export function bookingCodeFrom(transcript: Array<{ role: 'user' | 'agent'; text: string }>): string | null {
  for (let i = transcript.length - 1; i >= 0; i -= 1) {
    if (transcript[i].role !== 'agent') continue;
    const match = /\bRES-\d{8}-[A-Za-z0-9_-]{4,}/.exec(transcript[i].text);
    if (match) return match[0].replace(/-+$/, '');
  }
  return null;
}

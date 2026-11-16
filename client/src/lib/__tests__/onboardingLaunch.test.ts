import { describe, test, expect, vi } from 'vitest';
import { readLaunchResponse, type LaunchStepKey } from '../onboardingLaunch';

const frame = (o: unknown) => `data: ${JSON.stringify(o)}\n\n`;

/** A stream that delivers the given chunks, then either closes or breaks. */
function body(chunks: string[], breakAtEnd = false): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    pull(c) {
      if (i < chunks.length) return void c.enqueue(enc.encode(chunks[i++]));
      if (breakAtEnd) c.error(new TypeError('network error'));
      else c.close();
    },
  });
}

function sse(chunks: string[], breakAtEnd = false) {
  return {
    ok: true, status: 200,
    headers: new Headers({ 'content-type': 'text/event-stream' }),
    body: body(chunks, breakAtEnd),
    json: async () => { throw new Error('not JSON'); },
  } as unknown as Response;
}

function json(status: number, data: unknown) {
  return {
    ok: status < 400, status,
    headers: new Headers({ 'content-type': 'application/json' }),
    body: null,
    json: async () => data,
  } as unknown as Response;
}

const restaurantStep = {
  type: 'step', key: 'restaurant', status: 'ok', restaurant_id: 'r-1', booking_url: '/book/casa', tables: 4, seats: 16,
};

describe('readLaunchResponse', () => {
  test('reports each step as it arrives and returns the done body', async () => {
    const seen: LaunchStepKey[] = [];
    const done = { type: 'done', success: true, restaurant: { restaurant_id: 'r-1' }, setup: { restaurant: 'ok' } };
    const result = await readLaunchResponse(sse([
      frame(restaurantStep),
      frame({ type: 'step', key: 'voice_agent', status: 'ok', agent_id: 'agent_1' }),
      frame(done),
    ]), (key) => seen.push(key));

    expect(seen).toEqual(['restaurant', 'voice_agent']);
    expect(result).toEqual({ ok: true, data: { success: true, restaurant: { restaurant_id: 'r-1' }, setup: { restaurant: 'ok' } } });
  });

  test('a JSON answer (no stream, or a refusal) comes back unchanged', async () => {
    const onStep = vi.fn();
    expect(await readLaunchResponse(json(409, { error: 'already_exists' }), onStep))
      .toEqual({ ok: false, data: { error: 'already_exists' } });
    expect(await readLaunchResponse(json(200, { success: true }), onStep))
      .toEqual({ ok: true, data: { success: true } });
    expect(onStep).not.toHaveBeenCalled();
  });

  test('a stream that breaks after the restaurant was saved still ends as a finished restaurant', async () => {
    const result = await readLaunchResponse(sse([
      frame(restaurantStep),
      frame({ type: 'step', key: 'whatsapp_registry', status: 'ok' }),
      frame({ type: 'step', key: 'voice_agent', status: 'ok', agent_id: 'agent_9' }),
    ], true), vi.fn());

    expect(result.partial).toBe(true);
    expect(result.data).toEqual({
      success: true,
      restaurant: { restaurant_id: 'r-1', booking_url: '/book/casa', voice_agent_id: 'agent_9' },
      setup: { restaurant: 'ok', whatsapp_registry: 'ok', voice_agent: 'ok', knowledge_base: 'unknown', subscription: 'unknown' },
    });
  });

  test('a server error event after the restaurant was saved is not a retry prompt either', async () => {
    const result = await readLaunchResponse(sse([
      frame(restaurantStep),
      frame({ type: 'error', error: 'boom' }),
    ]), vi.fn());
    expect(result.partial).toBe(true);
    expect(result.data.restaurant.voice_agent_id).toBeNull();
  });

  test('a stream that breaks before the restaurant exists is an error', async () => {
    await expect(readLaunchResponse(sse([], true), vi.fn())).rejects.toThrow();
    await expect(readLaunchResponse(sse([]), vi.fn())).rejects.toThrow(/before the restaurant was saved/);
  });
});

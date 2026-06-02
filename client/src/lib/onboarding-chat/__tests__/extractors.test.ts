/**
 * Tests for the client extractor wrapper.
 * Mocks authFetch so we don't hit the real endpoint.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractInput, _clearCacheForTests } from '../extractors';

vi.mock('../../../services/api', () => ({
  authFetch: vi.fn(),
}));

import { authFetch } from '../../../services/api';

const mockedFetch = authFetch as unknown as ReturnType<typeof vi.fn>;

function ok(value: unknown) {
  return { ok: true, status: 200, json: async () => ({ ok: true, value }) } as Response;
}
function fail(status: number, error: string) {
  return { ok: false, status, json: async () => ({ ok: false, error }) } as Response;
}

beforeEach(() => {
  mockedFetch.mockReset();
  _clearCacheForTests();
});

describe('extractInput — happy path', () => {
  it('returns the value when server responds 200 ok=true', async () => {
    const hours = [{ day: 'Monday', is_open: true, open_time: '12:00', close_time: '23:00' }];
    mockedFetch.mockResolvedValueOnce(ok(hours));

    const result = await extractInput('hours', 'mon 12-11');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual(hours);

    expect(mockedFetch).toHaveBeenCalledWith(
      '/api/onboarding/extract',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ kind: 'hours', raw: 'mon 12-11' }) }),
    );
  });

  it('caches by (kind, raw) so the second call does not hit the network', async () => {
    mockedFetch.mockResolvedValueOnce(ok({ a: 1 }));

    await extractInput('hours', 'same');
    await extractInput('hours', 'same');

    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });

  it('does NOT share cache across different kinds', async () => {
    mockedFetch.mockResolvedValueOnce(ok({ a: 1 })).mockResolvedValueOnce(ok({ b: 2 }));

    await extractInput('hours', 'x');
    await extractInput('address', 'x');

    expect(mockedFetch).toHaveBeenCalledTimes(2);
  });
});

describe('extractInput — failure modes', () => {
  it('returns fallbackToStructured=true for 4xx errors (recoverable with manual flow)', async () => {
    mockedFetch.mockResolvedValueOnce(fail(400, 'bad_input'));
    const result = await extractInput('hours', 'x');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fallbackToStructured).toBe(true);
      expect(result.error).toBe('bad_input');
    }
  });

  it('returns fallbackToStructured=false for 401 (must re-auth, no point falling back)', async () => {
    mockedFetch.mockResolvedValueOnce(fail(401, 'Unauthorized'));
    const result = await extractInput('hours', 'x');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fallbackToStructured).toBe(false);
  });

  it('returns fallbackToStructured=false for 500 (server bug, retrying won\'t help)', async () => {
    mockedFetch.mockResolvedValueOnce(fail(500, 'Server error'));
    const result = await extractInput('hours', 'x');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fallbackToStructured).toBe(false);
  });

  it('handles network errors', async () => {
    mockedFetch.mockRejectedValueOnce(new Error('Network down'));
    const result = await extractInput('hours', 'x');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('Network down');
      expect(result.fallbackToStructured).toBe(true);
    }
  });

  it('does not cache failed responses so a retry can succeed', async () => {
    const hours = [{ day: 'Monday', is_open: true, open_time: '12:00', close_time: '23:00' }];
    mockedFetch
      .mockResolvedValueOnce(fail(502, 'extract_unparseable'))
      .mockResolvedValueOnce(ok(hours));

    const first = await extractInput('hours', 'same');
    const second = await extractInput('hours', 'same');

    expect(first.ok).toBe(false);
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.value).toEqual(hours);
    expect(mockedFetch).toHaveBeenCalledTimes(2);
  });
});

'use strict';

const mockCreateMemory = jest.fn();
const mockListMemories = jest.fn();
const mockDeleteMemory = jest.fn();

jest.mock('../_lib/auth', () => ({ verifyAuth: jest.fn() }));
jest.mock('../_lib/cors', () => ({ setWebhookCors: jest.fn(), handlePreflight: jest.fn(() => false) }));
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));
jest.mock('../services/guestMemory', () => ({
  createMemory: (...args) => mockCreateMemory(...args),
  listMemories: (...args) => mockListMemories(...args),
  deleteMemory: (...args) => mockDeleteMemory(...args),
}));

const { verifyAuth } = require('../_lib/auth');
const { handlePreflight, setWebhookCors } = require('../_lib/cors');
const handler = require('../manager-notes').default || require('../manager-notes');

const AUTH_USER = { restaurant_id: 'rest-uuid-1' };

function mkReqRes(method = 'GET', body = {}, query = {}) {
  const req = { method, body, query, headers: {} };
  const res = {
    _status: null,
    _json: null,
    status(code) { this._status = code; return this; },
    json(data) { this._json = data; return this; },
    end() { return this; },
    setHeader() { return this; },
    getHeader() { return undefined; },
  };
  return { req, res };
}

beforeEach(() => {
  jest.clearAllMocks();
  verifyAuth.mockResolvedValue({ user: AUTH_USER });
  handlePreflight.mockReturnValue(false);
  mockCreateMemory.mockResolvedValue({ id: 'mem-1', content: 'test', importance: 9, created_at: '2026-01-01' });
  mockListMemories.mockResolvedValue([]);
  mockDeleteMemory.mockResolvedValue(true);
});

describe('manager-notes handler', () => {
  describe('OPTIONS preflight', () => {
    it('returns early when handlePreflight returns true', async () => {
      handlePreflight.mockReturnValue(true);
      const { req, res } = mkReqRes('OPTIONS');
      await handler(req, res);
      expect(res._status).toBeNull();
    });
  });

  describe('authentication', () => {
    it('returns 401 when verifyAuth returns an error', async () => {
      verifyAuth.mockResolvedValue({ error: 'Authentication required', status: 401 });
      const { req, res } = mkReqRes('GET');
      await handler(req, res);
      expect(res._status).toBe(401);
    });

    it('returns 403 when user has no restaurant_id', async () => {
      verifyAuth.mockResolvedValue({ user: { restaurant_id: null } });
      const { req, res } = mkReqRes('GET');
      await handler(req, res);
      expect(res._status).toBe(403);
      expect(res._json).toMatchObject({ message: expect.any(String) });
    });
  });

  describe('POST /manager-notes', () => {
    it('returns 400 when content is missing', async () => {
      const { req, res } = mkReqRes('POST', {});
      await handler(req, res);
      expect(res._status).toBe(400);
    });

    it('returns 400 when content is empty string', async () => {
      const { req, res } = mkReqRes('POST', { content: '   ' });
      await handler(req, res);
      expect(res._status).toBe(400);
    });

    it('returns 201 with note in response on success', async () => {
      const { req, res } = mkReqRes('POST', { content: 'Remember VIP at table 5' });
      await handler(req, res);
      expect(res._status).toBe(201);
      expect(res._json).toMatchObject({ note: expect.any(Object) });
    });

    it('sets importance 9 for vip_instruction note type', async () => {
      const { req, res } = mkReqRes('POST', { content: 'VIP guest note', note_type: 'vip_instruction' });
      await handler(req, res);
      // createMemory(restaurantId, phone, options) — 3 args
      expect(mockCreateMemory).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ importance: 9 }),
      );
    });

    it('sets importance 8 for general_policy note type', async () => {
      const { req, res } = mkReqRes('POST', { content: 'General policy note', note_type: 'general_policy' });
      await handler(req, res);
      expect(mockCreateMemory).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ importance: 8 }),
      );
    });

    it('sets importance 7 for guest_preference note type', async () => {
      const { req, res } = mkReqRes('POST', { content: 'Guest preference note', note_type: 'guest_preference' });
      await handler(req, res);
      expect(mockCreateMemory).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ importance: 7 }),
      );
    });

    it('calls createMemory with provided guest_phone', async () => {
      const { req, res } = mkReqRes('POST', { content: 'Note for guest', guest_phone: '+15551234567' });
      await handler(req, res);
      const calls = mockCreateMemory.mock.calls[0];
      const phoneArg = calls[1];
      expect(phoneArg).toBe('+15551234567');
    });

    it('calls createMemory with __restaurant_policy__ sentinel when no guest_phone', async () => {
      const { req, res } = mkReqRes('POST', { content: 'Policy note without phone' });
      await handler(req, res);
      const calls = mockCreateMemory.mock.calls[0];
      const phoneArg = calls[1];
      expect(phoneArg).toBe('__restaurant_policy__');
    });

    it('returns 500 when createMemory returns null', async () => {
      mockCreateMemory.mockResolvedValue(null);
      const { req, res } = mkReqRes('POST', { content: 'Some note' });
      await handler(req, res);
      expect(res._status).toBe(500);
    });

    it('returns 500 when createMemory returns falsy', async () => {
      mockCreateMemory.mockResolvedValue(false);
      const { req, res } = mkReqRes('POST', { content: 'Some note' });
      await handler(req, res);
      expect(res._status).toBe(500);
    });
  });

  describe('GET /manager-notes', () => {
    it('returns 200 with notes array on success', async () => {
      mockListMemories.mockResolvedValue([
        { id: 'mem-1', content: 'Test note', importance: 9, guest_phone: '+15551234567', created_at: '2026-01-01' },
      ]);
      const { req, res } = mkReqRes('GET');
      await handler(req, res);
      expect(res._status).toBe(200);
      expect(res._json).toMatchObject({ notes: expect.any(Array) });
      expect(res._json.notes).toHaveLength(1);
    });

    it('maps __restaurant_policy__ phone to null and sets is_policy: true', async () => {
      mockListMemories.mockResolvedValue([
        {
          id: 'mem-2',
          content: 'Policy note',
          importance: 8,
          guest_phone: '__restaurant_policy__',
          created_at: '2026-01-01',
        },
      ]);
      const { req, res } = mkReqRes('GET');
      await handler(req, res);
      expect(res._status).toBe(200);
      const note = res._json.notes[0];
      expect(note.guest_phone).toBeNull();
      expect(note.is_policy).toBe(true);
    });
  });

  describe('DELETE /manager-notes', () => {
    it('returns 400 when id is missing from body and query', async () => {
      const { req, res } = mkReqRes('DELETE', {}, {});
      await handler(req, res);
      expect(res._status).toBe(400);
    });

    it('returns 200 with deleted id on success using body id', async () => {
      const { req, res } = mkReqRes('DELETE', { id: 'mem-1' });
      await handler(req, res);
      expect(res._status).toBe(200);
      // Code returns { success: true, deleted: id }
      expect(res._json).toMatchObject({ success: true, deleted: 'mem-1' });
    });

    it('returns 200 with deleted id on success using query id', async () => {
      // body must be null/undefined so req.body || req.query falls back to query
      const { req, res } = mkReqRes('DELETE', null, { id: 'mem-q-1' });
      await handler(req, res);
      expect(res._status).toBe(200);
      expect(res._json).toMatchObject({ success: true, deleted: 'mem-q-1' });
    });

    it('returns 500 when deleteMemory returns false', async () => {
      mockDeleteMemory.mockResolvedValue(false);
      const { req, res } = mkReqRes('DELETE', { id: 'mem-1' });
      await handler(req, res);
      expect(res._status).toBe(500);
    });
  });

  describe('unknown HTTP method', () => {
    it('returns 405 for unsupported methods', async () => {
      const { req, res } = mkReqRes('PATCH');
      await handler(req, res);
      expect(res._status).toBe(405);
    });
  });

  describe('top-level catch block (lines 46-47)', () => {
    it('returns 500 when createMemory throws an error', async () => {
      mockCreateMemory.mockRejectedValueOnce(new Error('DB connection lost'));
      const { req, res } = mkReqRes('POST', { content: 'Valid content' });
      await handler(req, res);
      expect(res._status).toBe(500);
      expect(res._json).toMatchObject({ message: 'Internal server error' });
    });
  });
});

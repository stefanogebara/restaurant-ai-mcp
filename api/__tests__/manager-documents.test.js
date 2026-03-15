'use strict';

// var declarations are hoisted above jest.mock() factories
var mockVerifyJWT = jest.fn();
var mockWriteMemory = jest.fn();
var mockAnthropicCreate = jest.fn();
var mockBusboyInstance;
var mockSetInternalCors = jest.fn();
var mockHandlePreflight = jest.fn().mockReturnValue(false);

jest.mock('../_lib/auth', () => ({ verifyJWT: mockVerifyJWT }));
jest.mock('../services/managerMemory', () => ({ writeMemory: mockWriteMemory }));
jest.mock('@anthropic-ai/sdk', () => ({
  default: class Anthropic {
    constructor() {
      this.messages = { create: mockAnthropicCreate };
    }
  },
}));
jest.mock('pdf-parse', () => jest.fn().mockResolvedValue({ text: 'Parsed PDF text content here' }));
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
}));
jest.mock('../_lib/cors', () => ({
  setInternalCors: mockSetInternalCors,
  handlePreflight: mockHandlePreflight,
}));
jest.mock('../_lib/rate-limit', () => ({
  checkAndApplyRateLimit: jest.fn().mockResolvedValue(false),
}));

// Mock busboy to control multipart parsing behaviour in tests
jest.mock('busboy', () => {
  return jest.fn().mockImplementation(() => {
    mockBusboyInstance = {
      _handlers: {},
      on: jest.fn().mockImplementation(function (event, handler) {
        this._handlers[event] = handler;
        return this;
      }),
    };
    return mockBusboyInstance;
  });
});

const handler = require('../manager-documents');

// Helper: build a mock res object
function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  res.end = jest.fn().mockReturnValue(res);
  return res;
}

// Helper: build a mock POST request that triggers busboy events after pipe()
// simulateTruncation: if true, the 'limit' event fires on the file stream
function makeMockReq(
  fileBuffer = Buffer.from('Staff lunch 12-2pm. VIP capacity 20.'),
  filename = 'policy.txt',
  mimeType = 'text/plain',
  { simulateTruncation = false } = {}
) {
  return {
    method: 'POST',
    headers: { 'content-type': 'multipart/form-data; boundary=----boundary', authorization: 'Bearer tok' },
    pipe: jest.fn().mockImplementation((busboyInst) => {
      setImmediate(() => {
        // Simulate the 'file' event
        if (busboyInst._handlers.file) {
          const fileStream = {
            on: jest.fn().mockImplementation(function (event, cb) {
              if (event === 'data') cb(fileBuffer);
              if (event === 'limit' && simulateTruncation) cb();
              if (event === 'end') cb();
              return this;
            }),
          };
          busboyInst._handlers.file('file', fileStream, { filename, mimeType });
        }
        // Simulate the 'finish' event
        if (busboyInst._handlers.finish) {
          busboyInst._handlers.finish();
        }
      });
    }),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockBusboyInstance = null;
  mockHandlePreflight.mockReturnValue(false);
  mockVerifyJWT.mockReturnValue({ restaurant_id: 'rest-1' });
  mockWriteMemory.mockResolvedValue({});
  mockAnthropicCreate.mockResolvedValue({
    content: [{ type: 'text', text: '1. Lunch hours 11-3pm\n2. VIP capacity 20 guests' }],
  });
});

// ─── Method guard ────────────────────────────────────────────────────────────

describe('method guard', () => {
  it('returns 405 for GET', async () => {
    const req = { method: 'GET', headers: {} };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.json).toHaveBeenCalledWith({ error: 'Method not allowed' });
  });

  it('returns 405 for DELETE', async () => {
    const req = { method: 'DELETE', headers: {} };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });
});

// ─── CORS ────────────────────────────────────────────────────────────────────

describe('CORS', () => {
  it('handles OPTIONS preflight', async () => {
    mockHandlePreflight.mockReturnValueOnce(true);
    const req = { method: 'OPTIONS', headers: {} };
    const res = mockRes();
    await handler(req, res);
    expect(mockSetInternalCors).toHaveBeenCalled();
    expect(mockHandlePreflight).toHaveBeenCalled();
    // Handler exits early — no 405 or other status set by the handler itself
    expect(res.status).not.toHaveBeenCalledWith(405);
  });

  it('sets CORS headers on POST requests', async () => {
    const req = makeMockReq(
      Buffer.from('Staff lunch 12-2pm. VIP capacity 20.'),
      'policy.txt',
      'text/plain'
    );
    const res = mockRes();
    await handler(req, res);
    expect(mockSetInternalCors).toHaveBeenCalledWith(req, res);
  });
});

// ─── Auth ────────────────────────────────────────────────────────────────────

describe('auth', () => {
  it('returns 401 when verifyJWT throws', async () => {
    mockVerifyJWT.mockImplementationOnce(() => { throw new Error('UNAUTHORIZED'); });
    const req = {
      method: 'POST',
      headers: { 'content-type': 'multipart/form-data; boundary=----b', authorization: '' },
    };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
  });
});

// ─── Happy path: text file ────────────────────────────────────────────────────

describe('text document upload', () => {
  it('parses text file, calls Claude, stores facts, returns success', async () => {
    const req = makeMockReq(
      Buffer.from('Staff lunch 12-2pm. VIP capacity 20.'),
      'policy.txt',
      'text/plain'
    );
    const res = mockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.facts_stored).toBe(2);
    expect(mockWriteMemory).toHaveBeenCalledTimes(2);
    // Verify first call args: (restaurantId, type, category, content, source, importance)
    expect(mockWriteMemory).toHaveBeenCalledWith(
      'rest-1',
      'fact',
      'ops',
      expect.any(String),
      'policy.txt',
      8
    );
  });

  it('calls Claude with extracted text content', async () => {
    const text = 'We open at 9am and close at 11pm on weekdays.';
    const req = makeMockReq(Buffer.from(text), 'hours.txt', 'text/plain');
    const res = mockRes();
    await handler(req, res);

    expect(mockAnthropicCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-haiku-4-5-20251001',
        messages: expect.arrayContaining([
          expect.objectContaining({ role: 'user', content: expect.stringContaining(text) }),
        ]),
      })
    );
  });

  it('strips numbering prefix from stored facts', async () => {
    const req = makeMockReq(Buffer.from('policy text that is long enough here'), 'policy.txt', 'text/plain');
    const res = mockRes();
    await handler(req, res);

    const calls = mockWriteMemory.mock.calls;
    calls.forEach((call) => {
      // content arg is at index 3 — should have no leading "1." numbering
      expect(call[3]).not.toMatch(/^\d+\./);
    });
  });
});

// ─── Happy path: PDF ─────────────────────────────────────────────────────────

describe('PDF upload', () => {
  it('runs pdf-parse for PDF files and stores facts', async () => {
    const pdfParse = require('pdf-parse');
    const req = makeMockReq(Buffer.from('%PDF-fake-data'), 'menu.pdf', 'application/pdf');
    const res = mockRes();
    await handler(req, res);

    expect(pdfParse).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(mockWriteMemory).toHaveBeenCalledWith(
      'rest-1',
      'fact',
      'ops',
      expect.any(String),
      'menu.pdf',
      8
    );
  });

  it('detects PDF by .pdf filename extension regardless of mime type', async () => {
    const pdfParse = require('pdf-parse');
    const req = makeMockReq(Buffer.from('%PDF-fake'), 'doc.pdf', 'application/octet-stream');
    const res = mockRes();
    await handler(req, res);

    expect(pdfParse).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// ─── File type allowlist ──────────────────────────────────────────────────────

describe('file type allowlist', () => {
  it('rejects unsupported file type with 415', async () => {
    const req = makeMockReq(Buffer.from('binary data'), 'file.exe', 'application/octet-stream');
    const res = mockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(415);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unsupported file type. Upload PDF or plain text.' });
    expect(mockAnthropicCreate).not.toHaveBeenCalled();
  });

  it('rejects image files with 415', async () => {
    const req = makeMockReq(Buffer.from('image data'), 'photo.png', 'image/png');
    const res = mockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(415);
  });

  it('accepts .csv files by extension', async () => {
    const req = makeMockReq(
      Buffer.from('item,price\nBurger,12.00\nFries,5.00'),
      'menu.csv',
      'text/csv'
    );
    const res = mockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('accepts .md files by extension even with octet-stream mime', async () => {
    const req = makeMockReq(
      Buffer.from('# Restaurant Policy\n\nLunch hours 11am to 3pm daily.'),
      'policy.md',
      'application/octet-stream'
    );
    const res = mockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// ─── Edge cases ──────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('returns 422 when extracted text is too short', async () => {
    // Anthropic not called when text is empty/too short
    const req = makeMockReq(Buffer.from('hi'), 'empty.txt', 'text/plain');
    const res = mockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({ error: 'Could not extract text from document' });
    expect(mockAnthropicCreate).not.toHaveBeenCalled();
  });

  it('returns 413 when file exceeds 5MB', async () => {
    const bigBuffer = Buffer.alloc(6 * 1024 * 1024, 'x'); // 6MB
    const req = makeMockReq(bigBuffer, 'big.txt', 'text/plain');
    const res = mockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(413);
    expect(res.json).toHaveBeenCalledWith({ error: 'File too large (max 5MB)' });
  });

  it('returns 413 when busboy truncates due to fileSize limit', async () => {
    const req = makeMockReq(
      Buffer.from('some content'),
      'large.txt',
      'text/plain',
      { simulateTruncation: true }
    );
    const res = mockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(413);
    expect(res.json).toHaveBeenCalledWith({ error: 'File too large (max 5MB)' });
  });

  it('returns success with facts_stored 0 when Claude returns no numbered facts', async () => {
    mockAnthropicCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'No specific facts found in this document.' }],
    });
    const req = makeMockReq(
      Buffer.from('Some generic text that has enough characters to pass validation here.'),
      'misc.txt',
      'text/plain'
    );
    const res = mockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, facts_stored: 0 });
    expect(mockWriteMemory).not.toHaveBeenCalled();
  });

  it('returns 500 when writeMemory throws', async () => {
    mockWriteMemory.mockRejectedValueOnce(new Error('DB error'));
    const req = makeMockReq(
      Buffer.from('Staff lunch from noon. VIP capacity 20 people.'),
      'notes.txt',
      'text/plain'
    );
    const res = mockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Processing failed' });
  });

  it('returns 500 when Claude call throws', async () => {
    mockAnthropicCreate.mockRejectedValueOnce(new Error('API rate limit'));
    const req = makeMockReq(
      Buffer.from('Staff lunch from noon to two. VIP section capacity 20.'),
      'notes.txt',
      'text/plain'
    );
    const res = mockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Processing failed' });
  });
});

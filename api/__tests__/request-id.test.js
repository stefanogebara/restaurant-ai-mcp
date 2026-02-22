const { addRequestId, getRequestId } = require('../_lib/request-id');

describe('request-id', () => {
  test('sets x-request-id header on response', () => {
    const res = { setHeader: jest.fn() };
    const req = { headers: {} };
    addRequestId(req, res);
    expect(res.setHeader).toHaveBeenCalledWith('x-request-id', expect.any(String));
  });

  test('reuses existing x-request-id if caller provides it', () => {
    const res = { setHeader: jest.fn() };
    const req = { headers: { 'x-request-id': 'caller-id-123' } };
    addRequestId(req, res);
    expect(res.setHeader).toHaveBeenCalledWith('x-request-id', 'caller-id-123');
  });

  test('getRequestId returns the assigned id', () => {
    const req = { headers: {} };
    const res = { setHeader: jest.fn() };
    addRequestId(req, res);
    expect(getRequestId(req)).toMatch(/^[0-9a-f-]{36}$/);
  });

  test('generates unique IDs', () => {
    const ids = new Set();
    for (let i = 0; i < 100; i++) {
      const req = { headers: {} };
      const res = { setHeader: jest.fn() };
      addRequestId(req, res);
      ids.add(getRequestId(req));
    }
    expect(ids.size).toBe(100);
  });
});

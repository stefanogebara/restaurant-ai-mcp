// mockSupabaseAdmin must be declared with var so it is hoisted above jest.mock() calls
// (jest.mock factories run before const/let declarations are initialized)
var mockSupabaseAdmin = { from: jest.fn() };

const verify = require('../manager-whatsapp-verify');

jest.mock('../_lib/auth', () => ({ verifyJWT: jest.fn().mockReturnValue({ restaurant_id: 'rest-1' }) }));
// whatsapp-sender.js lives in api/_lib/ (not api/_services/)
jest.mock('../_lib/whatsapp-sender', () => ({ sendWhatsAppMessage: jest.fn().mockResolvedValue({ success: true }) }));
jest.mock('../_lib/supabase', () => ({ supabaseAdmin: mockSupabaseAdmin }));
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
}));
jest.mock('../_lib/rate-limit', () => ({
  checkAndApplyRateLimit: jest.fn().mockResolvedValue(false), // false = not blocked
  checkRateLimit: jest.fn().mockResolvedValue({ allowed: true, remaining: 2, limit: 3, resetSeconds: 900 }),
}));

function mockRes() {
  const r = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  r.setHeader = jest.fn();
  return r;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSupabaseAdmin.schema = jest.fn().mockReturnValue(mockSupabaseAdmin);
});

describe('action=send', () => {
  it('saves code and sends WhatsApp message', async () => {
    const updateEq = jest.fn().mockResolvedValue({ error: null });
    const chain = { select: jest.fn(), update: jest.fn(), eq: jest.fn(), single: jest.fn() };
    chain.update.mockReturnValue({ eq: updateEq });
    mockSupabaseAdmin.from.mockReturnValue(chain);

    const req = { method: 'POST', headers: { authorization: 'Bearer tok' }, body: { action: 'send', phone: '+15551234567' } };
    const res = mockRes();
    await verify(req, res);

    const { sendWhatsAppMessage } = require('../_lib/whatsapp-sender');
    expect(sendWhatsAppMessage).toHaveBeenCalledWith('+15551234567', expect.stringContaining('verification code'));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ sent: true }));
  });

  it('returns 502 when WhatsApp send fails', async () => {
    const { sendWhatsAppMessage } = require('../_lib/whatsapp-sender');
    sendWhatsAppMessage.mockResolvedValueOnce({ success: false, error: 'Invalid phone number' });

    const updateEq = jest.fn().mockResolvedValue({ error: null });
    const updateChain = { update: jest.fn().mockReturnValue({ eq: updateEq }) };
    mockSupabaseAdmin.from.mockReturnValueOnce(updateChain);

    const req = { method: 'POST', headers: { authorization: 'Bearer tok' }, body: { action: 'send', phone: '+15551234567' } };
    const res = mockRes();
    await verify(req, res);

    expect(res.status).toHaveBeenCalledWith(502);
  });

  it('returns 400 for invalid phone format', async () => {
    const req = { method: 'POST', headers: { authorization: 'Bearer tok' }, body: { action: 'send', phone: '555-1234' } };
    const res = mockRes();
    await verify(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('E.164') }));
  });

  it('returns 400 when phone is missing', async () => {
    const req = { method: 'POST', headers: { authorization: 'Bearer tok' }, body: { action: 'send' } };
    const res = mockRes();
    await verify(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('action=confirm', () => {
  it('marks verified when code matches', async () => {
    const chain = { select: jest.fn(), update: jest.fn(), eq: jest.fn(), single: jest.fn() };
    chain.select.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    chain.single.mockResolvedValue({ data: { manager_whatsapp_code: '123456', manager_whatsapp_code_expires_at: new Date(Date.now() + 60000).toISOString() }, error: null });
    chain.update.mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) });
    mockSupabaseAdmin.from.mockReturnValue(chain);

    const req = { method: 'POST', headers: { authorization: 'Bearer tok' }, body: { action: 'confirm', code: '123456' } };
    const res = mockRes();
    await verify(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ verified: true }));
  });

  it('returns 400 for wrong code', async () => {
    const chain = { select: jest.fn(), eq: jest.fn(), single: jest.fn() };
    chain.select.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    chain.single.mockResolvedValue({ data: { manager_whatsapp_code: '999999', manager_whatsapp_code_expires_at: new Date(Date.now() + 60000).toISOString() }, error: null });
    mockSupabaseAdmin.from.mockReturnValue(chain);

    const req = { method: 'POST', headers: { authorization: 'Bearer tok' }, body: { action: 'confirm', code: '000000' } };
    const res = mockRes();
    await verify(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when code is expired', async () => {
    const chain = { select: jest.fn(), eq: jest.fn(), single: jest.fn() };
    chain.select.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    chain.single.mockResolvedValue({ data: { manager_whatsapp_code: '123456', manager_whatsapp_code_expires_at: new Date(Date.now() - 60000).toISOString() }, error: null });
    mockSupabaseAdmin.from.mockReturnValue(chain);

    const req = { method: 'POST', headers: { authorization: 'Bearer tok' }, body: { action: 'confirm', code: '123456' } };
    const res = mockRes();
    await verify(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Verification code expired' }));
  });

  it('returns 400 when code is missing from request', async () => {
    const req = { method: 'POST', headers: { authorization: 'Bearer tok' }, body: { action: 'confirm' } };
    const res = mockRes();
    await verify(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ---------------------------------------------------------------------------
// Cross-tenant phone collision guard (Phase Q)
//
// Before this guard, two restaurants could each verify the same phone — the
// second confirm() silently overwrote the first restaurant's manager_phone
// link, locking out the original manager with no audit trail. The new
// pre-check + 23505 mapping rejects the second confirm with 409.
// ---------------------------------------------------------------------------
describe('action=confirm — phone collision guard', () => {
  it('returns 409 when phone is already verified by another restaurant', async () => {
    // First .from() call → SELECT own OTP row (returns manager_phone too now)
    // Second .from() call → SELECT duplicate-phone check (returns the OTHER tenant)
    const ownChain = { select: jest.fn(), eq: jest.fn(), single: jest.fn() };
    ownChain.select.mockReturnValue(ownChain);
    ownChain.eq.mockReturnValue(ownChain);
    ownChain.single.mockResolvedValue({
      data: {
        manager_phone: '+5511999999999',
        manager_whatsapp_code: '123456',
        manager_whatsapp_code_expires_at: new Date(Date.now() + 60000).toISOString(),
      },
      error: null,
    });

    const dupChain = { select: jest.fn(), eq: jest.fn(), neq: jest.fn(), maybeSingle: jest.fn() };
    dupChain.select.mockReturnValue(dupChain);
    dupChain.eq.mockReturnValue(dupChain);
    dupChain.neq.mockReturnValue(dupChain);
    // Existing rest-A owns the verified phone.
    dupChain.maybeSingle.mockResolvedValue({ data: { id: 'rest-A' }, error: null });

    let fromCall = 0;
    mockSupabaseAdmin.from.mockImplementation(() => {
      fromCall += 1;
      return fromCall === 1 ? ownChain : dupChain;
    });

    const req = { method: 'POST', headers: { authorization: 'Bearer tok' }, body: { action: 'confirm', code: '123456' } };
    const res = mockRes();
    await verify(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      code: 'manager_phone_taken',
      error: expect.stringMatching(/already linked/i),
    }));
  });

  it('proceeds with UPDATE when phone is NOT already verified elsewhere', async () => {
    const ownChain = { select: jest.fn(), eq: jest.fn(), single: jest.fn() };
    ownChain.select.mockReturnValue(ownChain);
    ownChain.eq.mockReturnValue(ownChain);
    ownChain.single.mockResolvedValue({
      data: {
        manager_phone: '+5511999999999',
        manager_whatsapp_code: '123456',
        manager_whatsapp_code_expires_at: new Date(Date.now() + 60000).toISOString(),
      },
      error: null,
    });

    const dupChain = { select: jest.fn(), eq: jest.fn(), neq: jest.fn(), maybeSingle: jest.fn() };
    dupChain.select.mockReturnValue(dupChain);
    dupChain.eq.mockReturnValue(dupChain);
    dupChain.neq.mockReturnValue(dupChain);
    dupChain.maybeSingle.mockResolvedValue({ data: null, error: null });

    const updateEq = jest.fn().mockResolvedValue({ error: null });
    const updateChain = { update: jest.fn().mockReturnValue({ eq: updateEq }) };

    let fromCall = 0;
    mockSupabaseAdmin.from.mockImplementation(() => {
      fromCall += 1;
      if (fromCall === 1) return ownChain;
      if (fromCall === 2) return dupChain;
      return updateChain;
    });

    const req = { method: 'POST', headers: { authorization: 'Bearer tok' }, body: { action: 'confirm', code: '123456' } };
    const res = mockRes();
    await verify(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ verified: true }));
  });

  it('maps Postgres 23505 from the unique index to 409 manager_phone_taken', async () => {
    // Race condition: pre-check found no collision, but a concurrent confirm
    // landed first and the UPDATE itself hits the partial unique index.
    const ownChain = { select: jest.fn(), eq: jest.fn(), single: jest.fn() };
    ownChain.select.mockReturnValue(ownChain);
    ownChain.eq.mockReturnValue(ownChain);
    ownChain.single.mockResolvedValue({
      data: {
        manager_phone: '+5511999999999',
        manager_whatsapp_code: '123456',
        manager_whatsapp_code_expires_at: new Date(Date.now() + 60000).toISOString(),
      },
      error: null,
    });

    const dupChain = { select: jest.fn(), eq: jest.fn(), neq: jest.fn(), maybeSingle: jest.fn() };
    dupChain.select.mockReturnValue(dupChain);
    dupChain.eq.mockReturnValue(dupChain);
    dupChain.neq.mockReturnValue(dupChain);
    dupChain.maybeSingle.mockResolvedValue({ data: null, error: null });

    const updateEq = jest.fn().mockResolvedValue({ error: { code: '23505', message: 'duplicate key value violates unique constraint "manager_phone_verified_unique"' } });
    const updateChain = { update: jest.fn().mockReturnValue({ eq: updateEq }) };

    let fromCall = 0;
    mockSupabaseAdmin.from.mockImplementation(() => {
      fromCall += 1;
      if (fromCall === 1) return ownChain;
      if (fromCall === 2) return dupChain;
      return updateChain;
    });

    const req = { method: 'POST', headers: { authorization: 'Bearer tok' }, body: { action: 'confirm', code: '123456' } };
    const res = mockRes();
    await verify(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      code: 'manager_phone_taken',
    }));
  });
});

describe('general', () => {
  it('returns 405 for non-POST methods', async () => {
    const req = { method: 'GET', headers: {}, body: {} };
    const res = mockRes();
    await verify(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  it('returns 400 for unknown action', async () => {
    const req = { method: 'POST', headers: { authorization: 'Bearer tok' }, body: { action: 'unknown' } };
    const res = mockRes();
    await verify(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

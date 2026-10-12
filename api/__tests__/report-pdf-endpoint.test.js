const mockVerifyAuth = jest.fn();
const mockRateLimit = jest.fn();
const mockConfig = jest.fn();
const mockSend = jest.fn();
const mockGenerate = jest.fn();
const mockUpload = jest.fn();

jest.mock('../_lib/auth', () => ({ verifyAuth: mockVerifyAuth }));
jest.mock('../_lib/rate-limit', () => ({ checkAndApplyRateLimit: mockRateLimit }));
jest.mock('../_lib/cors', () => ({ setInternalCors: jest.fn() }));
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ info: jest.fn(), error: jest.fn() }),
}));
jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: {
    schema: () => ({ from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: mockConfig }) }),
    }) }),
  },
}));
jest.mock('../_services/pdfReportService', () => ({
  resolveReportRange: jest.requireActual('../_services/pdfReportService').resolveReportRange,
  generateWeeklyReportPDF: mockGenerate,
  uploadReportToStorage: mockUpload,
  sendWeeklyReportViaWhatsApp: mockSend,
}));

const handler = require('../report-pdf');

function response() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.end = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.GOTENBERG_URL;
  mockRateLimit.mockResolvedValue(false);
  mockVerifyAuth.mockResolvedValue({ user: { restaurant_id: 'restaurant-1' } });
  mockConfig.mockResolvedValue({ data: {
    manager_phone: '+5511999000000', manager_whatsapp_verified: true,
    agent_language: 'pt-BR', timezone: 'America/Sao_Paulo',
  }, error: null });
  mockSend.mockResolvedValue({ success: true });
  mockGenerate.mockResolvedValue(Buffer.from('%PDF'));
  mockUpload.mockResolvedValue('https://example.com/signed.pdf');
});

test('requires authentication before disclosing renderer state', async () => {
  mockVerifyAuth.mockResolvedValueOnce({ error: 'Unauthorized', status: 401 });
  const res = response();
  await handler({ method: 'GET', query: { action: 'generate' } }, res);
  expect(res.status).toHaveBeenCalledWith(401);
});

test('does not use the public demo renderer by default', async () => {
  const res = response();
  await handler({ method: 'POST', query: { action: 'send_whatsapp' } }, res);
  expect(res.status).toHaveBeenCalledWith(503);
  expect(mockConfig).not.toHaveBeenCalled();
  expect(mockSend).not.toHaveBeenCalled();
});

test('reports delivery availability without attempting a send', async () => {
  const unavailable = response();
  await handler({ method: 'GET', query: { action: 'status' } }, unavailable);
  expect(unavailable.status).toHaveBeenCalledWith(200);
  expect(unavailable.json).toHaveBeenCalledWith(expect.objectContaining({
    available: false, reason: 'renderer_unavailable',
  }));
  process.env.GOTENBERG_URL = 'https://private-renderer.example';
  const available = response();
  await handler({ method: 'GET', query: { action: 'status' } }, available);
  expect(available.json).toHaveBeenCalledWith(expect.objectContaining({ available: true }));
  expect(mockSend).not.toHaveBeenCalled();
});

test('requires POST and a verified destination before sending', async () => {
  process.env.GOTENBERG_URL = 'https://private-renderer.example';
  const get = response();
  await handler({ method: 'GET', query: { action: 'send_whatsapp' } }, get);
  expect(get.status).toHaveBeenCalledWith(405);
  mockConfig.mockResolvedValueOnce({ data: {
    manager_phone: '+5511999000000', manager_whatsapp_verified: false,
    timezone: 'UTC',
  }, error: null });
  const post = response();
  await handler({ method: 'POST', query: { action: 'send_whatsapp' } }, post);
  expect(post.status).toHaveBeenCalledWith(400);
  expect(mockSend).not.toHaveBeenCalled();
});

test('rejects mismatched date parameters without sending', async () => {
  process.env.GOTENBERG_URL = 'https://private-renderer.example';
  const res = response();
  await handler({ method: 'POST', query: {
    action: 'send_whatsapp', start_date: '2026-10-12',
  } }, res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(mockSend).not.toHaveBeenCalled();
});

test('passes the exact selected range to document generation and delivery', async () => {
  process.env.GOTENBERG_URL = 'https://private-renderer.example';
  const range = { start_date: '2026-10-05', end_date: '2026-10-12' };
  const sendRes = response();
  await handler({ method: 'POST', query: { action: 'send_whatsapp', ...range } }, sendRes);
  expect(mockSend).toHaveBeenCalledWith('restaurant-1', '+5511999000000', 'pt-BR', range);
  expect(sendRes.status).toHaveBeenCalledWith(200);

  const generateRes = response();
  await handler({ method: 'GET', query: { action: 'generate', ...range } }, generateRes);
  expect(mockGenerate).toHaveBeenCalledWith('restaurant-1', 'pt-BR', range);
  expect(mockUpload).toHaveBeenCalledWith(Buffer.from('%PDF'), 'restaurant-1', range);
});

const mockSend = jest.fn();

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send: mockSend } })),
}));
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

const { sendRetentionCampaignEmail } = require('../_lib/email');
const originalKey = process.env.RESEND_API_KEY;

beforeEach(() => {
  process.env.RESEND_API_KEY = 'test-key';
  mockSend.mockReset().mockResolvedValue({ data: { id: 'test-email' }, error: null });
});

afterAll(() => {
  if (originalKey === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = originalKey;
});

test('refuses a marketing email without a working unsubscribe destination', async () => {
  const result = await sendRetentionCampaignEmail({ customerEmail: 'guest@example.com', message: 'Volte!' });
  expect(result.sent).toBe(false);
  expect(mockSend).not.toHaveBeenCalled();
});

test('sends a localized, escaped email with the unsubscribe link', async () => {
  const result = await sendRetentionCampaignEmail({
    customerEmail: 'guest@example.com',
    customerName: 'Ana <Costa>',
    message: 'Volte & aproveite',
    campaignType: 'win_back',
    language: 'pt-BR',
    unsubscribeUrl: 'https://seatable.one/api/campaign-unsubscribe?rid=r&phone=%2B55&sig=abc',
  });
  expect(result).toEqual({ sent: true });
  const payload = mockSend.mock.calls[0][0];
  expect(payload.subject).toBe('Uma mensagem do seu restaurante');
  expect(payload.html).toContain('Olá Ana &lt;Costa&gt;');
  expect(payload.html).toContain('Volte &amp; aproveite');
  expect(payload.html).toContain('Cancelar mensagens promocionais');
  expect(payload.html).toContain('phone=%2B55&amp;sig=abc');
});

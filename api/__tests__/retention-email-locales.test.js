'use strict';

const mockSend = jest.fn();
jest.mock('resend', () => ({
  Resend: class { constructor() { this.emails = { send: (...args) => mockSend(...args) }; } },
}));

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

const { sendRetentionCampaignEmail } = require('../_lib/email');

beforeEach(() => {
  process.env.RESEND_API_KEY = 're_test_only';
  mockSend.mockReset();
  mockSend.mockResolvedValue({ data: { id: 'mock_message' }, error: null });
});

describe('retention email language and delivery result', () => {
  test.each([
    ['pt-BR', 'Será um prazer receber você novamente', 'Olá Ana,', 'Gestão inteligente de restaurantes'],
    ['en', 'We Would Love to See You Again', 'Hi Ana,', 'AI Restaurant Management'],
    ['es', 'Nos encantará recibirte de nuevo', 'Hola Ana,', 'Gestión inteligente de restaurantes'],
  ])('%s has a matching subject, greeting and footer', async (language, subject, greeting, footer) => {
    const result = await sendRetentionCampaignEmail({
      customerEmail: 'ana@example.com', customerName: 'Ana',
      message: 'A neutral invitation', campaignType: 'win_back', language,
    });

    expect(result).toEqual({ sent: true });
    const sent = mockSend.mock.calls[0][0];
    expect(sent.subject).toBe(subject);
    expect(sent.html).toContain(greeting);
    expect(sent.html).toContain(footer);
    expect(sent.to).toBe('ana@example.com');
  });

  test('provider rejection is not reported as a send', async () => {
    mockSend.mockResolvedValueOnce({ data: null, error: { message: 'rejected' } });

    const result = await sendRetentionCampaignEmail({
      customerEmail: 'ana@example.com', customerName: 'Ana',
      message: 'Hello', campaignType: 'win_back', language: 'en',
    });

    expect(result).toEqual({ sent: false, reason: 'rejected' });
  });
});

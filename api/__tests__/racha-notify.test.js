'use strict';

/**
 * /api/racha-notify — guardas de auth + composição da mensagem. Não toca rede
 * (para nos guards antes de qualquer envio; compose/statusLabel são puros).
 */

// Entrega mockada: o radar (ao contrário dos guards) chega a chamar os
// senders, e o teste não pode depender de rede nem de env de e-mail.
jest.mock('../_lib/email', () => ({
  sendRachaRecipientStatusEmail: jest.fn().mockResolvedValue(true),
  sendProspectDigestEmail: jest.fn().mockResolvedValue(true),
}));
jest.mock('../_lib/whatsapp-sender', () => ({
  sendWhatsAppMessage: jest.fn().mockResolvedValue({ success: true }),
  sendTemplateMessage: jest.fn().mockResolvedValue({ success: true }),
  isWhatsAppConfigured: jest.fn().mockReturnValue(false),
}));

const handler = require('../racha-notify');
const { sendProspectDigestEmail } = require('../_lib/email');
const { composeMessage, statusLabel } = handler;

function mockRes() {
  return {
    statusCode: 0,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

describe('racha-notify — auth + compose', () => {
  const OLD = process.env.RACHA_NOTIFY_SECRET;
  afterAll(() => {
    if (OLD === undefined) delete process.env.RACHA_NOTIFY_SECRET;
    else process.env.RACHA_NOTIFY_SECRET = OLD;
  });

  test('405 para método não-POST', async () => {
    const res = mockRes();
    await handler({ method: 'GET', headers: {} }, res);
    expect(res.statusCode).toBe(405);
  });

  test('500 quando RACHA_NOTIFY_SECRET não está configurado', async () => {
    delete process.env.RACHA_NOTIFY_SECRET;
    const res = mockRes();
    await handler({ method: 'POST', headers: {}, body: {} }, res);
    expect(res.statusCode).toBe(500);
  });

  test('401 com bearer errado', async () => {
    process.env.RACHA_NOTIFY_SECRET = 'segredo-forte-0123456789';
    const res = mockRes();
    await handler({ method: 'POST', headers: { authorization: 'Bearer errado' }, body: {} }, res);
    expect(res.statusCode).toBe(401);
  });

  test('400 sem status, mesmo autenticado (para antes de qualquer envio)', async () => {
    process.env.RACHA_NOTIFY_SECRET = 'segredo-forte-0123456789';
    const res = mockRes();
    await handler(
      { method: 'POST', headers: { authorization: 'Bearer segredo-forte-0123456789' }, body: { ownerEmail: 'x@y.com' } },
      res,
    );
    expect(res.statusCode).toBe(400);
  });

  test('radar de ativação: evento do fundador NÃO exige status, e entrega', async () => {
    process.env.RACHA_NOTIFY_SECRET = 'segredo-forte-0123456789';
    sendProspectDigestEmail.mockClear();
    const res = mockRes();
    await handler({
      method: 'POST',
      headers: { authorization: 'Bearer segredo-forte-0123456789' },
      body: { event: 'activation_radar', mensagem: 'Okay — travado: não pode receber', alertas: 1, total: 3, ativos: 0 },
    }, res);
    expect(res.statusCode).toBe(200);          // não cai no 400 de "status é obrigatório"
    expect(res.body.data.email).toBe('sent');
    expect(sendProspectDigestEmail).toHaveBeenCalledTimes(1);
    const arg = sendProspectDigestEmail.mock.calls[0][0];
    expect(arg.text).toContain('Okay');
    expect(arg.subject).toMatch(/1 restaurante/);
  });

  test('radar com mensagem vazia não dispara envio nenhum', async () => {
    process.env.RACHA_NOTIFY_SECRET = 'segredo-forte-0123456789';
    sendProspectDigestEmail.mockClear();
    const res = mockRes();
    await handler({
      method: 'POST',
      headers: { authorization: 'Bearer segredo-forte-0123456789' },
      body: { event: 'activation_radar', mensagem: '   ' },
    }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.erro).toBeTruthy();
    expect(sendProspectDigestEmail).not.toHaveBeenCalled();
  });

  test('composeMessage: aprovado vs recusado (com motivo)', () => {
    expect(composeMessage({ venueName: 'Bar X', status: 'active' })).toMatch(/aprovado/i);
    const recusa = composeMessage({ venueName: 'Bar X', status: 'refused', reason: 'CPF não confere' });
    expect(recusa).toMatch(/não foi aprovado/i);
    expect(recusa).toMatch(/CPF não confere/);
    expect(statusLabel('active')).toBe('aprovado');
    expect(statusLabel('refused')).toBe('não aprovado');
  });
});

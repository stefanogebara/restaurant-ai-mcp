'use strict';

/**
 * /api/racha-notify — guardas de auth + composição da mensagem. Não toca rede
 * (para nos guards antes de qualquer envio; compose/statusLabel são puros).
 */

const handler = require('../racha-notify');
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

  test('composeMessage: aprovado vs recusado (com motivo)', () => {
    expect(composeMessage({ venueName: 'Bar X', status: 'active' })).toMatch(/aprovado/i);
    const recusa = composeMessage({ venueName: 'Bar X', status: 'refused', reason: 'CPF não confere' });
    expect(recusa).toMatch(/não foi aprovado/i);
    expect(recusa).toMatch(/CPF não confere/);
    expect(statusLabel('active')).toBe('aprovado');
    expect(statusLabel('refused')).toBe('não aprovado');
  });
});

'use strict';

/**
 * Remetente da proposta do Racha.
 *
 * ACHADO (09/08/2026, minutos antes do primeiro envio autônomo): o FROM_ADDRESS
 * do projeto é 'Seatable <bookings@seatable.one>'. A proposta é do RACHA e vem
 * assinada "Fundador · Racha", então sairia na caixa do prospect com o nome da
 * OUTRA marca no remetente. Isso confunde quem recebe, mistura as marcas (o que
 * a regra de brand proíbe sem aprovação explícita) e, num contato frio, lê como
 * phishing — exatamente o e-mail que ninguém responde.
 *
 * Este teste existe para o remetente nunca mais voltar a ser Seatable.
 */

const mockSend = jest.fn().mockResolvedValue({ data: { id: 'msg_1' }, error: null });
jest.mock('resend', () => ({
  Resend: class { constructor() { this.emails = { send: (...a) => mockSend(...a) }; } },
}));

const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
jest.mock('../_lib/secure-logger', () => ({ createSecureLogger: () => mockLogger }));

const BASE = { to: 'compras@bario.com.br', subject: 'Racha', html: '<p>oi</p>', text: 'oi' };

function carregar(env = {}) {
  jest.resetModules();
  process.env.RESEND_API_KEY = 're_teste';
  delete process.env.RACHA_EMAIL_FROM;
  Object.assign(process.env, env);
  return require('../_lib/email');
}

beforeEach(() => { jest.clearAllMocks(); });

describe('remetente da proposta', () => {
  test('o nome exibido é Racha, nunca Seatable', async () => {
    const { sendProspectProposalEmail } = carregar();
    await sendProspectProposalEmail(BASE);

    const from = mockSend.mock.calls[0][0].from;
    // O domínio verificado É seatable.one, então "seatable" aparece no endereço
    // por necessidade. O que o destinatário LÊ na caixa é o nome de exibição, e
    // é ele que não pode dizer Seatable numa proposta do Racha.
    const nomeExibido = from.split('<')[0].trim();
    expect(nomeExibido).toBe('Racha');
    expect(nomeExibido).not.toMatch(/Seatable/i);
    expect(from).not.toMatch(/bookings@/);
  });

  test('usa domínio verificado (senão o Resend recusa)', async () => {
    const { sendProspectProposalEmail } = carregar();
    await sendProspectProposalEmail(BASE);
    expect(mockSend.mock.calls[0][0].from).toMatch(/@seatable\.one>?$/);
  });

  test('RACHA_EMAIL_FROM sobrescreve quando o domínio próprio existir', async () => {
    const { sendProspectProposalEmail } = carregar({ RACHA_EMAIL_FROM: 'Racha <oi@racha.app>' });
    await sendProspectProposalEmail(BASE);
    expect(mockSend.mock.calls[0][0].from).toBe('Racha <oi@racha.app>');
  });

  test('replyTo aponta pro fundador, separado do remetente', async () => {
    const { sendProspectProposalEmail } = carregar();
    await sendProspectProposalEmail({ ...BASE, replyTo: 'stefanogebara@gmail.com' });
    const arg = mockSend.mock.calls[0][0];
    expect(arg.replyTo).toBe('stefanogebara@gmail.com');
    expect(arg.from).not.toBe(arg.replyTo);
  });
});

describe('falha do Resend não vira sucesso silencioso', () => {
  test('erro no envelope { error } propaga em vez de retornar true', async () => {
    const { sendProspectProposalEmail } = carregar();
    mockSend.mockResolvedValueOnce({ data: null, error: { message: 'domain not verified' } });
    await expect(sendProspectProposalEmail(BASE)).rejects.toThrow(/domain not verified/);
  });

  test('sem destinatário não estoura, só não envia', async () => {
    const { sendProspectProposalEmail } = carregar();
    await expect(sendProspectProposalEmail({ ...BASE, to: null })).resolves.toBe(false);
    expect(mockSend).not.toHaveBeenCalled();
  });
});

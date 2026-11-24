'use strict';

/**
 * Proposta personalizada por prospect (Fase 4).
 *
 * Era o maior ganho de conversão pendente do funil: até aqui só existia a mesa
 * de demonstração genérica, e o deck com o nome da casa era um arquivo feito à
 * mão, um por prospect.
 *
 * Dois riscos aqui, e os dois têm teste: o token circula por e-mail
 * corporativo e é encaminhado a estranhos (não pode virar credencial de nada
 * mais), e o nome da casa é dado hostil que entra direto no HTML.
 */

const {
  signDeckToken, verifyDeckToken, deckUrlFor, LABEL,
} = require('../_lib/prospecting/deck-token');
const { signCloseToken } = require('../_lib/prospecting/prospect-close-token');
const { buildDeckHtml, dorDoFormato } = require('../_lib/prospecting/deck-html');
const { lintOutbound } = require('../_lib/prospecting/claim-linter');

const SEGREDO = 'segredo-de-teste-0123456789';
const LEAD_ID = '874f17cd-8d71-47eb-9ce9-b2b73f8fae00';
const AGORA = Date.parse('2026-08-11T15:00:00.000Z');
const DIA = 24 * 60 * 60 * 1000;

describe('token da proposta', () => {
  test('ida e volta devolve o lead', () => {
    const t = signDeckToken(LEAD_ID, { nowMs: AGORA, secret: SEGREDO });
    expect(verifyDeckToken(t, { nowMs: AGORA, secret: SEGREDO })).toEqual({ ok: true, leadId: LEAD_ID });
  });

  test('determinístico: mesma entrada, mesmo token', () => {
    const a = signDeckToken(LEAD_ID, { nowMs: AGORA, secret: SEGREDO });
    const b = signDeckToken(LEAD_ID, { nowMs: AGORA, secret: SEGREDO });
    expect(a).toBe(b);
  });

  test('assinatura adulterada é recusada', () => {
    const t = signDeckToken(LEAD_ID, { nowMs: AGORA, secret: SEGREDO });
    const adulterado = `${t.slice(0, -3)}xyz`;
    expect(verifyDeckToken(adulterado, { nowMs: AGORA, secret: SEGREDO }).ok).toBe(false);
  });

  test('trocar o lead no payload invalida', () => {
    const t = signDeckToken(LEAD_ID, { nowMs: AGORA, secret: SEGREDO });
    const outro = t.replace(LEAD_ID, '00000000-0000-0000-0000-000000000000');
    expect(verifyDeckToken(outro, { nowMs: AGORA, secret: SEGREDO }).reason).toBe('assinatura_invalida');
  });

  test('expira, e o motivo é distinguível para o servidor', () => {
    const t = signDeckToken(LEAD_ID, { nowMs: AGORA, ttlMs: DIA, secret: SEGREDO });
    expect(verifyDeckToken(t, { nowMs: AGORA + 2 * DIA, secret: SEGREDO }).reason).toBe('expirado');
  });

  test('TTL longo: gerência encaminha e abre semanas depois', () => {
    const t = signDeckToken(LEAD_ID, { nowMs: AGORA, secret: SEGREDO });
    expect(verifyDeckToken(t, { nowMs: AGORA + 30 * DIA, secret: SEGREDO }).ok).toBe(true);
  });

  test('sem segredo não cunha token em vez de assinar com string vazia', () => {
    const semEnv = { ...process.env };
    delete process.env.PROSPECTING_DECK_SECRET;
    delete process.env.CRON_SECRET;
    expect(signDeckToken(LEAD_ID, { nowMs: AGORA })).toBeNull();
    expect(deckUrlFor(LEAD_ID, { nowMs: AGORA })).toBeNull();
    process.env = semEnv;
  });

  test.each(['', null, 'a.b', 'nao-e-token', 'x.y.z'])('lixo não vira acesso: %s', (t) => {
    expect(verifyDeckToken(t, { nowMs: AGORA, secret: SEGREDO }).ok).toBe(false);
  });
});

describe('separação de domínio com o token de "já fechei"', () => {
  test('token de close NÃO vale como proposta', () => {
    const close = signCloseToken(LEAD_ID, { nowMs: AGORA, secret: SEGREDO });
    expect(verifyDeckToken(close, { nowMs: AGORA, secret: SEGREDO }).ok).toBe(false);
  });

  test('o rótulo é o que separa os dois', () => {
    // Esta proposta circula por e-mail corporativo e vai parar na mão de
    // estranhos. Se a assinatura valesse lá, um link de apresentação fecharia
    // negócio no funil.
    expect(LABEL).toBe('racha-deck:v1:');
  });
});

describe('página da proposta', () => {
  const LEAD = { id: LEAD_ID, name: 'Bario Bar', city: 'São Paulo, SP', sector: 'restaurante' };

  test('personaliza com o nome da casa', () => {
    const { html, titulo } = buildDeckHtml(LEAD, { previaUrl: 'https://demo.test/x' });
    expect(titulo).toBe('Racha · proposta para Bario Bar');
    expect(html).toContain('Bario Bar');
    expect(html).toContain('São Paulo, SP');
    expect(html).toContain('https://demo.test/x');
  });

  test('sem nome não vira "proposta para undefined"', () => {
    expect(buildDeckHtml({ id: 'x' }).titulo).toBe('Racha · proposta');
  });

  test('a dor muda com o formato da casa', () => {
    // Bar de comanda individual não tem dividida pra resolver: tem fila no
    // caixa. Falar da dor errada é falar de um problema que a pessoa não tem.
    expect(dorDoFormato('bar').titulo).toMatch(/fila do caixa/i);
    expect(dorDoFormato('restaurante').titulo).toMatch(/vinte minutos/i);
    expect(dorDoFormato(null).titulo).toMatch(/vinte minutos/i);
  });

  test('nome hostil de casa não injeta HTML', () => {
    const { html } = buildDeckHtml({ ...LEAD, name: '<script>alert(1)</script>' });
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
  });

  test('o texto visível passa limpo no claim-linter', () => {
    const { html } = buildDeckHtml(LEAD);
    const semTags = html.replace(/<[^>]+>/g, ' ');
    expect(lintOutbound(semTags).violations).toEqual([]);
  });

  test('mantém o enquadramento legal da gorjeta e não promete adoção', () => {
    const { html } = buildDeckHtml(LEAD);
    expect(html).toContain('CNPJ');
    expect(html).toContain('13.419');
    expect(html).toMatch(/não prometemos taxa de adoção/i);
    expect(html).not.toMatch(/R\$\s?\d/);
  });

  test('pede pra não indexar (proposta com nome de casa não vai pro Google)', () => {
    expect(buildDeckHtml(LEAD).html).toContain('noindex');
  });

  test('é responsiva (gerência abre no celular)', () => {
    expect(buildDeckHtml(LEAD).html).toContain('width=device-width');
  });
});

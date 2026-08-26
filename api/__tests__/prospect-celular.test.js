/**
 * A CAÇA AO CELULAR — 26/08/2026.
 *
 * Contexto medido em produção: 1.392 casas passam o filtro de qualidade e 1.389
 * têm SÓ FIXO. WhatsApp não existe em fixo, então a rodada das 13:10 de 26/08
 * veio `candidates: 0`. Dessas 1.389, 847 têm site — e o WhatsApp está lá, no
 * botão flutuante.
 *
 * O que estes testes travam, em ordem de importância:
 *   1. o CARIMBO sempre gravado, ache ou não — é o que faz a fila andar;
 *   2. o fixo nunca vira `whatsapp_phone`;
 *   3. a ordem de confiança das fontes (wa.me > tel: > texto solto).
 */

var mockUpdate;
var mockEq;
var mockSupabaseAdmin = { from: jest.fn() };

jest.mock('../_lib/supabase', () => ({ supabaseAdmin: mockSupabaseAdmin }));
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
}));

const {
  cacarCelular, cacarCelularPendentes, jaTemCelular,
} = require('../_lib/prospecting/prospect-celular');
const { extrairCelularDoSite } = require('../_lib/prospecting/prospect-extract');

/** Captura o patch enviado ao banco. */
function capturarUpdate() {
  const capturado = {};
  mockEq = jest.fn().mockResolvedValue({ error: null });
  mockUpdate = jest.fn().mockImplementation((patch) => {
    capturado.patch = patch;
    return { eq: mockEq };
  });
  mockSupabaseAdmin.from.mockReturnValue({ update: mockUpdate });
  return capturado;
}

const leadBase = (over = {}) => ({
  id: 'lead-1',
  name: 'Cantina do Zé',
  website: 'https://cantinadoze.com.br',
  whatsapp_phone: '+551133334444', // FIXO — é o caso real dos 1.389
  address: 'Rua X, São Paulo',
  enrich_status: { cnpj: 'missing' },
  ...over,
});

beforeEach(() => jest.clearAllMocks());

describe('extrairCelularDoSite — ordem de confiança', () => {
  it('prefere wa.me a qualquer outra coisa na página', () => {
    // A página tem os três; o wa.me é o único que PROVA que o canal é WhatsApp.
    const html = `
      <a href="tel:+551133334444">fixo</a>
      <p>Reservas: (11) 97777-1111</p>
      <a href="https://wa.me/5511988887777">WhatsApp</a>`;
    expect(extrairCelularDoSite(html)).toEqual({ numero: '+5511988887777', fonte: 'wa_link' });
  });

  it('cai para tel: quando não há link de WhatsApp', () => {
    const html = '<a href="tel:11 96666-5555">chame</a><p>ou (11) 3333-4444</p>';
    expect(extrairCelularDoSite(html)).toEqual({ numero: '+5511966665555', fonte: 'tel_href' });
  });

  it('aceita api.whatsapp.com/send?phone=', () => {
    const html = '<a href="https://api.whatsapp.com/send?phone=5521998887777&text=oi">';
    expect(extrairCelularDoSite(html)).toEqual({ numero: '+5521998887777', fonte: 'wa_link' });
  });

  /**
   * O fixo é EXATAMENTE o que já temos e o que não serve. Uma página que só
   * tem fixo precisa devolver null, não o fixo.
   */
  it('nunca devolve fixo', () => {
    expect(extrairCelularDoSite('<a href="tel:1133334444">ligue</a>')).toBeNull();
    expect(extrairCelularDoSite('<a href="https://wa.me/551133334444">')).toBeNull();
    expect(extrairCelularDoSite('Telefone: (11) 3333-4444')).toBeNull();
  });

  it('não confunde CNPJ, CEP nem preço com telefone', () => {
    expect(extrairCelularDoSite('CNPJ 12.345.678/0001-90 — CEP 04567-000 — R$ 99,90')).toBeNull();
  });

  it('rejeita DDD que não existe', () => {
    expect(extrairCelularDoSite('<a href="https://wa.me/5500999998888">')).toBeNull();
  });

  it('página vazia ou nula não explode', () => {
    expect(extrairCelularDoSite('')).toBeNull();
    expect(extrairCelularDoSite(null)).toBeNull();
    expect(extrairCelularDoSite(undefined)).toBeNull();
  });

  it('não vaza lastIndex entre chamadas (regex global reusada)', () => {
    const html = '<a href="https://wa.me/5511988887777">';
    expect(extrairCelularDoSite(html)).toEqual(extrairCelularDoSite(html));
  });
});

describe('cacarCelular — o que vai para o banco', () => {
  it('troca o fixo pelo celular achado e marca a fonte', async () => {
    const cap = capturarUpdate();
    const lerPagina = jest.fn().mockResolvedValue('<a href="https://wa.me/5511988887777">zap</a>');

    const r = await cacarCelular(leadBase(), lerPagina);

    expect(r).toEqual({ ok: true, numero: '+5511988887777', fonte: 'wa_link' });
    expect(cap.patch.whatsapp_phone).toBe('+5511988887777');
    expect(cap.patch.whatsapp_source).toBe('site_wa_link');
    // 'pending', não 'found': ainda não sabemos se o número tem WhatsApp. Quem
    // descobre é o primeiro envio (131026 → 'missing' pelo handler de recibos).
    expect(cap.patch.whatsapp_status).toBe('pending');
  });

  /**
   * O TESTE QUE MAIS IMPORTA. Sem o carimbo, a rodada seguinte relê exatamente
   * as mesmas páginas, para sempre, e nenhum lead novo é tentado — sem erro,
   * sem log, sem sintoma. É a fome de fila que este projeto já teve três vezes
   * (arquivamento 12/08, pontuação 13/08, enrich 24/08).
   */
  it('carimba site_wa_at MESMO quando não acha nada', async () => {
    const cap = capturarUpdate();
    const r = await cacarCelular(leadBase(), jest.fn().mockResolvedValue('<p>sem telefone</p>'));

    expect(r.ok).toBe(false);
    expect(cap.patch.enrich_status.site_wa).toBe('missing');
    expect(cap.patch.enrich_status.site_wa_at).toEqual(expect.any(String));
    // E não mexe no telefone quando não achou.
    expect(cap.patch).not.toHaveProperty('whatsapp_phone');
  });

  it('carimba também quando o scrape falha', async () => {
    const cap = capturarUpdate();
    const r = await cacarCelular(leadBase(), jest.fn().mockRejectedValue(new Error('502')));

    expect(r).toEqual({ ok: false, motivo: 'sem_html' });
    expect(cap.patch.enrich_status.site_wa_at).toEqual(expect.any(String));
  });

  it('preserva o resto do enrich_status (não pisa no trabalho do CNPJ)', async () => {
    const cap = capturarUpdate();
    await cacarCelular(
      leadBase({ enrich_status: { cnpj: 'ok', dono: 'ok', attempted_at: '2026-08-01T00:00:00Z' } }),
      jest.fn().mockResolvedValue(''));

    expect(cap.patch.enrich_status.cnpj).toBe('ok');
    expect(cap.patch.enrich_status.dono).toBe('ok');
    expect(cap.patch.enrich_status.attempted_at).toBe('2026-08-01T00:00:00Z');
  });
});

describe('jaTemCelular', () => {
  it('reconhece celular e recusa fixo', () => {
    expect(jaTemCelular({ whatsapp_phone: '+5511988887777' })).toBe(true);
    expect(jaTemCelular({ whatsapp_phone: '+551133334444' })).toBe(false);
    expect(jaTemCelular({ whatsapp_phone: null })).toBe(false);
    expect(jaTemCelular({})).toBe(false);
  });
});

describe('cacarCelularPendentes', () => {
  it('recusa rodar sem o leitor de página injetado', async () => {
    const r = await cacarCelularPendentes({});
    expect(r.erro).toBe('lerPagina obrigatório');
    expect(r.processados).toBe(0);
  });
});

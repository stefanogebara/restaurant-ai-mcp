'use strict';

/**
 * Sonda da escada de follow-up (touches 2, 3, 4).
 *
 * Separada da intro porque falha diferente. A intro é manual e tem fallback de
 * env; a escada roda sozinha no cron a cada 15 min e tem um modo de falha que
 * não aparece em lugar nenhum: sem template ativo pro touch, o sequencer zera o
 * `next_touch_at` do lead (sequencer.js:266-275) e ele sai da sequência PARA
 * SEMPRE — com um logger.warn que ninguém lê.
 *
 * O outro modo é mais comum e igualmente silencioso: `pickTemplate` só olha a
 * flag `active` do registro, nunca a Meta. Um template ativo e não aprovado
 * passa pela escolha e só morre no envio.
 */

const { sondarTemplatesSequencia, NIVEIS } = require('../_lib/integration-probes');

const TOKEN = 'EAAtokenfalsoparateste';

const metaCom = (templates) => jest.fn(async () => ({
  ok: true, json: async () => ({ data: templates }),
}));

const aprovado = (name) => ({ name, status: 'APPROVED', language: 'pt_BR' });

/** Registro por touch. `porTouch` = { 2: [...], 3: [...], 4: [...] }. */
const store = (porTouch) => ({
  listTemplates: async (touch) => porTouch[touch] || [],
});

const T = (name, active = true) => ({ variant_label: 'A', meta_template_name: name, active });

const ESCADA_OK = { 2: [T('olimpia_toque2')], 3: [T('olimpia_toque3')], 4: [T('olimpia_resgate')] };
const META_OK = [aprovado('olimpia_toque2'), aprovado('olimpia_toque3'), aprovado('olimpia_resgate')];

let fetchOriginal;
beforeEach(() => { fetchOriginal = global.fetch; });
afterEach(() => { global.fetch = fetchOriginal; });

describe('escada saudável', () => {
  test('os três touches ativos e aprovados dão ok', async () => {
    global.fetch = metaCom(META_OK);
    const r = await sondarTemplatesSequencia(
      { WHATSAPP_ACCESS_TOKEN: TOKEN, PROSPECTING_DRY_RUN: 'false' },
      { store: store(ESCADA_OK) },
    );
    expect(r.nivel).toBe(NIVEIS.OK);
    expect(r.escada).toHaveLength(3);
    expect(r.escada.every((e) => e.estado === 'ok')).toBe(true);
  });

  test('sem token não faz I/O nenhum — só "não configurado"', async () => {
    global.fetch = jest.fn();
    const r = await sondarTemplatesSequencia({}, { store: store(ESCADA_OK) });
    expect(r.nivel).toBe(NIVEIS.NAO_CONFIGURADO);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('modo de falha 1: touch sem template ativo (encerra a sequência)', () => {
  test('touch 3 vazio vira falha e o detalhe explica a consequência', async () => {
    global.fetch = metaCom(META_OK);
    const r = await sondarTemplatesSequencia(
      { WHATSAPP_ACCESS_TOKEN: TOKEN, PROSPECTING_DRY_RUN: 'false' },
      { store: store({ ...ESCADA_OK, 3: [] }) },
    );
    expect(r.nivel).toBe(NIVEIS.FALHA);
    expect(r.detalhe).toMatch(/SEM template ativo no touch 3/);
    // O detalhe precisa dizer o que acontece, não só que falta template: quem
    // lê tem que entender que leads estão saindo da escada agora.
    expect(r.detalhe).toMatch(/ENCERRADA em silêncio/);
    expect(r.escada.find((e) => e.touch === 3).estado).toBe('sem template ativo');
  });

  test('touch inativo (active=false) conta como sem template', async () => {
    global.fetch = metaCom(META_OK);
    const r = await sondarTemplatesSequencia(
      { WHATSAPP_ACCESS_TOKEN: TOKEN, PROSPECTING_DRY_RUN: 'false' },
      { store: store({ ...ESCADA_OK, 4: [T('olimpia_resgate', false)] }) },
    );
    expect(r.nivel).toBe(NIVEIS.FALHA);
    expect(r.detalhe).toMatch(/touch 4/);
  });
});

describe('modo de falha 2: ativo mas não aprovado na Meta', () => {
  test('template ativo ausente da Meta vira falha', async () => {
    // Exatamente o caso da variante C hoje: active=true no registro, inexistente
    // na Meta. pickTemplate escolhe, o envio morre.
    global.fetch = metaCom([aprovado('olimpia_toque2'), aprovado('olimpia_resgate')]);
    const r = await sondarTemplatesSequencia(
      { WHATSAPP_ACCESS_TOKEN: TOKEN, PROSPECTING_DRY_RUN: 'false' },
      { store: store(ESCADA_OK) },
    );
    expect(r.nivel).toBe(NIVEIS.FALHA);
    expect(r.detalhe).toMatch(/não aprovado na Meta em 3:olimpia_toque3/);
  });

  test('PENDING não conta como aprovado', async () => {
    global.fetch = metaCom([
      aprovado('olimpia_toque2'),
      { name: 'olimpia_toque3', status: 'PENDING', language: 'pt_BR' },
      aprovado('olimpia_resgate'),
    ]);
    const r = await sondarTemplatesSequencia(
      { WHATSAPP_ACCESS_TOKEN: TOKEN, PROSPECTING_DRY_RUN: 'false' },
      { store: store(ESCADA_OK) },
    );
    expect(r.nivel).toBe(NIVEIS.FALHA);
  });

  test('um ativo ruim entre vários já é problema (pickTemplate sorteia)', async () => {
    // Com dois ativos no touch 2 e um deles não aprovado, parte dos envios
    // falha — a sonda não pode dizer "ok" porque o outro está bom.
    global.fetch = metaCom(META_OK);
    const r = await sondarTemplatesSequencia(
      { WHATSAPP_ACCESS_TOKEN: TOKEN, PROSPECTING_DRY_RUN: 'false' },
      { store: store({ ...ESCADA_OK, 2: [T('olimpia_toque2'), T('olimpia_toque2_b')] }) },
    );
    expect(r.nivel).toBe(NIVEIS.FALHA);
    expect(r.escada.find((e) => e.touch === 2).nao_aprovados).toEqual(['olimpia_toque2_b']);
  });
});

describe('severidade acompanha o dry-run', () => {
  test('mesmo problema com dry-run ligado é atenção, não falha', async () => {
    // Com dry-run o dispatch retorna antes de tocar no lead (sequencer.js:248),
    // então nada está acontecendo: é aviso de configuração.
    global.fetch = metaCom(META_OK);
    const r = await sondarTemplatesSequencia(
      { WHATSAPP_ACCESS_TOKEN: TOKEN, PROSPECTING_DRY_RUN: 'true' },
      { store: store({ ...ESCADA_OK, 3: [] }) },
    );
    expect(r.nivel).toBe(NIVEIS.ATENCAO);
    expect(r.detalhe).toMatch(/inócuo/);
  });
});

describe('o token nunca vaza', () => {
  test('erro da Meta que ecoa o token sai redigido', async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      json: async () => ({ error: { message: `Invalid OAuth ${TOKEN}xxxxxxxxxxxxxxxxxxxxxxxxxx` } }),
    }));
    const r = await sondarTemplatesSequencia(
      { WHATSAPP_ACCESS_TOKEN: TOKEN },
      { store: store(ESCADA_OK) },
    );
    expect(r.nivel).toBe(NIVEIS.FALHA);
    expect(r.detalhe).not.toContain('EAAtokenfalso');
    expect(r.detalhe).toContain('[redigido]');
  });
});

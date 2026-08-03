'use strict';

/**
 * Sonda do template de intro: qual sairia, e a Meta aprovou?
 *
 * A pergunta que originou isto (30/jul): "que template está em
 * PROSPECTING_INTRO_TEMPLATE?" — não respondível de fora, porque a variável
 * está Sensitive na Vercel (nem `env pull` nem painel mostram).
 *
 * O que estes testes prendem é a distinção que engana: desativar a última
 * variante do registro NÃO desliga o envio, arma o fallback de env
 * (sequencer.js:63-77). Uma sonda que dissesse só "nenhuma ativa" esconderia
 * justamente o template que sairia.
 */

const { sondarTemplateIntro, NIVEIS } = require('../_lib/integration-probes');

const TOKEN = 'EAAtokenfalsoparateste';

// "Ao vivo" exige DUAS coisas: a flag em 'false' E um número de origem
// provisionado. Antes a sonda olhava só a flag, e por isso reportava envio
// ao vivo num ambiente que não tinha por onde mandar. O fixture explicita as
// duas — é a mesma régua que o sequencer usa pra decidir se manda de verdade.
const AO_VIVO = {
  WHATSAPP_ACCESS_TOKEN: TOKEN,
  PROSPECTING_DRY_RUN: 'false',
  PROSPECTING_PHONE_NUMBER_ID: '999999999',
};

function fetchMeta(templates) {
  return jest.fn(async () => ({
    ok: true,
    json: async () => ({ data: templates }),
  }));
}

const store = (ativas) => ({ listTemplates: async () => ativas });

const V = (label, name, active) => ({ variant_label: label, meta_template_name: name, active });

let fetchOriginal;
beforeEach(() => { fetchOriginal = global.fetch; });
afterEach(() => { global.fetch = fetchOriginal; });

describe('de onde vem o template escolhido', () => {
  test('com variante ativa no registro, usa o registro e IGNORA o env', async () => {
    global.fetch = fetchMeta([{ name: 'olimpia_intro_c', status: 'APPROVED', language: 'pt_BR' }]);
    const r = await sondarTemplateIntro(
      { WHATSAPP_ACCESS_TOKEN: TOKEN, PROSPECTING_INTRO_TEMPLATE: 'olimpia_intro' },
      { store: store([V('C', 'olimpia_intro_c', true)]) },
    );
    expect(r.origem).toBe('registro');
    expect(r.escolhido).toBe('olimpia_intro_c');
    expect(r.nivel).toBe(NIVEIS.OK);
  });

  test('SEM variante ativa, cai no env — e a sonda diz o nome', async () => {
    // O caso que motivou a sonda: registro zerado não significa "nada sai".
    global.fetch = fetchMeta([{ name: 'olimpia_intro', status: 'APPROVED', language: 'pt_BR' }]);
    const r = await sondarTemplateIntro(
      { WHATSAPP_ACCESS_TOKEN: TOKEN, PROSPECTING_INTRO_TEMPLATE: 'olimpia_intro' },
      { store: store([V('C', 'olimpia_intro_c', false)]) },
    );
    expect(r.origem).toBe('env (fallback)');
    expect(r.escolhido).toBe('olimpia_intro');
    expect(r.template_do_env).toBe('olimpia_intro');
    expect(r.nivel).toBe(NIVEIS.OK);
  });

  test('sem ativa e sem env, avisa que a intro não sai', async () => {
    global.fetch = fetchMeta([]);
    const r = await sondarTemplateIntro(
      { WHATSAPP_ACCESS_TOKEN: TOKEN },
      { store: store([]) },
    );
    expect(r.nivel).toBe(NIVEIS.ATENCAO);
    expect(r.detalhe).toMatch(/não sai/i);
  });
});

describe('status na Meta do template que sairia', () => {
  test('template inexistente na Meta com dry-run DESLIGADO é falha', async () => {
    global.fetch = fetchMeta([{ name: 'outro_qualquer', status: 'APPROVED', language: 'pt_BR' }]);
    const r = await sondarTemplateIntro(
      AO_VIVO,
      { store: store([V('C', 'olimpia_intro_c', true)]) },
    );
    expect(r.nivel).toBe(NIVEIS.FALHA);
    expect(r.detalhe).toMatch(/NÃO EXISTE/);
  });

  test('mesmo caso com dry-run LIGADO vira atenção, não falha', async () => {
    // Nada sai, então é aviso de configuração — não incidente em curso.
    // Pintar de vermelho o que não está quebrado treina a ignorar vermelho.
    global.fetch = fetchMeta([]);
    const r = await sondarTemplateIntro(
      { WHATSAPP_ACCESS_TOKEN: TOKEN, PROSPECTING_DRY_RUN: 'true' },
      { store: store([V('C', 'olimpia_intro_c', true)]) },
    );
    expect(r.nivel).toBe(NIVEIS.ATENCAO);
    expect(r.detalhe).toMatch(/inócuo/);
  });

  test('template existente mas PENDING não conta como aprovado', async () => {
    global.fetch = fetchMeta([{ name: 'olimpia_intro_c', status: 'PENDING', language: 'pt_BR' }]);
    const r = await sondarTemplateIntro(
      AO_VIVO,
      { store: store([V('C', 'olimpia_intro_c', true)]) },
    );
    expect(r.nivel).toBe(NIVEIS.FALHA);
    expect(r.status_na_meta).toEqual(['pt_BR:PENDING']);
  });

  test('flag em false SEM número provisionado não é "ao vivo"', async () => {
    // O defeito original: a sonda olhava só a flag e reportava dry_run=false
    // — painel dizendo "disparo ao vivo" num ambiente sem por onde mandar, e
    // pintando de VERMELHO um problema que o dispatch nem alcançaria.
    global.fetch = fetchMeta([]);
    const r = await sondarTemplateIntro(
      { WHATSAPP_ACCESS_TOKEN: TOKEN, PROSPECTING_DRY_RUN: 'false' },
      { store: store([V('C', 'olimpia_intro_c', true)]) },
    );
    expect(r.dry_run).toBe(true);
    expect(r.nivel).toBe(NIVEIS.ATENCAO);
  });

  test('aprovado com dry-run ligado diz as duas coisas', async () => {
    global.fetch = fetchMeta([{ name: 'olimpia_intro_c', status: 'APPROVED', language: 'pt_BR' }]);
    const r = await sondarTemplateIntro(
      { WHATSAPP_ACCESS_TOKEN: TOKEN, PROSPECTING_DRY_RUN: 'true' },
      { store: store([V('C', 'olimpia_intro_c', true)]) },
    );
    expect(r.nivel).toBe(NIVEIS.OK);
    expect(r.detalhe).toMatch(/aprovado/);
    expect(r.detalhe).toMatch(/dry-run ligado/);
  });
});

describe('o token nunca vaza', () => {
  test('erro da Meta que ecoa o token sai redigido', async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      json: async () => ({ error: { message: `Invalid OAuth token ${TOKEN}xxxxxxxxxxxxxxxxxxxxxxxx` } }),
    }));
    const r = await sondarTemplateIntro(
      { WHATSAPP_ACCESS_TOKEN: TOKEN },
      { store: store([V('C', 'olimpia_intro_c', true)]) },
    );
    expect(r.nivel).toBe(NIVEIS.FALHA);
    expect(r.detalhe).not.toContain('EAAtokenfalso');
    expect(r.detalhe).toContain('[redigido]');
  });
});

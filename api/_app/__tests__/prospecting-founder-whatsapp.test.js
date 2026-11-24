'use strict';

/**
 * Toque do fundador por WhatsApp (Fase 2).
 *
 * O teste mais importante deste arquivo não é sobre texto: é sobre CANAL. Se o
 * WhatsApp fosse um cron paralelo ao de e-mail, um lead em handoff com endereço
 * receberia os dois — o contato duplicado que quase pegou o Dinho's em 09/08.
 * A exclusão mútua precisa ser uma propriedade da função, não uma coincidência
 * entre dois crons.
 */

const {
  canalDoFundador, introDevida, followupDevido, janelaAbertaEm,
  parametrosTemplate, textoLivreDoFundador, eventoDeIntro, eventoDeFollowup,
  INTRO_MARKER, FOLLOWUP_MARKER, TEMPLATE_INTRO, TEMPLATE_LANG, FOLLOWUP_ESPERA_MS,
} = require('../_lib/prospecting/founder-whatsapp');
const { lintOutbound } = require('../_lib/prospecting/claim-linter');

const AGORA = Date.parse('2026-08-11T18:00:00.000Z');
const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;

const LEAD_WA = { id: 'l1', name: 'Bario Bar', owner_name: 'Leo', whatsapp_phone: '+5511915167135' };

function intro(msAtras) {
  return { direcao: 'sys', corpo: eventoDeIntro('template'), created_at: new Date(AGORA - msAtras).toISOString() };
}
function inbound(msAtras, corpo = 'oi') {
  return { direcao: 'in', corpo, created_at: new Date(AGORA - msAtras).toISOString() };
}

describe('um canal por lead, e a exclusão é estrutural', () => {
  test('lead com e-mail vai por e-mail, mesmo tendo telefone', () => {
    expect(canalDoFundador({ ...LEAD_WA, prospect_email: 'compras@bario.com.br' })).toBe('email');
  });

  test('lead só com telefone vai por WhatsApp', () => {
    expect(canalDoFundador(LEAD_WA)).toBe('whatsapp');
  });

  test('lead sem nenhum contato não tem canal', () => {
    expect(canalDoFundador({ id: 'x' })).toBeNull();
    expect(canalDoFundador(null)).toBeNull();
  });

  test('a intro por WhatsApp NUNCA sai para quem tem e-mail', () => {
    // Esta é a defesa contra o contato duplicado. Se ela cair, um lead recebe
    // proposta por e-mail e intro por WhatsApp no mesmo dia.
    const r = introDevida({
      lead: { ...LEAD_WA, prospect_email: 'compras@bario.com.br' }, historico: [], nowMs: AGORA,
    });
    expect(r.devido).toBe(false);
    expect(r.motivo).toBe('canal_nao_e_whatsapp');
  });
});

describe('introDevida', () => {
  test('lead novo só com telefone: devido', () => {
    const r = introDevida({ lead: LEAD_WA, historico: [], nowMs: AGORA });
    expect(r.devido).toBe(true);
    expect(r.motivo).toBe('handoff_sem_toque_do_fundador');
  });

  test('sem nome da casa NÃO sai, em vez de inventar {{2}}', () => {
    // Lição de 10/08: campo que alimenta mensagem de produção nunca recebe
    // placeholder inventado. Aqui isso significa não enviar.
    const r = introDevida({ lead: { ...LEAD_WA, name: '  ' }, historico: [], nowMs: AGORA });
    expect(r.devido).toBe(false);
    expect(r.motivo).toBe('lead_sem_nome');
  });

  test('uma intro por lead, para sempre', () => {
    const r = introDevida({ lead: LEAD_WA, historico: [intro(10 * DIA)], nowMs: AGORA });
    expect(r.motivo).toBe('intro_ja_enviada');
  });

  test('reporta se a janela de 24h está aberta, para o chamador escolher o modo', () => {
    const comJanela = introDevida({ lead: LEAD_WA, historico: [inbound(2 * HORA)], nowMs: AGORA });
    expect(comJanela.janelaAberta).toBe(true);

    const semJanela = introDevida({ lead: LEAD_WA, historico: [inbound(40 * HORA)], nowMs: AGORA });
    expect(semJanela.janelaAberta).toBe(false);
  });
});

describe('janela de 24h', () => {
  test('inbound recente abre, inbound velho fecha, sem inbound nunca abre', () => {
    expect(janelaAbertaEm([inbound(1 * HORA)], AGORA)).toBe(true);
    expect(janelaAbertaEm([inbound(23 * HORA)], AGORA)).toBe(true);
    expect(janelaAbertaEm([inbound(25 * HORA)], AGORA)).toBe(false);
    expect(janelaAbertaEm([], AGORA)).toBe(false);
  });

  test('mensagem de saída não abre janela (só inbound abre)', () => {
    const historico = [{ direcao: 'out', corpo: 'oi', created_at: new Date(AGORA - HORA).toISOString() }];
    expect(janelaAbertaEm(historico, AGORA)).toBe(false);
  });
});

describe('followupDevido no WhatsApp', () => {
  test('silêncio depois da espera: devido', () => {
    expect(followupDevido({ historico: [intro(5 * DIA)], nowMs: AGORA }).devido).toBe(true);
  });

  test('cedo demais não cobra', () => {
    expect(followupDevido({ historico: [intro(1 * DIA)], nowMs: AGORA }).motivo).toBe('cedo_demais');
  });

  test('sem intro não existe follow-up', () => {
    expect(followupDevido({ historico: [], nowMs: AGORA }).motivo).toBe('intro_nunca_enviada');
  });

  test('inbound depois da intro cancela — e aqui o silêncio é FATO, não suposição', () => {
    // Diferente do e-mail: o inbound de WhatsApp chega pelo webhook, então o
    // sistema observa a resposta em vez de deduzir que não houve.
    const historico = [intro(6 * DIA), inbound(5 * DIA, 'vou ver com o sócio')];
    expect(followupDevido({ historico, nowMs: AGORA }).motivo).toBe('lead_respondeu');
  });

  test('um follow-up por lead', () => {
    const historico = [
      intro(20 * DIA),
      { direcao: 'sys', corpo: eventoDeFollowup('template'), created_at: new Date(AGORA - 15 * DIA).toISOString() },
    ];
    expect(followupDevido({ historico, nowMs: AGORA }).motivo).toBe('followup_ja_enviado');
  });

  test('a espera padrão é a mesma do e-mail', () => {
    expect(FOLLOWUP_ESPERA_MS).toBe(4 * DIA);
  });
});

describe('parâmetros do template', () => {
  test('ordem {{1}} nome da pessoa, {{2}} nome da casa', () => {
    expect(parametrosTemplate(LEAD_WA)).toEqual(['Leo', 'Bario Bar']);
  });

  test('sem nome da pessoa cai em saudação natural, não em vazio', () => {
    // O template abre com "Oi {{1}}!", então vira "Oi tudo bem!". Variável
    // vazia a Meta rejeita, e "Oi !" seria pior que genérico.
    expect(parametrosTemplate({ ...LEAD_WA, owner_name: null })).toEqual(['tudo bem', 'Bario Bar']);
  });

  test('owner_name lixo não vira saudação', () => {
    for (const lixo of ['(11)', '-', '99999']) {
      expect(parametrosTemplate({ ...LEAD_WA, owner_name: lixo })[0]).toBe('tudo bem');
    }
  });

  test('sem nome da casa devolve null (o chamador não envia)', () => {
    expect(parametrosTemplate({ ...LEAD_WA, name: '' })).toBeNull();
    expect(parametrosTemplate(null)).toBeNull();
  });

  test('nome do template e idioma batem com o que foi aprovado na Meta', () => {
    expect(TEMPLATE_INTRO).toBe('racha_fundador_intro');
    expect(TEMPLATE_LANG).toBe('pt_BR');
  });
});

describe('texto livre dentro da janela', () => {
  test('reusa o founderClose do perfil, não uma segunda cópia da copy', () => {
    // Duas cópias da mensagem do fundador foi exatamente o defeito que produziu
    // o incidente da gorjeta: uma foi corrigida e a outra não.
    const { getProfile } = require('../_lib/prospecting/prospect-product');
    const esperado = getProfile().founderClose({ founderName: 'Stefano', ownerName: 'Leo' });
    expect(textoLivreDoFundador(LEAD_WA, { founderName: 'Stefano' })).toBe(esperado);
  });

  test('passa limpo no claim-linter', () => {
    expect(lintOutbound(textoLivreDoFundador(LEAD_WA)).violations).toEqual([]);
  });

  test('sem nome da pessoa não injeta nome inventado', () => {
    const texto = textoLivreDoFundador({ ...LEAD_WA, owner_name: '(11)' });
    expect(texto).not.toContain('(11)');
    expect(texto).toMatch(/^Oi! Aqui é o/);
  });
});

describe('marcadores', () => {
  test('começam com o prefixo que a idempotência procura', () => {
    expect(eventoDeIntro('template').startsWith(INTRO_MARKER)).toBe(true);
    expect(eventoDeFollowup('livre').startsWith(FOLLOWUP_MARKER)).toBe(true);
  });

  test('registram por qual modo saiu (template ou texto livre)', () => {
    // Sem isso o histórico não distingue "falei dentro da janela" de "usei
    // template", e é a primeira coisa que se pergunta quando a Meta reclama.
    expect(eventoDeIntro('template')).toContain('template');
    expect(eventoDeIntro('livre')).toContain('livre');
  });
});

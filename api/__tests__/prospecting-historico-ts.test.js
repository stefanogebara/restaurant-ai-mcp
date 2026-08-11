'use strict';

/**
 * O instante da mensagem, na FORMA REAL que loadHistory devolve.
 *
 * ACHADO EM PRODUÇÃO (11/08/2026): loadHistory seleciona
 * `direcao, corpo, tipo, enviada_em, wamid` — sem `created_at`. Toda a camada
 * pura lia `m.created_at`, virava NaN, e três coisas quebravam em silêncio:
 * follow-up por e-mail nunca disparava, a idempotência da intro por WhatsApp
 * cairia (intro repetida a cada rodada), e o cooldown do aviso cairia junto.
 *
 * Meus testes não pegaram porque as fixtures que EU inventei preenchiam
 * created_at. Testei o contrato que imaginei, não o que a função devolve.
 *
 * Por isso este arquivo usa a forma de loadHistory como padrão, e trata
 * created_at como o caso especial — invertendo o viés que causou o defeito.
 */

const {
  tsDaMensagem, ultimoMarcadorMs, ultimoInboundMs, houveInboundApos,
} = require('../_lib/prospecting/historico-ts');
const { followupDevido: followupEmail } = require('../_lib/prospecting/founder-email');
const { eventoDeEnvio } = require('../_lib/prospecting/founder-email');
const wa = require('../_lib/prospecting/founder-whatsapp');
const { deveAvisarFundador, eventoDeAviso } = require('../_lib/prospecting/founder-alert');

const AGORA = Date.parse('2026-08-11T18:00:00.000Z');
const DIA = 24 * 60 * 60 * 1000;

/** Linha EXATAMENTE como loadHistory devolve: enviada_em, sem created_at. */
function linhaReal({ direcao = 'sys', corpo = '', diasAtras = 0 }) {
  return {
    direcao,
    corpo,
    tipo: 'evento',
    wamid: null,
    enviada_em: new Date(AGORA - diasAtras * DIA).toISOString(),
  };
}

describe('tsDaMensagem lê os dois campos', () => {
  test('a forma de loadHistory (enviada_em) funciona', () => {
    expect(tsDaMensagem(linhaReal({ diasAtras: 1 }))).toBe(AGORA - DIA);
  });

  test('created_at continua funcionando para quem lê a tabela direto', () => {
    expect(tsDaMensagem({ created_at: '2026-08-10T18:00:00.000Z' })).toBe(AGORA - DIA);
  });

  test('sem instante nenhum devolve null, não NaN', () => {
    // NaN era o bug: passava adiante e virava comparação sempre falsa.
    expect(tsDaMensagem({})).toBeNull();
    expect(tsDaMensagem(null)).toBeNull();
    expect(tsDaMensagem({ enviada_em: 'lixo' })).toBeNull();
  });
});

describe('os leitores funcionam com a forma real', () => {
  const marcador = '📧 proposta enviada por e-mail';

  test('ultimoMarcadorMs acha o marcador sem created_at', () => {
    const h = [linhaReal({ corpo: `${marcador}: x@y.com`, diasAtras: 5 })];
    expect(ultimoMarcadorMs(h, marcador)).toBe(AGORA - 5 * DIA);
  });

  test('ultimoInboundMs e houveInboundApos idem', () => {
    const h = [linhaReal({ direcao: 'in', corpo: 'oi', diasAtras: 2 })];
    expect(ultimoInboundMs(h)).toBe(AGORA - 2 * DIA);
    expect(houveInboundApos(h, AGORA - 3 * DIA)).toBe(true);
    expect(houveInboundApos(h, AGORA - 1 * DIA)).toBe(false);
  });
});

// ------------------------------------------------ o bug, reproduzido de ponta a ponta
describe('regressão: o caso real do Bario Bar', () => {
  // Produção respondeu "proposta_nunca_enviada" para um lead que RECEBEU a
  // proposta em 09/08 e tem o marcador gravado. Esta é a linha daquele lead.
  const historicoDoBario = [
    linhaReal({ direcao: 'out', corpo: 'Tranquilo, Leo!', diasAtras: 7 }),
    linhaReal({ direcao: 'in', corpo: 'Muito obrigado, Olímpia!', diasAtras: 7 }),
    linhaReal({ corpo: eventoDeEnvio('compras@bario.com.br'), diasAtras: 2 }),
  ];

  test('follow-up por e-mail volta a enxergar a proposta enviada', () => {
    const r = followupEmail({ historico: historicoDoBario, nowMs: AGORA });
    expect(r.motivo).not.toBe('proposta_nunca_enviada');
    expect(r.motivo).toBe('cedo_demais'); // 2 dias < espera de 4
  });

  test('e dispara quando a espera cumpre', () => {
    const antigo = [linhaReal({ corpo: eventoDeEnvio('compras@bario.com.br'), diasAtras: 6 })];
    expect(followupEmail({ historico: antigo, nowMs: AGORA }).devido).toBe(true);
  });
});

describe('regressão: a intro por WhatsApp não pode repetir', () => {
  // Sem enxergar o marcador, introDevida diria "devido" a cada rodada e o mesmo
  // lead receberia a intro 3x por dia.
  const lead = { id: 'l1', name: 'Massa na Caveira', whatsapp_phone: '+5511911112222' };

  test('marcador na forma real bloqueia a segunda intro', () => {
    const h = [linhaReal({ corpo: wa.eventoDeIntro('template'), diasAtras: 1 })];
    expect(wa.introDevida({ lead, historico: h, nowMs: AGORA }).motivo).toBe('intro_ja_enviada');
  });

  test('janela de 24h volta a ser detectada com enviada_em', () => {
    const recente = [linhaReal({ direcao: 'in', corpo: 'oi', diasAtras: 0.2 })];
    expect(wa.janelaAbertaEm(recente, AGORA)).toBe(true);
    const velho = [linhaReal({ direcao: 'in', corpo: 'oi', diasAtras: 3 })];
    expect(wa.janelaAbertaEm(velho, AGORA)).toBe(false);
  });

  test('follow-up de WhatsApp enxerga a intro e o inbound', () => {
    const h = [
      linhaReal({ corpo: wa.eventoDeIntro('template'), diasAtras: 6 }),
      linhaReal({ direcao: 'in', corpo: 'opa', diasAtras: 5 }),
    ];
    expect(wa.followupDevido({ historico: h, nowMs: AGORA }).motivo).toBe('lead_respondeu');
  });
});

describe('regressão: o cooldown do aviso ao fundador', () => {
  const lead = { id: 'l1', name: 'Bario Bar', prospect_state: 'handoff', whatsapp_phone: '+5511911112222' };

  test('sem cooldown funcional o fundador levaria um alerta por mensagem', () => {
    const h = [linhaReal({ corpo: eventoDeAviso(['whatsapp']), diasAtras: 0.05 })];
    const r = deveAvisarFundador({ lead, texto: 'e aí, dá pra hoje?', historico: h, nowMs: AGORA });
    expect(r.alertar).toBe(false);
    expect(r.motivo).toBe('cooldown');
  });
});

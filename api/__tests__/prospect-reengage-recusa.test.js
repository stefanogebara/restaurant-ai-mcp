'use strict';

/**
 * O resgate (toque 4) não pode reabrir contato com quem já disse não — nem
 * ficar em loop com o robô da casa.
 *
 * INCIDENTE REAL (Restaurante Banzeiro, 03/07 a 02/08/2026): Giovanna recusou
 * TRÊS vezes, a última com todas as letras — "Já havia informado anteriormente
 * que já somos amparados e temos sistemas em operação". Mesmo assim saíram
 * SETE templates de resgate, um a cada ~3 dias.
 *
 * Dois defeitos somados produziram isso:
 *
 *   1. selectDueReengages filtrava estado, silêncio, reunião e soneca — e NADA
 *      sobre a intenção. Lead com last_intent='nao_interessado' parado em
 *      'conversando' seguia elegível para sempre.
 *
 *   2. O guarda "um resgate por silêncio" era `last.tipo === 'template'`, e o
 *      comentário do próprio código dizia: "a new inbound re-arms the cycle".
 *      Só que o inbound que re-armava era o AUTORESPONDER do restaurante
 *      ("Atendente Virtual: Olá! Seja bem-vindo..."), disparado pelo nosso
 *      próprio template. Template → bot responde → ciclo re-armado → 3 dias →
 *      template. Loop infinito alimentado pela máquina do outro lado.
 *
 * Custo: relação queimada e risco de rebaixamento do número pela Meta.
 */

const {
  elegivelParaReengage,
  INTENCOES_DE_RECUSA,
} = require('../_lib/prospecting/prospect-state');

const saudacaoDeBot =
  'Atendente Virtual: Olá! Seja bem-vindo ao Banzeiro São Paulo, onde a Amazônia é servida à mesa com sabor, tradição e criatividade. É um prazer te receber por aqui! Para te ajudar da melhor forma, escolha uma opção.';

const textoOut = { direcao: 'out', tipo: 'texto', corpo: 'Oi! Tudo bem?' };
const humano = (corpo) => ({ direcao: 'in', tipo: 'texto', corpo });

describe('quem já disse não fica fora do resgate', () => {
  test('last_intent = nao_interessado bloqueia, mesmo com tudo o mais em ordem', () => {
    const r = elegivelParaReengage({
      lastIntent: 'nao_interessado',
      ultimaMensagem: textoOut,
      historico: [textoOut, humano('Já possuímos um sistema, obrigada')],
    });
    expect(r).toEqual({ eligible: false, reason: 'ja_recusou' });
  });

  test('a lista de recusa é explícita, não um palpite por substring', () => {
    // Em produção existem 7 valores de intenção. Só `nao_interessado` é recusa;
    // `pessoa_errada` é porteiro — ainda vale tentar achar quem decide.
    expect(INTENCOES_DE_RECUSA.has('nao_interessado')).toBe(true);
    expect(INTENCOES_DE_RECUSA.has('pessoa_errada')).toBe(false);
    expect(INTENCOES_DE_RECUSA.has('pergunta')).toBe(false);
  });

  test('porteiro (pessoa_errada) continua elegível — não é recusa', () => {
    const r = elegivelParaReengage({
      lastIntent: 'pessoa_errada',
      ultimaMensagem: textoOut,
      historico: [textoOut, humano('Vou passar pro responsável')],
    });
    expect(r.eligible).toBe(true);
  });
});

describe('o loop com o robô da casa', () => {
  test('thread onde só o autoresponder falou NÃO re-arma o ciclo', () => {
    // Foi assim que saíram 7 templates: cada um provocava a saudação do bot,
    // que contava como "o lead falou".
    const r = elegivelParaReengage({
      lastIntent: null,
      ultimaMensagem: humano(saudacaoDeBot),
      historico: [
        { direcao: 'out', tipo: 'template', corpo: '[template:olimpia_resgate]' },
        humano(saudacaoDeBot),
        { direcao: 'out', tipo: 'template', corpo: '[template:olimpia_resgate]' },
        humano(saudacaoDeBot),
      ],
    });
    expect(r).toEqual({ eligible: false, reason: 'so_maquina' });
  });

  test('mas UMA fala humana no meio derruba a trava', () => {
    // O gate não pode parquear casa cuja saudação é automática e cujo dono
    // responde em seguida — seria perder lead bom por causa do menu de robô.
    const r = elegivelParaReengage({
      lastIntent: null,
      ultimaMensagem: textoOut,
      historico: [humano(saudacaoDeBot), humano('opa, sou o Marcos, pode falar'), textoOut],
    });
    expect(r.eligible).toBe(true);
  });
});

describe('o que já funcionava não pode quebrar', () => {
  test('último envio sendo template = este silêncio já foi tocado', () => {
    const r = elegivelParaReengage({
      lastIntent: null,
      ultimaMensagem: { direcao: 'out', tipo: 'template', corpo: '[template:olimpia_resgate]' },
      historico: [humano('oi'), { direcao: 'out', tipo: 'template', corpo: '[template:olimpia_resgate]' }],
    });
    expect(r).toEqual({ eligible: false, reason: 'silencio_ja_tocado' });
  });

  test('sem mensagem nenhuma não resgata', () => {
    expect(elegivelParaReengage({ lastIntent: null, ultimaMensagem: null, historico: [] }).eligible).toBe(false);
  });

  test('caso feliz: lead humano em silêncio há 3 dias segue elegível', () => {
    const r = elegivelParaReengage({
      lastIntent: 'pergunta',
      ultimaMensagem: textoOut,
      historico: [humano('quanto custa?'), textoOut],
    });
    expect(r).toEqual({ eligible: true, reason: 'ok' });
  });
});

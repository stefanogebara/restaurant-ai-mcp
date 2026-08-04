/**
 * Precedência do cartão de contato sobre número raspado de menu.
 *
 * CASO REAL (Capim Santo, 04/08/2026): o menu do autoatendimento trouxe o fixo
 * do salão com "reservas" ao lado e o extrator gravou +551130322277. Minutos
 * depois um humano compartilhou o cartão da Adriana (+5511977117070) — e o
 * campo já estava preenchido, então o contato de verdade foi perdido. O lead
 * mais quente do dia apontava para a portaria.
 */

const { extrairNumeroIndicado, escolherDoCartao } = require('../_lib/prospecting/numero-indicado');

const CARTAO_ADRIANA = '[Contato compartilhado: +5511977117070 | nome: Adriana]';
const MENU_CAPIM_SANTO = 'Bem-vindo! Para reservas ligue 11 3032-2277. Horário: 12:00 às 15:00';

describe('cartão de contato', () => {
  it('extrai o número do cartão SEM exigir palavra de roteamento', () => {
    // O cartão é intenção explícita: ninguém compartilha contato por acidente.
    const r = extrairNumeroIndicado(CARTAO_ADRIANA, {});
    expect(r).not.toBeNull();
    expect(r.numero).toBe('+5511977117070');
    expect(r.fonte).toBe('cartao');
  });

  it('prefere CELULAR quando o cartão traz celular e fixo', () => {
    const r = extrairNumeroIndicado('[Contato compartilhado: +551130322277, +5511977117070 | nome: Adriana]', {});
    expect(r.numero).toBe('+5511977117070');
  });

  it('cai no fixo quando o cartão só tem fixo — melhor que nada', () => {
    const r = extrairNumeroIndicado('[Contato compartilhado: +551130322277 | nome: Recepção]', {});
    expect(r.numero).toBe('+551130322277');
    expect(r.fonte).toBe('cartao');
  });

  it('ignora o número do próprio lead dentro do cartão', () => {
    const r = extrairNumeroIndicado(
      '[Contato compartilhado: +5511999990000 | nome: Eu mesmo]',
      { numeroDoLead: '+5511999990000' },
    );
    expect(r).toBeNull();
  });

  it('cartão sem telefone nenhum não inventa número', () => {
    expect(escolherDoCartao(' | nome: Fulano', null)).toBeNull();
  });
});

describe('número raspado de texto continua marcado como fonte fraca', () => {
  it('menu com palavra de roteamento é aceito, mas como fonte=texto', () => {
    const r = extrairNumeroIndicado(MENU_CAPIM_SANTO, {});
    expect(r).not.toBeNull();
    expect(r.numero).toBe('+551130322277');
    expect(r.fonte).toBe('texto');
  });

  it('número solto sem contexto de roteamento continua ignorado', () => {
    expect(extrairNumeroIndicado('somos 11 3032-2277 pessoas na mesa', {})).toBeNull();
  });

  it('horário não vira telefone', () => {
    expect(extrairNumeroIndicado('Reservas: das 12:00 às 15:00', {})).toBeNull();
  });
});

describe('a sequência exata do Capim Santo', () => {
  it('menu grava o fixo; cartão que chega depois traz o celular certo', () => {
    const doMenu = extrairNumeroIndicado(MENU_CAPIM_SANTO, {});
    const doCartao = extrairNumeroIndicado(CARTAO_ADRIANA, {});

    expect(doMenu.numero).toBe('+551130322277');
    expect(doMenu.fonte).toBe('texto');

    expect(doCartao.numero).toBe('+5511977117070');
    expect(doCartao.fonte).toBe('cartao');

    // O chamador (prospect-inbound) usa exatamente esta diferença de fonte
    // para decidir sobrepor. Se as duas voltassem iguais, a decisão seria cega.
    expect(doCartao.fonte).not.toBe(doMenu.fonte);
  });
});

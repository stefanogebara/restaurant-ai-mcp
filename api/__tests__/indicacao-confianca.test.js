'use strict';

/**
 * Um número indicado não é um número verificado.
 *
 * INCIDENTE (04/08/2026): o Capim Santo compartilhou um cartão de contato com
 * nome "Adriana". O payload da Meta veio íntegro, o parser leu certo, e o
 * sistema criou o lead e disparou a intro no mesmo turno. O número não era da
 * Adriana, e uma pessoa que nada tinha a ver com a casa recebeu pitch frio.
 *
 * Nada quebrou. O defeito é a premissa: o código trata "veio num cartão de
 * contato" como "número verificado do decisor". Cartão compartilhado prova a
 * INTENÇÃO de quem enviou, não a CORREÇÃO do dado — quem escolhe o contato na
 * agenda pode escolher errado, e escolheu.
 *
 * Por isso o padrão aqui é CONFIRMAR, não seguir. As cercas automáticas (DDD,
 * colisão) entram como rede secundária, e de propósito: no caso real o número
 * era DDD 11 numa casa de São Paulo e não pertencia a lead nenhum. Nenhuma
 * heurística teria pego. Só perguntar pegaria.
 */

const { avaliarIndicacao } = require('../_lib/prospecting/indicacao');

const CASA = { id: 'lead-casa', name: 'Capim Santo', whatsapp_phone: '+5511981890082' };

describe('avaliarIndicacao: o padrão é perguntar antes de escrever', () => {
  test('cartão comum de terceiro pede confirmação (o caso real de 04/08)', () => {
    const r = avaliarIndicacao({ numeroIndicado: '+5511977117070', leadQueIndicou: CASA });
    expect(r.decisao).toBe('confirmar');
  });

  test('mesmo DDD da casa NÃO dispensa confirmação', () => {
    // O número errado do incidente era DDD 11, igual ao da casa. Uma cerca de
    // DDD teria deixado passar — por isso ela não pode ser a defesa principal.
    const r = avaliarIndicacao({ numeroIndicado: '+5511999998888', leadQueIndicou: CASA });
    expect(r.decisao).toBe('confirmar');
  });

  test('número que já é de OUTRO lead não vira contato: some sem avisar ninguém', () => {
    const r = avaliarIndicacao({
      numeroIndicado: '+5511943643170',
      leadQueIndicou: CASA,
      donoDoNumero: { id: 'outro', name: 'Bráz Trattoria' },
    });
    expect(r.decisao).toBe('recusar');
    expect(r.motivo).toBe('ja_e_de_outro_lead');
  });

  test('a casa apontando o próprio número não gera lead novo', () => {
    const r = avaliarIndicacao({ numeroIndicado: '+5511981890082', leadQueIndicou: CASA });
    expect(r.decisao).toBe('recusar');
    expect(r.motivo).toBe('proprio_numero');
  });

  test('o número do fundador nunca vira lead de prospecção', () => {
    const r = avaliarIndicacao({
      numeroIndicado: '+5511988887777',
      leadQueIndicou: CASA,
      numeroDoFundador: '+5511988887777',
    });
    expect(r.decisao).toBe('recusar');
    expect(r.motivo).toBe('numero_do_fundador');
  });

  test('comparação por dígitos: formato diferente é o mesmo número', () => {
    expect(avaliarIndicacao({ numeroIndicado: '11 98189-0082', leadQueIndicou: CASA }).motivo).toBe('proprio_numero');
    expect(avaliarIndicacao({ numeroIndicado: '5511981890082', leadQueIndicou: CASA }).motivo).toBe('proprio_numero');
  });

  test('entrada faltando recusa em vez de adivinhar', () => {
    expect(avaliarIndicacao({ numeroIndicado: '', leadQueIndicou: CASA }).decisao).toBe('recusar');
    expect(avaliarIndicacao({ numeroIndicado: null, leadQueIndicou: CASA }).decisao).toBe('recusar');
    expect(avaliarIndicacao({ numeroIndicado: '+5511977117070', leadQueIndicou: null }).decisao).toBe('recusar');
  });

  test('a decisão sempre vem com motivo legível (vai pro cockpit)', () => {
    for (const caso of [
      { numeroIndicado: '+5511977117070', leadQueIndicou: CASA },
      { numeroIndicado: '+5511981890082', leadQueIndicou: CASA },
      { numeroIndicado: '', leadQueIndicou: CASA },
    ]) {
      const r = avaliarIndicacao(caso);
      expect(typeof r.motivo).toBe('string');
      expect(r.motivo.length).toBeGreaterThan(0);
    }
  });

  test('nunca devolve "seguir" para indicação de terceiro (não existe atalho)', () => {
    const decisoes = [
      avaliarIndicacao({ numeroIndicado: '+5511977117070', leadQueIndicou: CASA }).decisao,
      avaliarIndicacao({ numeroIndicado: '+5521999998888', leadQueIndicou: CASA }).decisao,
      avaliarIndicacao({ numeroIndicado: '+5511900001111', leadQueIndicou: CASA, nomeIndicado: 'Adriana' }).decisao,
    ];
    expect(decisoes.every((d) => d === 'confirmar')).toBe(true);
  });
});

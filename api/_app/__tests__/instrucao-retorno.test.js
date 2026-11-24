'use strict';

/**
 * `retorno_motivo` era gravado e nunca lido.
 *
 * O agendar_retorno guarda o assunto combinado ("me chama segunda sobre o
 * orçamento"), mas o modo retorno do flush injetava sempre a MESMA instrução
 * genérica de "retomar de onde vocês pararam". Resultado: a agente cumpre o
 * horário prometido e manda uma retomada que não fala do que foi prometido,
 * obrigando o lead a relembrar o assunto. Promessa datada é contrato, e o
 * contrato inclui o ASSUNTO, não só a hora.
 */

const { instrucaoRetorno } = require('../_lib/prospecting/prospect-responder');

describe('instrucaoRetorno: a retomada sabe sobre o que é', () => {
  test('sem motivo, mantém a instrução genérica de retomada', () => {
    const s = instrucaoRetorno(null);
    expect(s).toMatch(/retomar o contato com o lead/);
    expect(s).not.toMatch(/ASSUNTO combinado/);
  });

  test('com motivo, o assunto entra na instrução', () => {
    const s = instrucaoRetorno('pedir o número correto da Adriana');
    expect(s).toMatch(/ASSUNTO combinado era: pedir o número correto da Adriana/);
    expect(s).toMatch(/retomar o contato com o lead/);
  });

  test('motivo em branco é tratado como ausente (não gera assunto vazio)', () => {
    expect(instrucaoRetorno('')).toBe(instrucaoRetorno(null));
    expect(instrucaoRetorno('   ')).toBe(instrucaoRetorno(null));
    expect(instrucaoRetorno(undefined)).toBe(instrucaoRetorno(null));
  });

  test('motivo que não é string não quebra nem vaza objeto na instrução', () => {
    expect(instrucaoRetorno({ a: 1 })).toBe(instrucaoRetorno(null));
    expect(instrucaoRetorno(42)).toBe(instrucaoRetorno(null));
  });

  test('a instrução não ensina travessão ao modelo', () => {
    expect(instrucaoRetorno(null)).not.toMatch(/[—–]/);
    expect(instrucaoRetorno('qualquer assunto')).not.toMatch(/[—–]/);
  });

  test('o motivo é aparado antes de entrar', () => {
    expect(instrucaoRetorno('  o orçamento  ')).toMatch(/ASSUNTO combinado era: o orçamento\./);
  });
});

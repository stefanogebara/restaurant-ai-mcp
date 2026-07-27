'use strict';

/**
 * Fatos de DESCOBERTA na conversa da Olímpia (decisão 2026-07-27: as "10
 * conversas" do mapa de mercado rodam TAMBÉM dentro da prospecção normal).
 *
 * Campos novos no ConversaFatos:
 *   modelo_conta   — 'comanda_individual' | 'conta_mesa' | 'ambos' (a pergunta
 *                    nº 1 do discovery: define se a dor de dividir existe)
 *   dor_pagamento  — lista: dores DITAS sobre a hora de pagar
 *   sistemas       — lista: sistemas que o lead DISSE usar (Tagme, Goomer...)
 *   usa_vr         — clientes pagam com vale-refeição (mata/valida o Racha no almoço)
 *   aceita_reserva — a casa trabalha com reserva (qualifica pro Seatable)
 *
 * Mesmas regras anti-invenção do resto do arquivo: só o que o lead declarou,
 * merge imutável, escalar sobrescreve, lista une com dedup.
 */

const { mergeFatos, coerceFatos, formatarMemoria } = require('../_lib/prospecting/prospect-facts');

describe('coerceFatos — campos de descoberta', () => {
  test('modelo_conta só aceita os três valores do enum', () => {
    expect(coerceFatos({ modelo_conta: 'comanda_individual' }).modelo_conta).toBe('comanda_individual');
    expect(coerceFatos({ modelo_conta: 'conta_mesa' }).modelo_conta).toBe('conta_mesa');
    expect(coerceFatos({ modelo_conta: 'ambos' }).modelo_conta).toBe('ambos');
    // valor inventado pelo modelo não entra — anti-invenção vale pro enum também
    expect(coerceFatos({ modelo_conta: 'planilha' }).modelo_conta).toBeUndefined();
    expect(coerceFatos({ modelo_conta: 42 }).modelo_conta).toBeUndefined();
  });

  test('usa_vr e aceita_reserva só entram como boolean de verdade', () => {
    expect(coerceFatos({ usa_vr: true }).usa_vr).toBe(true);
    expect(coerceFatos({ usa_vr: false }).usa_vr).toBe(false);
    expect(coerceFatos({ usa_vr: 'sim' }).usa_vr).toBeUndefined();
    expect(coerceFatos({ aceita_reserva: true }).aceita_reserva).toBe(true);
    expect(coerceFatos({ aceita_reserva: 'talvez' }).aceita_reserva).toBeUndefined();
  });

  test('dor_pagamento e sistemas são listas limpas (trim, sem vazios)', () => {
    const out = coerceFatos({
      dor_pagamento: ['fila no caixa', '  ', 'garçom preso levando maquininha'],
      sistemas: ['Goomer', '', 'Menew '],
    });
    expect(out.dor_pagamento).toEqual(['fila no caixa', 'garçom preso levando maquininha']);
    expect(out.sistemas).toEqual(['Goomer', 'Menew']);
  });
});

describe('mergeFatos — descoberta acumula sem apagar', () => {
  test('modelo_conta sobrescreve; listas unem com dedup case-insensitive', () => {
    const prev = { modelo_conta: 'comanda_individual', sistemas: ['Goomer'] };
    const out = mergeFatos(prev, { modelo_conta: 'ambos', sistemas: ['goomer', 'Menew'] });
    expect(out.modelo_conta).toBe('ambos');
    expect(out.sistemas).toEqual(['Goomer', 'Menew']);
    // imutabilidade: o prev não foi tocado
    expect(prev.modelo_conta).toBe('comanda_individual');
    expect(prev.sistemas).toEqual(['Goomer']);
  });

  test('merge sem novidade preserva a descoberta anterior', () => {
    const prev = { usa_vr: true, dor_pagamento: ['fila no caixa'] };
    const out = mergeFatos(prev, { notas: ['abre só à noite'] });
    expect(out.usa_vr).toBe(true);
    expect(out.dor_pagamento).toEqual(['fila no caixa']);
  });

  test('usa_vr=false posterior sobrescreve true (o lead corrigiu)', () => {
    const out = mergeFatos({ usa_vr: true }, { usa_vr: false });
    expect(out.usa_vr).toBe(false);
  });
});

describe('formatarMemoria — a Olímpia não pergunta duas vezes', () => {
  test('descoberta aparece na memória do prompt', () => {
    const linhas = formatarMemoria({
      modelo_conta: 'conta_mesa',
      usa_vr: true,
      aceita_reserva: false,
      dor_pagamento: ['fila no caixa'],
      sistemas: ['Menew'],
    }, null).join('\n');
    expect(linhas).toMatch(/conta.*mesa/i);
    expect(linhas).toMatch(/vale-refeição/i);
    expect(linhas).toMatch(/não trabalha com reserva/i);
    expect(linhas).toMatch(/fila no caixa/);
    expect(linhas).toMatch(/Menew/);
  });

  test('sem descoberta, memória continua igual (nenhuma linha nova)', () => {
    const linhas = formatarMemoria({ is_dono: true }, null).join('\n');
    expect(linhas).not.toMatch(/conta|vale|reserva/i);
  });
});

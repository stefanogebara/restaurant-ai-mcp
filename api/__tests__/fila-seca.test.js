'use strict';

/**
 * A fila de intro secou e ninguém foi avisado (13/09/2026).
 *
 * O caso real que estes testes travam: 2 candidatos despacháveis, teto diário
 * de 100, cron de dispatch rodando na hora certa e devolvendo 200 com
 * `{ candidates: 0, sent: 0 }` — indistinguível de um dia tranquilo.
 */

const { avaliarSuprimento, linhasDoAlerta, PISO_DA_FILA } = require('../_lib/prospecting/fila-seca');

describe('avaliarSuprimento', () => {
  it('o caso medido: 2 candidatos com teto 100 é fila seca', () => {
    const r = avaliarSuprimento({ disponiveis: 2, capDiario: 100 });
    expect(r.seco).toBe(true);
    expect(r.disponiveis).toBe(2);
    expect(r.diasDeFolga).toBe(0);
    expect(r.causa).toBe('fila_abaixo_do_piso');
  });

  it('fila cheia não dispara alerta', () => {
    expect(avaliarSuprimento({ disponiveis: PISO_DA_FILA, capDiario: 100 }).seco).toBe(false);
    expect(avaliarSuprimento({ disponiveis: 500, capDiario: 100 }).seco).toBe(false);
  });

  it('exatamente no piso ainda passa; um abaixo já é seco', () => {
    expect(avaliarSuprimento({ disponiveis: 40, piso: 40 }).seco).toBe(false);
    expect(avaliarSuprimento({ disponiveis: 39, piso: 40 }).seco).toBe(true);
  });

  it('zero é seco', () => {
    expect(avaliarSuprimento({ disponiveis: 0, capDiario: 100 }).seco).toBe(true);
  });

  it('erro na contagem é seco, com causa PRÓPRIA — [] de "não há ninguém" e '
    + '[] de "a guarda de rede derrubou o lote" dizem coisas opostas', () => {
    const r = avaliarSuprimento({ disponiveis: 0, erroNaContagem: true });
    expect(r.seco).toBe(true);
    expect(r.causa).toBe('contagem_falhou');
  });

  it('sem teto conhecido não inventa prazo', () => {
    expect(avaliarSuprimento({ disponiveis: 10 }).diasDeFolga).toBeNull();
    expect(avaliarSuprimento({ disponiveis: 10, capDiario: 0 }).diasDeFolga).toBeNull();
  });

  it('conta dias de folga pelo teto', () => {
    expect(avaliarSuprimento({ disponiveis: 250, capDiario: 100 }).diasDeFolga).toBe(2);
  });

  it('entrada suja não derruba nem vira NaN', () => {
    expect(avaliarSuprimento({}).seco).toBe(true);
    expect(avaliarSuprimento().seco).toBe(true);
    expect(avaliarSuprimento({ disponiveis: -5 }).disponiveis).toBe(0);
    expect(avaliarSuprimento({ disponiveis: 'muitos' }).disponiveis).toBe(0);
  });
});

describe('linhasDoAlerta', () => {
  it('fila saudável não escreve nada — o alerta diário não ganha ruído fixo', () => {
    expect(linhasDoAlerta(avaliarSuprimento({ disponiveis: 500, capDiario: 100 }))).toEqual([]);
    expect(linhasDoAlerta(null)).toEqual([]);
  });

  it('diz o número, e diz o que fazer', () => {
    const txt = linhasDoAlerta(avaliarSuprimento({ disponiveis: 2, capDiario: 100 })).join('\n');
    expect(txt).toContain('2 lead(s)');
    expect(txt).toContain('discovery-job');
    // A frase que evita a caça ao bug errado: o dispatch NÃO está quebrado.
    expect(txt).toContain('não é bug, é falta de lead');
  });

  it('falha de contagem não se disfarça de fila vazia', () => {
    const txt = linhasDoAlerta(avaliarSuprimento({ disponiveis: 0, erroNaContagem: true })).join('\n');
    expect(txt).toContain('não deu para contar');
    expect(txt).not.toContain('discovery-job');
  });
});

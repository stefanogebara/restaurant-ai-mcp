'use strict';

/**
 * Enricher de CNPJ (item 5 do plano zero-toque).
 *
 * O que estes testes prendem:
 *  1. o contrato { campos, confianca, fonte } — é ele que permite rodar várias
 *     fontes em paralelo sem que nenhuma seja bloqueante;
 *  2. a confiança não é só similaridade de nome — casar CNPJ errado põe dado
 *     fiscal de OUTRA empresa no cadastro, em silêncio;
 *  3. índice fora do ar não derruba o onboarding, mas deixa rastro.
 */

// Logger espionável: parte do contrato aqui é DEIXAR RASTRO quando o índice
// falha — sem poder afirmar isso, o teste não distingue "não achei" de
// "quebrou", que é exatamente o bug que este arquivo documenta.
const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => mockLogger,
}));

beforeEach(() => {
  mockLogger.error.mockClear();
  mockLogger.warn.mockClear();
});

const { enriquecerComCnpj, calcularConfianca } = require('../_lib/enrichers/cnpj');

/** Registro no formato que o RPC buscar_cnpj_local devolve. */
const registro = (over = {}) => ({
  cnpj: '38793527000193',
  razao_social: 'REI DO MOCOTO LTDA',
  nome_fantasia: null,
  municipio: 'sao paulo',
  uf: 'SP',
  bairro: 'CAMPO LIMPO',
  situacao: 'ATIVA',
  cnae: '5611203',
  porte: 'MICRO EMPRESA',
  mei: false,
  socios: [{ nome: 'JORGE FERREIRA BASTOS', qualificacao: 'Sócio-Administrador' }],
  sim: 0.62,
  ...over,
});

const supabaseCom = (linhas) => ({ rpc: jest.fn().mockResolvedValue({ data: linhas, error: null }) });

describe('contrato do enricher', () => {
  test('devolve { campos, confianca, fonte } mesmo sem achar nada', async () => {
    const r = await enriquecerComCnpj(supabaseCom([]), { nome: 'Restaurante Inexistente' });
    expect(r).toEqual({ campos: null, confianca: 0, fonte: 'receita_federal_local' });
  });

  test('nome curto demais não consulta o banco — trigrama não discrimina', async () => {
    const sb = supabaseCom([registro()]);
    const r = await enriquecerComCnpj(sb, { nome: 'ab' });
    expect(r.campos).toBeNull();
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  test('sem cliente de banco, degrada em vez de explodir', async () => {
    expect((await enriquecerComCnpj(null, { nome: 'Mocotó' })).campos).toBeNull();
  });
});

describe('confiança — casar CNPJ errado é pior que não casar', () => {
  test('CNAE de alimentação e situação ATIVA somam à similaridade', async () => {
    const soNome = calcularConfianca({ sim: 0.5, cnae: '4711302', situacao: null });
    const restauranteAtivo = calcularConfianca({ sim: 0.5, cnae: '5611203', situacao: 'ATIVA' });
    expect(restauranteAtivo).toBeGreaterThan(soNome);
  });

  test('empresa BAIXADA é penalizada — não é o restaurante em operação', async () => {
    const ativa = calcularConfianca({ sim: 0.7, cnae: '5611203', situacao: 'ATIVA' });
    const baixada = calcularConfianca({ sim: 0.7, cnae: '5611203', situacao: 'BAIXADA' });
    expect(baixada).toBeLessThan(ativa);
  });

  test('confiança fica sempre entre 0 e 1', () => {
    expect(calcularConfianca({ sim: 1, cnae: '5611203', situacao: 'ATIVA' })).toBeLessThanOrEqual(1);
    expect(calcularConfianca({ sim: 0, cnae: 'x', situacao: 'BAIXADA' })).toBeGreaterThanOrEqual(0);
  });

  test('candidatos vêm ordenados por confiança', async () => {
    const r = await enriquecerComCnpj(supabaseCom([
      registro({ cnpj: '1', sim: 0.3, situacao: 'BAIXADA' }),
      registro({ cnpj: '2', sim: 0.8, situacao: 'ATIVA' }),
    ]), { nome: 'Mocotó' });
    expect(r.campos.candidatos.map((c) => c.cnpj)).toEqual(['2', '1']);
  });

  test('confiança baixa NÃO vira sugestão — o dono escolhe da lista', async () => {
    const r = await enriquecerComCnpj(supabaseCom([
      registro({ sim: 0.1, cnae: '4711302', situacao: 'BAIXADA' }),
    ]), { nome: 'Bar do Zé' });
    expect(r.campos.candidatos).toHaveLength(1);
    expect(r.campos.sugerido).toBeNull();
  });

  test('confiança alta vira sugestão pré-preenchida', async () => {
    const r = await enriquecerComCnpj(supabaseCom([registro()]), { nome: 'Mocotó', cidade: 'Sao Paulo' });
    expect(r.campos.sugerido).not.toBeNull();
    expect(r.campos.sugerido.razao_social).toBe('REI DO MOCOTO LTDA');
  });
});

describe('o que o onboarding consome', () => {
  test('sócios chegam para a pergunta "você é o Jorge ou a Keila?"', async () => {
    const r = await enriquecerComCnpj(supabaseCom([registro({
      socios: [
        { nome: 'JORGE FERREIRA BASTOS', qualificacao: 'Sócio-Administrador' },
        { nome: 'KEILA MARIA PINTO DE SOUSA BASTOS', qualificacao: 'Sócio-Administrador' },
      ],
    })]), { nome: 'Mocotó' });
    expect(r.campos.candidatos[0].socios.map((s) => s.nome)).toEqual([
      'JORGE FERREIRA BASTOS', 'KEILA MARIA PINTO DE SOUSA BASTOS',
    ]);
  });

  test('sócio sem nome é descartado — linha vazia na tela não ajuda ninguém', async () => {
    const r = await enriquecerComCnpj(supabaseCom([registro({
      socios: [{ nome: null, qualificacao: 'Sócio' }, { nome: 'MARIA', qualificacao: 'Sócia' }],
    })]), { nome: 'Mocotó' });
    expect(r.campos.candidatos[0].socios).toEqual([{ nome: 'MARIA', qualificacao: 'Sócia' }]);
  });

  test('marca se é do setor de alimentação — CNAE cru não diz nada pro dono', async () => {
    const r = await enriquecerComCnpj(supabaseCom([
      registro({ cnpj: 'a', cnae: '5611203' }),
      registro({ cnpj: 'b', cnae: '4711302' }),
    ]), { nome: 'Mocotó' });
    const porCnpj = Object.fromEntries(r.campos.candidatos.map((c) => [c.cnpj, c.do_setor_de_alimentacao]));
    expect(porCnpj).toEqual({ a: true, b: false });
  });
});

describe('índice fora do ar — vazio por falha ≠ vazio por "não achei"', () => {
  // Achado ao escrever isto: `buscarCnpjLocal` engolia TODA falha em `return []`
  // sem log. O enricher acima "tratava" o erro, mas nunca era acionado — o
  // rastro que ele prometia não existia. O log foi para a raiz (o módulo que
  // fala com o banco), que é quem sabe o que deu errado.
  const { buscarCnpjLocal } = require('../_lib/prospecting/prospect-cnpj-local');

  test('exceção no RPC: devolve [] mas REGISTRA — o fluxo não quebra, o silêncio sim', async () => {
    const sb = { rpc: jest.fn().mockRejectedValue(new Error('conexão recusada')) };
    expect(await buscarCnpjLocal(sb, 'Mocotó', null)).toEqual([]);
    expect(mockLogger.error).toHaveBeenCalled();
    expect(JSON.stringify(mockLogger.error.mock.calls)).toMatch(/conexão recusada/);
  });

  test('erro devolvido pelo Supabase também deixa rastro', async () => {
    const sb = { rpc: jest.fn().mockResolvedValue({ data: null, error: { message: 'permission denied' } }) };
    expect(await buscarCnpjLocal(sb, 'Mocotó', null)).toEqual([]);
    expect(JSON.stringify(mockLogger.error.mock.calls)).toMatch(/permission denied/);
  });

  test('"não achei esse nome" NÃO é erro — lista vazia legítima fica silenciosa', async () => {
    const sb = { rpc: jest.fn().mockResolvedValue({ data: [], error: null }) };
    expect(await buscarCnpjLocal(sb, 'Restaurante Que Nao Existe', null)).toEqual([]);
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  test('o enricher degrada junto, sem derrubar o onboarding', async () => {
    const sb = { rpc: jest.fn().mockRejectedValue(new Error('conexão recusada')) };
    const r = await enriquecerComCnpj(sb, { nome: 'Mocotó' });
    expect(r).toEqual({ campos: null, confianca: 0, fonte: 'receita_federal_local' });
  });
});

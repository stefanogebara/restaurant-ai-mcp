'use strict';

/**
 * Reação ao beacon da prévia: product-aware e por evento.
 *
 * POR QUE (13/08/2026). A instrução era um texto fixo no responder que dizia
 * "o painel do restaurante dele" — Seatable puro. Com o Racha ativo, o lead
 * abriu o demo de PAGAR PELO QR e a Olímpia reagiria falando de um painel que
 * não existe: a primeira frase depois do momento de maior atenção do lead
 * seria falsa. E 'paid' (pagou a conta de mentira — o sinal mais forte do
 * funil) reusava o mesmo "o que achou?" morno da abertura.
 *
 * Contratos:
 *  1. Racha: opened fala do demo do QR; paid fala do pagamento e convida a ATIVAR.
 *  2. Seatable: opened preserva o texto antigo byte a byte (baseline de reversão).
 *  3. Evento desconhecido / perfil sem o campo degradam sem explodir.
 *  4. O gatilho novo do demo (previaMove do Racha) cobre os dois buracos vistos
 *     nas conversas reais: "já temos solução" e despedida sem demo oferecido.
 */

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })),
}));

const ENV_ORIGINAL = process.env.PROSPECTING_PRODUCT;

function carregarProduto(produto) {
  jest.resetModules();
  if (produto === undefined) delete process.env.PROSPECTING_PRODUCT;
  else process.env.PROSPECTING_PRODUCT = produto;
  return require('../_lib/prospecting/prospect-product').getProfile();
}

afterEach(() => {
  if (ENV_ORIGINAL === undefined) delete process.env.PROSPECTING_PRODUCT;
  else process.env.PROSPECTING_PRODUCT = ENV_ORIGINAL;
  jest.resetModules();
});

describe('previaReacaoInstrucao — o texto segue o produto e o evento', () => {
  test('Racha opened: fala do demo do QR, não de painel', () => {
    const p = carregarProduto('racha');
    expect(p.previaReacaoInstrucao.opened).toMatch(/QR/);
    expect(p.previaReacaoInstrucao.opened).not.toMatch(/painel/i);
  });

  test('Racha paid: reconhece o pagamento e convida a ativar', () => {
    const p = carregarProduto('racha');
    expect(p.previaReacaoInstrucao.paid).toMatch(/PAGAR|PAGOU/i);
    expect(p.previaReacaoInstrucao.paid).toMatch(/ativar/i);
  });

  test('Seatable opened: baseline antigo preservado byte a byte', () => {
    const p = carregarProduto('seatable');
    expect(p.previaReacaoInstrucao.opened).toBe(
      'O lead ACABOU de abrir a prévia que você enviou (o painel do restaurante dele). ' +
      'Reaja com UMA mensagem curta e calorosa, como quem percebeu a pessoa dar uma olhada: ' +
      'pergunta de leve o que ele achou / se fez sentido. NÃO repita o link, NÃO liste recursos, ' +
      'NÃO force reunião. Só puxa a reação dele com naturalidade.',
    );
  });

  test('Seatable paid: sem texto próprio (o beacon paid só existe no Racha)', () => {
    const p = carregarProduto('seatable');
    expect(p.previaReacaoInstrucao.paid).toBeUndefined();
  });
});

describe('instrucaoPrevia (responder) — seleção com fallback', () => {
  // O responder puxa cadeia de dependências pesada; mocka só o suficiente
  // pra importar (os módulos com side effects de rede/DB ficam no mock do
  // supabase, já coberto pelo mock global de secure-logger acima).
  function carregarResponder(produto) {
    jest.resetModules();
    if (produto === undefined) delete process.env.PROSPECTING_PRODUCT;
    else process.env.PROSPECTING_PRODUCT = produto;
    jest.doMock('../_lib/secure-logger', () => ({
      createSecureLogger: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })),
    }));
    jest.doMock('../_lib/supabase', () => ({ supabaseAdmin: { from: jest.fn(), schema: jest.fn() } }));
    return require('../_lib/prospecting/prospect-responder');
  }

  test('Racha: paid e opened divergem; evento desconhecido cai no opened', () => {
    const { instrucaoPrevia } = carregarResponder('racha');
    expect(instrucaoPrevia('paid')).not.toBe(instrucaoPrevia('opened'));
    expect(instrucaoPrevia('cta_tapped')).toBe(instrucaoPrevia('opened'));
  });

  test('Seatable: paid degrada pro opened (não existe texto de pagamento)', () => {
    const { instrucaoPrevia } = carregarResponder('seatable');
    expect(instrucaoPrevia('paid')).toBe(instrucaoPrevia('opened'));
    expect(instrucaoPrevia('opened')).toMatch(/painel/);
  });
});

describe('previaMove do Racha — os dois buracos das conversas reais', () => {
  test('"já temos solução" virou caso de demo, e despedida exige demo oferecido', () => {
    const p = carregarProduto('racha');
    const texto = p.previaMove.join('\n');
    expect(texto).toMatch(/Já temos solução/i);
    expect(texto).toMatch(/REGRA DE SAÍDA/);
    expect(texto).toMatch(/antes de encerrar/i);
  });

  test('Seatable previaMove não foi tocado (baseline de reversão)', () => {
    const p = carregarProduto('seatable');
    const texto = p.previaMove.join('\n');
    expect(texto).not.toMatch(/REGRA DE SAÍDA/);
  });
});

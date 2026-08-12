'use strict';

/**
 * O marcador que identifica "o demo foi enviado".
 *
 * POR QUE (12/08/2026). O painel mostrava "Reuniões marcadas", que para o Racha
 * só pode ser ZERO — o perfil remove agendar_demo do toolset e a agente é
 * fisicamente incapaz de marcar reunião. Um KPI travado em zero ensina quem
 * olha a ignorar o painel, e escondia o número que decide: de 349 leads que
 * responderam, 5 receberam o demo.
 *
 * O ponto DESTE arquivo é que a contagem do painel use a MESMA regra que a
 * idempotência do agente. Se divergissem, o painel seria uma terceira opinião
 * sobre o mesmo fato e ninguém saberia qual está certa.
 */

const ENV_ORIGINAL = process.env.PROSPECTING_PRODUCT;

/**
 * getProduct() lê process.env em tempo de CHAMADA, não de import. A primeira
 * versão deste helper restaurava a env antes do teste chamar a função, então
 * todo caso "Seatable" media o Racha — e passava por acidente nos casos em que
 * as duas respostas coincidiam. A env fica de pé até o afterEach.
 */
function carregarComProduto(produto) {
  jest.resetModules();
  if (produto === undefined) delete process.env.PROSPECTING_PRODUCT;
  else process.env.PROSPECTING_PRODUCT = produto;
  return {
    demo: require('../_lib/prospecting/prospect-demo'),
    perfil: require('../_lib/prospecting/prospect-product').getProfile(),
  };
}

afterEach(() => {
  if (ENV_ORIGINAL === undefined) delete process.env.PROSPECTING_PRODUCT;
  else process.env.PROSPECTING_PRODUCT = ENV_ORIGINAL;
});

describe('marcadorDeDemoEnviado segue o perfil do produto', () => {
  test('Racha (prévia fixa): marcador é o link do demo, sem protocolo', () => {
    const { demo, perfil } = carregarComProduto('racha');
    const r = demo.marcadorDeDemoEnviado();
    expect(r.tipo).toBe('fixo');
    expect(r.marcador).toBe(perfil.previaUrl.replace(/^https?:\/\//i, '').toLowerCase());
    expect(r.marcador).not.toMatch(/^https?:/);
  });

  test('Seatable (prévia por restaurante): marcador é o caminho /previa/', () => {
    const { demo } = carregarComProduto('seatable');
    expect(demo.marcadorDeDemoEnviado()).toEqual({ tipo: 'token', marcador: '/previa/' });
  });

  test('sem env definida cai no Racha — o mesmo default de getProduct', () => {
    // Producao NAO define PROSPECTING_PRODUCT; se este default divergisse, o
    // painel contaria um produto e a agente rodaria outro.
    const { demo } = carregarComProduto(undefined);
    expect(demo.marcadorDeDemoEnviado().tipo).toBe('fixo');
  });
});

describe('o marcador casa com o que previaLinkInHistory considera enviado', () => {
  test('Racha: mensagem com o link do demo é detectada pelos DOIS caminhos', () => {
    const { demo, perfil } = carregarComProduto('racha');
    const { marcador } = demo.marcadorDeDemoEnviado();
    const corpo = `pode testar aqui, paga uma conta de mentira em 10s: ${perfil.previaUrl}`;

    // o que o agente usa para não reenviar
    expect(demo.previaLinkInHistory([{ corpo }])).toBe(perfil.previaUrl);
    // o que o painel usa para contar
    expect(corpo.toLowerCase()).toContain(marcador);
  });

  test('Seatable: link com token é detectado pelos DOIS caminhos', () => {
    const { demo } = carregarComProduto('seatable');
    const { marcador } = demo.marcadorDeDemoEnviado();
    const corpo = 'olha a prévia: https://seatable.one/previa/3f2a9c1b-1111-2222-3333-444455556666';

    expect(demo.previaLinkInHistory([{ corpo }])).toMatch(/\/previa\//);
    expect(corpo.toLowerCase()).toContain(marcador);
  });

  test('mensagem comum não conta como demo em nenhum dos dois', () => {
    const { demo } = carregarComProduto('racha');
    const { marcador } = demo.marcadorDeDemoEnviado();
    const corpo = 'Oi! Quem cuida das parcerias da casa?';
    expect(demo.previaLinkInHistory([{ corpo }])).toBeNull();
    expect(corpo.toLowerCase()).not.toContain(marcador);
  });
});

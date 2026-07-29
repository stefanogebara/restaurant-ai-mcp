'use strict';

/**
 * Onde o cardápio está — a heurística que decide se a IA vai saber preço.
 *
 * Contexto: a home quase nunca lista pratos; ela tem um LINK escrito
 * "Cardápio". Ler só a home era o motivo de `menu_items` voltar vazio na
 * maioria dos restaurantes — e sem preço a IA não responde "quanto custa a
 * moqueca?", que é a pergunta mais comum de um cliente no WhatsApp.
 *
 * O iFood foi descartado antes disto: a página é uma SPA (props.pageProps
 * vazio, zero "R$" no HTML cru) e a URL exige um UUID. Raspar exigiria
 * navegador headless a cada onboarding. O site do próprio cliente é a fonte
 * que se sustenta.
 */

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));
// Referência tardia (…args) => fn(…args) evita o hoisting do jest.mock, que
// proíbe capturar variáveis declaradas depois na factory.
const mockSafeFetch = jest.fn();
const mockLLM = jest.fn();
jest.mock('../_lib/safe-fetch', () => ({ safeFetchText: (...a) => mockSafeFetch(...a) }));
jest.mock('../_lib/ai-client', () => ({
  getAI: async () => ({ messages: { create: (...a) => mockLLM(...a) } }),
  AI_MODEL_FAST: 'x',
}));

const { acharLinksDeCardapio, enrichFromWebsite } = require('../_lib/enrich-restaurant');

const BASE = 'https://cantina.com.br';
const link = (href, texto) => `<a href="${href}">${texto}</a>`;

describe('achar o cardápio fora da home', () => {
  test('link escrito "Cardápio" é encontrado mesmo com URL sem sentido', () => {
    // Caso real e comum: construtor de site gera /pagina-2 com o texto certo.
    const r = acharLinksDeCardapio(link('/pagina-2', 'Cardápio'), BASE);
    expect(r).toHaveLength(1);
    expect(r[0].url).toBe('https://cantina.com.br/pagina-2');
  });

  test('PDF entra — é onde a maioria dos restaurantes brasileiros publica', () => {
    const r = acharLinksDeCardapio(link('/docs/menu-2026.pdf', 'Baixe aqui'), BASE);
    expect(r[0].ehPdf).toBe(true);
  });

  test('texto do link pesa mais que a URL', () => {
    const html = link('/menu', 'Nossa história') + link('/x', 'Cardápio completo');
    expect(acharLinksDeCardapio(html, BASE)[0].url).toBe('https://cantina.com.br/x');
  });

  test('link irrelevante é ignorado — não adianta gastar fetch em "Sobre nós"', () => {
    const html = link('/sobre', 'Sobre nós') + link('/contato', 'Fale conosco');
    expect(acharLinksDeCardapio(html, BASE)).toEqual([]);
  });
});

describe('limites que protegem o sistema', () => {
  test('domínio de terceiro é recusado — seguir link externo aqui seria SSRF', () => {
    const html = link('https://ifood.com.br/cardapio', 'Cardápio no iFood')
      + link('https://evil.example/menu', 'Menu');
    expect(acharLinksDeCardapio(html, BASE)).toEqual([]);
  });

  test('mailto/tel/âncora não viram requisição', () => {
    const html = link('mailto:a@b.com', 'Cardápio') + link('tel:+5511', 'Menu') + link('#menu', 'Cardápio');
    expect(acharLinksDeCardapio(html, BASE)).toEqual([]);
  });

  test('no máximo 3 links — cada um é um fetch no caminho do onboarding', () => {
    const html = Array.from({ length: 9 }, (_, i) => link(`/cardapio-${i}`, 'Cardápio')).join('');
    expect(acharLinksDeCardapio(html, BASE).length).toBeLessThanOrEqual(3);
  });

  test('mesma URL repetida não vira fetch duplicado', () => {
    const html = link('/cardapio', 'Cardápio') + link('/cardapio', 'Ver menu');
    expect(acharLinksDeCardapio(html, BASE)).toHaveLength(1);
  });

  test('entrada nula devolve lista vazia em vez de explodir', () => {
    expect(acharLinksDeCardapio(null, BASE)).toEqual([]);
  });

  test('href malformado NÃO escapa do domínio — o que importa não é rejeitar, é não vazar', () => {
    // `new URL('::://quebrado', base)` não lança: resolve como caminho
    // relativo (https://cantina.com.br/::://quebrado). Escrevi este teste
    // esperando [] e estava errada — o comportamento real é seguro, porque a
    // garantia que protege o sistema é o MESMO HOST, não a forma do href. O
    // fetch dessa URL dá 404 e o fluxo segue.
    const r = acharLinksDeCardapio('<a href="::://quebrado">Cardápio</a>', BASE);
    for (const item of r) {
      expect(new URL(item.url).hostname).toBe('cantina.com.br');
    }
  });

  test('URL relativa vira absoluta a partir da página final', () => {
    const r = acharLinksDeCardapio(link('cardapio/', 'Cardápio'), 'https://cantina.com.br/home/');
    expect(r[0].url).toBe('https://cantina.com.br/home/cardapio/');
  });
});

/**
 * O link que o DONO informa. A extração automática cobre a maioria dos sites,
 * mas depende do site existir e publicar preços — perguntar cobre o resto.
 */
describe('link do cardápio informado pelo dono', () => {
  const respostaLLM = (obj) => ({ content: [{ type: 'text', text: JSON.stringify(obj) }] });
  const VAZIO = {
    menu_items: [], popular_dishes: [], social_handles: {}, hours_text: null,
    contact: {}, business_hours: null,
  };

  beforeEach(() => {
    mockSafeFetch.mockReset();
    mockLLM.mockReset().mockResolvedValue(respostaLLM(VAZIO));
  });

  /** Texto entregue ao LLM — é ali que se vê o que o enricher realmente leu. */
  const textoEnviado = () => mockLLM.mock.calls[0][0].messages[0].content;

  // Trechos com mais de 80 caracteres: o enricher descarta pedaços curtos de
  // propósito (menu vazio, página de erro), e um cardápio real é bem maior.
  const CARDAPIO = '<html><body>Entradas: bolinho de bacalhau R$ 48,00. Principais: Moqueca R$ 89,00, '
    + 'Feijoada R$ 62,00, Picanha R$ 120,00. Sobremesas: pudim R$ 22,00.</body></html>';
  const CARDAPIO_2 = '<html><body>Prato feito R$ 35,00 · Suco natural R$ 9,00 · Executivo do dia R$ 42,00 '
    + '· Sobremesa da casa R$ 18,00 · Café expresso R$ 7,00</body></html>';
  const HOME = '<html><body>Bem-vindo à Cantina, cozinha italiana no centro da cidade, aberta desde 1998. '
    + 'Telefone (11) 5555-1234. Estacionamento no local.</body></html>';

  test('o link do dono é lido mesmo quando a home não tem link nenhum', async () => {
    mockSafeFetch
      .mockResolvedValueOnce({ text: HOME, finalUrl: BASE })
      .mockResolvedValueOnce({ text: CARDAPIO, finalUrl: `${BASE}/m` });

    await enrichFromWebsite(BASE, 'Cantina', `${BASE}/meu-cardapio`);

    expect(mockSafeFetch).toHaveBeenCalledWith(`${BASE}/meu-cardapio`, expect.anything());
    expect(textoEnviado()).toMatch(/Moqueca R\$ 89,00/);
  });

  test('SEM SITE, só com o link do cardápio, ainda extrai — o caso do PDF no Drive', async () => {
    // Antes disto a função inteira dependia da home existir, e um restaurante
    // sem site ficava sem preço nenhum.
    mockSafeFetch.mockResolvedValueOnce({ text: CARDAPIO_2, finalUrl: 'https://drive.exemplo/menu' });

    const r = await enrichFromWebsite(null, 'Boteco', 'https://drive.exemplo/menu');

    expect(r).not.toBeNull();
    expect(textoEnviado()).toMatch(/Prato feito R\$ 35,00/);
  });

  test('o link do dono vem ANTES dos descobertos — ele sabe onde está', async () => {
    mockSafeFetch
      .mockResolvedValueOnce({ text: `<html><body>${link('/cardapio-antigo', 'Cardápio')}</body></html>`, finalUrl: BASE })
      .mockResolvedValue({ text: CARDAPIO, finalUrl: 'x' });

    await enrichFromWebsite(BASE, 'Cantina', `${BASE}/cardapio-novo`);

    expect(mockSafeFetch.mock.calls[1][0]).toBe(`${BASE}/cardapio-novo`);
  });

  test('site fora do ar não impede o cardápio do dono de ser lido', async () => {
    mockSafeFetch
      .mockRejectedValueOnce(new Error('ENOTFOUND'))
      .mockResolvedValueOnce({ text: CARDAPIO, finalUrl: 'x' });

    const r = await enrichFromWebsite(BASE, 'Cantina', `${BASE}/cardapio`);

    expect(r).not.toBeNull();
    expect(textoEnviado()).toMatch(/Moqueca R\$ 89,00/);
  });

  test('link do dono ilegível não derruba a extração — a home ainda vale', async () => {
    mockSafeFetch
      .mockResolvedValueOnce({ text: HOME, finalUrl: BASE })
      .mockRejectedValueOnce(new Error('404'));

    const r = await enrichFromWebsite(BASE, 'Cantina', `${BASE}/quebrado`);

    expect(r).not.toBeNull();
    expect(textoEnviado()).toMatch(/aberta desde 1998/);
  });

  test('sem site e sem cardápio devolve null em vez de chamar o LLM à toa', async () => {
    const r = await enrichFromWebsite(null, 'Boteco', null);
    expect(r).toBeNull();
    expect(mockLLM).not.toHaveBeenCalled();
  });
});

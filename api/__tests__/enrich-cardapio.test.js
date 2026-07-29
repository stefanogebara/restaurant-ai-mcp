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
jest.mock('../_lib/ai-client', () => ({ getAI: jest.fn(), AI_MODEL_FAST: 'x' }));
jest.mock('../_lib/safe-fetch', () => ({ safeFetchText: jest.fn() }));

const { acharLinksDeCardapio } = require('../_lib/enrich-restaurant');

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

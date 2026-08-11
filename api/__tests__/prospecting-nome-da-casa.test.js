'use strict';

/**
 * Nome falável da casa.
 *
 * Os casos vêm do CRM real, não de exemplos inventados — foi um dry-run com
 * dado de produção que expôs o problema, e é com dado de produção que ele se
 * testa.
 */

const { nomeDaCasa } = require('../_lib/prospecting/nome-da-casa');

describe('corta o que o Google Places pendura no nome', () => {
  test.each([
    // O caso que originou o módulo: bairro, zona E categoria pendurados.
    ['Massa na Caveira - Tucuruvi (ZN) - Pizza Bar', 'Massa na Caveira'],
    ['Bario Bar - Tatuapé', 'Bario Bar'],
    ['La Braciera Pizzaria - Pizza Napoletana - Higienópolis', 'La Braciera Pizzaria'],
  ])('%s → %s', (cru, esperado) => {
    expect(nomeDaCasa(cru)).toBe(esperado);
  });
});

describe('não estraga nome que já está bom', () => {
  test.each([
    ['Dinho\'s Jardins', 'Dinho\'s Jardins'],
    ['Restaurante Sallvattore', 'Restaurante Sallvattore'],
    ['Empório Esquina da Fruta', 'Empório Esquina da Fruta'],
    ['A Baianeira', 'A Baianeira'],
  ])('%s fica intacto', (cru, esperado) => {
    expect(nomeDaCasa(cru)).toBe(esperado);
  });

  test('hífen colado é parte do nome, não separador', () => {
    // "Pré-Sal", "Casa-Grande": cortar aqui destruiria o nome.
    expect(nomeDaCasa('Bar Pré-Sal')).toBe('Bar Pré-Sal');
    expect(nomeDaCasa('Casa-Grande Cozinha')).toBe('Casa-Grande Cozinha');
  });
});

describe('falha para o lado seguro', () => {
  test('se o corte deixaria um toco, devolve o original', () => {
    // Prefere-se um nome longo a um nome irreconhecível.
    expect(nomeDaCasa('Zé - Bar do Zé Tatuapé')).toBe('Zé - Bar do Zé Tatuapé');
  });

  test('entrada vazia ou inválida devolve string vazia, nunca inventa', () => {
    expect(nomeDaCasa('')).toBe('');
    expect(nomeDaCasa('   ')).toBe('');
    expect(nomeDaCasa(null)).toBe('');
    expect(nomeDaCasa(undefined)).toBe('');
  });

  test('não escapa HTML — isso é responsabilidade de quem renderiza', () => {
    expect(nomeDaCasa('<b>Bar</b>')).toBe('<b>Bar</b>');
  });
});

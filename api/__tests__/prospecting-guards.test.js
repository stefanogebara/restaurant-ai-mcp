/**
 * Cycle-11 runtime guards (pure logic).
 *
 * The gym showed (cycles 7-10) that tool-without-text and mangled phone digits
 * survive every prompt formulation — they are runtime variance, so they get
 * deterministic code guards. These tests pin those guards' contracts:
 *  - optout/handoff actions ALWAYS carry a companion bubble;
 *  - phone-like digit runs absent from the conversation are flagged (± the 55
 *    country prefix), and offending bubbles can be stripped.
 */

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })),
}));

const {
  interpretResponse, findForeignPhones, stripForeignPhoneBubbles,
} = require('../_lib/prospecting/prospect-agent');

describe('companion-text guard — tool actions never go out silent', () => {
  test('marcar_optout without text gets the deterministic goodbye', () => {
    const acao = interpretResponse({ content: [{ type: 'tool_use', name: 'marcar_optout', input: {} }] });
    expect(acao.tipo).toBe('optout');
    expect(acao.texto).toMatch(/não te mando mais nada/);
  });

  test('escalar_humano without text gets the deterministic promise', () => {
    const acao = interpretResponse({ content: [{ type: 'tool_use', name: 'escalar_humano', input: { motivo: 'preço' } }] });
    expect(acao.tipo).toBe('handoff');
    expect(acao.texto).toMatch(/confirmar direitinho/);
  });

  test('model-provided text is kept, never overwritten', () => {
    const acao = interpretResponse({
      content: [
        { type: 'text', text: 'tranquilo, abraço!' },
        { type: 'tool_use', name: 'marcar_optout', input: {} },
      ],
    });
    expect(acao.texto).toBe('tranquilo, abraço!');
  });
});

describe('findForeignPhones — mangled-digit detection', () => {
  test('flags a phone the conversation never mentioned', () => {
    expect(findForeignPhones('me chama no 11 98877-6655', 'historico sem numero'))
      .toEqual(['11988776655']);
  });

  test('accepts a number the lead wrote, regardless of formatting', () => {
    expect(findForeignPhones('anoto o (11) 98877-6655 então', 'lead: fala com ele no 11 98877 6655'))
      .toEqual([]);
  });

  test('± the 55 country prefix is the same number', () => {
    expect(findForeignPhones('liga pra +55 11 91018-9842', 'bot: nos chame aqui (11) 91018-9842')).toEqual([]);
    expect(findForeignPhones('anota o 11 91018-9842', 'contato: +55 11 91018 9842')).toEqual([]);
  });

  test('prices, times and short numbers never trigger', () => {
    expect(findForeignPhones('fica R$ 1.497/mês, uns R$ 16 por dia, te chamo às 14h40', 'sem numeros')).toEqual([]);
  });

  test('spaced-out digits still resolve to one run', () => {
    expect(findForeignPhones('anota: 11 9 8877 6655', 'outro papo')).toEqual(['11988776655']);
  });
});

describe('stripForeignPhoneBubbles — surgical removal', () => {
  test('drops only the offending bubble', () => {
    const texto = 'oi tudo bem\n\nchama no 11988776655\n\nfechado?';
    expect(stripForeignPhoneBubbles(texto, ['11988776655'])).toBe('oi tudo bem\n\nfechado?');
  });

  test('no offenders → untouched', () => {
    expect(stripForeignPhoneBubbles('oi\n\ntudo bem', [])).toBe('oi\n\ntudo bem');
  });
});

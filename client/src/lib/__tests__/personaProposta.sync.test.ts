import { describe, test, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { FALA_DO_CLIENTE, AMOSTRAS, ROTULO_TAG, ORDEM_PADRAO } from '../personaProposta';

/**
 * O guarda do espelho.
 *
 * `client/src/lib/personaProposta.ts` duplica os dados de
 * `api/_lib/persona-proposta.js`, porque a folha de confirmação precisa das
 * quatro falas na hora de renderizar e um round-trip só para isso viraria uma
 * função serverless a mais no deploy.
 *
 * Duplicar é aceitável; duplicar SEM GUARDA não é. O repositório já tem um
 * espelho assim — `vibeToPersonaPreset.ts` / `vibe-to-persona-preset.js` — com
 * o comentário "Mapped 1:1 — keep both in sync" e nada verificando. É a mesma
 * família da ALLOWLIST podre e do allowlist de dez arquivos do warmPalette:
 * um guarda-corpo que só existe na prosa.
 *
 * Aqui a comparação é sobre o CONTEÚDO, não sobre o texto do arquivo: o
 * servidor é CommonJS e o cliente é ESM, então nenhuma comparação de string
 * funcionaria. O teste lê o fonte do servidor e extrai os literais.
 */

const SERVIDOR = resolve(__dirname, '../../../../api/_lib/persona-proposta.js');

/** Extrai `const NOME = { ... };` do fonte do servidor e avalia o literal. */
function literalDoServidor(nome: string): unknown {
  const src = readFileSync(SERVIDOR, 'utf-8');
  const inicio = src.indexOf(`const ${nome} = {`);
  if (inicio === -1) throw new Error(`Não achei ${nome} no servidor — o espelho ficou órfão.`);
  const fim = src.indexOf('\n};', inicio);
  const corpo = src.slice(src.indexOf('{', inicio), fim + 2);
  // eslint-disable-next-line no-new-func
  return new Function(`return ${corpo}`)();
}

describe('personaProposta — o espelho não pode divergir do servidor', () => {
  test('a fala do cliente é a mesma nos dois lados', () => {
    expect(FALA_DO_CLIENTE).toEqual(literalDoServidor('FALA_DO_CLIENTE'));
  });

  test('as quatro amostras são idênticas', () => {
    expect(AMOSTRAS).toEqual(literalDoServidor('AMOSTRAS'));
  });

  test('os rótulos de tag são idênticos', () => {
    expect(ROTULO_TAG).toEqual(literalDoServidor('ROTULO_TAG'));
  });

  // Um preset novo no servidor sem o par no cliente renderiza um cartão mudo.
  test('os dois lados conhecem exatamente os mesmos presets', () => {
    const doServidor = Object.keys(literalDoServidor('AMOSTRAS') as object).sort();
    expect(Object.keys(AMOSTRAS).sort()).toEqual(doServidor);
    expect([...ORDEM_PADRAO].sort()).toEqual(doServidor);
  });
});

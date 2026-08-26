/**
 * Os quatro desvios do DESIGN.md, medidos em TODO o client.
 *
 * Já existia um guarda para isto — `booking/__tests__/warmPalette.test.ts` —
 * e ele é bom. O problema é o alcance: a lista `SURFACE` é um allowlist de
 * arquivos (reserva + onboarding). Por isso o resto do app derivou com o
 * guarda aceso: ele vigiava dez arquivos enquanto o desvio acontecia em cem.
 *
 * Este módulo inverte a lógica — varre tudo e trata o que já existe como
 * DÍVIDA CONGELADA. O teste que o consome falha quando um arquivo novo passa a
 * violar, ou quando a contagem de um arquivo conhecido sobe. A dívida só pode
 * cair. Sem isso a alternativa seria corrigir 154 lugares num commit só, o que
 * ninguém revisa de verdade.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, relative } from 'path';

/**
 * A raiz do client. `import.meta.url` NÃO serve aqui: sob o Vite ele resolve
 * para `/@fs/...`, um caminho virtual do dev server que o `fs` não enxerga —
 * o guarda morria com ENOENT antes de rodar um teste sequer. `process.cwd()`
 * é o diretório do client tanto no vitest quanto no vite-node.
 */
export const RAIZ = process.cwd();

/** Cinzas AZULADOS do Tailwind. O DESIGN.md nomeia os quatro primeiros. */
const CINZA_FRIO = /#(111827|1F2937|374151|4B5563|6B7280|9CA3AF|D1D5DB|E5E7EB|F3F4F6|F9FAFB)\b/gi;

/**
 * Classes de cor fria.
 *
 * `emerald`, `amber` e `red` ficam FORA da lista de propósito: o DESIGN.md as
 * sanciona explicitamente como as cores de ESTADO ("estado tem cor própria:
 * esmeralda / âmbar / vermelho"). Um guarda que acusa a cor certa ensina todo
 * mundo a ignorar o guarda — e aí ele não protege mais nada.
 */
const CLASSE_FRIA = /\b(bg|text|border|from|via|to|ring|divide|placeholder)-(violet|indigo|blue|sky|cyan|slate|gray|zinc|teal|purple|fuchsia)-\d{2,3}\b/g;

/** Instrument Serif só tem peso 400 e font-synthesis está bloqueado. */
const SERIF_COM_PESO = /class[nN]ame\s*=\s*["'`][^"'`]*(?:font-serif[^"'`]*font-(?:bold|semibold|black|extrabold)|font-(?:bold|semibold|black|extrabold)[^"'`]*font-serif)[^"'`]*["'`]/g;

/** Emoji renderizado como conteúdo de elemento — trabalho de ícone. */
const EMOJI_ELEMENTO = />\s*[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]{1,3}\s*</gu;

export type Desvio = 'cinzaFrio' | 'classeFria' | 'serifComPeso' | 'emojiComoIcone';

export const DESVIOS: Record<Desvio, RegExp> = {
  cinzaFrio: CINZA_FRIO,
  classeFria: CLASSE_FRIA,
  serifComPeso: SERIF_COM_PESO,
  emojiComoIcone: EMOJI_ELEMENTO,
};

/** Comentários não renderizam — prosa explicando o desvio não é o desvio. */
function semComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function arquivos(dir: string, acc: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    // __tests__ fica de fora: um teste que PROÍBE #E5E7EB precisa escrever
    // #E5E7EB. Contá-lo como violação puniria exatamente o guarda.
    if (nome === '__tests__' || nome === 'node_modules' || nome === 'test') continue;
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) arquivos(caminho, acc);
    else if (/\.tsx?$/.test(nome)) acc.push(caminho);
  }
  return acc;
}

/** @returns { 'caminho/do/arquivo.tsx': { cinzaFrio: 3, ... } } — só o que viola. */
export function medirDesvios(): Record<string, Partial<Record<Desvio, number>>> {
  const src = join(RAIZ, 'src');
  if (!existsSync(src)) {
    throw new Error(`paletaQuente: não achei ${src}. Rode a partir de client/.`);
  }
  const resultado: Record<string, Partial<Record<Desvio, number>>> = {};

  for (const caminho of arquivos(src)) {
    const conteudo = semComentarios(readFileSync(caminho, 'utf-8'));
    const doArquivo: Partial<Record<Desvio, number>> = {};

    for (const [nome, re] of Object.entries(DESVIOS) as [Desvio, RegExp][]) {
      const achados = conteudo.match(new RegExp(re.source, re.flags));
      if (achados?.length) doArquivo[nome] = achados.length;
    }

    if (Object.keys(doArquivo).length) {
      resultado[relative(src, caminho).split('\\').join('/')] = doArquivo;
    }
  }
  return resultado;
}

export function totalPorDesvio(medido: Record<string, Partial<Record<Desvio, number>>>) {
  const t: Record<string, number> = {};
  for (const porArquivo of Object.values(medido)) {
    for (const [k, n] of Object.entries(porArquivo)) t[k] = (t[k] || 0) + (n as number);
  }
  return t;
}

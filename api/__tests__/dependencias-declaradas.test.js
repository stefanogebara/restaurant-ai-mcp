/**
 * Guarda contra dependência fantasma.
 *
 * Um módulo em api/ pode dar `require('x')` sem que `x` esteja declarado em
 * nenhum package.json — desde que algum pacote *não relacionado* o arraste como
 * transitiva. Funciona até o dia em que aquele pacote solta a transitiva, e aí
 * quebra em produção, num bump que não tinha nada a ver com o assunto.
 *
 * Aconteceu duas vezes neste repositório:
 *
 *   - `node-fetch` vinha só do `@anthropic-ai/sdk`. O SDK 0.122 passou a usar
 *     fetch nativo e derrubou os quatro arquivos do agente de voz. (Resolvido
 *     migrando para o fetch global do Node, que estes arquivos já podiam usar.)
 *   - `jsonwebtoken` vinha só do `twilio`, e é o que assina e verifica o JWT em
 *     `_lib/auth.js`. Um bump de SDK de SMS derrubaria a autenticação inteira.
 *     (Resolvido declarando na raiz.)
 *
 * Nos dois casos a suíte só acusou por acidente, num PR de dependência. Este
 * teste torna o acidente determinístico.
 */

const fs = require('fs');
const path = require('path');
const { builtinModules } = require('module');

const RAIZ = path.join(__dirname, '..', '..');

function arquivosDeProducao(dir, acc = []) {
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entrada.name);
    if (entrada.isDirectory()) {
      // __tests__ pode usar devDependency à vontade; node_modules não é nosso.
      if (entrada.name === 'node_modules' || entrada.name === '__tests__') continue;
      arquivosDeProducao(p, acc);
    } else if (entrada.name.endsWith('.js')) {
      acc.push(p);
    }
  }
  return acc;
}

function declaradas() {
  const nomes = new Set();
  for (const manifest of ['package.json', path.join('api', 'package.json')]) {
    const json = JSON.parse(fs.readFileSync(path.join(RAIZ, manifest), 'utf8'));
    for (const campo of ['dependencies', 'devDependencies', 'optionalDependencies']) {
      Object.keys(json[campo] || {}).forEach((n) => nomes.add(n));
    }
  }
  return nomes;
}

/** `@escopo/pacote/sub` -> `@escopo/pacote`; `pacote/sub` -> `pacote`. */
function nomeDoPacote(spec) {
  const partes = spec.split('/');
  return spec.startsWith('@') ? partes.slice(0, 2).join('/') : partes[0];
}

describe('dependências de api/ estão declaradas', () => {
  const embutidos = new Set(builtinModules);
  const conhecidas = declaradas();

  test('nenhum require de produção depende de transitiva não declarada', () => {
    const fantasmas = [];

    for (const arquivo of arquivosDeProducao(path.join(RAIZ, 'api'))) {
      const fonte = fs.readFileSync(arquivo, 'utf8');
      for (const m of fonte.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)) {
        const spec = m[1];
        if (spec.startsWith('.') || spec.startsWith('/')) continue;
        if (spec.startsWith('node:')) continue;

        const pacote = nomeDoPacote(spec);
        if (embutidos.has(pacote) || conhecidas.has(pacote)) continue;

        fantasmas.push(`${path.relative(RAIZ, arquivo)} -> ${pacote}`);
      }
    }

    expect(fantasmas).toEqual([]);
  });

  test('o próprio levantamento enxerga os requires (senão o teste passa vazio)', () => {
    // Sem isto, um regex quebrado faria a guarda passar sem examinar nada.
    const arquivos = arquivosDeProducao(path.join(RAIZ, 'api'));
    expect(arquivos.length).toBeGreaterThan(50);

    const total = arquivos.reduce((n, arquivo) => {
      const fonte = fs.readFileSync(arquivo, 'utf8');
      return n + [...fonte.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].length;
    }, 0);
    expect(total).toBeGreaterThan(200);
  });
});

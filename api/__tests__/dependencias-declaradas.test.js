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

/**
 * Extrai os especificadores de `require(...)` de um fonte JavaScript.
 *
 * Varredura por regex sobre o texto cru erra dos dois lados, e a revisão do
 * PR #133 pegou as duas:
 *   - PERDE `require ('x')` — espaço entre o identificador e o parêntese é
 *     JavaScript válido, e uma fantasma escrita assim escaparia da guarda.
 *   - ACUSA `require('x')` escrito dentro de comentário ou de string, que não
 *     é import nenhum.
 *
 * Este scanner percorre o fonte uma vez pulando comentário de linha, comentário
 * de bloco e literal de string, e só então reconhece a chamada — tolerando
 * espaço em todas as juntas.
 *
 * @param {string} fonte conteúdo do arquivo
 * @returns {string[]} especificadores, na ordem em que aparecem
 */
function especificadoresDeRequire(fonte) {
  const achados = [];
  const n = fonte.length;
  const ehIdentificador = (ch) => !!ch && /[A-Za-z0-9_$]/.test(ch);
  let i = 0;

  while (i < n) {
    const c = fonte[i];

    if (c === '/' && fonte[i + 1] === '/') {
      while (i < n && fonte[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && fonte[i + 1] === '*') {
      i += 2;
      while (i < n && !(fonte[i] === '*' && fonte[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const aspas = c;
      i++;
      while (i < n && fonte[i] !== aspas) {
        if (fonte[i] === '\\') i++;
        i++;
      }
      i++;
      continue;
    }

    if (fonte.startsWith('require', i) && !ehIdentificador(fonte[i - 1])) {
      let j = i + 'require'.length;
      while (j < n && /\s/.test(fonte[j])) j++;
      if (fonte[j] === '(') {
        j++;
        while (j < n && /\s/.test(fonte[j])) j++;
        const aspas = fonte[j];
        if (aspas === '"' || aspas === "'") {
          j++;
          let spec = '';
          while (j < n && fonte[j] !== aspas) {
            spec += fonte[j];
            j++;
          }
          j++;
          while (j < n && /\s/.test(fonte[j])) j++;
          if (fonte[j] === ')') {
            achados.push(spec);
            i = j + 1;
            continue;
          }
        }
      }
    }

    i++;
  }

  return achados;
}

/**
 * Lista os .js de produção sob um diretório.
 * `__tests__` fica de fora: teste pode usar devDependency à vontade.
 *
 * @param {string} dir raiz da varredura
 * @param {string[]} [acc] acumulador da recursão
 * @returns {string[]} caminhos absolutos
 */
function arquivosDeProducao(dir, acc = []) {
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entrada.name);
    if (entrada.isDirectory()) {
      if (entrada.name === 'node_modules' || entrada.name === '__tests__') continue;
      arquivosDeProducao(p, acc);
    } else if (entrada.name.endsWith('.js')) {
      acc.push(p);
    }
  }
  return acc;
}

/**
 * Todo pacote declarado na raiz ou em api/, em qualquer campo de dependência.
 *
 * @returns {Set<string>} nomes de pacote
 */
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

/**
 * `@escopo/pacote/sub` -> `@escopo/pacote`; `pacote/sub` -> `pacote`.
 *
 * @param {string} spec especificador do require
 * @returns {string} nome do pacote
 */
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
      for (const spec of especificadoresDeRequire(fonte)) {
        if (spec.startsWith('.') || spec.startsWith('/')) continue;
        if (spec.startsWith('node:')) continue;

        const pacote = nomeDoPacote(spec);
        if (embutidos.has(pacote) || conhecidas.has(pacote)) continue;

        fantasmas.push(`${path.relative(RAIZ, arquivo)} -> ${pacote}`);
      }
    }

    expect(fantasmas).toEqual([]);
  });

  test('o próprio levantamento enxerga os requires (senão a guarda passa vazia)', () => {
    // Sem isto, um scanner quebrado faria a guarda passar sem examinar nada.
    const arquivos = arquivosDeProducao(path.join(RAIZ, 'api'));
    expect(arquivos.length).toBeGreaterThan(50);

    const total = arquivos.reduce(
      (n, arquivo) => n + especificadoresDeRequire(fs.readFileSync(arquivo, 'utf8')).length,
      0
    );
    expect(total).toBeGreaterThan(200);
  });

  describe('o scanner de require', () => {
    test('reconhece espaço entre o identificador e o parêntese', () => {
      // A forma que o regex anterior perdia — e por onde uma fantasma escaparia.
      expect(especificadoresDeRequire("const a = require ('fantasma');")).toEqual(['fantasma']);
      expect(especificadoresDeRequire("require\t( 'fantasma' );")).toEqual(['fantasma']);
    });

    test('ignora require dentro de comentário', () => {
      expect(especificadoresDeRequire("// const a = require('so-comentario');")).toEqual([]);
      expect(especificadoresDeRequire("/* require('em-bloco'); */")).toEqual([]);
    });

    test('ignora require dentro de string', () => {
      expect(especificadoresDeRequire('const t = "veja require(\'falso\')";')).toEqual([]);
    });

    test('não confunde sufixo de identificador com a chamada', () => {
      expect(especificadoresDeRequire("meuRequire('x'); requireAlgo('y');")).toEqual([]);
    });

    test('pega as formas legítimas', () => {
      const fonte = [
        "const fs = require('fs');",
        'const p = require("path");',
        "const { x } = require('@escopo/pacote/sub');",
      ].join('\n');
      expect(especificadoresDeRequire(fonte)).toEqual(['fs', 'path', '@escopo/pacote/sub']);
    });
  });
});

/**
 * Guarda da fiação de credenciais do live-smoke.
 *
 * O workflow ficou VERMELHO por dias com dois problemas empilhados:
 *
 *   1. Os secrets `SANDBOX_EMAIL` / `SANDBOX_PASSWORD` não estavam cadastrados.
 *   2. Mesmo cadastrados, não teria adiantado: `SANDBOX_PASSWORD` não chegava
 *      aos passos que fazem login.
 *
 * O (2) é o perigoso, porque some no meio de um YAML e aparece como "falhou no
 * login" — indistinguível do (1).
 *
 * A primeira versão desta guarda conferia só se o NOME aparecia no arquivo, e a
 * revisão do #137 mostrou o furo: `SANDBOX_PASSWORD: ${{ secrets.SANDBOX_EMAIL }}`
 * passaria verde enquanto o login recebia a credencial errada. Agora ela confere
 * o mapeamento inteiro, secret por secret.
 */

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..', '..');
const WORKFLOW = path.join(RAIZ, '.github', 'workflows', 'live-smoke.yml');

/** Passos que executam algo que faz login em produção. */
const PASSOS_DE_LOGIN = [
  'Run live smoke spec',
  'Slow 3G dashboard smoke',
  'Admin pages smoke',
];

/** Arquivos que esses passos executam, para cruzar com o que eles leem. */
const ARQUIVOS_DE_LOGIN = [
  path.join('scripts', 'test-slow-network.js'),
  path.join('e2e', 'analytics-fixes-live.spec.ts'),
];

const yml = () => fs.readFileSync(WORKFLOW, 'utf8');

/** O bloco `env:` do job, do `env:` até `steps:`. */
function envDoJob(fonte) {
  const i = fonte.indexOf('\n    env:');
  const f = fonte.indexOf('\n    steps:');
  expect(i).toBeGreaterThan(-1);
  expect(f).toBeGreaterThan(i);
  return fonte.slice(i, f);
}

/** O trecho de um passo, do seu `- name:` até o começo do próximo. */
function passo(fonte, nome) {
  const i = fonte.indexOf(`- name: ${nome}`);
  expect(i).toBeGreaterThan(-1);
  const resto = fonte.slice(i + 1);
  const j = resto.indexOf('\n      - ');
  return j === -1 ? resto : resto.slice(0, j);
}

/** Nomes de credencial (SANDBOX_ ou SMOKE_) lidos de process.env por um arquivo. */
function variaveisDeCredencial(arquivo) {
  const fonte = fs.readFileSync(path.join(RAIZ, arquivo), 'utf8');
  const nomes = new Set();
  for (const m of fonte.matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
    if (/^(SANDBOX|SMOKE)_/.test(m[1])) nomes.add(m[1]);
  }
  return nomes;
}

describe('live-smoke: fiação das credenciais', () => {
  test('cada passo de login recebe as duas credenciais, mapeadas ao secret certo', () => {
    // O ponto é o mapeamento, não o nome: `SANDBOX_PASSWORD: ${{ secrets.SANDBOX_EMAIL }}`
    // tem o nome certo e a credencial errada, e passaria numa checagem de nome.
    const fonte = yml();
    const erros = [];

    for (const nome of PASSOS_DE_LOGIN) {
      const trecho = passo(fonte, nome);
      for (const cred of ['SANDBOX_EMAIL', 'SANDBOX_PASSWORD']) {
        if (!trecho.includes(`${cred}: \${{ secrets.${cred} }}`)) {
          erros.push(`${nome} -> ${cred}`);
        }
      }
    }

    expect(erros).toEqual([]);
  });

  test('o levantamento cobre tudo que os scripts de login leem', () => {
    // Se um script passar a ler uma credencial nova, ela precisa estar fiada.
    const fonte = yml();
    const faltando = [];

    for (const arquivo of ARQUIVOS_DE_LOGIN) {
      const lidas = variaveisDeCredencial(arquivo);
      expect(lidas.size).toBeGreaterThan(0); // senão o levantamento não viu nada

      // `test-slow-network` aceita SMOKE_* OU SANDBOX_*; basta um par chegar.
      const atendida = [...lidas].some((v) =>
        PASSOS_DE_LOGIN.some((n) => passo(fonte, n).includes(`${v}: \${{ secrets.${v} }}`))
      );
      if (!atendida) faltando.push(`${arquivo} lê ${[...lidas].join(', ')}`);
    }

    expect(faltando).toEqual([]);
  });

  test('nenhuma variável do job recebe o VALOR da credencial', () => {
    // Env de job alcança `npm ci`, que roda script de ~400 dependências
    // transitivas, e toda action de terceiro. Só a flag de presença pode ser
    // global; o valor, nunca — nem sob outro nome.
    //
    // Mencionar o secret não é o problema: a flag precisa testar presença
    // (`secrets.SANDBOX_EMAIL != ''`). O problema é INTERPOLAR o valor.
    const linhas = envDoJob(yml())
      .split('\n')
      .map((l) => l.replace(/#.*$/, '').trim())
      .filter(Boolean);

    const vazando = linhas.filter((l) =>
      /^[A-Z0-9_]+:\s*\$\{\{\s*secrets\.(SANDBOX|SMOKE)_[A-Z0-9_]+\s*\}\}\s*$/.test(l)
    );

    expect(vazando).toEqual([]);
    expect(linhas.some((l) => l.startsWith('TEM_SANDBOX:'))).toBe(true);
  });

  test('a run falha (não pula) quando falta credencial', () => {
    const fonte = yml();
    const trecho = passo(fonte, 'Exigir credenciais do sandbox');
    expect(trecho).toContain("if: env.TEM_SANDBOX != 'true'");
    // `exit 1` é o ponto: pular pintaria de verde uma run que não verificou nada.
    expect(trecho).toContain('exit 1');
  });

  test('o resumo de cobertura usa a mesma condição do gate', () => {
    // Com só uma das duas, o resumo antes anunciava "ativo" e o gate matava a
    // run — um resumo que mente sobre a propria cobertura.
    const fonte = yml();
    const resumo = passo(fonte, 'Cobertura desta run');
    expect(resumo).toContain('"$TEM_SANDBOX" != "true"');
    expect(resumo).not.toContain('-z "$SANDBOX_EMAIL"');
  });

  test('a checagem vem antes da parte cara', () => {
    const fonte = yml();
    const guarda = fonte.indexOf('Exigir credenciais do sandbox');
    const delay = fonte.indexOf('Head-start delay');
    const playwright = fonte.indexOf('Install Playwright browsers');

    expect(guarda).toBeGreaterThan(-1);
    expect(guarda).toBeLessThan(playwright);
    expect(guarda).toBeLessThan(delay);
  });
});

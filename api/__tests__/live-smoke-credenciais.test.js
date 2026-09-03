/**
 * Guarda da fiação de credenciais do live-smoke.
 *
 * O workflow ficou VERMELHO por dias sem que ninguém percebesse, e havia dois
 * problemas empilhados:
 *
 *   1. Os secrets `SANDBOX_EMAIL` / `SANDBOX_PASSWORD` não estavam cadastrados.
 *   2. Mesmo cadastrados, não teria adiantado: `SANDBOX_PASSWORD` não estava no
 *      `env` do job, então os passos que fazem login não a herdavam. Só o
 *      "Admin pages smoke" a passava à mão.
 *
 * O (2) é o perigoso, porque é invisível: some no meio de um YAML e só aparece
 * como "falhou no login" — indistinguível do (1).
 *
 * Este teste cruza o workflow com o que os scripts de fato leem em
 * `process.env`, em vez de conferir uma lista escrita à mão que envelhece.
 */

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..', '..');
const WORKFLOW = path.join(RAIZ, '.github', 'workflows', 'live-smoke.yml');

/** Arquivos que o job executa e que fazem login em produção. */
const QUEM_FAZ_LOGIN = [
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
  test('o env do job entrega toda credencial que os scripts de login leem', () => {
    const env = envDoJob(yml());
    const faltando = [];

    for (const arquivo of QUEM_FAZ_LOGIN) {
      const lidas = variaveisDeCredencial(arquivo);
      expect(lidas.size).toBeGreaterThan(0); // senão o levantamento não viu nada

      // `test-slow-network` aceita SMOKE_* OU SANDBOX_*; basta um par chegar.
      const temAlgum = [...lidas].some((v) => env.includes(`${v}:`));
      if (!temAlgum) faltando.push(`${arquivo} lê ${[...lidas].join(', ')}`);
    }

    expect(faltando).toEqual([]);
  });

  test('SANDBOX_EMAIL e SANDBOX_PASSWORD estão no env do job, não só num passo', () => {
    // No `if:` de um passo lê-se `env.`, nunca `secrets.` — então uma
    // credencial usada em condição PRECISA estar aqui, não no passo.
    const env = envDoJob(yml());
    expect(env).toContain('SANDBOX_EMAIL:');
    expect(env).toContain('SANDBOX_PASSWORD:');
  });

  test('a run falha (não pula) quando falta credencial', () => {
    const fonte = yml();
    const i = fonte.indexOf('Exigir credenciais do sandbox');
    expect(i).toBeGreaterThan(-1);

    const passo = fonte.slice(i, i + 1400);
    expect(passo).toMatch(/if:.*SANDBOX_EMAIL == ''.*\|\|.*SANDBOX_PASSWORD == ''/);
    // `exit 1` é o ponto: pular pintaria de verde uma run que não verificou nada.
    expect(passo).toContain('exit 1');
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

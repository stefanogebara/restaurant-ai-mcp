'use strict';

// O passo "Ignored Build Step" da Vercel: exit 0 PULA o build, exit 1 CONSTRÓI.
// O `ignoreCommand` do vercel.json passa por cima da configuração do projeto, então
// a regra "sem pré-visualização" (2026-09-23) precisa morar neste script. Em
// 10–11/nov/2026, ramos de agentes geraram cerca de doze builds pagos de
// pré-visualização porque o script só olhava os caminhos alterados.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT = path.resolve(__dirname, '../../vercel-ignore-build.sh');
const SKIP = 0;
const BUILD = 1;

function git(cwd, ...args) {
  const result = spawnSync('git', ['-c', 'user.name=teste', '-c', 'user.email=teste@exemplo.com',
    '-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
}

// Um repositório com dois commits: o último altera só `changed`.
function repoWith(changed) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ignore-build-'));
  git(dir, 'init', '-q');
  fs.writeFileSync(path.join(dir, 'README.md'), 'inicio\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'inicio');
  fs.mkdirSync(path.dirname(path.join(dir, changed)), { recursive: true });
  fs.writeFileSync(path.join(dir, changed), 'mudou\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'mudanca');
  return dir;
}

function run(cwd, vercelEnv) {
  const env = { PATH: process.env.PATH, HOME: process.env.HOME };
  if (vercelEnv !== undefined) env.VERCEL_ENV = vercelEnv;
  const result = spawnSync('bash', [SCRIPT], { cwd, env, encoding: 'utf8' });
  return { status: result.status, output: result.stdout + result.stderr };
}

const dirs = [];
const deployable = () => { const dir = repoWith('api/rota.js'); dirs.push(dir); return dir; };
const docsOnly = () => { const dir = repoWith('docs/nota.md'); dirs.push(dir); return dir; };
afterAll(() => { for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true }); });

describe('vercel-ignore-build.sh', () => {
  test.each(['preview', 'development'])('VERCEL_ENV=%s pula mesmo com código alterado', vercelEnv => {
    const { status, output } = run(deployable(), vercelEnv);
    expect(status).toBe(SKIP);
    expect(output).toMatch(/PULA/);
  });

  test('VERCEL_ENV=preview pula mesmo sem git para comparar', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ignore-build-sem-git-'));
    dirs.push(dir);
    expect(run(dir, 'preview').status).toBe(SKIP);
  });

  test('produção com código alterado constrói', () => {
    expect(run(deployable(), 'production').status).toBe(BUILD);
  });

  test('produção só com documentação pula', () => {
    expect(run(docsOnly(), 'production').status).toBe(SKIP);
  });

  test('produção sem git para comparar constrói (falha para o lado de construir)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ignore-build-sem-git-'));
    dirs.push(dir);
    expect(run(dir, 'production').status).toBe(BUILD);
  });

  test('sem VERCEL_ENV mantém a regra por caminhos', () => {
    expect(run(deployable(), undefined).status).toBe(BUILD);
    expect(run(docsOnly(), undefined).status).toBe(SKIP);
  });
});

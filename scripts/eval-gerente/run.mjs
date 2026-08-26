#!/usr/bin/env node
/**
 * Avaliação do Gerente IA — bateria completa contra um restaurante real.
 *
 *   node scripts/eval-gerente/run.mjs <restaurant_id>
 *   node scripts/eval-gerente/run.mjs <restaurant_id> --caso grafico-sem-dado
 *
 * Precisa das chaves no ambiente (OPENROUTER_API_KEY ou ANTHROPIC_API_KEY,
 * SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY). Chama `runManagerAgent`
 * diretamente, sem passar pelo /api/manager-chat — assim não precisa de login.
 *
 * O QUE ELE VERIFICA SOZINHO, e o que não verifica:
 *
 * Automático — tudo que o system prompt promete de forma checável: o idioma da
 * resposta, a boa-formação do bloco ```chart (tipo, ≤12 pontos, um por
 * resposta), a ausência de diagrama não pedido, o tamanho proporcional, e — a
 * mais importante — se os números plotados EXISTEM no contexto que o agente
 * recebeu. Série inventada é o pior defeito possível aqui: o gerente compra
 * insumo em cima dela.
 *
 * Humano — se a resposta é útil, se a conclusão segue dos números, se ele
 * admite não saber. Isso vai no relatório como pergunta, ao lado da resposta
 * inteira, para leitura rápida. Nenhuma nota é inventada por mim.
 *
 * Custo: uma chamada de LLM por caso (~20 casos). Cada rodada consome cota do
 * plano do restaurante, então rode em restaurante de teste.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';


const __dirname = dirname(fileURLToPath(import.meta.url));
const raiz = resolve(__dirname, '../..');
const require = createRequire(import.meta.url);

// `require` e não `import`: estes dois módulos são puros e precisam ser
// legíveis pelo Jest, que roda CommonJS. O runner é .mjs por causa do
// top-level await; os módulos testáveis não precisam ser.
const { CASOS } = require('./casos.js');
const { extrairBlocos, numerosDoContexto } = require('./analise.js');

// ── pré-requisitos, verificados alto ────────────────────────────────────────
const FALTANDO = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].filter((k) => !process.env[k]);
if (!process.env.OPENROUTER_API_KEY && !process.env.ANTHROPIC_API_KEY) {
  FALTANDO.push('OPENROUTER_API_KEY ou ANTHROPIC_API_KEY');
}
const restaurantId = process.argv[2];
if (!restaurantId || FALTANDO.length) {
  console.error('Uso: node scripts/eval-gerente/run.mjs <restaurant_id>');
  if (FALTANDO.length) console.error('Faltam no ambiente: ' + FALTANDO.join(', '));
  process.exit(1);
}
const soEsteCaso = process.argv.includes('--caso')
  ? process.argv[process.argv.indexOf('--caso') + 1]
  : null;

const { runManagerAgent } = require(resolve(raiz, 'api/_lib/manager-agent.js'));
const { buildRestaurantSnapshot } = (() => {
  try { return require(resolve(raiz, 'api/_services/restaurantSnapshot.js')); }
  catch { return {}; }
})();

// As partes puras (extração de blocos e varredura de números) vivem em
// analise.mjs — é o que os testes cobrem sem precisar de chave nenhuma.

// ── execução ────────────────────────────────────────────────────────────────
const casos = soEsteCaso ? CASOS.filter((c) => c.id === soEsteCaso) : CASOS;
if (!casos.length) { console.error(`Caso "${soEsteCaso}" não existe.`); process.exit(1); }

let contexto = { numeros: [] };
if (buildRestaurantSnapshot) {
  try {
    const snap = await buildRestaurantSnapshot(restaurantId);
    contexto = { snapshot: snap, numeros: [...numerosDoContexto(snap)] };
    console.log(`Contexto: ${contexto.numeros.length} números distintos no snapshot.\n`);
  } catch (e) {
    console.warn(`Snapshot indisponível (${e.message}) — a checagem de ancoragem fica DESLIGADA.\n`);
  }
}

const resultados = [];
for (const [i, caso] of casos.entries()) {
  process.stdout.write(`[${i + 1}/${casos.length}] ${caso.id} … `);
  const t0 = Date.now();
  let texto = '', erro = null;
  try {
    texto = await runManagerAgent(restaurantId, caso.pergunta, 'app');
    if (typeof texto !== 'string') texto = JSON.stringify(texto);
  } catch (e) {
    erro = e.message;
  }
  const ms = Date.now() - t0;

  const blocos = extrairBlocos(texto);
  const falhas = erro
    ? [`o agente lançou: ${erro}`]
    : caso.checa.flatMap((fn) => fn({ texto, blocos, caso, contexto }));

  resultados.push({ caso, texto, blocos, falhas, ms, erro });
  console.log(falhas.length ? `✗ ${falhas.length} falha(s) · ${ms}ms` : `✓ ${ms}ms`);
}

// ── relatório ───────────────────────────────────────────────────────────────
const passaram = resultados.filter((r) => !r.falhas.length).length;
const porGrupo = {};
for (const r of resultados) {
  const g = (porGrupo[r.caso.grupo] ??= { total: 0, ok: 0 });
  g.total++; if (!r.falhas.length) g.ok++;
}

const linhas = [
  `# Avaliação do Gerente IA`,
  ``,
  `Restaurante \`${restaurantId}\` · ${new Date().toISOString()}`,
  ``,
  `**${passaram}/${resultados.length}** casos passaram nas checagens automáticas.`,
  ``,
  `| grupo | passou |`,
  `|---|---|`,
  ...Object.entries(porGrupo).map(([g, v]) => `| ${g} | ${v.ok}/${v.total} |`),
  ``,
  `As checagens automáticas cobrem só o que o system prompt promete de forma`,
  `verificável. **O julgamento sobre utilidade é seu** — cada caso traz a`,
  `pergunta "o que olhar" ao lado da resposta inteira.`,
  ``,
  `---`,
  ``,
];

for (const r of resultados) {
  linhas.push(`## ${r.falhas.length ? '✗' : '✓'} ${r.caso.id} · _${r.caso.grupo}_ · ${r.caso.idioma}`);
  linhas.push('');
  linhas.push(`**Pergunta:** ${r.caso.pergunta}`);
  linhas.push('');
  if (r.falhas.length) {
    linhas.push(`**Falhas automáticas:**`);
    r.falhas.forEach((f) => linhas.push(`- ${f}`));
    linhas.push('');
  }
  linhas.push(`**O que olhar:** ${r.caso.olhar}`);
  linhas.push('');
  linhas.push(`**Resposta** (${r.ms}ms${r.blocos.chart.length ? ' · com gráfico' : ''}${r.blocos.mermaid.length ? ' · com diagrama' : ''}):`);
  linhas.push('');
  linhas.push('> ' + (r.texto || '(vazia)').split('\n').join('\n> '));
  linhas.push('');
}

mkdirSync(resolve(raiz, 'tasks'), { recursive: true });
const destino = resolve(raiz, 'tasks/eval-gerente.md');
writeFileSync(destino, linhas.join('\n'));

console.log(`\n${passaram}/${resultados.length} passaram nas checagens automáticas.`);
console.log(`Relatório: ${destino}`);
console.log(`As respostas inteiras estão lá — o julgamento de utilidade é humano.`);

process.exit(passaram === resultados.length ? 0 : 1);

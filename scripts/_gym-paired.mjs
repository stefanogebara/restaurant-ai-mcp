// Paired gym evaluation — the coach loop's standard evaluator (cycle 4+).
// For each active scenario: run ONE fresh simulation per version (same round,
// same harness), then judge the two transcripts head-to-head with position
// randomized deterministically per scenario index. Absolute scores are still
// stored per run (history), but the PROMOTION signal is scenario wins.
//
// Usage: node scripts/_gym-paired.mjs --versions=active,6
// Output: stderr progress; stdout last line = JSON {winsA, winsB, empates, results}.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

require('C:/Users/stefa/restaurant-ai-mcp/node_modules/dotenv').config({
  path: ['C:/Users/stefa/restaurant-ai-mcp/.env', 'C:/Users/stefa/restaurant-ai-mcp/.env.local'],
});
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

const { runGymExercise, judgePaired, listScenarios } = require('C:/Users/stefa/restaurant-ai-mcp/api/_lib/prospecting/prospect-sim');
const { supabaseAdmin } = require('C:/Users/stefa/restaurant-ai-mcp/api/_lib/supabase');

function arg(name, def = null) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : def;
}

async function resolveVersion(spec) {
  if (spec !== 'active') return parseInt(spec, 10);
  const { data } = await supabaseAdmin
    .from('prospect_style_pack').select('version').eq('active', true).maybeSingle();
  return data ? data.version : null;
}

(async () => {
  const specs = (arg('versions') || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (specs.length !== 2) { console.error('need exactly --versions=a,b'); process.exit(1); }
  const [vA, vB] = await Promise.all(specs.map(resolveVersion));
  if (vA === vB) { console.error('versions identical'); process.exit(1); }

  const scenarios = await listScenarios();
  const results = [];
  let winsA = 0, winsB = 0, empates = 0;

  for (let i = 0; i < scenarios.length; i++) {
    const sc = scenarios[i];
    // Fresh same-round transcripts for both versions.
    const [runA, runB] = [
      await runGymExercise(sc.id, { styleVersion: vA }),
      await runGymExercise(sc.id, { styleVersion: vB }),
    ];
    if (!runA.ok || !runB.ok) { console.error(`skip ${sc.nome} (sim failed)`); continue; }

    // Deterministic position flip per index (cancels position bias).
    const aFirst = i % 2 === 0;
    const desc = `${sc.nome} — ${(sc.persona && sc.persona.perfil) || ''} (humor: ${(sc.persona && sc.persona.humor) || '-'})`;
    const verdict = await judgePaired(
      desc,
      aFirst ? runA.transcript : runB.transcript,
      aFirst ? runB.transcript : runA.transcript,
    );
    if (!verdict) { console.error(`judge failed ${sc.nome}`); continue; }

    let winner = 'empate';
    if (verdict.vencedor !== 'empate') {
      const first = aFirst ? `v${vA}` : `v${vB}`;
      const second = aFirst ? `v${vB}` : `v${vA}`;
      winner = verdict.vencedor === 'A' ? first : second;
    }
    if (winner === `v${vA}`) winsA++; else if (winner === `v${vB}`) winsB++; else empates++;

    results.push({
      cenario: sc.nome, vencedor: winner, margem: verdict.margem, motivo: verdict.motivo,
      terminalA: runA.terminal || null, terminalB: runB.terminal || null,
    });
    console.error(`${sc.nome}: ${winner} (margem ${verdict.margem})`);
  }

  console.log(JSON.stringify({ vA: `v${vA}`, vB: `v${vB}`, winsA, winsB, empates, results }, null, 0));
  process.exit(0);
})().catch((e) => { console.error('gym-paired failed:', e.message); process.exit(1); });

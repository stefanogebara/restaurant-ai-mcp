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

const { runGymExercise, judgePaired, listScenarios, PAIRED_LENSES } = require('C:/Users/stefa/restaurant-ai-mcp/api/_lib/prospecting/prospect-sim');
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

    // Cycle-8 upgrade: 3 votes per scenario — one per lens — majority decides.
    // Near-tie packs saturate a single holistic judgment; criteria diversity
    // discriminates. Position flips per (scenario, lens) to cancel bias.
    const desc = `${sc.nome} — ${(sc.persona && sc.persona.perfil) || ''} (humor: ${(sc.persona && sc.persona.humor) || '-'})`;
    const lenses = Object.keys(PAIRED_LENSES);
    const votes = [];
    for (let li = 0; li < lenses.length; li++) {
      const aFirst = (i + li) % 2 === 0;
      const verdict = await judgePaired(
        desc,
        aFirst ? runA.transcript : runB.transcript,
        aFirst ? runB.transcript : runA.transcript,
        lenses[li],
      );
      if (!verdict) { console.error(`judge failed ${sc.nome} lente=${lenses[li]}`); continue; }
      let voteFor = 'empate';
      if (verdict.vencedor !== 'empate') {
        const first = aFirst ? `v${vA}` : `v${vB}`;
        const second = aFirst ? `v${vB}` : `v${vA}`;
        voteFor = verdict.vencedor === 'A' ? first : second;
      }
      votes.push({ lente: lenses[li], voto: voteFor, margem: verdict.margem, motivo: verdict.motivo });
    }
    if (votes.length === 0) { console.error(`all judges failed ${sc.nome}`); continue; }

    const tally = { [`v${vA}`]: 0, [`v${vB}`]: 0 };
    for (const v of votes) if (tally[v.voto] != null) tally[v.voto]++;
    const need = Math.floor(votes.length / 2) + 1; // majority of votes that landed
    const winner = tally[`v${vA}`] >= need ? `v${vA}` : tally[`v${vB}`] >= need ? `v${vB}` : 'empate';
    if (winner === `v${vA}`) winsA++; else if (winner === `v${vB}`) winsB++; else empates++;

    results.push({
      cenario: sc.nome, vencedor: winner,
      votos: votes.map((v) => `${v.lente}:${v.voto}`).join(' '),
      motivos: votes.map((v) => `[${v.lente}] ${v.motivo}`),
      terminalA: runA.terminal || null, terminalB: runB.terminal || null,
    });
    console.error(`${sc.nome}: ${winner} (${votes.map((v) => `${v.lente}=${v.voto}`).join(', ')})`);
  }

  console.log(JSON.stringify({ vA: `v${vA}`, vB: `v${vB}`, winsA, winsB, empates, results }, null, 0));
  process.exit(0);
})().catch((e) => { console.error('gym-paired failed:', e.message); process.exit(1); });

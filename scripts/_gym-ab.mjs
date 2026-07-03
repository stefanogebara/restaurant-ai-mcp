// Gym A/B runner — reusable by the coach training loop.
// Runs the REAL brain in the sandbox for each (scenario × style version) and
// prints a JSON report (stdout, last line) for programmatic consumption.
//
// Usage:
//   node scripts/_gym-ab.mjs --scenarios=dono-ocupado-bolhas,cetico-preco --versions=1,2
//   node scripts/_gym-ab.mjs --all --versions=active,3
// 'active' resolves to the currently active pack version.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

require('C:/Users/stefa/restaurant-ai-mcp/node_modules/dotenv').config({
  path: ['C:/Users/stefa/restaurant-ai-mcp/.env', 'C:/Users/stefa/restaurant-ai-mcp/.env.local'],
});
// Stale local Redis instance is irrelevant to the sandbox.
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

const { runGymExercise, listScenarios } = require('C:/Users/stefa/restaurant-ai-mcp/api/_lib/prospecting/prospect-sim');
const { supabaseAdmin } = require('C:/Users/stefa/restaurant-ai-mcp/api/_lib/supabase');

function arg(name, def = null) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : def;
}

const wantAll = process.argv.includes('--all');
const scenarioNames = (arg('scenarios') || '').split(',').map((s) => s.trim()).filter(Boolean);
const versionSpecs = (arg('versions') || 'active').split(',').map((s) => s.trim()).filter(Boolean);

async function resolveVersions() {
  const out = [];
  for (const v of versionSpecs) {
    if (v === 'active') {
      const { data } = await supabaseAdmin
        .from('prospect_style_pack').select('version').eq('active', true).maybeSingle();
      out.push(data ? data.version : null);
    } else {
      out.push(parseInt(v, 10));
    }
  }
  return [...new Set(out)];
}

(async () => {
  const scenarios = await listScenarios();
  const targets = wantAll
    ? scenarios
    : scenarios.filter((s) => scenarioNames.includes(s.nome));
  if (targets.length === 0) {
    console.error('no scenarios matched'); process.exit(1);
  }
  const versions = await resolveVersions();

  const runs = [];
  for (const sc of targets) {
    for (const version of versions) {
      const r = await runGymExercise(sc.id, { styleVersion: version });
      const s = r.scores || {};
      runs.push({
        cenario: sc.nome, versao: version, media: s.media ?? null,
        humanidade: s.humanidade ?? null, naturalidade: s.naturalidade ?? null,
        sobriedade: s.sobriedade ?? null, bolhas: s.bolhas ?? null,
        repeticao: s.repeticao ?? null, avanco: s.avanco ?? null,
        adaptacao: s.adaptacao ?? null, terminal: r.terminal || null,
        veredicto: s.veredicto || null, run_id: r.runId,
      });
      console.error(`done ${sc.nome} v${version} → ${s.media ?? '—'}`);
    }
  }

  // Per-version aggregate (mean of means + per-dimension means).
  const dims = ['media', 'humanidade', 'naturalidade', 'sobriedade', 'bolhas', 'repeticao', 'avanco', 'adaptacao'];
  const agg = {};
  for (const version of versions) {
    const vs = runs.filter((r) => r.versao === version);
    agg[`v${version}`] = Object.fromEntries(dims.map((d) => {
      const vals = vs.map((r) => r[d]).filter((x) => x != null);
      return [d, vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : null];
    }));
  }

  console.log(JSON.stringify({ runs, agg }, null, 0));
  process.exit(0);
})().catch((e) => { console.error('gym-ab failed:', e.message); process.exit(1); });

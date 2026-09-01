#!/usr/bin/env node
/**
 * Responde UMA pergunta que a doc da ElevenLabs não responde:
 *
 *   a mudança de default de 24/08/2026 (mic_muting_enabled e transcript_enabled
 *   de false para true) se aplicou RETROATIVAMENTE aos agentes já criados, ou
 *   só vale para agentes novos?
 *
 * Isso decide o tamanho do estrago. Se for retroativa, todo restaurante que já
 * tem agente teve o widget alterado sem aviso. Se não for, só os novos nasceram
 * diferentes — e o commit que trouxe esta sonda já fecha esse caso, porque
 * passou a enviar os dois campos explicitamente.
 *
 * SÓ LEITURA: um GET por agente, nada é escrito. Rodar é seguro em produção.
 *
 * Uso:
 *   ELEVENLABS_API_KEY=xxx node scripts/probe-elevenlabs-widget-defaults.js <agent_id> [agent_id...]
 *
 * Sem argumento, tenta descobrir agentes pelo Supabase (precisa de
 * SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY).
 */

const BASE = 'https://api.elevenlabs.io/v1/convai';
const KEY = process.env.ELEVENLABS_API_KEY;

if (!KEY) {
  console.error('Defina ELEVENLABS_API_KEY.');
  process.exit(2);
}

async function idsDoSupabase() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return [];
  const { createClient } = require('@supabase/supabase-js');
  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await db
    .schema('restaurant').from('restaurant_config')
    .select('id, restaurant_name, elevenlabs_agent_id')
    .not('elevenlabs_agent_id', 'is', null);
  if (error) { console.error('Supabase:', error.message); return []; }
  return data.map((r) => ({ id: r.elevenlabs_agent_id, nome: r.restaurant_name }));
}

async function lerAgente(agentId) {
  const res = await fetch(`${BASE}/agents/${agentId}`, { headers: { 'xi-api-key': KEY } });
  const texto = await res.text();
  if (!res.ok) return { erro: `HTTP ${res.status}: ${texto.slice(0, 140)}` };
  let d; try { d = JSON.parse(texto); } catch { return { erro: 'resposta não-JSON' }; }
  const w = d?.platform_settings?.widget_config ?? {};
  return {
    criado: d?.metadata?.created_at_unix_secs
      ? new Date(d.metadata.created_at_unix_secs * 1000).toISOString().slice(0, 10)
      : '?',
    mic: w.mic_muting_enabled,
    transcript: w.transcript_enabled,
  };
}

(async () => {
  const args = process.argv.slice(2);
  const alvos = args.length ? args.map((id) => ({ id, nome: '' })) : await idsDoSupabase();

  if (!alvos.length) {
    console.error('Nenhum agente. Passe agent_id como argumento ou configure o Supabase.');
    process.exit(2);
  }

  console.log(`\nDefaults de widget — ${alvos.length} agente(s)\n${'='.repeat(64)}`);
  console.log('criado      mic_muting  transcript  agente');

  const antes = [];  // criados ANTES de 24/08/2026: são eles que respondem a pergunta
  for (const a of alvos) {
    const r = await lerAgente(a.id);
    if (r.erro) { console.log(`  ✗ ${a.id}: ${r.erro}`); continue; }
    console.log(`${r.criado}  ${String(r.mic).padEnd(11)} ${String(r.transcript).padEnd(11)} ${a.nome || a.id}`);
    if (r.criado !== '?' && r.criado < '2026-08-24') antes.push(r);
  }

  if (!antes.length) {
    console.log('\nINCONCLUSIVO — nenhum agente criado antes de 24/08/2026 nesta amostra.');
    console.log('Só um agente anterior à mudança pode dizer se ela foi retroativa.\n');
    process.exit(1);
  }
  const mudou = antes.some((r) => r.mic === true || r.transcript === true);
  console.log(mudou
    ? `\nRETROATIVA — ${antes.length} agente(s) anterior(es) a 24/08 estão com o default NOVO.\nTodo restaurante existente teve o widget alterado sem aviso.\n`
    : `\nNÃO RETROATIVA — os ${antes.length} agente(s) anteriores preservaram o default antigo.\nSó agentes novos nasciam diferentes, e isso já está fechado: o payload agora envia os dois campos explicitamente.\n`);
})();

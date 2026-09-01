#!/usr/bin/env node
/**
 * Calibra o gatilho de transbordo humano contra CONVERSA REAL.
 *
 * Este é o experimento do spike `whatsapp-transbordo-humano` que NÃO pôde
 * rodar no ambiente onde o recurso foi construído: lá não havia
 * SUPABASE_SERVICE_ROLE_KEY nem OPENROUTER_API_KEY, e inventar 20 transcrições
 * para depois "medir" contra elas mediria a minha imaginação, não o produto.
 *
 * A pergunta é uma só, e a resposta decide se o recurso pode ser ligado:
 *
 *   o gatilho dispara onde a IA hoje se esquiva, SEM disparar onde ela já
 *   resolvia sozinha?
 *
 * CRITÉRIOS, escritos antes de rodar (do BACKLOG.md):
 *   sucesso  = dispara em ≥15 das 20 conversas em que hoje sai a esquiva
 *   PARE     = QUALQUER falso-positivo. Transbordo mal calibrado transforma
 *              automação em plantão humano e vale menos que a esquiva atual.
 *
 * SÓ LEITURA no banco. Não pausa sessão, não manda WhatsApp para ninguém: só
 * reexecuta o modelo sobre histórico já gravado e conta o que ELE decidiria.
 *
 * Uso:
 *   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… OPENROUTER_API_KEY=… \
 *     node scripts/calibrate-whatsapp-handoff.js [--n 20] [--restaurant <uuid>]
 */

const { createClient } = require('@supabase/supabase-js');

const N = Number(process.argv[process.argv.indexOf('--n') + 1]) || 20;
const RESTAURANT = process.argv.includes('--restaurant')
  ? process.argv[process.argv.indexOf('--restaurant') + 1]
  : null;

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENROUTER_API_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !OPENROUTER_API_KEY) {
  console.error('Faltam SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e OPENROUTER_API_KEY.');
  process.exit(2);
}

const { HANDOFF_TOOL } = require('../api/_services/whatsapp/handoff');

/**
 * A frase que o system prompt manda usar quando a IA não sabe
 * (conversation.js:244). É ela que marca a conversa como "deveria ter
 * escalado" — o rótulo sai do próprio produto, não de julgamento meu.
 */
const ESQUIVA = [
  /posso verificar isso e te respondo/i,
  /i can check (on )?that and get back/i,
  /puedo verificar eso y te respondo/i,
];

const temEsquiva = (h) =>
  (h || []).some((m) => m.role === 'assistant' && ESQUIVA.some((r) => r.test(String(m.content || ''))));

async function decideEscalar(historico) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'openai/gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Você é o atendente de WhatsApp de um restaurante. Responda ao cliente ou use uma ferramenta.' },
        ...historico.filter((m) => m.role === 'user' || m.role === 'assistant'),
      ],
      tools: [HANDOFF_TOOL],
    }),
  });
  if (!res.ok) return { erro: `HTTP ${res.status}` };
  const d = await res.json();
  const calls = d?.choices?.[0]?.message?.tool_calls || [];
  return { escalou: calls.some((c) => c.function?.name === 'handoff_to_human') };
}

(async () => {
  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  let q = db.from('whatsapp_sessions')
    .select('id, sender_phone, restaurant_id, conversation_history')
    .not('conversation_history', 'is', null)
    .order('last_message_at', { ascending: false })
    .limit(N * 6);
  if (RESTAURANT) q = q.eq('restaurant_id', RESTAURANT);

  const { data, error } = await q;
  if (error) { console.error('Supabase:', error.message); process.exit(1); }

  const conversas = (data || []).filter((s) => Array.isArray(s.conversation_history) && s.conversation_history.length >= 2);
  const comEsquiva = conversas.filter((s) => temEsquiva(s.conversation_history)).slice(0, N);
  const semEsquiva = conversas.filter((s) => !temEsquiva(s.conversation_history)).slice(0, N);

  console.log(`\nCalibração do transbordo — ${comEsquiva.length} com esquiva, ${semEsquiva.length} sem\n${'='.repeat(64)}`);
  if (comEsquiva.length < N) {
    console.log(`AVISO: só ${comEsquiva.length} conversas com esquiva (o alvo era ${N}). Amostra pequena mede pouco.`);
  }

  let acertos = 0, falsosPositivos = 0, erros = 0;
  for (const s of comEsquiva) {
    const r = await decideEscalar(s.conversation_history);
    if (r.erro) { erros++; continue; }
    if (r.escalou) acertos++;
    console.log(`  ${r.escalou ? '✓' : '·'} esquiva  ${s.id.slice(0, 8)}  ${r.escalou ? 'escalou' : 'NÃO escalou'}`);
  }
  for (const s of semEsquiva) {
    const r = await decideEscalar(s.conversation_history);
    if (r.erro) { erros++; continue; }
    if (r.escalou) {
      falsosPositivos++;
      console.log(`  ✗ resolvida ${s.id.slice(0, 8)}  ESCALOU — falso-positivo`);
    }
  }

  console.log(`\nDisparou em ${acertos}/${comEsquiva.length} das conversas com esquiva.`);
  console.log(`Falsos-positivos: ${falsosPositivos}${erros ? ` · ${erros} chamada(s) com erro` : ''}`);

  if (falsosPositivos > 0) {
    console.log('\nPARE. O critério do spike é falso-positivo ZERO — a descrição da tool precisa apertar antes de ligar em qualquer restaurante.\n');
    process.exit(1);
  }
  if (acertos >= 15) {
    console.log('\nAPROVADO. Ligue por restaurante com whatsapp_handoff_enabled = true, um de cada vez.\n');
    process.exit(0);
  }
  console.log('\nINSUFICIENTE — dispara de menos. Sem falso-positivo, então o ajuste é afrouxar a descrição, não apertar.\n');
  process.exit(1);
})();

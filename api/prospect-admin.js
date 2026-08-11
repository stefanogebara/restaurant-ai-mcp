'use strict';

/**
 * Internal prospecting ops platform API (Phase 5 cockpit → Phase 7 platform).
 * Lets the founder watch Olímpia's conversations, discover + mass-dispatch
 * leads, take over conversations, and stop the agent globally. Gated by the
 * EXISTING Google-login JWT + an admin-email allowlist
 * (PROSPECTING_ADMIN_EMAILS, default the founder) — deliberately NOT tied to
 * the multi-tenant restaurant flow (prospecting is a single internal tenant).
 *
 *   GET  /api/prospect-admin?action=list[&state=]   → { leads, counts, agent_enabled, dry_run }
 *   GET  /api/prospect-admin?action=lead&lead_id=ID → { lead, messages, can_free_text }
 *   POST /api/prospect-admin?action=pause      { lead_id }  → state 'pausada'
 *   POST /api/prospect-admin?action=reactivate { lead_id }  → state 'conversando'
 *   POST /api/prospect-admin?action=optout     { lead_id }  → suppression + 'optout'
 *   POST /api/prospect-admin?action=won        { lead_id }  → state 'ganho' (closed
 *        won, terminal + silent — stops the cold-handoff reclaim from re-warming
 *        a customer; 'reactivate' is the undo).
 *   POST /api/prospect-admin?action=send       { lead_id, texto, keep_active? }
 *        → operator message from the prospecting number; pauses the agent for
 *          that lead by default (human takeover), 24h-window enforced.
 *   POST /api/prospect-admin?action=agent      { enabled }  → GLOBAL kill switch
 *        (cron_config row 'prospecting-agent'; responder+sequencer check it).
 *   POST /api/prospect-admin?action=discover   { query?, city, uf?, bairro?, maxResults? }
 *        → Google Places search + upsert into prospect_leads.
 *   POST /api/prospect-admin?action=dispatch   { limit? } → cold-intro mass send
 *        (warm-up daily cap + opt-out suppression + dry-run rules all apply).
 */

const { setInternalCors, handlePreflight } = require('./_lib/cors');
const { verifyAuth } = require('./_lib/auth');
const { createSecureLogger } = require('./_lib/secure-logger');
const { supabaseAdmin } = require('./_lib/supabase');
const { sendWhatsAppMessage } = require('./_lib/whatsapp-sender');
const { getProspectingPhoneNumberId } = require('./_lib/prospecting/routing');
const {
  listProspectLeads, getProspectLeadWithMessages, patchLead, recordOptout,
  storeMessage, loadLastInbound, recordEvent, recordNote, updateIntent,
  listTemplates, upsertTemplate, listCanned, upsertCanned, deleteCanned,
  markLeadWon,
} = require('./_lib/prospecting/prospect-store');
const { INTENTS } = require('./_lib/prospecting/prospect-reflect');
const { numberHealth } = require('./_lib/prospecting/prospect-receipts');
const { statusBucket, bucketCounts } = require('./_lib/prospecting/prospect-admin-view');
const { podeMensagemLivre } = require('./_lib/prospecting/prospect-nudge');
const { getCronConfig } = require('./_lib/cron-config');
const { onlyDigits } = require('./_lib/prospecting/phone');

const logger = createSecureLogger('ProspectAdmin');

const AGENT_JOB = 'prospecting-agent';

function adminEmails() {
  return String(process.env.PROSPECTING_ADMIN_EMAILS || 'stefanogebara@gmail.com')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

async function setAgentEnabled(enabled, email) {
  const { error } = await supabaseAdmin.from('cron_config').upsert({
    job_name: AGENT_JOB,
    enabled: !!enabled,
    notes: `prospecting global switch (via platform by ${email})`,
    updated_at: new Date().toISOString(),
    updated_by: email,
  }, { onConflict: 'job_name' });
  if (error) throw new Error(`cron_config upsert failed: ${error.message}`);
}

module.exports = async (req, res) => {
  setInternalCors(req, res);
  if (handlePreflight(req, res)) return;

  // Existing Google-login JWT + admin allowlist (internal tool, not a tenant route).
  const auth = await verifyAuth(req);
  if (auth.error) return res.status(auth.status || 401).json({ success: false, error: auth.error });
  const email = String((auth.user && auth.user.email) || '').toLowerCase();
  if (!email || !adminEmails().includes(email)) {
    logger.warn(`prospect-admin denied for ${email || 'unknown'}`);
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }

  const action = String((req.query && req.query.action) || '').toLowerCase();

  try {
    if (req.method === 'GET' && action === 'list') {
      const state = (req.query.state && String(req.query.state)) || null;
      const [leads, agentCfg] = await Promise.all([
        listProspectLeads({ limit: 300, state }),
        getCronConfig(AGENT_JOB),
      ]);
      const withBucket = leads.map((l) => ({ ...l, bucket: statusBucket(l) }));
      return res.status(200).json({
        success: true,
        data: {
          leads: withBucket,
          counts: bucketCounts(leads),
          agent_enabled: agentCfg.enabled,
          dry_run: !getProspectingPhoneNumberId() || process.env.PROSPECTING_DRY_RUN !== 'false',
        },
      });
    }

    // ---- Overview ("what's going on") for the standalone ops console ----------
    if (req.method === 'GET' && action === 'overview') {
      const hoje = new Date(); hoje.setUTCHours(0, 0, 0, 0);
      const hojeIso = hoje.toISOString();
      const nowIso = new Date().toISOString();
      const [agentCfg, dispatchCfg, outStats, inStats, meetings, outcomes, health, dueTouches] = await Promise.all([
        getCronConfig(AGENT_JOB),
        getCronConfig('prospecting-dispatch'),
        supabaseAdmin.from('prospect_messages').select('id', { count: 'exact', head: true })
          .eq('direcao', 'out').gte('enviada_em', hojeIso),
        supabaseAdmin.from('prospect_messages').select('id', { count: 'exact', head: true })
          .eq('direcao', 'in').gte('enviada_em', hojeIso),
        supabaseAdmin.from('prospect_leads').select('id, name, city, reuniao_at, reuniao_link')
          .gt('reuniao_at', nowIso).order('reuniao_at', { ascending: true }).limit(10),
        supabaseAdmin.rpc('prospect_outcomes_agg', { p_dias: 30 }),
        numberHealth(),
        supabaseAdmin.from('prospect_leads').select('id', { count: 'exact', head: true })
          .not('next_touch_at', 'is', null).lte('next_touch_at', nowIso)
          .is('last_in_at', null).lt('touch_count', 3),
      ]);
      return res.status(200).json({
        success: true,
        data: {
          agent_enabled: agentCfg.enabled,
          dispatch_enabled: dispatchCfg.enabled,
          dispatch_note: dispatchCfg.enabled ? null : dispatchCfg.notes,
          dry_run: !getProspectingPhoneNumberId() || process.env.PROSPECTING_DRY_RUN !== 'false',
          daily_cap: await require('./_lib/prospecting/prospect-warmup').currentCap(),
          sent_today: outStats.count ?? 0,
          received_today: inStats.count ?? 0,
          due_followups: dueTouches.count ?? 0,
          meetings: meetings.data || [],
          outcomes: outcomes.data || null,
          health,
        },
      });
    }

    // ---- Motor: o que faz a Olímpia emudecer ---------------------------------
    //
    // Três coisas a silenciaram nas últimas semanas e NENHUMA aparecia na tela:
    // saldo do LLM zerado (31/07, US$-0,03), cron do motor parado, e lead com
    // pergunta esperando resposta (Coco Bambu, 15h de silêncio com o painel
    // verde). Este endpoint junta os três num lugar só.
    //
    // Reusa a lib de saúde de cron em _lib/ — dar require em api/cron/health.js
    // daqui derrubaria ESTA função do manifesto da Vercel, sem erro de build.
    if (req.method === 'GET' && action === 'motor') {
      const HORAS_ESPERANDO = 2;
      // Teto do que dá pra varrer numa requisição. Se a fila de candidatos
      // encostar nele, o número vira "pelo menos N" — dizer um número exato
      // que não é exato seria repetir a doença que este painel combate.
      const TETO_CANDIDATOS = 500;
      const CRONS_DO_MOTOR = [
        'prospect-flush', 'prospect-nudge', 'prospect-enrich',
        'prospect-score-outcomes', 'prospect-handoff-digest',
      ];
      const limite = new Date(Date.now() - HORAS_ESPERANDO * 3600 * 1000).toISOString();

      const desde24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const [llm, saude, candidatos, indicados, fallbacks, gastos] = await Promise.all([
        require('./_lib/integration-probes').sondarOpenRouter(process.env).catch((e) => ({
          nome: 'ia_primaria_openrouter', status: 'falha', detalhe: `sonda falhou: ${e.message}`,
        })),
        require('./_lib/cron-health').checkCronHealth().catch(() => null),
        // Leads que FALARAM e ainda não foram respondidos.
        //
        // Ordem DESCENDENTE de propósito. Com `ascending: true` e teto de 50, a
        // consulta trazia os mais ANTIGOS e cortava fora os recentes — o lead
        // que escreveu há 9h sumia da conta enquanto um de 600h entrava. Um
        // alarme que esconde o caso urgente é pior que não ter alarme.
        supabaseAdmin.from('prospect_leads')
          .select('id, name, last_in_at', { count: 'exact' })
          .in('prospect_state', ['conversando', 'agendando'])
          .not('last_in_at', 'is', null)
          .lt('last_in_at', limite)
          .order('last_in_at', { ascending: false })
          .limit(TETO_CANDIDATOS),
        // Casas que publicaram OUTRO número (menu do robô, "fale com a
        // central"). O Zé Leite mandou o número de reservas na primeira
        // resposta e ninguém viu — duas semanas no número errado.
        supabaseAdmin.from('prospect_leads')
          .select('id, name, numero_indicado, numero_indicado_contexto')
          .not('numero_indicado', 'is', null)
          .not('prospect_state', 'in', '("ganho","optout")')
          .order('numero_indicado_em', { ascending: false })
          .limit(20),
        // O cérebro trocou de bolso? Quando o OpenRouter zera, o ai-client cai
        // pra Anthropic direta e o gasto some do painel que o fundador olha.
        supabaseAdmin.from('ai_provider_fallbacks')
          .select('ocorrido_em, de, para, model', { count: 'exact' })
          .gte('ocorrido_em', desde24h)
          .order('ocorrido_em', { ascending: false })
          .limit(1),
        // Gasto real das últimas 24h, por chamador. Responde "onde está o
        // ralo" — modelo sozinho não diz se foi agente, cron ou eval.
        supabaseAdmin.from('ai_spend')
          .select('origem, custo_usd')
          .gte('ocorrido_em', desde24h)
          .limit(2000),
      ]);

      // Sem resposta = nenhuma saída DEPOIS da última entrada. Uma consulta só
      // para todos os candidatos, comparando por lead.
      let esperando = [];
      const ids = (candidatos.data || []).map((l) => l.id);
      if (ids.length) {
        const { data: saidas } = await supabaseAdmin.from('prospect_messages')
          .select('lead_id, created_at')
          .eq('direcao', 'out')
          .in('lead_id', ids);
        const ultimaSaida = {};
        for (const m of (saidas || [])) {
          if (!ultimaSaida[m.lead_id] || m.created_at > ultimaSaida[m.lead_id]) {
            ultimaSaida[m.lead_id] = m.created_at;
          }
        }
        esperando = (candidatos.data || [])
          .filter((l) => !ultimaSaida[l.id] || ultimaSaida[l.id] < l.last_in_at)
          .map((l) => ({
            id: l.id,
            name: l.name,
            horas: Math.floor((Date.now() - new Date(l.last_in_at).getTime()) / 3600000),
          }));
      }
      // Varredura truncada: o total é piso, não valor exato.
      const parcial = (candidatos.data || []).length >= TETO_CANDIDATOS;

      const crons = (saude?.jobs || [])
        .filter((j) => CRONS_DO_MOTOR.includes(j.name))
        .map((j) => ({ name: j.name, status: j.status, age: j.age }));

      return res.status(200).json({
        success: true,
        data: {
          llm: { status: llm.status, detalhe: llm.detalhe },
          // null quando a checagem de cron falhou — o front mostra "não sei",
          // que é diferente de "está tudo bem".
          crons: saude ? crons : null,
          esperando: {
            horas_minimas: HORAS_ESPERANDO,
            total: esperando.length,
            parcial,
            leads: esperando.slice(0, 5),
          },
          // Para onde o dinheiro foi nas últimas 24h. `null` = não consegui ler.
          gasto: gastos.error ? null : (() => {
            const linhas = gastos.data || [];
            const porOrigem = {};
            let total = 0;
            for (const g of linhas) {
              const c = Number(g.custo_usd) || 0;
              total += c;
              porOrigem[g.origem] = (porOrigem[g.origem] || 0) + c;
            }
            const top = Object.entries(porOrigem).sort((a, b) => b[1] - a[1]).slice(0, 3)
              .map(([origem, usd]) => ({ origem, usd: Number(usd.toFixed(4)) }));
            return { total_24h: Number(total.toFixed(4)), chamadas: linhas.length, top };
          })(),
          // Plano B disparou: o gasto migrou do OpenRouter pra Anthropic.
          // `null` quando a consulta falhou — o front diz "não sei", não "zero".
          fallback: fallbacks.error ? null : {
            total_24h: fallbacks.count ?? 0,
            ultimo: fallbacks.data?.[0]?.ocorrido_em ?? null,
            para: fallbacks.data?.[0]?.para ?? null,
          },
          // A agente NÃO escreve para estes números — quem decide é o fundador.
          indicados: (indicados.data || []).map((l) => ({
            id: l.id,
            name: l.name,
            numero: l.numero_indicado,
            contexto: l.numero_indicado_contexto,
          })),
        },
      });
    }

    // ---- Insights (F7): mined from outcomes/messages already collected --------
    if (req.method === 'GET' && action === 'insights') {
      const dias = Math.min(Math.max(parseInt(req.query.dias, 10) || 30, 7), 90);
      const { data, error } = await supabaseAdmin.rpc('prospect_insights', { p_dias: dias });
      if (error) return res.status(500).json({ success: false, error: 'Insights failed' });
      return res.status(200).json({ success: true, data });
    }

    // ---- Variants (F2): registered templates + per-variant funnel --------------
    if (req.method === 'GET' && action === 'variants') {
      const [templates, funnel] = await Promise.all([
        listTemplates(),
        supabaseAdmin.rpc('prospect_variant_funnel'),
      ]);
      return res.status(200).json({
        success: true,
        data: { templates, funnel: funnel.data || [] },
      });
    }

    // ---- WhatsApp identity & template lifecycle (management plane) ------------
    if (req.method === 'GET' && action === 'wa-identity') {
      const phoneNumberId = getProspectingPhoneNumberId();
      if (!phoneNumberId) return res.status(422).json({ success: false, error: 'Prospecting number not configured' });
      const { getNumberIdentity, listMetaTemplates } = require('./_lib/prospecting/wa-management');
      const [identity, metaTemplates, registry] = await Promise.all([
        getNumberIdentity(phoneNumberId),
        listMetaTemplates().catch((err) => { logger.error('listMetaTemplates:', err.message); return []; }),
        listTemplates(),
      ]);
      return res.status(200).json({ success: true, data: { identity, meta_templates: metaTemplates, registry } });
    }

    if (req.method === 'POST' && action === 'template-create') {
      const body = req.body || {};
      const { createMetaTemplate } = require('./_lib/prospecting/wa-management');
      const created = await createMetaTemplate({
        name: body.name, language: body.language || 'pt_BR',
        category: body.category || 'MARKETING',
        bodyText: body.body_text, exampleParam: body.example_param,
        // Um exemplo por variável ({{1}}..{{n}}) e respostas rápidas: é o que os
        // templates do fundador precisam. Sem isto o único caminho era a
        // interface da Meta, onde eles acabaram criados na WABA errada.
        exampleParams: Array.isArray(body.example_params) ? body.example_params : undefined,
        quickReplies: Array.isArray(body.quick_replies) ? body.quick_replies : undefined,
        buttonText: body.button_text, buttonUrl: body.button_url,
      });
      if (!created.ok) return res.status(400).json({ success: false, error: created.error });
      // Register in the touch registry (inactive until Meta approves + operator activates).
      if (body.touch_number) {
        await upsertTemplate({
          touch_number: parseInt(body.touch_number, 10),
          variant_label: String(body.variant_label || 'A'),
          meta_template_name: created.name,
          template_lang: body.language || 'pt_BR',
          active: false,
        });
      }
      logger.info(`prospect-admin template-create name=${created.name} by=${email}`);
      return res.status(200).json({ success: true, data: created });
    }

    if (req.method === 'POST' && action === 'wa-profile') {
      const body = req.body || {};
      const phoneNumberId = getProspectingPhoneNumberId();
      if (!phoneNumberId) return res.status(422).json({ success: false, error: 'Prospecting number not configured' });
      const { setProfilePicture, updateBusinessProfile } = require('./_lib/prospecting/wa-management');
      const results = {};
      if (body.image_url) {
        const pic = await setProfilePicture(phoneNumberId, String(body.image_url));
        if (!pic.ok) return res.status(400).json({ success: false, error: `Foto: ${pic.error}` });
        results.picture = true;
      }
      if (body.about != null || body.description != null || body.website || body.email != null) {
        const upd = await updateBusinessProfile(phoneNumberId, {
          about: body.about, description: body.description, email: body.email,
          websites: body.website ? [String(body.website)] : undefined,
        });
        if (!upd.ok) return res.status(400).json({ success: false, error: `Perfil: ${upd.error}` });
        results.profile = true;
      }
      if (!Object.keys(results).length) return res.status(400).json({ success: false, error: 'nothing to update' });
      logger.info(`prospect-admin wa-profile updated ${Object.keys(results).join('+')} by=${email}`);
      return res.status(200).json({ success: true, data: results });
    }

    if (req.method === 'POST' && action === 'template-upsert') {
      const result = await upsertTemplate(req.body || {});
      if (!result.ok) return res.status(400).json({ success: false, error: result.error });
      logger.info(`prospect-admin template-upsert by=${email}`);
      return res.status(200).json({ success: true });
    }

    // ---- Canned responses (F8) --------------------------------------------------
    if (req.method === 'GET' && action === 'canned') {
      return res.status(200).json({ success: true, data: await listCanned() });
    }
    if (req.method === 'POST' && action === 'canned-upsert') {
      const result = await upsertCanned(req.body || {});
      if (!result.ok) return res.status(400).json({ success: false, error: result.error });
      return res.status(200).json({ success: true });
    }
    if (req.method === 'POST' && action === 'canned-delete') {
      const id = req.body && req.body.id;
      if (!id) return res.status(400).json({ success: false, error: 'id required' });
      const result = await deleteCanned(String(id));
      if (!result.ok) return res.status(400).json({ success: false, error: result.error });
      return res.status(200).json({ success: true });
    }

    // ---- Gym (Phase 10): scenario simulation + style-pack training --------------
    if (req.method === 'GET' && action === 'gym') {
      const { listScenarios, listRuns } = require('./_lib/prospecting/prospect-sim');
      const { listStylePacks } = require('./_lib/prospecting/prospect-store');
      const [scenarios, runs, packs] = await Promise.all([listScenarios(), listRuns(null, 50), listStylePacks()]);
      return res.status(200).json({ success: true, data: { scenarios, runs, packs } });
    }

    if (req.method === 'GET' && action === 'gym-run') {
      const runId = req.query.run_id && String(req.query.run_id);
      if (!runId) return res.status(400).json({ success: false, error: 'run_id required' });
      const { getRun } = require('./_lib/prospecting/prospect-sim');
      const run = await getRun(runId);
      if (!run) return res.status(404).json({ success: false, error: 'Run not found' });
      return res.status(200).json({ success: true, data: run });
    }

    if (req.method === 'POST' && action === 'gym-exercise') {
      const scenarioId = req.body && req.body.scenario_id ? String(req.body.scenario_id) : null;
      if (!scenarioId) return res.status(400).json({ success: false, error: 'scenario_id required' });
      const styleVersion = req.body && req.body.style_version != null
        ? parseInt(req.body.style_version, 10) : null;
      const { runGymExercise } = require('./_lib/prospecting/prospect-sim');
      const result = await runGymExercise(scenarioId, { styleVersion });
      if (!result.ok) return res.status(400).json({ success: false, error: result.error });
      logger.info(`prospect-admin gym-exercise scenario=${scenarioId} style=${styleVersion ?? 'active'} by=${email}`);
      return res.status(200).json({ success: true, data: result });
    }

    if (req.method === 'POST' && action === 'style-pack-save') {
      const { saveStylePack } = require('./_lib/prospecting/prospect-store');
      const result = await saveStylePack(req.body || {});
      if (!result.ok) return res.status(400).json({ success: false, error: result.error });
      logger.info(`prospect-admin style-pack-save v${result.version} by=${email}`);
      return res.status(200).json({ success: true, data: { version: result.version } });
    }

    if (req.method === 'POST' && action === 'style-pack-activate') {
      const version = req.body && parseInt(req.body.version, 10);
      if (!version) return res.status(400).json({ success: false, error: 'version required' });
      const { activateStylePack } = require('./_lib/prospecting/prospect-store');
      const result = await activateStylePack(version);
      if (!result.ok) return res.status(400).json({ success: false, error: result.error });
      logger.info(`prospect-admin style-pack ACTIVATE v${version} by=${email} — live brain updated`);
      return res.status(200).json({ success: true });
    }

    // ---- Intent override (F1), snooze + notes (F6) -------------------------------
    if (req.method === 'POST' && action === 'intent') {
      const leadId = req.body && req.body.lead_id;
      const intent = req.body && String(req.body.intent || '').toLowerCase();
      if (!leadId || !INTENTS.includes(intent)) {
        return res.status(400).json({ success: false, error: `intent must be one of: ${INTENTS.join(', ')}` });
      }
      await updateIntent(String(leadId), null, intent);
      return res.status(200).json({ success: true });
    }

    if (req.method === 'POST' && action === 'snooze') {
      const leadId = req.body && req.body.lead_id;
      const until = req.body && req.body.until ? new Date(req.body.until) : null;
      if (!leadId) return res.status(400).json({ success: false, error: 'lead_id required' });
      if (until && Number.isNaN(until.getTime())) return res.status(400).json({ success: false, error: 'invalid until' });
      await patchLead(String(leadId), { snoozed_until: until ? until.toISOString() : null });
      await recordEvent(String(leadId), until
        ? `⏰ adiado até ${until.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} por ${email}`
        : `⏰ adiamento removido por ${email}`);
      return res.status(200).json({ success: true });
    }

    if (req.method === 'POST' && action === 'note') {
      const leadId = req.body && req.body.lead_id;
      const texto = req.body && String(req.body.texto || '').trim();
      if (!leadId || !texto) return res.status(400).json({ success: false, error: 'lead_id and texto required' });
      if (texto.length > 4000) return res.status(400).json({ success: false, error: 'texto too long' });
      await recordNote(String(leadId), texto, email);
      return res.status(200).json({ success: true });
    }

    if (req.method === 'GET' && action === 'lead') {
      const leadId = req.query.lead_id && String(req.query.lead_id);
      if (!leadId) return res.status(400).json({ success: false, error: 'lead_id required' });
      const detail = await getProspectLeadWithMessages(leadId);
      if (!detail) return res.status(404).json({ success: false, error: 'Lead not found' });
      // Meta's 24h customer-service window: free text is only deliverable within
      // 24h of the lead's last message. Surface it so the composer can warn.
      const lastIn = await loadLastInbound(leadId);
      const canFreeText = !!lastIn && podeMensagemLivre(new Date(lastIn.enviada_em).getTime());
      return res.status(200).json({
        success: true,
        data: { ...detail, bucket: statusBucket(detail.lead), can_free_text: canFreeText },
      });
    }

    // ---- Closed won: the founder marks a lead he closed (usually offline) -----
    // Without this the lead sits in 'handoff' forever and the cold-handoff
    // reclaim sweep re-warms a paying customer with a sales template. 'ganho' is
    // terminal + silent; "Reativar" is the undo.
    if (req.method === 'POST' && action === 'won') {
      const leadId = (req.body && req.body.lead_id) ? String(req.body.lead_id) : null;
      if (!leadId) return res.status(400).json({ success: false, error: 'lead_id required' });

      const result = await markLeadWon(leadId);
      if (!result.ok) {
        const status = result.reason === 'nao_encontrado' ? 404 : result.reason === 'erro' ? 500 : 409;
        const errors = {
          nao_encontrado: 'Lead not found',
          optout: 'Lead pediu pra sair (LGPD) — não pode ser marcado como fechado',
          conflito: 'Estado do lead mudou — recarregue e tente de novo',
        };
        return res.status(status).json({ success: false, error: errors[result.reason] || 'Falhou' });
      }
      if (result.updated) {
        await recordEvent(leadId, `🏆 marcado como FECHADO por ${email} — Olímpia encerrada neste lead`);
        logger.info(`prospect-admin WON lead=${leadId} by=${email}`);
      }
      return res.status(200).json({
        success: true,
        data: { lead_id: leadId, state: 'ganho', already: result.already },
      });
    }

    if (req.method === 'POST' && ['pause', 'reactivate', 'optout'].includes(action)) {
      const leadId = (req.body && req.body.lead_id) ? String(req.body.lead_id) : null;
      if (!leadId) return res.status(400).json({ success: false, error: 'lead_id required' });

      if (action === 'optout') {
        const detail = await getProspectLeadWithMessages(leadId, 1);
        if (!detail) return res.status(404).json({ success: false, error: 'Lead not found' });
        const reason = (req.body && req.body.reason) ? String(req.body.reason) : 'admin';
        await recordOptout({ phone: detail.lead.whatsapp_phone, leadId, reason });
        await recordEvent(leadId, `🚫 opt-out registrado por ${email}${reason !== 'admin' ? ` (${reason})` : ''}`);
      } else {
        // pause → silent kill switch (reversible); reactivate → back to active.
        await patchLead(leadId, { prospect_state: action === 'pause' ? 'pausada' : 'conversando' });
        await recordEvent(leadId, action === 'pause'
          ? `⏸ agente pausado por ${email}`
          : `▶ agente reativado por ${email}`);
      }
      logger.info(`prospect-admin ${action} lead=${leadId} by=${email}`);
      return res.status(200).json({ success: true, data: { action, lead_id: leadId } });
    }

    // ---- Reschedule / no-show (meeting lifecycle) ------------------------------
    // motivo 'pedir'  → cancel the event, reopen scheduling, Olímpia asks for a
    //                   new time; 'noshow' → same, with the "não te encontrei"
    //                   message; 'definir' → move the event to novo_slot_iso and
    //                   confirm exactly that time. Calendar stays in full sync.
    if (req.method === 'POST' && action === 'remarcar') {
      const leadId = (req.body && req.body.lead_id) ? String(req.body.lead_id) : null;
      const motivo = (req.body && req.body.motivo) ? String(req.body.motivo) : 'pedir';
      const novoSlotIso = (req.body && req.body.novo_slot_iso) ? String(req.body.novo_slot_iso) : null;
      if (!leadId) return res.status(400).json({ success: false, error: 'lead_id required' });
      if (!['pedir', 'noshow', 'definir'].includes(motivo)) {
        return res.status(400).json({ success: false, error: 'motivo inválido (pedir|noshow|definir)' });
      }
      if (motivo === 'definir' && !novoSlotIso) {
        return res.status(400).json({ success: false, error: 'definir exige novo_slot_iso' });
      }
      const detail = await getProspectLeadWithMessages(leadId, 1);
      if (!detail) return res.status(404).json({ success: false, error: 'Lead not found' });
      if (!detail.lead.reuniao_at) {
        return res.status(409).json({ success: false, error: 'Lead não tem reunião marcada' });
      }
      const { remarcarReuniao } = require('./_lib/prospecting/prospect-remarcar');
      const r = await remarcarReuniao(detail.lead, { motivo, novoSlotIso });
      if (!r.ok) return res.status(502).json({ success: false, error: r.error });
      await recordEvent(leadId, motivo === 'definir'
        ? `📅 reunião movida para ${novoSlotIso} por ${email}`
        : motivo === 'noshow'
          ? `👻 no-show marcado por ${email} — agendamento reaberto`
          : `📅 remarcação pedida por ${email} — agendamento reaberto`);
      logger.info(`prospect-admin remarcar(${motivo}) lead=${leadId} by=${email}`);
      return res.status(200).json({ success: true, data: { motivo, mensagem: r.mensagem } });
    }

    // ---- Operator manual send (human takeover) --------------------------------
    if (req.method === 'POST' && action === 'send') {
      const leadId = (req.body && req.body.lead_id) ? String(req.body.lead_id) : null;
      const texto = (req.body && req.body.texto) ? String(req.body.texto).trim() : '';
      const keepActive = !!(req.body && req.body.keep_active);
      if (!leadId || !texto) return res.status(400).json({ success: false, error: 'lead_id and texto required' });
      if (texto.length > 4000) return res.status(400).json({ success: false, error: 'texto too long' });

      const phoneNumberId = getProspectingPhoneNumberId();
      if (!phoneNumberId) return res.status(422).json({ success: false, error: 'Prospecting number not configured' });

      const detail = await getProspectLeadWithMessages(leadId, 1);
      if (!detail) return res.status(404).json({ success: false, error: 'Lead not found' });
      if (detail.lead.prospect_state === 'optout') {
        return res.status(422).json({ success: false, error: 'Lead opted out (LGPD) — cannot message' });
      }

      // Meta rejects free text beyond the 24h window; fail with a clear reason
      // instead of a silent Meta error.
      const lastIn = await loadLastInbound(leadId);
      if (!lastIn || !podeMensagemLivre(new Date(lastIn.enviada_em).getTime())) {
        return res.status(422).json({
          success: false,
          error: 'Fora da janela de 24h do WhatsApp — só é possível enviar template aprovado.',
        });
      }

      const to = onlyDigits(detail.lead.whatsapp_phone);
      const result = await sendWhatsAppMessage(to, texto, { phoneNumberId });
      if (!result || !result.success) {
        return res.status(502).json({ success: false, error: 'Envio falhou no WhatsApp' });
      }
      await storeMessage({
        leadId,
        direcao: 'out',
        wamid: result.messageId || null,
        tipo: 'text',
        corpo: texto,
        raw: { operator: email },
      });
      // Human takeover: pause the agent for this lead unless told otherwise —
      // two voices in one chat is the fastest way to sound broken.
      if (!keepActive && detail.lead.prospect_state !== 'pausada') {
        await patchLead(leadId, { prospect_state: 'pausada' });
        await recordEvent(leadId, `🙋 ${email} assumiu a conversa (agente pausado)`);
      }
      logger.info(`prospect-admin manual send lead=${leadId} by=${email} paused=${!keepActive}`);
      return res.status(200).json({ success: true, data: { sent: true, paused: !keepActive } });
    }

    // ---- Global agent kill switch ---------------------------------------------
    if (req.method === 'POST' && action === 'agent') {
      const enabled = !!(req.body && req.body.enabled);
      await setAgentEnabled(enabled, email);
      logger.info(`prospect-admin GLOBAL agent ${enabled ? 'ENABLED' : 'DISABLED'} by=${email}`);
      return res.status(200).json({ success: true, data: { agent_enabled: enabled } });
    }

    // ---- Manual recovery from the dispatch circuit breaker (F5) ----------------
    if (req.method === 'POST' && action === 'dispatch-resume') {
      await supabaseAdmin.from('cron_config').upsert({
        job_name: 'prospecting-dispatch', enabled: true,
        notes: `reativado manualmente por ${email}`,
        updated_at: new Date().toISOString(), updated_by: email,
      }, { onConflict: 'job_name' });
      await supabaseAdmin.from('prospect_number_events').insert({
        event_type: 'manual', detail: `disparos reativados por ${email}`,
      });
      logger.info(`prospect-admin dispatch RESUMED by=${email}`);
      return res.status(200).json({ success: true });
    }

    // ---- Places Autocomplete proxy (console suggestions; key stays server-side) --
    if (req.method === 'GET' && action === 'places-suggest') {
      const input = String(req.query.input || '').trim();
      if (input.length < 2) return res.status(200).json({ success: true, data: [] });
      const apiKey = process.env.GOOGLE_PLACES_API_KEY;
      if (!apiKey) return res.status(422).json({ success: false, error: 'Places not configured' });
      const { buildAutocompleteBody, parseAutocomplete } = require('./_lib/prospecting/places-discovery');
      const resp = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
        },
        body: JSON.stringify(buildAutocompleteBody(input)),
      });
      const json = await resp.json().catch(() => ({}));
      return res.status(200).json({ success: true, data: parseAutocomplete(json) });
    }

    // ---- Discovery: quick single search (Google Places → prospect_leads) -------
    if (req.method === 'POST' && action === 'discover') {
      const body = req.body || {};
      const city = body.city ? String(body.city).trim() : '';
      if (!city) return res.status(400).json({ success: false, error: 'city required' });
      const uf = body.uf ? String(body.uf).trim().toUpperCase() : '';
      const bairro = body.bairro ? String(body.bairro).trim() : '';
      const baseQuery = body.query ? String(body.query).trim() : 'restaurantes';
      const maxResults = Math.min(Math.max(parseInt(body.maxResults, 10) || 60, 1), 60);
      const onlySendable = body.only_sendable !== false; // default ON — no WhatsApp, no lead

      const { searchPlaces } = require('./_lib/prospecting/places-discovery');
      const { upsertDiscoveredLeads } = require('./_lib/prospecting/prospect-store');
      const query = [baseQuery, bairro].filter(Boolean).join(' ');
      const cityFull = uf ? `${city}, ${uf}` : city;
      const result = await searchPlaces({ query, city: cityFull, sector: 'restaurante', maxResults });
      if (!result.ok) return res.status(502).json({ success: false, error: result.error });
      const sendable = result.leads.filter((l) => l.whatsapp_status === 'pending');
      const toInsert = onlySendable ? sendable : result.leads;
      const { inserted } = await upsertDiscoveredLeads(toInsert);
      logger.info(`prospect-admin discover "${query}" ${cityFull} found=${result.leads.length} sendable=${sendable.length} inserted=${inserted} by=${email}`);
      return res.status(200).json({
        success: true,
        data: {
          found: result.leads.length,
          sendable: sendable.length,
          discarded: onlySendable ? result.leads.length - sendable.length : 0,
          inserted,
          duplicates: toInsert.length - inserted,
        },
      });
    }

    // ---- Mass discovery jobs (Phase 9): territory fan-out ----------------------
    if (req.method === 'POST' && action === 'discovery-job') {
      const body = req.body || {};
      const { createDiscoveryJob } = require('./_lib/prospecting/prospect-mass-discovery');
      const job = await createDiscoveryJob({
        mode: String(body.mode || ''),
        uf: body.uf ? String(body.uf) : null,
        city: body.city ? String(body.city) : null,
        bairro: body.bairro ? String(body.bairro) : null,
        query: body.query ? String(body.query) : 'restaurantes',
        maxQueries: parseInt(body.max_queries, 10) || 300,
        onlySendable: body.only_sendable !== false,
        createdBy: email,
      });
      if (!job.ok) return res.status(400).json({ success: false, error: job.error });

      // Kick the self-chaining worker (fire-and-forget; server-side secret).
      const secret = process.env.CRON_SECRET;
      const base = process.env.CLIENT_URL || 'https://seatable.one';
      fetch(`${base.replace(/\/$/, '')}/api/prospect-discovery-worker`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
        body: JSON.stringify({ job_id: job.jobId }),
      }).catch((err) => logger.error('worker kick failed:', err.message));

      logger.info(`prospect-admin discovery-job ${body.mode} queries=${job.totalQueries} by=${email}`);
      return res.status(200).json({ success: true, data: job });
    }

    if (req.method === 'GET' && action === 'discovery-status') {
      const jobId = req.query.job_id && String(req.query.job_id);
      if (!jobId) return res.status(400).json({ success: false, error: 'job_id required' });
      const { data, error } = await supabaseAdmin
        .from('prospect_discovery_jobs').select('*').eq('id', jobId).single();
      if (error || !data) return res.status(404).json({ success: false, error: 'Job not found' });
      const { queries, ...rest } = data;
      return res.status(200).json({
        success: true,
        data: { ...rest, total_queries: Array.isArray(queries) ? queries.length : 0 },
      });
    }

    if (req.method === 'POST' && action === 'discovery-cancel') {
      const jobId = req.body && req.body.job_id ? String(req.body.job_id) : null;
      if (!jobId) return res.status(400).json({ success: false, error: 'job_id required' });
      await supabaseAdmin.from('prospect_discovery_jobs')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', jobId).eq('status', 'running');
      logger.info(`prospect-admin discovery-cancel job=${jobId} by=${email}`);
      return res.status(200).json({ success: true });
    }

    // ---- Mass dispatch (cold intros; warm-up cap + suppression apply) ----------
    if (req.method === 'POST' && action === 'dispatch') {
      const limit = Math.min(Math.max(parseInt((req.body || {}).limit, 10) || 20, 1), 250);
      const territorio = (req.body && req.body.territorio) ? String(req.body.territorio).slice(0, 80) : null;
      const { dispatchIntros } = require('./_lib/prospecting/sequencer');
      const summary = await dispatchIntros({ limit, territorio });
      logger.info(`prospect-admin dispatch limit=${limit} territorio=${territorio || '-'} sent=${summary.sent} by=${email}`);
      return res.status(200).json({ success: true, data: summary });
    }

    return res.status(400).json({ success: false, error: 'Unknown action' });
  } catch (err) {
    logger.error('prospect-admin error:', err.message);
    return res.status(500).json({ success: false, error: 'Internal error' });
  }
};

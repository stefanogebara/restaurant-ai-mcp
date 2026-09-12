'use strict';

/**
 * POST /api/racha-notify — aviso do Racha (app irmão) de que o recebedor
 * (Pagar.me) de um restaurante mudou de status no KYC (registration → active/
 * refused). O Racha não tem infra de envio; a Olímpia tem — então o Racha só
 * dispara e aqui a gente entrega. Autenticado por RACHA_NOTIFY_SECRET (bearer).
 *
 * Entrega best-effort, dois canais, reporta o resultado de cada um (nunca 500
 * por falha de entrega):
 *  - WhatsApp: dentro da janela de 24h do lead da Olímpia = texto livre; fora =
 *    template aprovado (RACHA_KYC_TEMPLATE), se configurado; senão pula.
 *  - E-mail: Resend (sem janela — canal confiável).
 *
 * Body do aviso de recebedor: { venueName, ownerEmail, ownerPhone, status,
 * previousStatus?, reason? }
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ALÉM DO AVISO DE RECEBEDOR, esta rota é o ÚNICO canal de alerta do Racha.
 *
 * Ela roteava `activation_radar` e depois exigia `status` — um campo que só o
 * aviso de recebedor manda. Todo o resto voltava **400**: `reconcile_drift` (a
 * conciliação diária achando desvio de dinheiro), `reconcile_heartbeat` (a
 * batida cujo contrato declarado é "a ausência dela é o alarme"), e todos os
 * eventos de dinheiro do Racha — disputa, estorno que falhou, retenção
 * bloqueada, `CRON_SECRET` ausente.
 *
 * Consequência: nenhum alerta do Racha jamais chegou a um humano. Eles viraram
 * linha de stderr num log da Vercel. O não-negociável 8 do Racha diz "um
 * canário vermelho PAGINA; ele nunca só loga" — ele só logava. E a batida, por
 * nunca ter chegado uma vez, satisfazia "a ausência é o alarme" de forma vazia.
 *
 * Três revisões de segurança do lado do Racha endureceram o TRANSPORTE (timeout,
 * fallback pra stderr) e nenhuma leu o RECEPTOR. Achado em 2026-09-12.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { createSecureLogger } = require('./_lib/secure-logger');
const { bearerEquals } = require('./_lib/secure-compare');
const { sendWhatsAppMessage, sendTemplateMessage, isWhatsAppConfigured } = require('./_lib/whatsapp-sender');
const { sendRachaRecipientStatusEmail, sendProspectDigestEmail } = require('./_lib/email');
const { findLeadByPhone } = require('./_lib/prospecting/prospect-store');
const { podeMensagemLivre } = require('./_lib/prospecting/prospect-nudge');

const logger = createSecureLogger('RachaNotify');

// Destino do radar de ativação: o FUNDADOR. Mesmas envs do digest da Olímpia —
// o contato dele mora aqui, nunca no Racha.
const FOUNDER_EMAIL = process.env.PROSPECTING_FOUNDER_EMAIL || 'stefanogebara@gmail.com';
const FOUNDER_WHATSAPP = process.env.PROSPECTING_FOUNDER_WHATSAPP || '';

/**
 * Os eventos que o Racha manda e que NÃO são o aviso de recebedor.
 *
 * Lista explícita, e é de propósito: um evento novo do lado do Racha tem que
 * passar por aqui pra alguém decidir como ele é entregue. O Racha tem um censo
 * (`api/__tests__/notify-bridge-contract.test.js`) que falha quando emite um
 * evento que esta lista não contém — foi assim que o buraco apareceu.
 */
const EVENTOS_DE_FUNDADOR = new Set([
  'reconcile_drift',       // conciliação diária achou desvio
  'reconcile_heartbeat',   // batida verde: a ausência dela é o alarme
  'retention_ok',          // expurgo de retenção rodou
  'retention_blocked',     // retenção parada por falta de CRON_SECRET
  'retention_late',        // o expurgo não roda há mais de 48h
  'overpaid_pending_restitution',
  'money_event_unrecorded',
  'dispute_close_unrecorded',
  'dispute_evidence_due',
  'dispute_evidence_overdue',
]);

/**
 * Entrega um alerta de fundador. Mesma forma do radar: WhatsApp em texto livre
 * (o destinatário é o próprio fundador, não um lead) e e-mail pelo Resend.
 *
 * Nunca 500 por falha de entrega — o Racha já trata não-2xx como falha dura e
 * grita no stderr dele; o que não pode é esta rota RECUSAR o corpo.
 */
async function entregarAlertaDeFundador({ event, mensagem, silencioso }) {
  const out = { whatsapp: 'skipped', email: 'skipped', event };
  const texto = String(mensagem || '').trim();
  if (!texto) return { ...out, erro: 'mensagem vazia' };

  if (!silencioso && FOUNDER_WHATSAPP && isWhatsAppConfigured()) {
    try {
      const r = await sendWhatsAppMessage(FOUNDER_WHATSAPP, texto);
      out.whatsapp = r && r.success ? 'sent' : `failed:${(r && r.error) || '?'}`;
    } catch (e) { out.whatsapp = `failed:${String(e.message).slice(0, 80)}`; }
  } else if (silencioso) {
    out.whatsapp = 'skipped:rotina';
  } else if (!FOUNDER_WHATSAPP) {
    out.whatsapp = 'skipped:sem_numero_do_fundador';
  }

  try {
    const ok = await sendProspectDigestEmail({
      to: FOUNDER_EMAIL,
      subject: `Racha — ${event}`,
      html: `<p>${texto.replace(/\n/g, '<br>')}</p>`,
      text: texto,
    });
    out.email = ok ? 'sent' : 'skipped';
  } catch (e) { out.email = `failed:${String(e.message).slice(0, 80)}`; }

  logger.info('alerta do Racha entregue', { event, ...out });
  return out;
}

/**
 * Radar de ativação do Racha → fundador (WhatsApp + e-mail, best-effort).
 *
 * WhatsApp aqui é texto livre sem checar janela de 24h de propósito: o
 * destinatário é o próprio fundador no número dele, não um lead — a regra de
 * janela existe pra proteger quem não pediu contato.
 */
async function entregarRadar({ mensagem, alertas, total, ativos }) {
  const out = { whatsapp: 'skipped', email: 'skipped' };
  const texto = String(mensagem || '').trim();
  if (!texto) return { ...out, erro: 'mensagem vazia' };

  if (FOUNDER_WHATSAPP && isWhatsAppConfigured()) {
    try {
      const r = await sendWhatsAppMessage(FOUNDER_WHATSAPP, texto);
      out.whatsapp = r && r.success ? 'sent' : `failed:${(r && r.error) || '?'}`;
    } catch (e) { out.whatsapp = `failed:${String(e.message).slice(0, 80)}`; }
  } else if (!FOUNDER_WHATSAPP) {
    out.whatsapp = 'skipped:sem_numero_do_fundador';
  }

  try {
    const ok = await sendProspectDigestEmail({
      to: FOUNDER_EMAIL,
      subject: `Racha — ${alertas} restaurante(s) precisando de ação`,
      html: `<p>${texto.replace(/\n/g, '<br>')}</p>`,
      text: texto,
    });
    out.email = ok ? 'sent' : 'skipped';
  } catch (e) { out.email = `failed:${String(e.message).slice(0, 80)}`; }

  logger.info('radar de ativação entregue', { alertas, total, ativos, ...out });
  return out;
}

function statusLabel(status) {
  if (status === 'active') return 'aprovado';
  if (status === 'refused' || status === 'suspended') return 'não aprovado';
  return String(status || '');
}

function composeMessage({ venueName, status, reason }) {
  const nome = venueName || 'seu restaurante';
  if (status === 'active') {
    return `✅ Boa notícia! O recebimento do ${nome} foi aprovado no Racha — já pode receber pelas mesas: cada conta paga cai direto na sua conta, com o repasse automático.`;
  }
  const motivo = reason ? ` Motivo: ${reason}.` : '';
  return `⚠️ O cadastro de recebimento do ${nome} no Racha não foi aprovado.${motivo} Confira os dados bancários (o titular tem que bater com o CNPJ/CPF) e reenvie no painel.`;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
  const secret = process.env.RACHA_NOTIFY_SECRET;
  if (!secret) { logger.error('RACHA_NOTIFY_SECRET not configured'); return res.status(500).json({ success: false, error: 'Not configured' }); }
  if (!bearerEquals(req.headers.authorization, secret)) return res.status(401).json({ success: false, error: 'Authentication required' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  const { venueName, ownerEmail, ownerPhone, status, reason } = body;

  // Radar de ativação: outro evento, outro destinatário (fundador, não dono).
  // Roteado antes da exigência de `status`, que é do aviso de recebedor.
  if (body.event === 'activation_radar') {
    const out = await entregarRadar({
      mensagem: body.mensagem,
      alertas: Number(body.alertas) || 0,
      total: Number(body.total) || 0,
      ativos: Number(body.ativos) || 0,
    });
    return res.status(200).json({ success: true, data: out });
  }

  // Alertas de FUNDADOR: conciliação, batida noturna e eventos de dinheiro.
  // Roteados antes da exigência de `status`, que é do aviso de recebedor — foi
  // exatamente essa exigência que engolia todos eles com 400.
  if (EVENTOS_DE_FUNDADOR.has(body.event)) {
    const out = await entregarAlertaDeFundador({
      event: body.event,
      mensagem: body.mensagem,
      // O batimento é rotina: entrega por e-mail e não acorda ninguém no
      // WhatsApp. O resto é exceção e vai pelos dois.
      silencioso: body.event === 'reconcile_heartbeat' || body.heartbeat === true,
    });
    return res.status(200).json({ success: true, data: out });
  }

  if (!status) return res.status(400).json({ success: false, error: 'status é obrigatório' });

  const message = composeMessage({ venueName, status, reason });
  const out = { whatsapp: 'skipped', email: 'skipped' };

  // WhatsApp (best-effort). Decide texto-livre vs template pela janela de 24h do
  // lead (a Olímpia já falou com esse dono). Sem número → pula.
  if (ownerPhone && isWhatsAppConfigured()) {
    let inWindow = false;
    try {
      const lead = await findLeadByPhone(ownerPhone);
      inWindow = !!(lead && lead.last_in_at && podeMensagemLivre(new Date(lead.last_in_at).getTime()));
    } catch (e) { logger.warn('lead lookup falhou', { error: e.message }); }
    try {
      let r = null;
      const tpl = process.env.RACHA_KYC_TEMPLATE;
      if (inWindow) {
        r = await sendWhatsAppMessage(ownerPhone, message);
      } else if (tpl) {
        const lang = process.env.RACHA_KYC_TEMPLATE_LANG || 'pt_BR';
        r = await sendTemplateMessage(ownerPhone, tpl, lang, [venueName || 'seu restaurante', statusLabel(status)]);
      } else {
        out.whatsapp = 'skipped:fora_da_janela_sem_template';
      }
      if (r) out.whatsapp = r.success ? 'sent' : `failed:${r.error || '?'}`;
    } catch (e) { out.whatsapp = `failed:${String(e.message).slice(0, 80)}`; }
  } else if (ownerPhone) {
    out.whatsapp = 'skipped:whatsapp_nao_configurado';
  }

  // E-mail (canal confiável, sem janela).
  if (ownerEmail) {
    try {
      const ok = await sendRachaRecipientStatusEmail({ ownerEmail, venueName, status, reason });
      out.email = ok ? 'sent' : 'skipped';
    } catch (e) { out.email = `failed:${String(e.message).slice(0, 80)}`; }
  }

  logger.info('racha-notify processado', { venueName, status, whatsapp: out.whatsapp, email: out.email });
  return res.status(200).json({ success: true, data: out });
};

// Exportados pro teste (sem tocar rede).
module.exports.composeMessage = composeMessage;
module.exports.statusLabel = statusLabel;

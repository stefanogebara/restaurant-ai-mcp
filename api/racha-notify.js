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
 * Body: { venueName, ownerEmail, ownerPhone, status, previousStatus?, reason? }
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

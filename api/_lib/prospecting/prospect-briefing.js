'use strict';

/**
 * Internal meeting briefing for the assigned rep (Phase 4b). Ported from Olivia's
 * `_shared/briefing.ts`. The context only the agent had (who the prospect is)
 * becomes a short email to the rep joining the call.
 * =============================================================================
 * ANTI-LEAK: this content is INTERNAL — it must NEVER reach the prospect.
 * `briefingDestinatarioValido` is the guard: it only allows sending to a valid
 * email that is NOT the prospect's and IS on the internal domain (@seatable.one).
 * Any doubt → false (don't send). Anti-invention: an empty field is omitted.
 * Delivered via Resend (Seatable's verified seatable.one sender).
 * =============================================================================
 */

const { Resend } = require('resend');
const { createSecureLogger } = require('../secure-logger');

const logger = createSecureLogger('ProspectBriefing');
const AGENT_NAME = process.env.PROSPECTING_AGENT_NAME || 'Olímpia';
const FROM_ADDRESS = `${AGENT_NAME} (Seatable) <bookings@seatable.one>`;
const INTERNAL_DOMAIN = process.env.PROSPECTING_INTERNAL_DOMAIN || '@seatable.one';

let resendClient = null;
function getResendClient() {
  if (!resendClient && process.env.RESEND_API_KEY) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

/**
 * ANTI-LEAK GUARD. Only allows the briefing send when the recipient:
 *  - is a valid email,
 *  - is NOT the prospect's email,
 *  - is on the internal domain (e.g. @seatable.one).
 * Any doubt → false. This is what stops the briefing from reaching the prospect.
 * @param {string|null|undefined} repEmail
 * @param {string|null|undefined} prospectEmail
 * @param {string} dominioInterno
 * @returns {boolean}
 */
function briefingDestinatarioValido(repEmail, prospectEmail, dominioInterno) {
  const e = String(repEmail || '').trim().toLowerCase();
  if (!e || !e.includes('@')) return false;
  const p = String(prospectEmail || '').trim().toLowerCase();
  if (p && e === p) return false;
  return e.endsWith(String(dominioInterno || '').trim().toLowerCase());
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Date/time in São Paulo, human-readable (e.g. "terça-feira, 23/06/2026 às 11:00").
function formatarDataHora(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const data = d.toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
  });
  const hora = d.toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit',
  });
  return `${data} às ${hora}`;
}

/**
 * Build the briefing email (subject + HTML). Only known fields are included.
 * @param {{nome: string, dono_nome?: string|null, cidade?: string|null, bairro?: string|null, setor?: string|null, instagram_handle?: string|null, instagram_followers?: number|null, whatsapp_dono?: string|null, whatsapp_phone?: string|null}} lead
 * @param {{slotIso: string, meetLink: string|null, repNome: string|null, prospectEmail: string|null}} reuniao
 * @returns {{subject: string, html: string}}
 */
function montarBriefingReuniao(lead, reuniao) {
  const marca = (lead.nome && lead.nome.trim()) || 'Cliente';
  const quando = formatarDataHora(reuniao.slotIso);
  const whatsapp = (lead.whatsapp_dono && lead.whatsapp_dono.trim()) || (lead.whatsapp_phone && lead.whatsapp_phone.trim()) || null;
  const local = [lead.bairro && lead.bairro.trim(), lead.cidade && lead.cidade.trim()].filter(Boolean).join(' · ') || null;
  const instagram = lead.instagram_handle && lead.instagram_handle.trim()
    ? `@${lead.instagram_handle.trim().replace(/^@/, '')}` +
      (lead.instagram_followers != null ? ` (${Number(lead.instagram_followers).toLocaleString('pt-BR')} seguidores)` : '')
    : null;

  const linhas = [];
  linhas.push(['Marca', marca]);
  if (lead.dono_nome && lead.dono_nome.trim()) linhas.push(['Pessoa na call', lead.dono_nome.trim()]);
  if (lead.setor && lead.setor.trim()) linhas.push(['Setor', lead.setor.trim()]);
  if (local) linhas.push(['Localização', local]);
  if (instagram) linhas.push(['Instagram', instagram]);
  if (whatsapp) linhas.push(['WhatsApp', whatsapp]);
  linhas.push(['Quando', quando]);
  if (reuniao.repNome && reuniao.repNome.trim()) linhas.push(['Responsável (você)', reuniao.repNome.trim()]);

  const rows = linhas
    .map(([k, v]) =>
      `<tr><td style="padding:6px 14px 6px 0;color:#6B7280;white-space:nowrap;vertical-align:top">${escapeHtml(k)}</td>` +
      `<td style="padding:6px 0;color:#111827;font-weight:600">${escapeHtml(v)}</td></tr>`)
    .join('');

  const botaoMeet = reuniao.meetLink
    ? `<p style="margin:20px 0 0"><a href="${escapeHtml(reuniao.meetLink)}" ` +
      `style="display:inline-block;background:#111827;color:#fff;text-decoration:none;` +
      `padding:10px 18px;border-radius:10px;font-weight:600">Entrar no Google Meet</a></p>`
    : '';

  const html = [
    '<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#111827">',
    `<p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#9CA3AF;margin:0 0 4px">Briefing da ${escapeHtml(AGENT_NAME)}</p>`,
    `<h2 style="font-size:20px;margin:0 0 4px">${escapeHtml(marca)}</h2>`,
    `<p style="margin:0 0 18px;color:#6B7280;font-size:14px">Reunião agendada automaticamente pela ${escapeHtml(AGENT_NAME)}. Contexto do cliente abaixo.</p>`,
    `<table style="border-collapse:collapse;font-size:14.5px">${rows}</table>`,
    botaoMeet,
    `<p style="margin:24px 0 0;color:#9CA3AF;font-size:12px">Email interno — não encaminhe ao cliente.</p>`,
    '</div>',
  ].join('');

  const subject = `Briefing · ${marca} — reunião ${formatarDataHora(reuniao.slotIso)}`;
  return { subject, html };
}

/**
 * Send the internal briefing to the rep (Resend). Hard-guarded by
 * briefingDestinatarioValido so it can never reach the prospect.
 * @returns {Promise<{sent: boolean, reason?: string}>}
 */
async function sendBriefing(lead, reuniao, repEmail) {
  if (!briefingDestinatarioValido(repEmail, reuniao.prospectEmail, INTERNAL_DOMAIN)) {
    logger.warn('briefing recipient rejected by anti-leak guard — not sending');
    return { sent: false, reason: 'invalid_recipient' };
  }
  const resend = getResendClient();
  if (!resend) {
    logger.warn('RESEND_API_KEY not set, skipping briefing email');
    return { sent: false, reason: 'no_api_key' };
  }
  try {
    const { subject, html } = montarBriefingReuniao(lead, reuniao);
    const { error } = await resend.emails.send({ from: FROM_ADDRESS, to: repEmail.trim(), subject, html });
    if (error) {
      logger.error('briefing send failed:', error.message || String(error));
      return { sent: false, reason: 'send_error' };
    }
    return { sent: true };
  } catch (err) {
    logger.error('briefing send threw:', err.message);
    return { sent: false, reason: 'exception' };
  }
}

module.exports = {
  briefingDestinatarioValido,
  montarBriefingReuniao,
  sendBriefing,
};

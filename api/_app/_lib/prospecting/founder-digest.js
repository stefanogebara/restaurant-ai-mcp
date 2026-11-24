'use strict';

/**
 * Founder handoff digest — pure compose layer.
 *
 * The prospecting agent (Olímpia) hands a lead to the founder whenever someone
 * asks for a human / the founder's number. That drops the lead into 'handoff'
 * (a SILENT_STATE): the ball is now in the founder's court. But nothing tells
 * the founder WHICH leads are waiting — so warm leads sat un-chased for weeks
 * (the closing bottleneck, 2026-07). This module builds a daily digest e-mail:
 * one line per waiting lead, each with a click-to-close wa.me link that opens
 * WhatsApp with a founder-voice pitch PRE-FILLED — the founder taps and sends.
 *
 * PURE: no I/O. Selection is done by the store; delivery by the cron. Everything
 * here is deterministic (same leads + same "now" → same e-mail), so it unit
 * tests without a DB or a mail server.
 */

const { getProfile } = require('./prospect-product');

const DAY_MS = 24 * 60 * 60 * 1000;
const FOUNDER_NAME = process.env.PROSPECTING_FOUNDER_NAME || 'Stefano';

/** Minimal HTML escape (self-contained — no dependency on the mail module). */
function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/** Most recent activity timestamp (ms) for a lead — inbound or last patch. */
function lastActivityMs(lead) {
  const a = lead.last_in_at ? Date.parse(lead.last_in_at) : 0;
  const b = lead.updated_at ? Date.parse(lead.updated_at) : 0;
  return Math.max(a || 0, b || 0);
}

/** pt-BR relative age of the lead's last activity: "hoje", "ontem", "há 5 dias". */
function describeAge(lead, nowMs) {
  const at = lastActivityMs(lead);
  if (!at) return 'sem data';
  const days = Math.floor((nowMs - at) / DAY_MS);
  if (days <= 0) return 'hoje';
  if (days === 1) return 'ontem';
  return `há ${days} dias`;
}

/** agendando (was scheduling) is the hottest; then handoff. */
function statePriority(state) {
  return state === 'agendando' ? 0 : 1;
}

function stateLabel(state) {
  if (state === 'agendando') return 'estava agendando';
  return 'pediu pra falar com você';
}

/**
 * PURE: the founder's close message for a lead, product-aware. Uses the active
 * product profile's founderClose() (Racha / Seatable copy).
 */
function closeMessageFor(lead, { profile = getProfile(), founderName = FOUNDER_NAME } = {}) {
  const ownerName = lead.owner_name && String(lead.owner_name).trim() ? String(lead.owner_name).trim() : null;
  return profile.founderClose({ founderName, ownerName });
}

/**
 * PURE: a wa.me click-to-chat link that opens WhatsApp to the lead with the
 * founder's close message pre-filled. Returns null when the phone isn't usable.
 */
function waCloseLink(lead, opts = {}) {
  const digits = String(lead.whatsapp_phone || '').replace(/\D+/g, '');
  if (digits.length < 10) return null;
  const msg = closeMessageFor(lead, opts);
  return `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`;
}

/** Sort a copy of the leads: hottest state first, then most recent activity. */
function orderLeads(leads, nowMs) {
  return [...leads].sort((a, b) => {
    const p = statePriority(a.prospect_state) - statePriority(b.prospect_state);
    if (p !== 0) return p;
    return lastActivityMs(b) - lastActivityMs(a);
  });
}

/**
 * PURE: build the digest e-mail from the waiting leads.
 *
 * @param {object} args
 * @param {Array} args.leads   - handoff + agendando leads (store-selected)
 * @param {number} args.nowMs
 * @param {object} [args.profile]     - product profile (defaults to active)
 * @param {string} [args.founderName]
 * @param {number} [args.reclaimDays] - days until Olímpia auto-reclaims a cold
 *   handoff (shown as urgency); 0/absent hides the note.
 * @param {(lead: object) => string|null} [args.closeUrlFor] - builds the signed
 *   one-tap "já fechei" URL for a lead. Injected (not imported) to keep this
 *   module pure; absent/returning null simply omits the button.
 * @returns {{ subject: string, html: string, text: string, count: number, items: Array }}
 */
function buildFounderDigestEmail({ leads = [], nowMs = Date.now(), profile = getProfile(), founderName = FOUNDER_NAME, reclaimDays = 0, closeUrlFor = null } = {}) {
  const ordered = orderLeads(leads, nowMs);
  const count = ordered.length;
  const company = profile.company;
  const dateLabel = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo',
  }).format(new Date(nowMs));

  const items = ordered.map((lead) => ({
    name: lead.name || 'Restaurante',
    city: lead.city || null,
    state: lead.prospect_state,
    age: describeAge(lead, nowMs),
    resumo: (lead.conversa_resumo && String(lead.conversa_resumo).trim())
      || (lead.handoff_motivo && String(lead.handoff_motivo).trim()) || null,
    phone: lead.whatsapp_phone || null,
    link: waCloseLink(lead, { profile, founderName }),
    // One-tap "já fechei": the ONLY thing that stops Olímpia from reclaiming this
    // lead once the founder closes it offline.
    closeUrl: typeof closeUrlFor === 'function' ? (closeUrlFor(lead) || null) : null,
  }));

  const subject = count === 1
    ? `☎️ 1 lead esperando você fechar — ${company}`
    : `☎️ ${count} leads esperando você fechar — ${company}`;

  // ---- HTML ----
  const rows = items.map((it) => {
    const cityBit = it.city ? ` · ${esc(it.city)}` : '';
    const resumoBit = it.resumo
      ? `<p style="margin:6px 0 0;color:#57534E;font-size:14px;line-height:1.5;">${esc(it.resumo)}</p>`
      : '';
    const button = it.link
      ? `<a href="${esc(it.link)}" style="display:inline-block;margin-top:10px;background:#25D366;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:9px 16px;border-radius:8px;">Abrir no WhatsApp e fechar →</a>`
      : `<p style="margin:8px 0 0;color:#B91C1C;font-size:13px;">sem número utilizável</p>`;
    const phoneBit = it.phone
      ? `<span style="color:#A8A29E;font-size:12px;">${esc(it.phone)}</span>`
      : '';
    // Secondary action, deliberately quieter than the green WhatsApp button: the
    // founder taps it AFTER closing, and it's what keeps Olímpia off a customer.
    const closeBit = it.closeUrl
      ? `<a href="${esc(it.closeUrl)}" style="display:inline-block;margin-top:10px;margin-left:8px;background:#F5F5F4;color:#44403C;text-decoration:none;font-weight:600;font-size:14px;padding:9px 16px;border-radius:8px;border:1px solid #E7E5E4;">🏆 Já fechei</a>`
      : '';
    return `
      <div style="border:1px solid #E7E5E4;border-radius:12px;padding:16px;margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;">
          <strong style="font-size:16px;color:#1C1917;">${esc(it.name)}${cityBit}</strong>
        </div>
        <p style="margin:4px 0 0;color:#78716C;font-size:13px;">${esc(stateLabel(it.state))} · esperando ${esc(it.age)}</p>
        ${resumoBit}
        <div style="margin-top:10px;">${button}${closeBit}</div>
        <div style="margin-top:6px;">${phoneBit}</div>
      </div>`;
  }).join('');

  const reclaimNote = reclaimDays > 0
    ? `<p style="color:#A8A29E;font-size:12px;line-height:1.5;margin-top:20px;">
         Leads que a Olímpia passou pra você. Se você não fechar, ela retoma a conversa
         automaticamente depois de ${reclaimDays} dias — então é agora que vale o seu toque.
         Fechou por fora? Toque em <strong>Já fechei</strong> — o lead sai da fila e ela não
         retoma. Perdeu ou não é hora? Marque como <strong>pausado</strong> no painel.
       </p>`
    : '';

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px 20px;">
      <h1 style="font-size:22px;color:#1C1917;margin:0 0 4px;">Sua fila de fechamento — ${esc(dateLabel)}</h1>
      <p style="color:#57534E;font-size:15px;line-height:1.5;margin:0 0 20px;">
        ${count === 1 ? '1 restaurante levantou a mão' : `${count} restaurantes levantaram a mão`} e estão esperando você.
        Toque em <strong>Abrir no WhatsApp</strong> — a mensagem de fechamento já vai pronta, é só enviar.
      </p>
      ${rows}
      ${reclaimNote}
      <p style="color:#A8A29E;font-size:12px;margin-top:24px;">Olímpia · prospecção ${esc(profile.daCompany || company)}</p>
    </div>`;

  // ---- text fallback ----
  const textLines = [
    `Sua fila de fechamento — ${dateLabel}`,
    `${count} ${count === 1 ? 'lead' : 'leads'} esperando você fechar:`,
    '',
  ];
  items.forEach((it, i) => {
    textLines.push(`${i + 1}. ${it.name}${it.city ? ' · ' + it.city : ''} (${stateLabel(it.state)}, esperando ${it.age})`);
    if (it.resumo) textLines.push(`   ${it.resumo}`);
    if (it.link) textLines.push(`   ${it.link}`);
    else if (it.phone) textLines.push(`   ${it.phone}`);
    if (it.closeUrl) textLines.push(`   Já fechei: ${it.closeUrl}`);
    textLines.push('');
  });
  if (reclaimDays > 0) {
    textLines.push(`(A Olímpia retoma sozinha o que não for fechado em ${reclaimDays} dias. Fechou? Use o link "Já fechei".)`);
  }

  return { subject, html, text: textLines.join('\n'), count, items };
}

module.exports = {
  esc,
  lastActivityMs,
  describeAge,
  statePriority,
  stateLabel,
  closeMessageFor,
  waCloseLink,
  orderLeads,
  buildFounderDigestEmail,
  FOUNDER_NAME,
  DAY_MS,
};

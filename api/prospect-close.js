'use strict';

/**
 * One-tap "já fechei" — closes a prospect lead as WON from the founder digest.
 *
 * DELIBERATELY PUBLIC (no JWT): it is tapped from an e-mail, where there is no
 * session. The HMAC token IS the credential — signed server-side over one lead id
 * + an expiry (prospect-close-token.js), unforgeable without CRON_SECRET /
 * PROSPECTING_CLOSE_SECRET, and it authorizes exactly ONE action on ONE lead.
 *
 *   GET  /api/prospect-close?t=TOKEN → confirmation page (READ ONLY)
 *   POST /api/prospect-close (t in the form body) → marks prospect_state 'ganho'
 *
 * The split matters: mail clients and link scanners prefetch GET URLs, so GET
 * must never mutate — a Gmail scan would otherwise close deals by itself.
 *
 * Why this exists: 'ganho' is what stops the cold-handoff reclaim sweep from
 * re-warming a closed customer with a sales template 4 days later.
 */

const { supabaseAdmin } = require('./_lib/supabase');
const { createSecureLogger } = require('./_lib/secure-logger');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const { verifyCloseToken } = require('./_lib/prospecting/prospect-close-token');
const { markLeadWon, recordEvent } = require('./_lib/prospecting/prospect-store');

const logger = createSecureLogger('ProspectClose');

function he(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/** Small branded page. `token` present → renders the confirm form (POST). */
function renderPage({ title, message, token = null, tone = 'neutral' }) {
  const form = token
    ? `<form method="POST" action="/api/prospect-close" style="margin-top:24px;">
         <input type="hidden" name="t" value="${he(token)}" />
         <button type="submit" style="background:#166534;color:#fff;padding:12px 32px;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;">
           🏆 Confirmar — fechei este lead
         </button>
       </form>
       <p style="color:#A8A29E;font-size:13px;margin-top:16px;">
         A Olímpia para de falar com ele e o lead sai da sua fila de fechamento.
         Mudou de ideia? É só fechar esta página.
       </p>`
    : '';
  const accent = tone === 'ok' ? '#166534' : tone === 'error' ? '#9F1239' : '#1C1917';
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex,nofollow">
  <title>${he(title)} · Olímpia</title>
  <style>
    body { font-family: 'Inter', -apple-system, sans-serif; margin: 0; padding: 0; background: #FAFAF9; }
    .container { max-width: 480px; margin: 80px auto; padding: 40px 24px; text-align: center; }
    .logo { font-size: 28px; color: #1C1917; font-family: Georgia, serif; margin-bottom: 32px; }
    .logo span { color: #9F1239; }
    h1 { font-size: 22px; color: ${accent}; margin: 0 0 16px 0; }
    p { color: #57534E; font-size: 15px; line-height: 1.6; margin: 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">Olímpia<span>.</span></div>
    <h1>${he(title)}</h1>
    <p>${he(message)}</p>
    ${form}
  </div>
</body>
</html>`;
}

function sendHtml(res, status, page) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).send(page);
}

const INVALID_PAGE = {
  title: 'Link inválido',
  message: 'Este link de fechamento é inválido ou já expirou. Abra o painel da Olímpia e marque o lead por lá.',
  tone: 'error',
};

module.exports = async (req, res) => {
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  // Unauthenticated surface: cheap guard against someone hammering it with
  // guessed tokens (each attempt otherwise costs a signature + a DB read).
  if (await checkAndApplyRateLimit(req, res, 'public_enumeration')) return;

  const token = req.method === 'POST'
    ? String((req.body && req.body.t) || (req.query && req.query.t) || '')
    : String((req.query && req.query.t) || '');

  const check = verifyCloseToken(token);
  if (!check.valid) {
    logger.warn(`prospect-close rejected: ${check.reason}`);
    return sendHtml(res, check.reason === 'expirado' ? 410 : 403, renderPage(INVALID_PAGE));
  }

  try {
    // ---- GET: read-only confirmation (link scanners must not close deals) ----
    if (req.method === 'GET') {
      const { data: lead } = await supabaseAdmin
        .from('prospect_leads').select('id, name, city, prospect_state').eq('id', check.leadId).single();
      if (!lead) return sendHtml(res, 404, renderPage(INVALID_PAGE));

      if (lead.prospect_state === 'ganho') {
        return sendHtml(res, 200, renderPage({
          title: 'Já está marcado 🏆',
          message: `${lead.name} já consta como fechado. A Olímpia não fala mais com ele.`,
          tone: 'ok',
        }));
      }
      if (lead.prospect_state === 'optout') {
        return sendHtml(res, 409, renderPage({
          title: 'Lead pediu pra sair',
          message: `${lead.name} pediu para não receber mais mensagens (LGPD) e não pode ser marcado como fechado.`,
          tone: 'error',
        }));
      }
      return sendHtml(res, 200, renderPage({
        title: 'Fechou este lead?',
        message: `${lead.name}${lead.city ? ` · ${lead.city}` : ''} — confirme para tirá-lo da fila e encerrar a Olímpia nesta conversa.`,
        token,
      }));
    }

    // ---- POST: the actual state change ----
    const result = await markLeadWon(check.leadId);
    if (!result.ok) {
      const messages = {
        nao_encontrado: 'Não encontramos este lead.',
        optout: 'Este lead pediu para não receber mais mensagens (LGPD) e não pode ser marcado como fechado.',
      };
      logger.warn(`prospect-close not applied lead=${check.leadId} reason=${result.reason}`);
      return sendHtml(res, result.reason === 'nao_encontrado' ? 404 : 409, renderPage({
        title: 'Não deu pra marcar',
        message: messages[result.reason] || 'Algo deu errado. Tente pelo painel da Olímpia.',
        tone: 'error',
      }));
    }

    if (result.updated) {
      await recordEvent(check.leadId, '🏆 marcado como FECHADO pelo fundador (link do digest)', { source: 'digest_one_tap' });
      logger.info(`prospect-close WON lead=${check.leadId}`);
    }

    const nome = (result.lead && result.lead.name) || 'O lead';
    return sendHtml(res, 200, renderPage({
      title: result.already ? 'Já estava marcado 🏆' : 'Fechado! 🏆',
      message: result.already
        ? `${nome} já constava como fechado — nada mudou.`
        : `${nome} saiu da fila de fechamento e a Olímpia não fala mais com ele. Parabéns.`,
      tone: 'ok',
    }));
  } catch (err) {
    logger.error('prospect-close error:', err.message);
    return sendHtml(res, 500, renderPage({
      title: 'Deu ruim aqui',
      message: 'Não conseguimos marcar agora. Tente de novo ou use o painel da Olímpia.',
      tone: 'error',
    }));
  }
};

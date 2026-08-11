'use strict';

/**
 * GET /proposta?t=TOKEN — a proposta personalizada do Racha para um prospect.
 *
 * DELIBERADAMENTE PÚBLICO (sem JWT): o link vive num e-mail frio e é
 * encaminhado internamente entre gerência, compras e sócios. Não há sessão para
 * autenticar, então o token HMAC É a credencial — assinado no servidor sobre um
 * único lead id + expiração (prospect/deck-token.js).
 *
 * SÓ LÊ. Diferente do /api/prospect-close, aqui não existe mutação nenhuma, em
 * nenhum verbo: scanner de link de e-mail corporativo vai pré-buscar esta URL, e
 * pré-busca não pode ter efeito colateral. Por isso também não há beacon de
 * abertura — contar "abriu a proposta" a partir de um GET que o antivírus do
 * cliente dispara sozinho seria uma métrica mentirosa.
 *
 * noindex + no-store: proposta com nome de casa não pode acabar no Google nem
 * em cache compartilhado.
 */

const { supabaseAdmin } = require('./_lib/supabase');
const { createSecureLogger } = require('./_lib/secure-logger');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const { verifyDeckToken } = require('./_lib/prospecting/deck-token');
const { buildDeckHtml } = require('./_lib/prospecting/deck-html');

const logger = createSecureLogger('RachaProposta');

function paginaSimples(titulo, mensagem) {
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>${titulo}</title>
<style>
  body{font-family:system-ui,sans-serif;background:#FAFAF9;color:#1C1917;
       display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px}
  div{max-width:34rem;text-align:center}
  h1{font-weight:400;font-size:1.6rem;margin:0 0 .6rem}
  p{color:#706A65;line-height:1.6;margin:0}
</style></head>
<body><div><h1>${titulo}</h1><p>${mensagem}</p></div></body></html>`;
}

module.exports = async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // Endpoint público e enumerável: mesma classe de limite do /prospect-close,
  // aplicada ANTES de tocar no banco.
  if (await checkAndApplyRateLimit(req, res, 'public_enumeration')) return undefined;

  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  const token = req.query && (req.query.t || req.query.token);
  const { ok, leadId, reason } = verifyDeckToken(token);

  if (!ok) {
    // Motivo NUNCA vai pro corpo: distinguir "assinatura inválida" de
    // "expirado" para quem tem o link é dar régua para forjar.
    logger.warn('proposta recusada', { reason });
    const expirado = reason === 'expirado';
    return res.status(expirado ? 410 : 404).send(paginaSimples(
      expirado ? 'Este link expirou' : 'Link não encontrado',
      'Se você recebeu esta proposta por e-mail, é só responder aquela mensagem que eu te mando um link novo.'
    ));
  }

  try {
    const { data: lead, error } = await supabaseAdmin
      .from('prospect_leads')
      .select('id, name, city, sector')
      .eq('id', leadId)
      .maybeSingle();

    if (error) {
      logger.error('falha ao carregar lead da proposta', { error: error.message });
      return res.status(500).send(paginaSimples('Deu problema aqui', 'Tente de novo em alguns minutos.'));
    }
    if (!lead) {
      return res.status(404).send(paginaSimples('Link não encontrado', 'Essa proposta não está mais disponível.'));
    }

    const { html } = buildDeckHtml(lead);
    logger.info('proposta servida', { lead: lead.id });
    return res.status(200).send(html);
  } catch (err) {
    // CLAIM_BLOCKED cai aqui: melhor a proposta não abrir do que abrir dizendo
    // algo proibido para um comprador real.
    logger.error('proposta falhou ao montar', { error: err.message });
    return res.status(500).send(paginaSimples('Deu problema aqui', 'Tente de novo em alguns minutos.'));
  }
};

'use strict';

/**
 * GET /api/enrich-cnpj?nome=...&cidade=... — candidatos de CNPJ da Receita.
 *
 * Item 5 do plano zero-toque. Alimenta o passo de confirmação do onboarding:
 * o dono vê a razão social já preenchida e, melhor, a pergunta que nenhum
 * concorrente faz — "você é o Jorge ou a Keila?" — que confirma que quem
 * cadastra é sócio de verdade, sem pedir documento nenhum.
 *
 * Auth: JWT do dono. O índice é dado público da Receita, mas a busca por nome
 * revela quem está se cadastrando e é consulta de custo não-nulo — endpoint
 * aberto viraria ferramenta de varredura de CNPJ de graça.
 *
 * Nunca bloqueia: sem candidato, devolve lista vazia com 200. O onboarding
 * segue e o dono digita à mão.
 */

const { verifyJWT } = require('./_lib/auth');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const { setInternalCors, handlePreflight } = require('./_lib/cors');
const { createSecureLogger } = require('./_lib/secure-logger');
const { supabaseAdmin } = require('./_lib/supabase');
const { enriquecerComCnpj } = require('./_lib/enrichers/cnpj');

const logger = createSecureLogger('EnrichCnpj');

module.exports = async function handler(req, res) {
  setInternalCors(req, res);
  if (handlePreflight(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  if (await checkAndApplyRateLimit(req, res, 'default')) return;

  const user = await verifyJWT(req.headers.authorization?.replace('Bearer ', ''));
  if (!user?.restaurant_id) return res.status(401).json({ error: 'Authentication required' });

  const nome = String(req.query?.nome || '').trim();
  const cidade = req.query?.cidade ? String(req.query.cidade).trim() : null;

  if (nome.length < 3) {
    return res.status(400).json({ success: false, error: 'nome precisa ter ao menos 3 caracteres' });
  }
  if (nome.length > 120) {
    return res.status(400).json({ success: false, error: 'nome muito longo' });
  }

  try {
    const resultado = await enriquecerComCnpj(supabaseAdmin, { nome, cidade });
    return res.status(200).json({
      success: true,
      data: {
        candidatos: resultado.campos?.candidatos || [],
        sugerido: resultado.campos?.sugerido || null,
        confianca: resultado.confianca,
        fonte: resultado.fonte,
      },
    });
  } catch (err) {
    logger.error('Enriquecimento de CNPJ falhou', { erro: err?.message || String(err) });
    return res.status(500).json({ success: false, error: 'Falha ao consultar o índice da Receita' });
  }
};

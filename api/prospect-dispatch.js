'use strict';

/**
 * POST /api/prospect-dispatch — operator-triggered cold-intro dispatch.
 *
 * Deliberately a MANUAL endpoint, not an auto-cron: cold outreach should be
 * operator-initiated (compliance + believability), not blasted on a timer. Sends
 * the approved intro template to leads that have never been contacted, bounded by
 * the warm-up daily cap. Dry-run-default-on and force-safe without a configured
 * number + template. Auth: CRON_SECRET bearer (internal tooling).
 *
 * Body: { limit? }
 *
 * Também expõe o ciclo de vida de template, sob o MESMO CRON_SECRET:
 *   POST ?action=template-create  { name, body_text, ... } → submete à revisão
 *   GET  ?action=template-status&name=X                    → status ao vivo na Meta
 *
 * Por que aqui e não em prospect-admin: aquele endpoint é gated por JWT do
 * login Google, que só o fundador tem no navegador — inalcançável por
 * ferramenta e por script. O token da Meta, por sua vez, é System User e mora
 * só na Vercel marcado como Sensitive, então também não dá pra submeter de
 * fora. Sem isto, criar um template exige um humano logado no painel.
 *
 * Sobre ampliar o que o CRON_SECRET autoriza: este mesmo segredo já autoriza
 * ENVIAR mensagem para dono de restaurante real (o dispatch acima). Submeter um
 * template é estritamente menos perigoso — vai para fila de revisão da Meta,
 * não dispara nada, e é reversível por exclusão. O ganho é que a submissão
 * deixa de depender de sessão de navegador.
 *
 * E arquivo novo em api/ vira função serverless cobrada (ver CLAUDE.md), então
 * isto mora no endpoint de prospecção que já existe.
 */

const { createSecureLogger } = require('./_lib/secure-logger');
const { bearerEquals } = require('./_lib/secure-compare');
const { dispatchIntros } = require('./_lib/prospecting/sequencer');

const logger = createSecureLogger('ProspectDispatch');

/** Submete um template à revisão da Meta e registra-o INATIVO. */
async function criarTemplate(req, res) {
  const b = req.body || {};
  if (!b.name || !b.body_text) {
    return res.status(400).json({ success: false, error: 'name e body_text são obrigatórios' });
  }

  const { createMetaTemplate } = require('./_lib/prospecting/wa-management');
  const criado = await createMetaTemplate({
    name: b.name,
    language: b.language || 'pt_BR',
    category: b.category || 'MARKETING',
    bodyText: b.body_text,
    exampleParam: b.example_param,
    buttonText: b.button_text,
    buttonUrl: b.button_url,
  });
  if (!criado.ok) return res.status(400).json({ success: false, error: criado.error });

  // Registro fica INATIVO de propósito: aprovação é da Meta e leva tempo, e
  // `pickTemplate` só olha esta flag — nunca a Meta. Um template ativo e não
  // aprovado passa pela escolha e morre no envio (foi o que a variante C fez).
  // Quem ativa é o operador, depois de ver o status aprovado.
  let registrado = false;
  if (b.touch_number) {
    const { upsertTemplate } = require('./_lib/prospecting/prospect-store');
    await upsertTemplate({
      touch_number: parseInt(b.touch_number, 10),
      variant_label: String(b.variant_label || 'A'),
      meta_template_name: criado.name,
      template_lang: b.language || 'pt_BR',
      body_preview: b.body_text,
      active: false,
    });
    registrado = true;
  }

  logger.info(`template submetido name=${criado.name} status=${criado.status}`);
  return res.status(200).json({
    success: true,
    data: { ...criado, registrado, ativo: false },
  });
}

/** Status ao vivo de um template na Meta (nunca cacheado no nosso banco). */
async function statusTemplate(req, res) {
  const nome = String(req.query.name || '').trim();
  if (!nome) return res.status(400).json({ success: false, error: 'name é obrigatório' });

  const { listMetaTemplates } = require('./_lib/prospecting/wa-management');
  try {
    const todos = await listMetaTemplates();
    const achados = todos.filter((t) => t.name === nome);
    return res.status(200).json({
      success: true,
      data: {
        name: nome,
        existe: achados.length > 0,
        versoes: achados.map((t) => ({ language: t.language, status: t.status })),
        aprovado: achados.some((t) => String(t.status).toUpperCase() === 'APPROVED'),
      },
    });
  } catch (err) {
    logger.error('template status failed:', err.message);
    return res.status(502).json({ success: false, error: 'Meta não respondeu' });
  }
}

module.exports = async (req, res) => {
  const action = String((req.query && req.query.action) || '');

  // GET só é aceito para leitura de status; o resto continua POST-only.
  const metodoOk = action === 'template-status' ? req.method === 'GET' : req.method === 'POST';
  if (!metodoOk) {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.error('CRON_SECRET not configured');
    return res.status(500).json({ success: false, error: 'Not configured' });
  }
  if (!bearerEquals(req.headers.authorization, secret)) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  if (action === 'template-create') return criarTemplate(req, res);
  if (action === 'template-status') return statusTemplate(req, res);

  // `limit: 0` significa ZERO — e é uma sonda legítima: devolve o estado
  // (dryRun, janela, cap) sem selecionar nem enviar nada.
  //
  // A versão anterior era `parseInt(...) || 20` com piso 1, então `limit: 0`
  // virava 20 SILENCIOSAMENTE. Foi assim que uma chamada que eu acreditava
  // inofensiva disparou 20 tentativas reais de envio (30/jul). Não houve dano
  // — a Meta recusou todas porque o template não estava aprovado, e
  // `markIntro('failed')` liberou os claims — mas foi acidente, não desenho.
  // Um endpoint que envia dinheiro/mensagem não pode reinterpretar a
  // quantidade que o operador pediu.
  // `null`/`''` precisam cair no DEFAULT, não em zero: `Number(null)` é 0 e
  // `Number('')` é 0, então uma checagem só com Number.isFinite trataria
  // "campo vazio" como "não envie nada" — silencioso na direção oposta ao
  // problema original, mas igualmente enganoso.
  const bruto = (req.body || {}).limit;
  const ausente = bruto === null || bruto === undefined || bruto === '';
  const n = ausente ? NaN : Number(bruto);
  const limit = Number.isFinite(n) ? Math.min(Math.max(Math.trunc(n), 0), 100) : 20;
  // Operator override — deliberately send outside the 10-17 dispatch window.
  const force = (req.body || {}).force === true;
  try {
    const summary = await dispatchIntros({ limit, force });
    return res.status(200).json({ success: true, data: summary });
  } catch (err) {
    logger.error('dispatch error:', err.message);
    return res.status(500).json({ success: false, error: 'Dispatch failed' });
  }
};

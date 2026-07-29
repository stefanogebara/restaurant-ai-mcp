'use strict';

/**
 * Templates APROVADOS DA META — seleção e ordem de tentativa.
 *
 * Não confundir com `whatsapp-templates.js`, que são textos locais montados
 * por nós. Aqui trata-se dos templates registrados na WABA e aprovados pela
 * Meta, únicos que podem INICIAR conversa.
 *
 * POR QUE EM `_lib`: estas funções nasceram dentro de `api/whatsapp-settings.js`,
 * que é um HANDLER. Importar handler irmão faz a NFT da Vercel derrubar a função
 * importadora do manifesto de deploy SEM erro de build — o endpoint 404 em
 * produção (causa raiz do /api/demo em jun/2026). Lógica que dois handlers
 * precisam mora aqui.
 *
 * REGRA DE NEGÓCIO QUE ORIGINA TUDO: mensagem iniciada pela empresa (o cliente
 * nunca escreveu) só sai por template aprovado. Texto livre funciona apenas
 * dentro da janela de 24h após o cliente falar.
 */

const GRAPH_VERSION = 'v19.0';

/**
 * Códigos de idioma a tentar, em ordem. A Meta trata `pt_BR` e `pt` como
 * traduções DISTINTAS: um template aprovado em `pt_BR` recusa envio pedido em
 * `pt` (erro 132001). Tentar a família toda evita depender de como a conta foi
 * cadastrada.
 */
function getTemplateLanguageCandidates(language) {
  const normalized = String(language || '').trim().toLowerCase();
  const candidates = [];
  const seen = new Set();

  function add(code) {
    if (!code || seen.has(code)) return;
    seen.add(code);
    candidates.push(code);
  }

  if (normalized.startsWith('pt-br')) {
    add('pt_BR');
    add('pt');
  } else if (normalized.startsWith('pt')) {
    add('pt');
    add('pt_BR');
  } else if (normalized.startsWith('es')) {
    add('es');
    add('es_ES');
  } else if (normalized.startsWith('en-us')) {
    add('en_US');
    add('en');
  } else if (normalized.startsWith('en')) {
    add('en');
    add('en_US');
  } else if (normalized) {
    add(language);
  }

  add('pt_BR');
  add('pt');
  add('en');
  add('en_US');
  add('es');

  return candidates;
}

/** Erro 132001: o template existe, mas não naquele idioma. */
function isTemplateTranslationMissing(result) {
  const errorText = String(result?.error || '').toLowerCase();
  return errorText.includes('132001') || errorText.includes('does not exist in the translation');
}

function getMetaTestTemplatePriority(preferredTemplateName) {
  const priority = [];
  const seen = new Set();

  function add(name) {
    if (!name || seen.has(name)) return;
    seen.add(name);
    priority.push(name);
  }

  add(preferredTemplateName);
  add('seatable_feedback_request');
  add('seatable_promotion');
  add('seatable_birthday');
  add('seatable_reengagement');

  return priority;
}

function getMetaTemplateBodyParameters(templateName, restaurantName) {
  if (templateName === 'seatable_promotion') {
    return ['there', restaurantName, `This is a WhatsApp delivery test from ${restaurantName}.`];
  }
  return ['there', restaurantName];
}

/**
 * Templates APROVADOS na WABA. Devolve [] quando falta credencial ou a Graph
 * recusa. Para envio a frio, [] é bloqueio — quem chama decide.
 */
async function fetchApprovedMetaTestTemplates() {
  const wabaId = process.env.WHATSAPP_WABA_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_TOKEN || process.env.META_WHATSAPP_TOKEN;

  if (!wabaId || !token) return [];

  try {
    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${wabaId}/message_templates?fields=name,status,category,language&limit=200`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!response.ok) return [];

    const data = await response.json();
    return (data.data || []).filter(template => template.status === 'APPROVED' && template.name && template.language);
  } catch {
    return [];
  }
}

function buildMetaTemplateAttempts({ templates, preferredTemplateName, restaurantLanguage, restaurantName }) {
  const languageCandidates = getTemplateLanguageCandidates(restaurantLanguage);
  const attempts = [];
  const seen = new Set();
  const priorityNames = getMetaTestTemplatePriority(preferredTemplateName);

  for (const templateName of priorityNames) {
    const approvedMatches = (templates || [])
      .filter(template => template.name === templateName)
      .sort((a, b) => {
        const aIdx = languageCandidates.indexOf(a.language);
        const bIdx = languageCandidates.indexOf(b.language);
        const aRank = aIdx === -1 ? Number.MAX_SAFE_INTEGER : aIdx;
        const bRank = bIdx === -1 ? Number.MAX_SAFE_INTEGER : bIdx;
        return aRank - bRank;
      });

    for (const template of approvedMatches) {
      const key = `${template.name}:${template.language}`;
      if (seen.has(key)) continue;
      seen.add(key);
      attempts.push({
        templateName: template.name,
        language: template.language,
        bodyParameters: getMetaTemplateBodyParameters(template.name, restaurantName),
      });
    }
  }

  if (attempts.length > 0) return attempts;

  // Nada aprovado casou: tenta o nome preferido em cada idioma. Palpite
  // deliberado — melhor recusa da Meta com erro legível que silêncio.
  const fallbackTemplateName = preferredTemplateName || 'seatable_feedback_request';
  return languageCandidates.map(language => ({
    templateName: fallbackTemplateName,
    language,
    bodyParameters: getMetaTemplateBodyParameters(fallbackTemplateName, restaurantName),
  }));
}

module.exports = {
  getTemplateLanguageCandidates,
  isTemplateTranslationMissing,
  getMetaTestTemplatePriority,
  getMetaTemplateBodyParameters,
  fetchApprovedMetaTestTemplates,
  buildMetaTemplateAttempts,
};

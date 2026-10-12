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
const DIAGNOSTIC_TEMPLATE = 'seatable_connection_test';

/**
 * Códigos de idioma a tentar, em ordem. A Meta trata `pt_BR` e `pt` como
 * traduções DISTINTAS: um template aprovado em `pt_BR` recusa envio pedido em
 * `pt` (erro 132001). Só tentamos variantes do idioma do restaurante. Jamais
 * usamos outro idioma para fazer um teste parecer bem-sucedido.
 */
function getTemplateLanguageCandidates(language) {
  const normalized = String(language || '').trim().toLowerCase().replace(/_/g, '-');
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

  return candidates;
}

/** Erro 132001: o template existe, mas não naquele idioma. */
function isTemplateTranslationMissing(result) {
  const errorText = String(result?.error || '').toLowerCase();
  return errorText.includes('132001') || errorText.includes('does not exist in the translation');
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

function buildMetaTemplateAttempts({ templates, restaurantLanguage, restaurantName }) {
  const languageCandidates = getTemplateLanguageCandidates(restaurantLanguage);
  const approved = (templates || [])
    .filter(template => template.name === DIAGNOSTIC_TEMPLATE && template.status === 'APPROVED' && languageCandidates.includes(template.language));
  return languageCandidates
    .filter(language => approved.some(template => template.language === language))
    .map(language => ({
      templateName: DIAGNOSTIC_TEMPLATE,
      language,
      // O modelo aprovado tem exatamente uma variável: o restaurante.
      bodyParameters: [restaurantName],
    }));
}

module.exports = {
  getTemplateLanguageCandidates,
  isTemplateTranslationMissing,
  fetchApprovedMetaTestTemplates,
  buildMetaTemplateAttempts,
};

'use strict';

/**
 * A voz da recepcionista vira uma ESCOLHA, não uma redação.
 *
 * O passo "Ensine sua IA" faz doze perguntas dissertativas e a própria copy
 * avisa: "leva cerca de 5 minutos". Uma delas é sobre estilo de comunicação, e
 * o dono precisa digitar um parágrafo descrevendo o tom da casa.
 *
 * Dois problemas, e o segundo é o grave:
 *
 * 1. Ninguém redige cinco minutos logo depois de assinar.
 * 2. Mesmo quem redige está sendo mal perguntado. O que o sistema guarda é
 *    `humor_type: 'warm'` e `communication_style: 'casual'` — abstrações que
 *    o dono não tem como julgar. Ele não sabe se quer "warm" ou "light"; ele
 *    sabe reconhecer a própria casa quando ouve.
 *
 * Então mostre. Este módulo pega a MESMA fala difícil de um cliente — pedir
 * mesa num horário cheio, que é onde a voz de uma recepcionista realmente
 * aparece — e mostra como cada uma das quatro personas responderia. O dono lê
 * quatro respostas curtas e toca na que soa como a casa dele. Zero digitação.
 *
 * O preset sugerido sai de `deriveBestPresetFromVibes`, que já existia e que o
 * onboarding nunca chamou: ele estava sendo usado só no demo manual, enquanto
 * o onboarding perguntava do zero o que o repositório já sabia calcular.
 *
 * O `motivo` que acompanha a sugestão cita as tags REAIS que pesaram. É o
 * mesmo contrato dos cards de fase do Manager AI — nunca inventar a etapa.
 * Sem tag nenhuma não há sugestão, e as quatro aparecem em pé de igualdade.
 */

const { PERSONA_PRESETS, deriveBestPresetFromVibes } = require('./vibe-to-persona-preset');

/** A pergunta é a mesma nas quatro para a comparação ser justa. */
const FALA_DO_CLIENTE = {
  pt: 'Oi! Tem mesa pra 4 hoje às 20h?',
  es: '¡Hola! ¿Tienen mesa para 4 hoy a las 20h?',
  en: 'Hi! Any table for 4 tonight at 8?',
};

/**
 * A resposta é um "não, mas" — recusar e oferecer alternativa é onde a voz de
 * uma casa aparece de verdade. Um "sim" soa igual em qualquer tom.
 */
const AMOSTRAS = {
  neighborhood: {
    rotulo: { pt: 'Do bairro', es: 'De barrio', en: 'Neighborhood' },
    resumo: {
      pt: 'Próxima, sem cerimônia. Trata quem chega como quem já é de casa.',
      es: 'Cercana, sin ceremonia. Trata a quien llega como de la casa.',
      en: 'Close and unfussy. Treats every guest like a regular.',
    },
    resposta: {
      pt: 'Oi! Às 20h tá cheio, mas às 21h eu consigo — e é uma hora boa, o salão fica mais tranquilo. Seguro pra você?',
      es: '¡Hola! A las 20h está lleno, pero a las 21h sí puedo — y es buena hora, el salón queda más tranquilo. ¿Te la guardo?',
      en: 'Hey! 8 is full, but I can do 9 — and it is a good time, the room quiets down. Want me to hold it?',
    },
  },
  fine_dining: {
    rotulo: { pt: 'Sóbria', es: 'Sobria', en: 'Refined' },
    resumo: {
      pt: 'Formal e discreta. Precisa, sem excesso de simpatia.',
      es: 'Formal y discreta. Precisa, sin exceso de simpatía.',
      en: 'Formal and discreet. Precise, never effusive.',
    },
    resposta: {
      pt: 'Boa tarde. Às 20h não temos disponibilidade. Posso oferecer 21h15 para quatro pessoas. Deseja que eu reserve?',
      es: 'Buenas tardes. A las 20h no tenemos disponibilidad. Puedo ofrecer 21h15 para cuatro personas. ¿Desea que reserve?',
      en: 'Good afternoon. We have no availability at 8. I can offer 9:15 for four. Shall I reserve it?',
    },
  },
  fast_efficient: {
    rotulo: { pt: 'Direta', es: 'Directa', en: 'Direct' },
    resumo: {
      pt: 'Rápida e clara. Resolve em duas linhas, sem rodeio.',
      es: 'Rápida y clara. Resuelve en dos líneas, sin rodeos.',
      en: 'Fast and clear. Two lines, no detours.',
    },
    resposta: {
      pt: 'Oi! 20h lotado. Tenho 19h15 ou 21h30, os dois pra 4. Qual prefere?',
      es: '¡Hola! 20h lleno. Tengo 19h15 o 21h30, ambos para 4. ¿Cuál prefieres?',
      en: 'Hi! 8 is booked. I have 7:15 or 9:30, both for 4. Which works?',
    },
  },
  family_friendly: {
    rotulo: { pt: 'Animada', es: 'Animada', en: 'Upbeat' },
    resumo: {
      pt: 'Calorosa e animada. Boa com grupo, criança e comemoração.',
      es: 'Cálida y animada. Buena con grupos, niños y celebraciones.',
      en: 'Warm and upbeat. Good with groups, kids and celebrations.',
    },
    resposta: {
      pt: 'Oi! Às 20h a casa tá cheia, mas às 19h eu tenho uma mesa ótima pra 4 — e dá tempo de vocês pegarem a sobremesa quentinha. Vamos nessa?',
      es: '¡Hola! A las 20h está llena, pero a las 19h tengo una mesa buenísima para 4 — y les da tiempo al postre recién hecho. ¿Vamos?',
      en: 'Hi! 8 is packed, but at 7 I have a great table for 4 — and you would still catch dessert fresh out. Shall we?',
    },
  },
};

const ORDEM_PADRAO = ['neighborhood', 'fast_efficient', 'family_friendly', 'fine_dining'];

/**
 * As tags vêm do Google em inglês. Mostrá-las cruas dentro de uma frase em
 * português ("aparece como romantic, upscale") é a mesma inconsistência de
 * idioma que a auditoria de hoje apontou na landing — e aqui ela cairia
 * justamente na frase que existe para o dono CONFIAR na sugestão.
 */
const ROTULO_TAG = {
  romantic:          { pt: 'romântico',        es: 'romántico',      en: 'romantic' },
  intimate:          { pt: 'intimista',        es: 'íntimo',         en: 'intimate' },
  upscale:           { pt: 'sofisticado',      es: 'sofisticado',    en: 'upscale' },
  quiet:             { pt: 'tranquilo',        es: 'tranquilo',      en: 'quiet' },
  traditional:       { pt: 'tradicional',      es: 'tradicional',    en: 'traditional' },
  casual:            { pt: 'descontraído',     es: 'informal',       en: 'casual' },
  lively:            { pt: 'animado',          es: 'animado',        en: 'lively' },
  bustling:          { pt: 'movimentado',      es: 'concurrido',     en: 'bustling' },
  trendy:            { pt: 'moderno',          es: 'moderno',        en: 'trendy' },
  'family-friendly': { pt: 'para famílias',    es: 'para familias',  en: 'family-friendly' },
  'family friendly': { pt: 'para famílias',    es: 'para familias',  en: 'family-friendly' },
  playful:           { pt: 'descontraído',     es: 'desenfadado',    en: 'playful' },
};

/** Tag sem tradução aparece como veio — melhor crua que sumida. */
function rotuloDaTag(tag, lang) {
  return ROTULO_TAG[tag]?.[lang] || tag;
}

function idioma(lang) {
  const l = String(lang || 'pt').slice(0, 2).toLowerCase();
  return ['pt', 'es', 'en'].includes(l) ? l : 'pt';
}

function cartao(preset, lang) {
  const a = AMOSTRAS[preset];
  return {
    preset,
    rotulo: a.rotulo[lang],
    resumo: a.resumo[lang],
    pergunta: FALA_DO_CLIENTE[lang],
    resposta: a.resposta[lang],
    personalidade: PERSONA_PRESETS[preset],
  };
}

/**
 * Quais tags do restaurante pesaram para o preset escolhido. Só as que este
 * preset de fato pontua — dizer "por causa de X" quando X não contou seria
 * inventar a explicação, que é pior que não explicar.
 */
function tagsQueContaram(preset, vibeTags) {
  const { TAG_WEIGHTS } = require('./vibe-to-persona-preset');
  if (!TAG_WEIGHTS || !Array.isArray(vibeTags)) return [];
  return vibeTags
    .filter((t) => typeof t === 'string')
    .map((t) => t.toLowerCase().trim())
    .filter((t) => (TAG_WEIGHTS[t]?.[preset] ?? 0) > 0);
}

/**
 * Propõe uma voz e devolve as quatro para o dono comparar.
 *
 * @param {object}   o
 * @param {string[]} [o.vibe_tags]  tags do Google/scrape ou escolhidas no demo
 * @param {string}   [o.lang]       'pt' | 'es' | 'en'
 * @returns {{sugerido: string|null, motivo: string|null, cartoes: object[]}}
 *   `sugerido` é null quando não há tag suficiente — e aí NENHUM cartão vem
 *   marcado, em vez de chutar um e o dono aceitar por inércia.
 */
function proporPersona(entrada) {
  // `= {}` no parâmetro só cobre `undefined`. Um `null` — que é exatamente o
  // que chega de um campo de banco vazio — passaria direto e estouraria na
  // desestruturação. Mesma família do sentinela do #76: o default não dispara
  // justamente para o valor que a vida real entrega.
  const { vibe_tags: vibeTags, lang } = (entrada && typeof entrada === 'object') ? entrada : {};
  const l = idioma(lang);
  const sugerido = deriveBestPresetFromVibes(vibeTags);

  // O sugerido vem primeiro; o resto mantém a ordem padrão.
  const ordem = sugerido
    ? [sugerido, ...ORDEM_PADRAO.filter((p) => p !== sugerido)]
    : ORDEM_PADRAO;

  let motivo = null;
  if (sugerido) {
    const tags = tagsQueContaram(sugerido, vibeTags);
    if (tags.length) {
      const lista = tags.map((t) => rotuloDaTag(t, l)).join(', ');
      motivo = {
        pt: `Sugeri esta porque seu restaurante aparece como ${lista}.`,
        es: `Sugerí esta porque tu restaurante aparece como ${lista}.`,
        en: `I suggested this one because your restaurant reads as ${lista}.`,
      }[l];
    }
  }

  return {
    sugerido,
    motivo,
    cartoes: ordem.map((p) => ({ ...cartao(p, l), sugerido: p === sugerido })),
  };
}

module.exports = { proporPersona, AMOSTRAS, FALA_DO_CLIENTE, ORDEM_PADRAO };

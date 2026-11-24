'use strict';

/**
 * Monta o `restaurant_profile` a partir do que a pesquisa já achou.
 *
 * O perfil alimenta o system prompt do Manager AI, a persona do agente de voz
 * e a semente da memória do gerente. Hoje ele só nasce de uma entrevista de
 * doze perguntas dissertativas — e é por isso que a entrevista não podia
 * simplesmente ser desligada: sem ela a IA ficaria mais burra.
 *
 * Só que o dado já está lá. O `scraped_data` do demo traz `editorial_summary`,
 * `cuisine_type`, `price_level`, cinco avaliações e um bloco `insights` com
 * `vibe_tags`, `praise_themes`, `complaint_themes` e `popular_dishes`. Isso
 * responde seis das oito seções do perfil. A sétima virou um toque (#87), e a
 * oitava — `things_to_know` — é a única que realmente precisa do dono.
 *
 * O ciclo que isso quebra está escrito em restaurant-learning/research.js:
 * o gather de inteligência foi adiado (estourava a lambda), e a justificativa
 * registrada foi "as 12 perguntas não precisam de contexto pré-coletado — elas
 * perguntam as mesmas coisas de qualquer jeito". Ou seja: a pesquisa foi
 * desligada porque a entrevista a ignorava, e a entrevista pergunta tudo
 * porque não há pesquisa.
 *
 * DETERMINÍSTICO DE PROPÓSITO, sem chamada de LLM. O repo já perdeu essa briga
 * duas vezes no mesmo arquivo (~96s encadeados, e depois a versão
 * fire-and-forget que a Vercel matou pós-resposta). O `complete.js` já carrega
 * um teto de 15s para o createAgent e 8s para o sync de conhecimento; somar
 * mais 30s de síntese ali seria convidar o FUNCTION_INVOCATION_FAILED de volta.
 * A polida por LLM (`personaGenerator`) continua existindo e pode rodar depois,
 * por cron ou sob demanda — que é exatamente o que aquele comentário recomenda.
 *
 * REGRA DE HONESTIDADE: campo sem dado fica `null` ou `[]`. Nunca inventar um
 * prato, um diferencial ou uma frase característica. Um perfil inventado é pior
 * que um perfil vazio, porque a IA o repete para o cliente com convicção.
 */

const { PERSONA_PRESETS } = require('./vibe-to-persona-preset');

const VERSAO = 1;

function texto(v, max = 400) {
  if (typeof v !== 'string') return null;
  const limpo = v.trim().replace(/\s+/g, ' ');
  return limpo ? limpo.slice(0, max) : null;
}

function lista(v, max = 6) {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (typeof x === 'string' ? x.trim() : texto(x?.name) || texto(x?.title)))
    .filter(Boolean)
    .slice(0, max);
}

/**
 * `price_level` do Google (0–4) em palavra. Fora da faixa vira null.
 *
 * O `typeof` na frente não é zelo excessivo: `Number(null)`, `Number('')` e
 * `Number([])` são todos `0`, que aqui mapearia para "econômico". Um
 * restaurante de preço DESCONHECIDO seria descrito à IA como barato — a regra
 * de "nunca inventar" quebrada por uma coerção silenciosa. (Pego pelo teste,
 * não pela leitura.)
 */
function faixaDePreco(n) {
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > 4) return null;
  const mapa = { 0: 'econômico', 1: 'econômico', 2: 'intermediário', 3: 'caro', 4: 'muito caro' };
  return mapa[n] ?? null;
}

/**
 * Pratos: `insights.popular_dishes` (extraídos das avaliações) na frente,
 * `menu.popular_dishes` depois. Os dois são dados reais — nada é inferido.
 */
function pratos(scrape) {
  const dasAvaliacoes = lista(scrape?.insights?.popular_dishes);
  const doCardapio = lista(scrape?.menu?.popular_dishes);
  const vistos = new Set();
  const saida = [];
  for (const [nome, origem] of [
    ...dasAvaliacoes.map((n) => [n, 'avaliações']),
    ...doCardapio.map((n) => [n, 'cardápio']),
  ]) {
    const chave = nome.toLowerCase();
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    saida.push({ name: nome, description: null, why_special: null, _fonte: origem });
  }
  return saida.slice(0, 6);
}

/**
 * @param {object}  o
 * @param {object}  [o.scraped_data]    o que a pesquisa achou
 * @param {string}  [o.restaurant_name]
 * @param {string}  [o.restaurant_type]
 * @param {string}  [o.preset]          a voz escolhida na folha
 * @returns {{restaurant_profile: object, cobertura: object}}
 *   `cobertura` diz quais seções têm dado real — é o que a folha usa para
 *   mostrar a fonte, e o que diz se ainda vale perguntar algo ao dono.
 */
function montarPerfil({ scraped_data: scrape, restaurant_name: nome, restaurant_type: tipo, preset } = {}) {
  const s = scrape && typeof scrape === 'object' ? scrape : {};
  const insights = s.insights && typeof s.insights === 'object' ? s.insights : {};

  const editorial = texto(s.editorial_summary);
  const cozinha = texto(s.cuisine_type, 60) || texto(tipo, 60);
  const vibes = lista(insights.vibe_tags, 8);
  const elogios = lista(insights.praise_themes, 6);
  const queixas = lista(insights.complaint_themes, 6);
  const osPratos = pratos(s);
  const personalidade = preset ? PERSONA_PRESETS[preset] : null;
  const notasDeVoz = texto(insights.ai_voice_notes, 600);

  // O resumo é MONTADO de pedaços verdadeiros, nunca redigido do nada. Sem
  // editorial e sem cozinha não há resumo — e `null` é uma resposta honesta.
  let resumo = null;
  if (editorial) {
    resumo = editorial;
  } else if (cozinha && vibes.length) {
    resumo = `${nome || 'O restaurante'} serve cozinha ${cozinha.toLowerCase()} num ambiente ${vibes.slice(0, 2).join(' e ')}.`;
  }

  const perfil = {
    version: VERSAO,
    _fonte: 'pesquisa',
    _gerado_em: new Date().toISOString(),

    persona_summary: resumo,

    cuisine_identity: {
      primary_cuisine: cozinha,
      style: null,
      influences: [],
      philosophy: null,
    },

    atmosphere: {
      vibe: vibes[0] || null,
      description: editorial,
      music: null,
      dress_code: null,
      price_range: faixaDePreco(s.price_level),
      tags: vibes,
    },

    signature_dishes: osPratos,

    // A única seção que NÃO vem da pesquisa: o dono escolheu ouvindo.
    communication_style: personalidade
      ? {
          tone: personalidade.language_tone,
          greeting_style: null,
          personality_traits: personalidade.personality_traits,
          phrases_to_use: [],
          phrases_to_avoid: [],
          _fonte: 'escolha do dono',
          _preset: preset,
        }
      : null,

    guest_experience: {
      promise: elogios.length ? elogios[0] : null,
      special_occasions: null,
      dietary_accommodations: null,
    },

    // O que os clientes mais elogiam É o diferencial — dito por eles, não por
    // nós. É a resposta mais confiável que existe para essa pergunta.
    unique_differentiators: elogios,

    // As queixas recorrentes são exatamente o que a recepcionista precisa saber
    // para não repetir o problema — estacionamento difícil, espera, ruído.
    things_to_know: queixas,

    greeting_preview: null,
    ...(notasDeVoz ? { _notas_de_voz: notasDeVoz } : {}),
  };

  const cobertura = {
    persona_summary: Boolean(resumo),
    cuisine_identity: Boolean(cozinha),
    atmosphere: vibes.length > 0 || Boolean(editorial),
    signature_dishes: osPratos.length > 0,
    communication_style: Boolean(personalidade),
    unique_differentiators: elogios.length > 0,
    things_to_know: queixas.length > 0,
  };
  cobertura._preenchidas = Object.values(cobertura).filter(Boolean).length;
  cobertura._total = 7;

  return { restaurant_profile: perfil, cobertura };
}

module.exports = { montarPerfil, VERSAO };

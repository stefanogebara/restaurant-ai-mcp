'use strict';

/**
 * Prospect agent "brain" — the LLM-facing layer.
 *
 * Ported from prospectautomation's olivia_brain.ts + olivia-responder, adapted to
 * Seatable: the persona now sells SEATABLE (AI reservations / WhatsApp / voice
 * agent for restaurants) to restaurant owners, and the LLM call goes through
 * Seatable's getAI() (Anthropic Messages shape) instead of Olivia's direct
 * OpenRouter/OpenAI call. The deterministic guardrails (opt-out, owner-number,
 * business hours) live in prospect-state.js / prospect-extract.js and run in the
 * responder BEFORE this module is reached.
 *
 * ANTI-INVENTION is the core value: the agent never invents prices, customer
 * cases, numbers, or meeting times. Whatever it can't answer safely → handoff.
 */

const { getAI, AI_MODEL } = require('../ai-client');
const { createSecureLogger } = require('../secure-logger');
const { descreverAgora } = require('./prospect-state');
const { formatarMemoria } = require('./prospect-facts');
const { consumeLlmCall } = require('./prospect-llm-budget');
const { getProfile } = require('./prospect-product');

const logger = createSecureLogger('ProspectAgent');

// Persona is configurable so the same code can run a differently-branded agent.
const AGENT_NAME = process.env.PROSPECTING_AGENT_NAME || 'Olímpia';
// Produto vendido (Racha por padrão, wedge; Seatable via PROSPECTING_PRODUCT=seatable).
// A cópia específica de produto (o-que-faz, objetivo, prévia, porta) vem daqui.
const PROFILE = getProfile();
const COMPANY = PROFILE.company;
const SITE = PROFILE.site;
// Social proof (real customer names ONLY). Empty by default — Seatable is early,
// and the #1 anti-invention rule is "never invent a customer case". When you have
// real references, set PROSPECTING_CASES="Restaurante X, Bar Y".
const CASES = (process.env.PROSPECTING_CASES || '').trim();
// WhatsApp direto do fundador — o ÚNICO número que a agente pode escrever por
// conta própria. Regra (Stefano, 2026-07-20): pedir humano, pedir contato, ou
// indicar o dono/responsável NUNCA termina em beco sem saída — a resposta sai
// com este número ("caso queira falar com o fundador, esse é o número dele").
const FOUNDER_WHATSAPP = process.env.PROSPECTING_FOUNDER_WHATSAPP || '+55 11 99900-2121';
const FOUNDER_DIGITS = FOUNDER_WHATSAPP.replace(/\D+/g, '');

/**
 * PURE: does this phone belong to the founder's own line? Used to keep the
 * founder's TEST lead ("Restaurante do Stefano", the founder's own number) out
 * of the handoff digest and the reclaim sweep. Match is ±the 55 country prefix
 * so a bare vs. E.164 stored number never slips through.
 * @param {string|null|undefined} phone
 * @returns {boolean}
 */
function isFounderNumber(phone) {
  const d = String(phone || '').replace(/\D+/g, '');
  if (!d || !FOUNDER_DIGITS) return false;
  return d === FOUNDER_DIGITS
    || (d.startsWith('55') && d.slice(2) === FOUNDER_DIGITS)
    || (FOUNDER_DIGITS.startsWith('55') && FOUNDER_DIGITS.slice(2) === d);
}

/**
 * @typedef {Object} LeadContexto
 * @property {string} name
 * @property {string|null} [owner_name]
 * @property {string|null} [sector]
 * @property {string|null} [city]
 * @property {'m'|'f'|string|null} [nome_genero]
 * @property {object|null} [conversa_fatos]
 * @property {string|null} [conversa_resumo]
 */

/**
 * Build the agent system prompt: persona + lead context + memory + objective +
 * safety rules (anti-invention, handoff, opt-out) + scheduling + owner-referral
 * + the ACTIVE STYLE PACK (Phase 10 gym) — the DB-versioned humanization layer
 * that the gym tunes without deploys.
 * Pure and deterministic (same lead + same "now" + same style → same prompt).
 *
 * @param {LeadContexto} lead
 * @param {string} [agoraDescricao] - output of descreverAgora()
 * @param {string|null} [styleBody] - style-pack text to append (null = none)
 * @returns {string}
 */
function buildSystemPrompt(lead, agoraDescricao, styleBody = null) {
  const artigo = lead.nome_genero === 'm' ? 'o' : 'a';
  const cidade = lead.city && lead.city.trim() ? lead.city.trim() : null;
  const dono = lead.owner_name && lead.owner_name.trim() ? lead.owner_name.trim() : null;

  const blocoData = agoraDescricao
    ? [
        'DATA E HORA AGORA: ' + agoraDescricao + '.',
        'Use isto pra entender referências de tempo: "hoje", "amanhã", "semana que vem",',
        'dias da semana, etc. Ao FALAR de datas, seja natural e relativa ("amanhã", "terça',
        'que vem", "dia 25) — NUNCA diga o ano nem soletre a data como um robô. Se a pessoa',
        'só puder num período ("semana que vem", "depois do dia 20"), respeite ao agendar.',
        '',
      ]
    : [];

  const blocoCases = CASES
    ? [`Já roda em ${CASES}.`, '']
    : [];

  return [
    `Você é a ${AGENT_NAME}, ${PROFILE.daCompany} (${SITE}). Você fala português do Brasil, com`,
    'tom caloroso, leve e natural, como uma pessoa de verdade no WhatsApp, não um robô.',
    'Mensagens curtas (1 a 3 frases), sem jargão, sem soar script. Use o primeiro nome',
    'da pessoa quando souber. Você não levanta o assunto de ser IA por conta própria; mas se',
    'perguntarem DIRETO ("é robô?", "é atendimento automático?"), NÃO minta: responda leve,',
    `em meia linha — "sou a ${AGENT_NAME}, assistente virtual ${PROFILE.daCompany} 🙂" — e siga a`,
    'conversa no mesmo fôlego. Ser pega negando vira "golpe" na cabeça de quem pergunta;',
    'a naturalidade vende, o disfarce não. Nunca finja ser humana quando perguntarem.',
    '',
    ...blocoData,
    'RITMO (a regra mais importante — pessoa de verdade não interroga nem despeja):',
    '- UMA mensagem por turno, curta. NÃO quebre em várias bolhas. Se precisar de duas frases,',
    '  mantenha no MESMO parágrafo — nunca separe por linha em branco só pra "parecer humano".',
    '- NO MÁXIMO UMA pergunta por turno. NUNCA faça duas perguntas seguidas, e NUNCA empilhe',
    '  pergunta + oferta/pitch na mesma resposta. Uma coisa de cada vez.',
    '- LEIA A ENERGIA: se a pessoa responde curto, seco, ou desconversa ("não é o caso", "não',
    '  temos", "sem tempo", poucas palavras) — mande UMA linha calorosa, SEM pergunta e SEM',
    '  oferta, e RECUE. Vender aqui é conversar no ritmo dela, não cutucar. Empurrar afasta.',
    '- Depois de UMA tentativa sem engajamento real, encerre com leveza e se ponha à disposição.',
    '  Não reformule a mesma oferta de outro jeito só pra continuar — isso é o que irrita.',
    '',
    ...PROFILE.oQueFaz,
    '',
    ...blocoCases,
    'CONTEXTO DESTE LEAD:',
    `- Restaurante: ${artigo} ${lead.name}` + (cidade ? ` (em ${cidade})` : ''),
    dono
      ? `- Responsável conhecido: ${dono}`
      : '- Responsável (no cadastro): ainda não temos o nome — mas quem está respondendo' +
        ' PODE ser o próprio dono/gerente; confirme pela CONVERSA, não por este campo.',
    `- Segmento: ${lead.sector || 'restaurante'}`,
    // A nota do Google é a abertura mais natural ("vi que vocês têm nota boa").
    // Sem ela no contexto o modelo INVENTAVA um número plausível — em 25/07/2026
    // as 10 últimas aberturas citaram nota falsa, e um dono de 4,9 recebeu "4,2"
    // e respondeu "acho que vou a loja errada". Ou vai o número real, ou vai a
    // instrução de não citar nota nenhuma.
    Number.isFinite(Number(lead.rating)) && Number(lead.rating) > 0
      ? `- Nota no Google: ${String(lead.rating).replace('.', ',')}`
        + (Number(lead.reviews_count) > 0 ? ` (${lead.reviews_count} avaliações)` : '')
        + ' — este é o número REAL; use exatamente ele se for elogiar.'
      : '- Nota no Google: não temos a nota deste lead — NÃO cite nota nem número de'
        + ' avaliações nesta conversa. Elogie outra coisa, ou não elogie.',
    '',
    ...formatarMemoria(lead.conversa_fatos, lead.conversa_resumo),
    ...PROFILE.objetivo,
    '',
    'QUALIFICAÇÃO — NUNCA PERGUNTE DUAS VEZES: se a pessoa já disse ou deu a entender que é',
    'dono/gerente ("sou eu", "sou o dono", "pode falar comigo", "é comigo mesmo"), considere',
    'CONFIRMADO. NÃO volte a perguntar quem é o responsável — irrita e soa robótico. Agradeça',
    'em uma linha e siga DIRETO pra mostrar valor: ofereça a PRÉVIA (criar_demo) se ainda não',
    'mandou nesta conversa; se a prévia já foi enviada/vista, siga pro PRÓXIMO PASSO (veja o',
    'bloco de próximo passo abaixo). Só pergunte de novo quem é o responsável se for mesmo',
    'ambíguo, ou se ela disser que é outra pessoa (aí peça o contato). Olhe o histórico antes.',
    '',
    'REGRAS INEGOCIÁVEIS:',
    '1. NUNCA invente preço, número, caso de cliente, integração ou qualquer dado. Se não',
    '   souber, seja honesta e use a ferramenta escalar_humano.',
    '1b. NOME DA PESSOA: nunca invente um nome. Só chame pelo nome se ela se apresentou NESTA',
    '   conversa, ou se o nome está no contexto acima. Na dúvida, fale SEM nome.',
    '1c. CASOS DE CLIENTE: só cite um restaurante cliente se ele estiver explicitamente no',
    '   texto acima. Se não houver nenhum listado, NÃO invente referências — fale do valor',
    '   da solução sem citar nomes.',
    '1d. NOTA DO GOOGLE: nunca invente a nota nem o número de avaliações. Use SÓ o número',
    '   que está no contexto acima, exatamente como está. Se o contexto disser que não',
    '   temos a nota, não fale de nota — nem "nota boa", nem "bem avaliado", nada. O dono',
    '   sabe a nota dele de cor: errar isso destrói a credibilidade na primeira frase.',
    '2. Se a pessoa se irritar, pedir pra parar, ou disser que não é o responsável e não pode',
    '   ajudar, seja educada. Pra opt-out claro, use marcar_optout.',
    '3. Se pedirem detalhes que você não pode dar com segurança (preço, contrato, integração',
    '   específica), use escalar_humano em vez de inventar.',
    '4. ESTILO: não repita informação que já mandou nesta conversa. Não insista: se a pessoa',
    '   não engajar depois de uma tentativa, encerre com leveza e se coloque à disposição.',
    '5. TAMANHO: espelhe o tamanho e a energia da mensagem da pessoa. Mensagem curta pede',
    '   resposta curta (um "Oi! Tudo sim e por aí?" basta pra small talk; uma linha basta',
    '   pra pergunta de sim/não). A maioria das respostas deve ter 1 a 3 frases curtas; só',
    '   se estenda quando a pessoa pedir de verdade uma explicação. NUNCA mande parágrafos',
    '   longos nem textão.',
    '5b. EMOJI: use com MUITA parcimônia. A maioria das mensagens não deve ter nenhum.',
    '5c. NÃO REABRA A SAUDAÇÃO: depois de já se cumprimentarem, NÃO recomece com "Oi/Olá" nem',
    '   repita "tudo bem?". Se a pessoa só retribuiu o cumprimento (ex.: "tô bem, e você?")',
    '   e JÁ trouxe outra coisa na mesma mensagem (uma pergunta, um assunto), pule a small',
    '   talk e responda DIRETO o que ela trouxe. Cumprimente uma vez só, no começo.',
    '6. MENSAGEM IRRELEVANTE/ACIDENTAL: se vier algo fora do assunto, por engano ou sem',
    '   sentido, não comente o conteúdo. Retome com UMA linha leve, ou chame ignorar.',
    '6b. MÍDIA QUE NÃO ABRIU: APENAS se a última mensagem aparecer LITERALMENTE como "[a',
    '   pessoa enviou um áudio/imagem/documento/vídeo que não consegui ouvir/ver/abrir]",',
    '   reconheça com leveza e peça pra reenviar por escrito (ex.: "recebi seu áudio, mas',
    '   não consegui ouvir aqui — consegue me mandar por escrito?"). Uma linha só; não use',
    '   ferramentas nesse caso. NUNCA invente o conteúdo.',
    '6c. MÍDIA QUE VOCÊ JÁ LEU (caso comum!): quando a mensagem vier como "[áudio] ...",',
    '   "[imagem] ..." ou "[documento] ..." COM texto depois do colchete, esse texto É o',
    '   conteúdo real da pessoa — já transcrito ou extraído pra você. Trate como se ela',
    '   tivesse digitado: responda ao conteúdo com naturalidade. NUNCA diga que "não',
    '   consegui ouvir/ver/abrir" nesse caso (isso é só a regra 6b), e não repita o rótulo',
    '   entre colchetes na sua resposta.',
    '7. Você se comunica SÓ por mensagem aqui no WhatsApp; nunca diga que ligou, que vai',
    '   ligar, ou prometa um contato que não pode fazer.',
    '7b. VÁRIAS MENSAGENS SEGUIDAS: é comum a pessoa quebrar um pensamento em várias bolhas',
    '   ("oi" / "vi sua mensagem" / "quanto custa?"). Leia TODAS como uma coisa só e responda',
    '   UMA vez, ao conjunto — nunca responda bolha por bolha nem comece a responder a',
    '   primeira sem considerar as seguintes.',
    '',
    ...PROFILE.previaMove,
    '',
    ...PROFILE.agendamento,
    '',
    'INDICAÇÃO DO RESPONSÁVEL (quando te passam o contato de OUTRA pessoa):',
    '9. Se te indicarem o responsável e vier um número — digitado no texto OU como cartão de',
    '   contato ("[Contato compartilhado: +55 ...]") — chame registrar_responsavel JÁ com',
    '   esse número (e o nome, se disserem). Esse número É a indicação que você precisava.',
    '9b. NUNCA peça o número de novo se ele já apareceu na conversa (texto ou cartão de',
    '   contato). Pedir algo que a pessoa acabou de mandar é o que mais irrita.',
    '9c. NUNCA diga "vou entrar em contato" / "vou chamar essa pessoa" ANTES de chamar',
    '   registrar_responsavel — é a ferramenta que registra e aciona o contato. Sem ela,',
    '   não prometa contato com terceiros.',
    '10. Depois que te passaram o contato, encerre com leveza (agradeça e diga que vai falar',
    '   com a pessoa indicada). NÃO volte a perguntar "você é o responsável?" pra quem acabou',
    '   de repassar outro contato — é contraditório e parece que você não leu o que mandaram.',
    '',
    `CONTATO DO FUNDADOR: o fundador ${PROFILE.daCompany} atende direto no WhatsApp ${FOUNDER_WHATSAPP}.`,
    '11. SEMPRE que a pessoa pedir pra falar com um humano/alguém da empresa, pedir telefone',
    '   ou contato, dizer que quer (ou que alguém vai) entrar em contato, OU te indicar o',
    '   dono/responsável (com ou sem número), inclua esse contato na resposta, com',
    '   naturalidade — ex.: "ok, obrigada! caso prefira falar direto com o fundador, esse é',
    `   o número dele: ${FOUNDER_WHATSAPP}". É o ÚNICO número que você pode escrever por`,
    '   conta própria; qualquer outro número, só copie exatamente como está no histórico.',
    '',
    'FERRAMENTAS: prefira responder por texto enquanto a conversa avança. Chame uma',
    'ferramenta quando a situação pedir: mostrar valor na hora (criar_demo — seu principal',
    'movimento), o PRÓXIMO PASSO do fecho (veja o bloco acima), retomar num momento combinado',
    '(agendar_retorno), registrar o responsável, escalar, opt-out, ignorar.',
    ...(styleBody && String(styleBody).trim() ? ['', String(styleBody).trim()] : []),
  ].join('\n');
}

/**
 * pt-BR placeholder for INBOUND media the agent couldn't read (audio w/o
 * transcription, image/doc/video w/o OCR). Lets it acknowledge that something
 * arrived instead of replying to old context. Anti-invention: makes explicit we
 * did NOT read the content.
 */
function placeholderMidia(tipo) {
  switch (tipo) {
    case 'audio':
    case 'voice': return '[a pessoa enviou um áudio que não consegui ouvir]';
    case 'image':
    case 'sticker': return '[a pessoa enviou uma imagem que não consegui ver]';
    case 'document': return '[a pessoa enviou um documento que não consegui abrir]';
    case 'video': return '[a pessoa enviou um vídeo que não consegui ver]';
    default: return null;
  }
}

/**
 * Convert stored conversation history (chronological) into Anthropic messages:
 * inbound → 'user', outbound → 'assistant'. Inbound media without readable text
 * becomes a placeholder so the agent reacts to the media, not stale context.
 *
 * @param {Array<{direcao:'in'|'out', corpo:string|null, tipo?:string|null}>} historico
 * @returns {Array<{role:'user'|'assistant', content:string}>}
 */
function historyToMessages(historico) {
  const msgs = [];
  for (const m of historico || []) {
    const corpo = m.corpo && String(m.corpo).trim();
    if (corpo) {
      msgs.push({ role: m.direcao === 'in' ? 'user' : 'assistant', content: corpo });
      continue;
    }
    if (m.direcao === 'in') {
      const ph = placeholderMidia(m.tipo);
      if (ph) msgs.push({ role: 'user', content: ph });
    }
  }
  return msgs;
}

// Tools in Anthropic shape ({ name, description, input_schema }). getAI() converts
// to OpenAI function shape under the hood. Phase 1 set: conversation management +
// scheduling INTENT (real calendar booking lands in Phase 4).
const PROSPECT_TOOLS = [
  {
    name: 'agendar_demo',
    description:
      'Chame quando o lead topar ter a demonstração. Passe o que ele disse sobre quando pode (ex.: "amanhã de tarde"), ou "" se não disse. NÃO invente horário: quem confirma o slot é a agenda/humano.',
    input_schema: {
      type: 'object',
      properties: {
        resumo_disponibilidade: { type: 'string', description: 'O que o lead disse sobre quando pode, ou "".' },
      },
      required: ['resumo_disponibilidade'],
    },
  },
  {
    name: 'agendar_retorno',
    description:
      'Chame quando o lead pedir pra você chamar depois ("me chama amanhã", "liga segunda", "me chama depois do almoço") OU quando VOCÊ prometer retomar num momento ("segunda eu te chamo", "te chamo amanhã"). Passe em `quando` exatamente o que foi dito sobre o momento. O sistema agenda e te lembra de cumprir na hora — promessa datada é contrato. NÃO use pra marcar a demonstração (isso é agendar_demo).',
    input_schema: {
      type: 'object',
      properties: {
        quando: { type: 'string', description: 'O que foi dito sobre quando (ex.: "amanhã de tarde", "segunda", "depois do almoço").' },
      },
      required: ['quando'],
    },
  },
  {
    name: 'criar_demo',
    description: PROFILE.previaToolDesc,
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'registrar_responsavel',
    description:
      'Chame quando te passarem o NÚMERO de WhatsApp do dono/responsável — digitado no texto OU como cartão de contato ("[Contato compartilhado: +55 ...]"). Registra o contato. Nunca invente o número.',
    input_schema: {
      type: 'object',
      properties: {
        numero: { type: 'string', description: 'Número informado, como apareceu.' },
        nome: { type: 'string', description: 'Nome do responsável, se disseram. Senão "".' },
      },
      required: ['numero'],
    },
  },
  {
    name: 'escalar_humano',
    description:
      'Chame quando não puder responder com segurança (preço, contrato, pergunta técnica específica) ou a conversa fugir do script. Um humano assume.',
    input_schema: {
      type: 'object',
      properties: { motivo: { type: 'string', description: 'Por que está escalando (curto).' } },
      required: ['motivo'],
    },
  },
  {
    name: 'marcar_optout',
    description: 'Chame quando a pessoa pedir claramente para não receber mais mensagens. Definitivo (LGPD).',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'ignorar',
    description:
      'Chame quando a última mensagem claramente não pede resposta (engano, figurinha solta, mensagem de outro assunto). Não responder é mais natural que responder.',
    input_schema: {
      type: 'object',
      properties: { motivo: { type: 'string', description: 'Por que está ignorando (curto).' } },
    },
  },
];

// Toolset EFETIVO oferecido ao modelo (product-aware). Produtos sem agendamento
// de call (Racha: PROFILE.agendaDemoTool === false) removem agendar_demo — a
// agente fica FISICAMENTE incapaz de marcar reunião, além do prompt/style pack
// já mandarem não marcar. Seatable mantém a ferramenta.
const EFFECTIVE_TOOLS = PROFILE.agendaDemoTool === false
  ? PROSPECT_TOOLS.filter((t) => t.name !== 'agendar_demo')
  : PROSPECT_TOOLS;

/**
 * @typedef {{tipo:'responder', texto:string}
 *   | {tipo:'agendar', texto:string|null, resumo:string}
 *   | {tipo:'agendar_retorno', texto:string, quando:string}
 *   | {tipo:'criar_demo', texto:string}
 *   | {tipo:'registrar_responsavel', texto:string|null, numero:string, nome:string|null}
 *   | {tipo:'handoff', texto:string|null, motivo:string}
 *   | {tipo:'optout', texto:string|null}
 *   | {tipo:'ignorar', motivo:string}
 *   | {tipo:'nada', motivo:string}} ProspectAcao
 */

/**
 * Interpret a getAI() response (Anthropic shape: content blocks + stop_reason)
 * into a structured action. A tool_use takes precedence over text; a truncated
 * text-only reply (stop_reason 'max_tokens', no tool) becomes 'nada' so a half
 * message is never sent.
 *
 * @param {{content?: Array, stop_reason?: string}} response
 * @returns {ProspectAcao}
 */
// Companion lines for tool actions when the model sent the tool without text.
// Deterministic (no extra LLM call): the action NEVER goes out silent — the
// recurring failure class the gym exposed in cycles 7-10.
const COMPANION_TEXT = {
  optout: 'entendido, não te mando mais nada — obrigada pelo tempo 🙏',
  handoff: `boa pergunta — vou confirmar direitinho com o time e te retorno 🙂 se preferir falar direto com o fundador, esse é o número dele: ${FOUNDER_WHATSAPP}`,
  porta: PROFILE.porta,
  previa: PROFILE.previaCompanion,
  registrar: (nome) => (nome
    ? `perfeito, obrigada! já chamo ${nome} então 🙂 e caso ${nome} queira falar direto com o fundador, esse é o número dele: ${FOUNDER_WHATSAPP}`
    : `perfeito, obrigada pela indicação! já entro em contato então 🙂 e caso a pessoa queira falar direto com o fundador, esse é o número dele: ${FOUNDER_WHATSAPP}`),
  agendar: (resumo) => (resumo && resumo !== 'sem detalhe'
    ? `fechado! deixa eu confirmar aqui (${resumo}) e já te mando o convite 🙂`
    : 'perfeito! qual dia e horário fica melhor pra você?'),
  retorno: (quando) => (quando && quando.trim()
    ? `fechado, te chamo ${quando.trim()} então 🙂`
    : 'fechado, te chamo depois então 🙂'),
};

// Frases prontas pra anexar o contato do fundador quando o texto do modelo
// esqueceu (a garantia determinística embaixo do prompt).
const LINHA_FUNDADOR = {
  handoff: `ah, e se preferir falar direto com o fundador, esse é o número dele: ${FOUNDER_WHATSAPP}`,
  registrar: (nome) => `ah, e caso ${nome || 'a pessoa'} queira falar direto com o fundador, esse é o número dele: ${FOUNDER_WHATSAPP}`,
};

/**
 * PURE: guarantee the founder's number rides along on a handoff/referral reply.
 * When the model wrote its own text but forgot the number, append `linha`
 * (same WhatsApp bubble — single newline, never a blank line). Empty text
 * returns null so callers fall back to COMPANION_TEXT, which already carries
 * it. Digit-normalized check, so formatting differences never duplicate it.
 */
function comContatoFundador(texto, linha) {
  const t = String(texto || '').trim();
  if (!t) return null;
  if (t.replace(/\D+/g, '').includes(FOUNDER_DIGITS)) return t;
  return `${t}\n${linha}`;
}

/**
 * PURE: phone-like digit runs (10-13 digits) present in `texto` but absent
 * from the conversation context — i.e., numbers the model may have mangled.
 */
function findForeignPhones(texto, contextoTexto) {
  // Extract phone-shaped tokens (separators allowed), then normalize to digits;
  // the context collapses to one digit stream so formatting never causes a miss.
  const matches = String(texto || '').match(/\+?\d[\d\s\-.()/]{8,18}\d/g) || [];
  const runs = [...new Set(
    matches.map((m) => m.replace(/\D+/g, '')).filter((d) => d.length >= 10 && d.length <= 13),
  )];
  const contexto = String(contextoTexto || '').replace(/\D+/g, '');
  // Same number ± the 55 country prefix is NOT foreign (the model may add or
  // drop +55 when echoing a number the lead wrote bare).
  const conhecido = (r) => contexto.includes(r)
    || (r.startsWith('55') && contexto.includes(r.slice(2)))
    || contexto.includes('55' + r);
  return runs.filter((r) => !conhecido(r));
}

/** PURE: drop bubbles (blank-line separated) that contain any listed digit run. */
function stripForeignPhoneBubbles(texto, foreign) {
  if (!foreign.length) return texto;
  const bubbles = String(texto).split(/\n{2,}/);
  const kept = bubbles.filter((b) => !foreign.some((f) => b.replace(/\D+/g, '').includes(f)));
  return kept.join('\n\n').trim();
}

function interpretResponse(response) {
  const blocks = Array.isArray(response && response.content) ? response.content : [];
  const textBlock = blocks.find((b) => b.type === 'text' && b.text && b.text.trim());
  const texto = textBlock ? textBlock.text.trim() : null;
  const toolUse = blocks.find((b) => b.type === 'tool_use');

  if (!toolUse && response && response.stop_reason === 'max_tokens') {
    return { tipo: 'nada', motivo: 'resposta truncada (max_tokens)' };
  }

  if (toolUse && toolUse.name) {
    const nome = toolUse.name;
    const args = (toolUse.input && typeof toolUse.input === 'object') ? toolUse.input : {};
    if (nome === 'marcar_optout') return { tipo: 'optout', texto: texto || COMPANION_TEXT.optout };
    if (nome === 'ignorar') return { tipo: 'ignorar', motivo: String(args.motivo || '').trim() || 'sem motivo' };
    if (nome === 'escalar_humano') return { tipo: 'handoff', texto: comContatoFundador(texto, LINHA_FUNDADOR.handoff) || COMPANION_TEXT.handoff, motivo: String(args.motivo || 'não especificado') };
    if (nome === 'registrar_responsavel') {
      const numero = String(args.numero || '').trim();
      if (!numero) return { tipo: 'handoff', texto: comContatoFundador(texto, LINHA_FUNDADOR.handoff), motivo: 'registrar_responsavel sem número' };
      const nomeDono = String(args.nome || '').trim();
      return {
        tipo: 'registrar_responsavel',
        texto: comContatoFundador(texto, LINHA_FUNDADOR.registrar(nomeDono || null))
          || COMPANION_TEXT.registrar(nomeDono || null),
        numero,
        nome: nomeDono || null,
      };
    }
    if (nome === 'agendar_demo') {
      const resumo = String(args.resumo_disponibilidade || '').trim() || 'sem detalhe';
      return { tipo: 'agendar', texto: texto || COMPANION_TEXT.agendar(resumo), resumo };
    }
    if (nome === 'criar_demo') {
      // The responder creates the demo and appends the REAL link; the model's
      // text is just the lead-in bubble (any URL it wrote is stripped there).
      return { tipo: 'criar_demo', texto: texto || COMPANION_TEXT.previa };
    }
    if (nome === 'agendar_retorno') {
      const quando = String(args.quando || '').trim();
      return { tipo: 'agendar_retorno', texto: texto || COMPANION_TEXT.retorno(quando), quando };
    }
    return { tipo: 'handoff', texto, motivo: `tool desconhecida: ${nome}` };
  }

  if (texto) return { tipo: 'responder', texto };
  return { tipo: 'nada', motivo: 'resposta vazia do LLM' };
}

/**
 * Generate the agent's next action for a conversation. Single round-trip (the
 * tool's effect is executed by the responder, not fed back to the model here —
 * the agent emits at most one tool call per turn, matching Olivia).
 *
 * Orchestrator modes (nudge/remarcar) inject an internal instruction as a final
 * user turn and disable tools — the agent writes ONE plain-text message.
 *
 * Style: the ACTIVE style pack is loaded (cached) unless the gym passes an
 * explicit `styleOverride` (a draft under A/B test; pass null for bare prompt).
 *
 * @param {{lead: LeadContexto, history: Array, nowMs: number,
 *          injectUserTurn?: string|null, noTools?: boolean,
 *          styleOverride?: string|null}} ctx
 * @returns {Promise<ProspectAcao>}
 */
async function generateReply({ lead, history, nowMs, injectUserTurn = null, noTools = false, styleOverride = undefined }) {
  const messages = historyToMessages(history);
  if (injectUserTurn) messages.push({ role: 'user', content: injectUserTurn });
  if (messages.length === 0) return { tipo: 'nada', motivo: 'sem histórico' };

  let styleBody = styleOverride;
  if (styleBody === undefined) {
    const { getActiveStylePack } = require('./prospect-store');
    styleBody = await getActiveStylePack().catch(() => null);
  }
  // Global hourly budget (cost circuit-breaker). The responder pre-gates and
  // defers BEFORE the inbound claim; hitting this here means the budget ran
  // out mid-window (race) or a non-responder caller (gym) — degrade to
  // silence, same contract as an LLM error.
  const budget = await consumeLlmCall(nowMs);
  if (!budget.allowed) {
    logger.error(`LLM budget exhausted (${budget.count}/${budget.cap} this hour) — no reply generated`);
    return { tipo: 'nada', motivo: 'orçamento de LLM esgotado nesta hora' };
  }

  const system = buildSystemPrompt(lead, descreverAgora(nowMs), styleBody);
  try {
    const response = await getAI().messages.create({
      model: AI_MODEL,
      max_tokens: 400,
      temperature: 0.6,
      system,
      messages,
      ...(noTools ? {} : { tools: EFFECTIVE_TOOLS }),
    });
    const acao = interpretResponse(response);

    // Foreign-phone guard: a phone number in the reply that never appeared in
    // the conversation is almost certainly mangled digits (seen in the gym:
    // the model altered a lead-provided number). One corrective retry; if it
    // persists, the offending bubble is stripped rather than sent wrong.
    if (acao.texto) {
      const contexto = [
        // Whitelisted: o contato do fundador é o único número que a agente pode
        // escrever sem ele existir no histórico (regra 11 do prompt) — sem isto
        // o guarda arrancaria exatamente a bolha que a regra manda enviar.
        FOUNDER_WHATSAPP,
        lead && lead.whatsapp_phone,
        ...history.map((h) => h && h.corpo),
        injectUserTurn,
      ].filter(Boolean).join(' ');
      let foreign = findForeignPhones(acao.texto, contexto);
      if (foreign.length) {
        logger.warn(`foreign phone digits in reply (${foreign.join(',')}) — corrective retry`);
        const retryBudget = await consumeLlmCall(nowMs);
        const retry = !retryBudget.allowed ? null : await getAI().messages.create({
          model: AI_MODEL,
          max_tokens: 400,
          temperature: 0.3,
          system,
          messages: [...messages, { role: 'user', content: '[INSTRUÇÃO INTERNA: sua resposta anterior citou um número de telefone que NÃO existe na conversa. Reescreva a resposta copiando números EXATAMENTE como aparecem no histórico — ou sem citar número nenhum.]' }],
          ...(noTools ? {} : { tools: EFFECTIVE_TOOLS }),
        }).catch(() => null);
        const acao2 = retry ? interpretResponse(retry) : null;
        if (acao2 && acao2.texto && findForeignPhones(acao2.texto, contexto).length === 0) {
          return acao2;
        }
        const clean = stripForeignPhoneBubbles(acao.texto, foreign);
        if (!clean) return { tipo: 'nada', motivo: 'resposta descartada (número estranho à conversa)' };
        acao.texto = clean;
      }
    }
    // Tool-argument guard: registrar_responsavel with a number that never
    // appeared in the conversation = hallucinated contact. Keep the words
    // (usually the ask for the number), drop the premature tool. O número do
    // fundador NÃO entra na whitelist aqui: registrá-lo como "responsável"
    // criaria um lead de indicação apontando pro próprio fundador.
    if (acao.tipo === 'registrar_responsavel') {
      const contextoArgs = [
        lead && lead.whatsapp_phone,
        ...history.map((h) => h && h.corpo),
        injectUserTurn,
      ].filter(Boolean).join(' ');
      if (findForeignPhones(acao.numero, contextoArgs).length) {
        logger.warn(`registrar_responsavel with foreign numero (${String(acao.numero).slice(0, 6)}…) — tool dropped, ask kept`);
        return acao.texto
          ? { tipo: 'responder', texto: acao.texto }
          : { tipo: 'nada', motivo: 'registrar com número estranho à conversa' };
      }
    }
    return acao;
  } catch (err) {
    logger.error('generateReply LLM call failed:', err.message);
    // Fail safe: a transient LLM error must NOT send a half-baked message.
    return { tipo: 'nada', motivo: `erro LLM: ${err.message}` };
  }
}

module.exports = {
  AGENT_NAME,
  COMPANY,
  FOUNDER_WHATSAPP,
  FOUNDER_DIGITS,
  isFounderNumber,
  COMPANION_TEXT,
  PROSPECT_TOOLS,
  buildSystemPrompt,
  placeholderMidia,
  historyToMessages,
  interpretResponse,
  comContatoFundador,
  findForeignPhones,
  stripForeignPhoneBubbles,
  generateReply,
};

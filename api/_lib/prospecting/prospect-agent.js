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

const logger = createSecureLogger('ProspectAgent');

// Persona is configurable so the same code can run a differently-branded agent.
const AGENT_NAME = process.env.PROSPECTING_AGENT_NAME || 'Olímpia';
const COMPANY = 'Seatable';
const SITE = 'seatable.one';
// Social proof (real customer names ONLY). Empty by default — Seatable is early,
// and the #1 anti-invention rule is "never invent a customer case". When you have
// real references, set PROSPECTING_CASES="Restaurante X, Bar Y".
const CASES = (process.env.PROSPECTING_CASES || '').trim();

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
 * safety rules (anti-invention, handoff, opt-out) + scheduling + owner-referral.
 * Pure and deterministic (same lead + same "now" → same prompt) for testability.
 *
 * @param {LeadContexto} lead
 * @param {string} [agoraDescricao] - output of descreverAgora()
 * @returns {string}
 */
function buildSystemPrompt(lead, agoraDescricao) {
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
    `Você é a ${AGENT_NAME}, da ${COMPANY} (${SITE}). Você fala português do Brasil, com`,
    'tom caloroso, leve e natural, como uma pessoa de verdade no WhatsApp, não um robô.',
    'Mensagens curtas (1 a 3 frases), sem jargão, sem soar script. Use o primeiro nome',
    'da pessoa quando souber. NUNCA admita nem confirme que é uma IA/robô/bot — mesmo',
    'se perguntarem direto. Desconverse com leveza e siga a conversa, ex.: "Haha, sou a',
    `${AGENT_NAME}, da ${COMPANY}! Cuido do primeiro contato com vocês por aqui. E aí, ...".`,
    '',
    ...blocoData,
    `O QUE A ${COMPANY.toUpperCase()} FAZ: ajuda restaurantes a lotar mais mesas e parar de`,
    'perder reserva — atendimento por IA no WhatsApp (que parece humano de verdade), um',
    'agente de voz que atende o telefone do restaurante, e um painel pro salão gerenciar',
    'reservas, mesas e fila de espera em tempo real.',
    '',
    ...blocoCases,
    'CONTEXTO DESTE LEAD:',
    `- Restaurante: ${artigo} ${lead.name}` + (cidade ? ` (em ${cidade})` : ''),
    dono
      ? `- Responsável conhecido: ${dono}`
      : '- Responsável (no cadastro): ainda não temos o nome — mas quem está respondendo' +
        ' PODE ser o próprio dono/gerente; confirme pela CONVERSA, não por este campo.',
    `- Segmento: ${lead.sector || 'restaurante'}`,
    '',
    ...formatarMemoria(lead.conversa_fatos, lead.conversa_resumo),
    'SEU OBJETIVO ÚNICO: descobrir se quem responde é o dono/gerente e, com leveza, agendar',
    'uma demonstração rápida (30 min, online) pra mostrar a solução. Cada mensagem sua deve',
    'aproximar disso: qualificar e marcar a demo.',
    '',
    'QUALIFICAÇÃO — NUNCA PERGUNTE DUAS VEZES: se a pessoa já disse ou deu a entender que é',
    'dono/gerente ("sou eu", "sou o dono", "pode falar comigo", "é comigo mesmo"), considere',
    'CONFIRMADO. NÃO volte a perguntar quem é o responsável — irrita e soa robótico. Agradeça',
    'em uma linha e siga DIRETO pra combinar a demo (pergunte o melhor dia/horário). Só',
    'pergunte de novo se for mesmo ambíguo, ou se ela disser que é outra pessoa (aí peça o',
    'contato do responsável). Olhe o histórico antes de perguntar.',
    '',
    'REGRAS INEGOCIÁVEIS:',
    '1. NUNCA invente preço, número, caso de cliente, integração ou qualquer dado. Se não',
    '   souber, seja honesta e use a ferramenta escalar_humano.',
    '1b. NOME DA PESSOA: nunca invente um nome. Só chame pelo nome se ela se apresentou NESTA',
    '   conversa, ou se o nome está no contexto acima. Na dúvida, fale SEM nome.',
    '1c. CASOS DE CLIENTE: só cite um restaurante cliente se ele estiver explicitamente no',
    '   texto acima. Se não houver nenhum listado, NÃO invente referências — fale do valor',
    '   da solução sem citar nomes.',
    '2. Se a pessoa se irritar, pedir pra parar, ou disser que não é o responsável e não pode',
    '   ajudar, seja educada. Pra opt-out claro, use marcar_optout.',
    '3. Se pedirem detalhes que você não pode dar com segurança (preço, contrato, integração',
    '   específica), use escalar_humano em vez de inventar.',
    '4. ESTILO: não repita informação que já mandou nesta conversa. Não insista: se a pessoa',
    '   não engajar depois de uma tentativa, encerre com leveza e se coloque à disposição.',
    '5. TAMANHO: espelhe o tamanho e a energia da mensagem da pessoa. A maioria das respostas',
    '   deve ter 1 a 3 frases curtas. NUNCA mande parágrafos longos nem textão.',
    '5b. EMOJI: use com MUITA parcimônia. A maioria das mensagens não deve ter nenhum.',
    '5c. NÃO REABRA A SAUDAÇÃO: depois de já se cumprimentarem, NÃO recomece com "Oi/Olá" nem',
    '   repita "tudo bem?". Cumprimente uma vez só, no começo da conversa.',
    '6. MENSAGEM IRRELEVANTE/ACIDENTAL: se vier algo fora do assunto, por engano ou sem',
    '   sentido, não comente o conteúdo. Retome com UMA linha leve, ou chame ignorar.',
    '6b. MÍDIA QUE NÃO ABRIU: APENAS se a última mensagem aparecer LITERALMENTE como "[a',
    '   pessoa enviou um áudio/imagem/documento/vídeo que não consegui ouvir/ver/abrir]",',
    '   reconheça com leveza e peça pra reenviar por escrito. NUNCA invente o conteúdo.',
    '7. Você se comunica SÓ por mensagem aqui no WhatsApp; nunca diga que ligou, que vai',
    '   ligar, ou prometa um contato que não pode fazer.',
    '7b. VÁRIAS MENSAGENS SEGUIDAS: leia TODAS como uma coisa só e responda UMA vez ao',
    '   conjunto — nunca responda bolha por bolha.',
    '',
    'AGENDAMENTO (objetivo final):',
    '8. Quando o lead topar a demo, NÃO proponha horários você mesma e NÃO invente',
    '   disponibilidade. Pergunte qual dia e horário fica melhor PRA ELE (pergunta aberta)',
    '   e chame agendar_demo com o que ele disser sobre quando pode. Um humano (ou a agenda)',
    '   confirma o horário — você nunca diz que a demo está marcada sem essa confirmação.',
    '',
    'INDICAÇÃO DO RESPONSÁVEL (quando te passam o contato de OUTRA pessoa):',
    '9. Se te indicarem o responsável e vier um número — digitado no texto OU como cartão de',
    '   contato ("[Contato compartilhado: +55 ...]") — chame registrar_responsavel JÁ com',
    '   esse número (e o nome, se disserem). NUNCA peça o número de novo se ele já apareceu.',
    '10. Depois que te passaram o contato, encerre com leveza (agradeça e diga que vai falar',
    '   com a pessoa indicada). NÃO volte a perguntar "você é o responsável?" pra quem acabou',
    '   de repassar outro contato.',
    '',
    'FERRAMENTAS: prefira responder por texto enquanto a conversa avança. Chame uma',
    'ferramenta só quando a situação pedir (agendar, registrar o responsável, escalar,',
    'opt-out, ignorar).',
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

/**
 * @typedef {{tipo:'responder', texto:string}
 *   | {tipo:'agendar', texto:string|null, resumo:string}
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
    if (nome === 'marcar_optout') return { tipo: 'optout', texto };
    if (nome === 'ignorar') return { tipo: 'ignorar', motivo: String(args.motivo || '').trim() || 'sem motivo' };
    if (nome === 'escalar_humano') return { tipo: 'handoff', texto, motivo: String(args.motivo || 'não especificado') };
    if (nome === 'registrar_responsavel') {
      const numero = String(args.numero || '').trim();
      if (!numero) return { tipo: 'handoff', texto, motivo: 'registrar_responsavel sem número' };
      const nomeDono = String(args.nome || '').trim();
      return { tipo: 'registrar_responsavel', texto, numero, nome: nomeDono || null };
    }
    if (nome === 'agendar_demo') {
      return { tipo: 'agendar', texto, resumo: String(args.resumo_disponibilidade || '').trim() || 'sem detalhe' };
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
 * @param {{lead: LeadContexto, history: Array, nowMs: number}} ctx
 * @returns {Promise<ProspectAcao>}
 */
async function generateReply({ lead, history, nowMs }) {
  const messages = historyToMessages(history);
  if (messages.length === 0) return { tipo: 'nada', motivo: 'sem histórico' };

  const system = buildSystemPrompt(lead, descreverAgora(nowMs));
  try {
    const response = await getAI().messages.create({
      model: AI_MODEL,
      max_tokens: 400,
      temperature: 0.6,
      system,
      messages,
      tools: PROSPECT_TOOLS,
    });
    return interpretResponse(response);
  } catch (err) {
    logger.error('generateReply LLM call failed:', err.message);
    // Fail safe: a transient LLM error must NOT send a half-baked message.
    return { tipo: 'nada', motivo: `erro LLM: ${err.message}` };
  }
}

module.exports = {
  AGENT_NAME,
  COMPANY,
  PROSPECT_TOOLS,
  buildSystemPrompt,
  placeholderMidia,
  historyToMessages,
  interpretResponse,
  generateReply,
};

/**
 * Transbordo humano no canal de hóspede.
 *
 * Origem: spike `whatsapp-transbordo-humano` (docs/intel/BACKLOG.md). Hoje, o
 * que a IA não sabe resolver termina numa esquiva — o system prompt manda dizer
 * "Posso verificar isso e te respondo" (conversation.js:244) e ninguém verifica
 * nada. Este módulo transforma essa esquiva em uma passagem de bastão: a IA
 * cala, o host é avisado, e a conversa volta a ser de gente.
 *
 * TRÊS PROPRIEDADES QUE IMPORTAM MAIS QUE O RECURSO EM SI:
 *
 * 1. A pausa expira (HANDOFF_TTL_MS). Pausa sem prazo é pior que a esquiva: se
 *    o host estiver servindo mesa e não vir a notificação, o cliente fala
 *    sozinho para sempre. Vencido o prazo, a IA retoma.
 *
 * 2. Falha ao avisar o host CANCELA a pausa. Silenciar a IA sem que ninguém
 *    saiba que precisa responder é o pior estado possível — pior que não ter
 *    transbordo. Se a notificação não sai, a pausa é desfeita e a IA segue.
 *
 * 3. Nasce desligado por restaurante (`whatsapp_handoff_enabled`, default
 *    false). O critério de parada do spike é "qualquer falso-positivo, pare",
 *    e falso-positivo só se mede contra conversa real. Enquanto ninguém
 *    calibrar, ninguém recebe.
 */

const { createSecureLogger } = require('../../_lib/secure-logger');

const logger = createSecureLogger('WhatsAppHandoff');

/** Quanto tempo a IA fica calada esperando o humano. */
const HANDOFF_TTL_MS = 30 * 60 * 1000;

/**
 * A tool. A descrição é o gatilho de verdade — é ela que o modelo lê para
 * decidir — então ela diz tanto quando chamar quanto quando NÃO chamar. A
 * metade negativa existe porque o custo assimétrico é o ponto: deixar de
 * escalar devolve a esquiva de hoje, escalar demais põe um humano no meio de
 * conversa que a IA resolvia sozinha.
 */
const HANDOFF_TOOL = {
  type: 'function',
  function: {
    name: 'handoff_to_human',
    description: [
      'Passa a conversa para um humano da equipe do restaurante e para de responder.',
      'CHAME quando o cliente pedir falar com uma pessoa, reclamar de algo que aconteceu na visita,',
      'pedir exceção que você não pode conceder (alergia grave, evento privado, pedido especial de cozinha),',
      'ou quando você fosse responder que vai "verificar e responder depois" — essa frase sem transbordo é uma promessa que ninguém cumpre.',
      'NÃO CHAME para pergunta que você consegue responder com as tools de reserva, cardápio ou horário,',
      'nem por cortesia, nem quando o cliente apenas demonstra indecisão. Escalar demais coloca um humano no meio de conversa que você resolvia sozinho.',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description: 'O que você não consegue resolver, em uma frase, na língua do cliente. Vai para o host e serve de material de calibração.',
        },
      },
      required: ['reason'],
    },
  },
};

/** O recurso está ligado para este restaurante? Ausência de dado = não. */
function isHandoffEnabled(session) {
  return session?.restaurant?.whatsapp_handoff_enabled === true;
}

/**
 * A sessão está pausada AGORA?
 *
 * Compara com o relógio a cada leitura em vez de confiar num booleano gravado:
 * assim a retomada não depende de nenhum cron existir. Se o processo que
 * deveria despausar nunca rodar, a pausa expira sozinha na próxima mensagem.
 */
function isPaused(session, agora = Date.now()) {
  const t = session?.handoff_paused_until;
  if (!t) return false;
  const ms = new Date(t).getTime();
  return Number.isFinite(ms) && ms > agora;
}

/**
 * Grava a pausa. Devolve o patch aplicado, para o chamador atualizar a sessão
 * em memória sem reler o banco.
 */
async function pausar(supabase, sessionId, reason, agora = Date.now()) {
  const patch = {
    handoff_paused_until: new Date(agora + HANDOFF_TTL_MS).toISOString(),
    handoff_reason: reason || null,
    handoff_requested_at: new Date(agora).toISOString(),
  };
  const { error } = await supabase.from('whatsapp_sessions').update(patch).eq('id', sessionId);
  if (error) throw new Error(`falha ao pausar sessão: ${error.message}`);
  return patch;
}

/** Desfaz a pausa. Usado no cancelamento (propriedade 2) e na retomada manual. */
async function despausar(supabase, sessionId) {
  const patch = { handoff_paused_until: null, handoff_reason: null };
  const { error } = await supabase.from('whatsapp_sessions').update(patch).eq('id', sessionId);
  if (error) throw new Error(`falha ao despausar sessão: ${error.message}`);
  return patch;
}

/** O texto que o cliente vê. Sem promessa de prazo que ninguém garante. */
function mensagemAoCliente(language) {
  switch (language) {
    case 'pt': return 'Vou chamar alguém da equipe para te ajudar com isso. Um instante.';
    case 'es': return 'Voy a pedir que alguien del equipo te ayude con esto. Un momento.';
    default:   return 'Let me get someone from the team to help you with this. One moment.';
  }
}

function mensagemAoHost({ restaurantName, customerPhone, reason }) {
  return [
    `🔔 Um cliente pediu atendimento humano no WhatsApp de ${restaurantName}.`,
    '',
    `Cliente: ${customerPhone}`,
    `Motivo: ${reason || '(não informado)'}`,
    '',
    `A IA está em silêncio nessa conversa por ${HANDOFF_TTL_MS / 60000} minutos. Responda direto ao cliente.`,
  ].join('\n');
}

module.exports = {
  HANDOFF_TOOL,
  HANDOFF_TTL_MS,
  isHandoffEnabled,
  isPaused,
  pausar,
  despausar,
  mensagemAoCliente,
  mensagemAoHost,
  logger,
};

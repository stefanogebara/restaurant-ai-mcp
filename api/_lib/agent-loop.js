'use strict';

/**
 * Loop de agente com teto — o primitivo que não existia neste repo.
 *
 * `manager-agent` e `prospect-agent` fazem UM round-trip de tool: pegam o
 * PRIMEIRO bloco `tool_use`, executam, mandam o resultado de volta e param.
 * Se o modelo quiser uma segunda ferramenta, ela é ignorada. Pior: se ele
 * chamar uma tool que o `if` não prevê, o código cai num
 * `content.find(b => b.type === 'text')` de uma resposta cujo `stop_reason` é
 * `tool_use` — que pode não ter bloco de texto nenhum — e LANÇA.
 *
 * Para o onboarding em conversa isso não serve: "raspa o site → extrai o
 * cardápio → confirma os horários → grava" é uma cadeia, não um round-trip.
 *
 * Três coisas que este loop faz e o one-shot erra:
 *
 *  1. **Todos os blocos `tool_use`, não o primeiro.** A API exige que o turno
 *     seguinte traga um `tool_result` para CADA `tool_use` da resposta. Mandar
 *     um só é HTTP 400, e o modelo pode pedir várias de uma vez.
 *  2. **Erro de tool é dado, não exceção.** Tool desconhecida ou handler que
 *     lança viram `tool_result` com `is_error`, e a conversa continua — o
 *     modelo se recupera ou explica. Derrubar o turno inteiro porque uma
 *     ferramenta falhou é perder o trabalho das anteriores.
 *  3. **Dois tetos, não um.** Iterações contra loop infinito, e RELÓGIO
 *     contra a lambda. O repo já perdeu essa briga uma vez:
 *     `restaurant-learning/research.js` encadeava ~96s e morria com
 *     FUNCTION_INVOCATION_FAILED. Um teto de iterações não protege contra
 *     isso — 3 chamadas lentas estouram tanto quanto 8 rápidas.
 *
 * Sobre `onPhase`: o contrato de honestidade dos cards de fase do Manager AI é
 * *"nunca inventa etapas: cada emissão corresponde a trabalho que aconteceu"*.
 * Aqui isso é estrutural — `onPhase` só é chamado em volta da execução de uma
 * tool, com o resultado real. Nada é emitido por antecipação.
 */

const { createSecureLogger } = require('./secure-logger');

const logger = createSecureLogger('AgentLoop');

const MAX_ITERACOES_PADRAO = 6;

/**
 * @param {object}   opts
 * @param {Function} opts.createMessage  async ({ messages, forceText }) => resposta
 *   estilo Anthropic. O chamador amarra modelo, system e tools. Quando
 *   `forceText` é true deve chamar SEM tools — é a última volta, e o modelo
 *   precisa produzir texto em vez de pedir mais uma ferramenta.
 * @param {Array}    opts.messages       histórico inicial (não é mutado).
 * @param {object}   opts.handlers       { nomeDaTool: async (input, ctx) => any }
 * @param {number}  [opts.maxIterations] teto de voltas (padrão 6).
 * @param {number}  [opts.deadlineMs]    instante absoluto (epoch ms) em que o
 *   loop para de iniciar chamadas novas. Sem isto, só o teto de iterações
 *   protege — e ele não protege contra lentidão.
 * @param {Function}[opts.onPhase]       ({ tipo, tool, ok, erro }) => void
 * @param {object}  [opts.ctx]           repassado a cada handler.
 * @param {Function}[opts.now]           injetável para teste.
 *
 * @returns {Promise<{text: string, messages: Array, iterations: number,
 *   stopReason: 'completed'|'max_iterations'|'deadline', toolCalls: Array}>}
 */
async function runAgentLoop({
  createMessage,
  messages,
  handlers = {},
  maxIterations = MAX_ITERACOES_PADRAO,
  deadlineMs,
  onPhase,
  ctx,
  now = () => Date.now(),
}) {
  if (typeof createMessage !== 'function') {
    throw new Error('runAgentLoop: createMessage é obrigatório');
  }
  if (!Array.isArray(messages)) {
    throw new Error('runAgentLoop: messages deve ser um array');
  }

  const historico = [...messages];
  const toolCalls = [];
  let iterations = 0;
  let stopReason = 'completed';
  let ultimoTexto = '';

  const emitir = (evento) => {
    if (typeof onPhase !== 'function') return;
    try {
      onPhase(evento);
    } catch (err) {
      // Um consumidor de fase quebrado não pode derrubar o turno: a fase é
      // narração, o trabalho é o que importa.
      logger.warn(`onPhase lançou (ignorado): ${err.message}`);
    }
  };

  const estourouORelogio = () => typeof deadlineMs === 'number' && now() >= deadlineMs;

  while (iterations < maxIterations) {
    if (estourouORelogio()) {
      stopReason = 'deadline';
      break;
    }

    // Última volta permitida: pede texto. Sem isto o loop pode terminar com o
    // modelo no meio de uma cadeia de tools e devolver string vazia — o
    // usuário veria a conversa simplesmente parar.
    const ultimaVolta = iterations === maxIterations - 1;
    const resposta = await createMessage({ messages: historico, forceText: ultimaVolta });
    iterations++;

    const blocos = Array.isArray(resposta?.content) ? resposta.content : [];
    const texto = blocos.filter((b) => b?.type === 'text').map((b) => b.text).join('').trim();
    if (texto) ultimoTexto = texto;

    const pedidos = blocos.filter((b) => b?.type === 'tool_use');
    if (pedidos.length === 0) {
      stopReason = 'completed';
      break;
    }

    if (ultimaVolta) {
      // Pediu tool mesmo sem tools na mão. Não há volta seguinte para
      // executá-la — parar aqui é mais honesto que fingir que houve resposta.
      stopReason = 'max_iterations';
      break;
    }

    historico.push({ role: 'assistant', content: resposta.content });

    // TODOS os pedidos, na ordem. A API rejeita o turno seguinte se faltar um
    // tool_result para qualquer tool_use desta resposta.
    const resultados = [];
    for (const pedido of pedidos) {
      const nome = pedido.name;
      let conteudo;
      let houveErro = false;

      const handler = handlers[nome];
      if (typeof handler !== 'function') {
        houveErro = true;
        conteudo = `Ferramenta desconhecida: ${nome}`;
        logger.warn(`Modelo pediu tool inexistente: ${nome}`);
      } else {
        emitir({ tipo: 'tool_inicio', tool: nome });
        try {
          const saida = await handler(pedido.input || {}, ctx);
          conteudo = typeof saida === 'string' ? saida : JSON.stringify(saida ?? null);
        } catch (err) {
          houveErro = true;
          conteudo = `Falhou: ${err.message}`;
          logger.warn(`Tool ${nome} lançou: ${err.message}`);
        }
        emitir({ tipo: 'tool_fim', tool: nome, ok: !houveErro, erro: houveErro ? conteudo : undefined });
      }

      toolCalls.push({ tool: nome, input: pedido.input || {}, ok: !houveErro });
      resultados.push({
        type: 'tool_result',
        tool_use_id: pedido.id,
        content: conteudo,
        ...(houveErro ? { is_error: true } : {}),
      });
    }

    historico.push({ role: 'user', content: resultados });
  }

  if (iterations >= maxIterations && stopReason === 'completed') {
    stopReason = 'max_iterations';
  }

  return { text: ultimoTexto, messages: historico, iterations, stopReason, toolCalls };
}

module.exports = { runAgentLoop, MAX_ITERACOES_PADRAO };

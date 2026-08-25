'use strict';

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
}));

const { runAgentLoop } = require('../_lib/agent-loop');

// Atalhos para montar respostas no formato Anthropic.
const texto = (t) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: t }] });
const usaTool = (nome, input = {}, id = 'tu-1') => ({
  stop_reason: 'tool_use',
  content: [{ type: 'tool_use', id, name: nome, input }],
});

/** createMessage que devolve as respostas na ordem e registra o que recebeu. */
function roteiro(...respostas) {
  const chamadas = [];
  const fn = async ({ messages, forceText }) => {
    chamadas.push({ messages: JSON.parse(JSON.stringify(messages)), forceText });
    return respostas[chamadas.length - 1] ?? texto('fim');
  };
  fn.chamadas = chamadas;
  return fn;
}

const INICIO = [{ role: 'user', content: 'oi' }];

describe('runAgentLoop', () => {
  test('sem tool nenhuma: uma volta e devolve o texto', async () => {
    const r = await runAgentLoop({ createMessage: roteiro(texto('pronto')), messages: INICIO });
    expect(r.text).toBe('pronto');
    expect(r.iterations).toBe(1);
    expect(r.stopReason).toBe('completed');
  });

  test('encadeia: tool → resultado → texto, com o resultado no histórico', async () => {
    const handler = jest.fn().mockResolvedValue({ itens: 23 });
    const cm = roteiro(usaTool('raspar_site', { url: 'x.com' }), texto('achei 23 itens'));

    const r = await runAgentLoop({ createMessage: cm, messages: INICIO, handlers: { raspar_site: handler } });

    expect(handler).toHaveBeenCalledWith({ url: 'x.com' }, undefined);
    expect(r.text).toBe('achei 23 itens');
    expect(r.iterations).toBe(2);

    // A segunda chamada precisa enxergar o resultado da tool.
    const segunda = cm.chamadas[1].messages;
    const ultimo = segunda[segunda.length - 1];
    expect(ultimo.role).toBe('user');
    expect(ultimo.content[0]).toMatchObject({ type: 'tool_result', tool_use_id: 'tu-1' });
    expect(ultimo.content[0].content).toContain('23');
  });

  // A API rejeita (400) o turno seguinte se faltar um tool_result para
  // QUALQUER tool_use da resposta. O one-shot do manager-agent pega só
  // `content.find(b => b.type === 'tool_use')` — o primeiro — e por isso não
  // suporta o modelo pedindo duas ferramentas de uma vez.
  test('executa TODOS os blocos tool_use, não só o primeiro', async () => {
    const a = jest.fn().mockResolvedValue('A');
    const b = jest.fn().mockResolvedValue('B');
    const cm = roteiro(
      { stop_reason: 'tool_use', content: [
        { type: 'tool_use', id: 'tu-a', name: 'tool_a', input: {} },
        { type: 'tool_use', id: 'tu-b', name: 'tool_b', input: {} },
      ] },
      texto('juntei as duas')
    );

    const r = await runAgentLoop({ createMessage: cm, messages: INICIO, handlers: { tool_a: a, tool_b: b } });

    expect(a).toHaveBeenCalled();
    expect(b).toHaveBeenCalled();
    const resultados = cm.chamadas[1].messages.at(-1).content;
    expect(resultados.map((x) => x.tool_use_id)).toEqual(['tu-a', 'tu-b']);
    expect(r.text).toBe('juntei as duas');
  });

  test('tool desconhecida vira tool_result de erro — não derruba o turno', async () => {
    const cm = roteiro(usaTool('nao_existe'), texto('desculpa, não consigo isso'));

    const r = await runAgentLoop({ createMessage: cm, messages: INICIO, handlers: {} });

    const resultado = cm.chamadas[1].messages.at(-1).content[0];
    expect(resultado.is_error).toBe(true);
    expect(resultado.content).toMatch(/desconhecida/i);
    expect(r.text).toBe('desculpa, não consigo isso');
    expect(r.stopReason).toBe('completed');
  });

  test('handler que lança vira tool_result de erro — a conversa continua', async () => {
    const cm = roteiro(usaTool('raspar_site'), texto('o site está fora do ar'));
    const handler = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const r = await runAgentLoop({ createMessage: cm, messages: INICIO, handlers: { raspar_site: handler } });

    const resultado = cm.chamadas[1].messages.at(-1).content[0];
    expect(resultado.is_error).toBe(true);
    expect(resultado.content).toContain('ECONNREFUSED');
    expect(r.text).toBe('o site está fora do ar');
    expect(r.toolCalls[0].ok).toBe(false);
  });

  test('teto de iterações: para e avisa em vez de girar para sempre', async () => {
    const cm = roteiro(...Array.from({ length: 10 }, (_, i) => usaTool('loop', {}, `tu-${i}`)));

    const r = await runAgentLoop({
      createMessage: cm, messages: INICIO,
      handlers: { loop: async () => 'de novo' },
      maxIterations: 3,
    });

    expect(r.iterations).toBe(3);
    expect(r.stopReason).toBe('max_iterations');
  });

  test('a última volta pede texto (forceText) — senão o turno termina mudo', async () => {
    const cm = roteiro(usaTool('t'), usaTool('t', {}, 'tu-2'), texto('resumindo'));

    const r = await runAgentLoop({
      createMessage: cm, messages: INICIO,
      handlers: { t: async () => 'ok' },
      maxIterations: 3,
    });

    expect(cm.chamadas.map((c) => c.forceText)).toEqual([false, false, true]);
    expect(r.text).toBe('resumindo');
  });

  // Um teto de iterações NÃO protege contra lentidão: 3 chamadas de 30s
  // estouram a lambda tanto quanto 8 rápidas. O repo já perdeu essa briga em
  // restaurant-learning/research.js (~96s, FUNCTION_INVOCATION_FAILED).
  test('teto de RELÓGIO: não inicia chamada nova depois do prazo', async () => {
    let agora = 1000;
    const cm = roteiro(usaTool('lenta'), texto('nunca chega aqui'));

    const r = await runAgentLoop({
      createMessage: cm, messages: INICIO,
      handlers: { lenta: async () => { agora += 50_000; return 'demorou'; } },
      deadlineMs: 30_000,
      now: () => agora,
    });

    expect(cm.chamadas).toHaveLength(1);
    expect(r.stopReason).toBe('deadline');
  });

  test('prazo já vencido antes de começar: não chama o modelo', async () => {
    const cm = roteiro(texto('não deveria rodar'));
    const r = await runAgentLoop({
      createMessage: cm, messages: INICIO, deadlineMs: 500, now: () => 1000,
    });
    expect(cm.chamadas).toHaveLength(0);
    expect(r.iterations).toBe(0);
    expect(r.stopReason).toBe('deadline');
  });

  // O contrato dos cards de fase do Manager AI: "nunca inventa etapas; cada
  // emissão corresponde a trabalho que aconteceu".
  test('onPhase só emite em volta de trabalho REAL', async () => {
    const fases = [];
    const cm = roteiro(usaTool('raspar_site'), texto('fim'));

    await runAgentLoop({
      createMessage: cm, messages: INICIO,
      handlers: { raspar_site: async () => 'ok' },
      onPhase: (e) => fases.push(e),
    });

    expect(fases).toEqual([
      { tipo: 'tool_inicio', tool: 'raspar_site' },
      { tipo: 'tool_fim', tool: 'raspar_site', ok: true, erro: undefined },
    ]);
  });

  test('nenhuma fase é emitida para tool que nem existe', async () => {
    const fases = [];
    const cm = roteiro(usaTool('fantasma'), texto('fim'));
    await runAgentLoop({ createMessage: cm, messages: INICIO, handlers: {}, onPhase: (e) => fases.push(e) });
    expect(fases).toEqual([]);
  });

  test('onPhase que lança não derruba o turno — fase é narração, não trabalho', async () => {
    const cm = roteiro(usaTool('t'), texto('sobrevivi'));
    const r = await runAgentLoop({
      createMessage: cm, messages: INICIO,
      handlers: { t: async () => 'ok' },
      onPhase: () => { throw new Error('consumidor quebrado'); },
    });
    expect(r.text).toBe('sobrevivi');
  });

  test('não muta o array de mensagens do chamador', async () => {
    const original = [{ role: 'user', content: 'oi' }];
    await runAgentLoop({
      createMessage: roteiro(usaTool('t'), texto('fim')),
      messages: original,
      handlers: { t: async () => 'ok' },
    });
    expect(original).toHaveLength(1);
  });

  test('ctx chega em cada handler', async () => {
    const handler = jest.fn().mockResolvedValue('ok');
    await runAgentLoop({
      createMessage: roteiro(usaTool('t'), texto('fim')),
      messages: INICIO, handlers: { t: handler }, ctx: { restaurantId: 'r-1' },
    });
    expect(handler).toHaveBeenCalledWith({}, { restaurantId: 'r-1' });
  });

  test('createMessage ausente falha alto, não silenciosamente', async () => {
    await expect(runAgentLoop({ messages: INICIO })).rejects.toThrow(/createMessage/);
  });
});

'use strict';

/**
 * Transbordo humano no canal de hóspede — spike `whatsapp-transbordo-humano`.
 *
 * O que estes testes protegem não é "o recurso funciona", e sim as três
 * propriedades que decidem se ele é melhor ou pior que a esquiva de hoje
 * ("Posso verificar isso e te respondo", conversation.js:244):
 *
 *   1. a pausa EXPIRA — pausa sem prazo deixa o cliente falando sozinho;
 *   2. falha ao avisar o host DESFAZ a pausa — IA calada com host que não sabe
 *      de nada é o pior estado possível;
 *   3. nasce DESLIGADO — o critério de parada do spike é "qualquer
 *      falso-positivo, pare", e falso-positivo só se mede em conversa real.
 */

const {
  HANDOFF_TOOL,
  HANDOFF_TTL_MS,
  isHandoffEnabled,
  isPaused,
  pausar,
  despausar,
  mensagemAoCliente,
  mensagemAoHost,
} = require('../_services/whatsapp/handoff');

/** Supabase mínimo: registra os updates e deixa injetar erro. */
function fakeSupabase({ erro = null } = {}) {
  const updates = [];
  return {
    updates,
    from: () => ({
      update: (patch) => ({
        eq: async (_col, id) => {
          updates.push({ patch, id });
          return { error: erro };
        },
      }),
    }),
  };
}

describe('propriedade 1 — a pausa expira sozinha', () => {
  it('isPaused é falso quando o prazo já passou', () => {
    const agora = Date.now();
    const s = { handoff_paused_until: new Date(agora - 1000).toISOString() };
    expect(isPaused(s, agora)).toBe(false);
  });

  it('isPaused é verdadeiro dentro do prazo', () => {
    const agora = Date.now();
    const s = { handoff_paused_until: new Date(agora + 60_000).toISOString() };
    expect(isPaused(s, agora)).toBe(true);
  });

  it('a pausa dura exatamente HANDOFF_TTL_MS a partir de agora', async () => {
    const db = fakeSupabase();
    const agora = Date.UTC(2026, 8, 1, 12, 0, 0);
    const patch = await pausar(db, 'sess-1', 'cliente quer falar com o gerente', agora);
    expect(Date.parse(patch.handoff_paused_until) - agora).toBe(HANDOFF_TTL_MS);
  });

  /**
   * A retomada NÃO pode depender de cron. isPaused compara com o relógio a cada
   * leitura, então uma sessão pausada e esquecida volta a ser atendida pela IA
   * sem que nada precise rodar.
   */
  it('uma sessão pausada e esquecida se auto-retoma, sem cron nenhum', () => {
    const t0 = Date.now();
    const s = { handoff_paused_until: new Date(t0 + HANDOFF_TTL_MS).toISOString() };
    expect(isPaused(s, t0)).toBe(true);
    expect(isPaused(s, t0 + HANDOFF_TTL_MS + 1)).toBe(false);
  });

  it('sessão sem campo de pausa nunca está pausada', () => {
    expect(isPaused({})).toBe(false);
    expect(isPaused(null)).toBe(false);
    expect(isPaused({ handoff_paused_until: 'não é data' })).toBe(false);
  });
});

describe('propriedade 2 — desfazer a pausa é possível e limpa o motivo', () => {
  it('despausar zera prazo e motivo', async () => {
    const db = fakeSupabase();
    const patch = await despausar(db, 'sess-1');
    expect(patch).toEqual({ handoff_paused_until: null, handoff_reason: null });
    expect(db.updates).toHaveLength(1);
  });

  it('pausar propaga o erro do banco em vez de fingir que pausou', async () => {
    const db = fakeSupabase({ erro: { message: 'conexão caiu' } });
    await expect(pausar(db, 'sess-1', 'motivo')).rejects.toThrow(/conexão caiu/);
  });
});

describe('propriedade 3 — nasce desligado', () => {
  it('ausência do flag conta como desligado', () => {
    expect(isHandoffEnabled({ restaurant: {} })).toBe(false);
    expect(isHandoffEnabled({})).toBe(false);
    expect(isHandoffEnabled(null)).toBe(false);
  });

  it('só o booleano true liga — string "true" não conta', () => {
    expect(isHandoffEnabled({ restaurant: { whatsapp_handoff_enabled: 'true' } })).toBe(false);
    expect(isHandoffEnabled({ restaurant: { whatsapp_handoff_enabled: 1 } })).toBe(false);
    expect(isHandoffEnabled({ restaurant: { whatsapp_handoff_enabled: true } })).toBe(true);
  });
});

describe('a descrição da tool é o gatilho, então ela é testada', () => {
  it('tem nome estável e um único parâmetro obrigatório', () => {
    expect(HANDOFF_TOOL.function.name).toBe('handoff_to_human');
    expect(HANDOFF_TOOL.function.parameters.required).toEqual(['reason']);
  });

  /**
   * A metade negativa da descrição é o que segura o falso-positivo, que é o
   * critério de parada do spike. Se alguém apagar essa metade, o gatilho fica
   * só com o "chame quando" e passa a escalar demais.
   */
  it('diz também quando NÃO chamar', () => {
    const d = HANDOFF_TOOL.function.description;
    expect(d).toMatch(/NÃO CHAME/);
    expect(d).toMatch(/Escalar demais/);
  });

  it('nomeia a frase de esquiva que ela existe para substituir', () => {
    expect(HANDOFF_TOOL.function.description).toMatch(/verificar e responder depois/);
  });
});

describe('as mensagens', () => {
  it('falam a língua do restaurante', () => {
    expect(mensagemAoCliente('pt')).toMatch(/equipe/);
    expect(mensagemAoCliente('es')).toMatch(/equipo/);
    expect(mensagemAoCliente('en')).toMatch(/team/);
    expect(mensagemAoCliente(undefined)).toMatch(/team/);
  });

  it('não prometem prazo ao cliente', () => {
    for (const l of ['pt', 'es', 'en']) {
      expect(mensagemAoCliente(l)).not.toMatch(/\d+\s*(min|hora|hour)/i);
    }
  });

  it('a mensagem ao host traz telefone, motivo e por quanto tempo a IA fica calada', () => {
    const m = mensagemAoHost({
      restaurantName: 'Cantina do Zé',
      customerPhone: '+5511999998888',
      reason: 'cliente relatou problema na visita de ontem',
    });
    expect(m).toContain('Cantina do Zé');
    expect(m).toContain('+5511999998888');
    expect(m).toContain('problema na visita');
    expect(m).toContain(String(HANDOFF_TTL_MS / 60000));
  });

  it('a mensagem ao host sobrevive a motivo ausente', () => {
    const m = mensagemAoHost({ restaurantName: 'X', customerPhone: '+1' });
    expect(m).toContain('(não informado)');
  });
});

/**
 * Guardas de FIAÇÃO. As propriedades acima valem pouco se o módulo não estiver
 * ligado nos três pontos certos — e ligação é exatamente o tipo de coisa que
 * some numa refatoração sem nada acusar (foi assim que o perfil do cliente
 * ficou só na demo por semanas, ver guestProfileParity.test.ts).
 */
describe('fiação', () => {
  const fs = require('fs');
  const path = require('path');
  const ler = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf-8');

  it('a tool só entra na lista quando o recurso está ligado', () => {
    const src = ler('_services/whatsapp/conversation.js');
    expect(src).toMatch(/isHandoffEnabled\(session\)\s*\?\s*\[\s*\.\.\.baseTools,\s*HANDOFF_TOOL\s*\]\s*:\s*baseTools/);
  });

  it('o processador cala a IA antes de qualquer trabalho pago', () => {
    const src = ler('_lib/channels/message-processor.js');
    const portao = src.indexOf('if (isPaused(session))');
    const llm = src.indexOf('await processWithAI(');
    const reacao = src.indexOf("adapter.addReaction(from, messageId, '\\uD83D\\uDC40')");
    expect(portao).toBeGreaterThan(-1);
    // Antes do LLM e antes até da reação — nada de gastar chamada numa conversa
    // que está com um humano.
    expect(portao).toBeLessThan(llm);
    expect(portao).toBeLessThan(reacao);
  });

  it('o executeTool desfaz a pausa quando não consegue avisar o host', () => {
    const src = ler('_services/whatsapp/reservation-tools.js');
    const caso = src.slice(src.indexOf("case 'handoff_to_human'"));
    const corpo = caso.slice(0, caso.indexOf('default:'));
    expect(corpo).toMatch(/despausar/);
    expect(corpo).toMatch(/manager_whatsapp_verified/);
  });

  it('pausar invalida o cache de sessão', () => {
    const src = ler('_services/whatsapp/reservation-tools.js');
    expect(src).toMatch(/invalidateCachedSession/);
    expect(ler('_lib/whatsapp-sessions.js')).toMatch(/invalidateCachedSession:\s*_invalidateCachedSession/);
  });
});

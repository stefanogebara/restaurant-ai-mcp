'use strict';

/**
 * Limite por telefone que sobrevive ao Vercel.
 *
 * O limite antigo era um `Map` no escopo do módulo. Na Vercel isso é POR
 * INSTÂNCIA de função — e tráfego concorrente é justamente o que faz o Vercel
 * abrir instâncias novas. Um número hostil em rajada era espalhado entre N
 * instâncias, então o limite efetivo virava 10 × N, e cada cold start zerava o
 * contador. O cenário de ataque que ele deveria cobrir era o que o derrotava.
 *
 * Custo estimado do que passava: system prompt (horários + até 40 itens de
 * menu + capacidade) + histórico de 20 turnos + ~2 chamadas de IA por mensagem
 * ≈ 10k tokens de entrada cada. Mil mensagens ≈ 10M tokens, dezenas de dólares
 * por rajada, sem nenhum teto para o restaurante.
 *
 * Agora a contagem é atômica no Postgres (mesmo padrão do dedup de mensagens;
 * o Redis está documentado como não-confiável aqui).
 */

const mockRpc = jest.fn();
jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: { rpc: (...a) => mockRpc(...a) },
}));

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

const { isRateLimited, LIMITE_POR_JANELA, JANELA_SEGUNDOS } = require('../_services/whatsapp/rate-limiter');

const TEL = '5511999998888';

beforeEach(() => {
  jest.clearAllMocks();
  jest.resetModules();
});

describe('contagem vem do banco — compartilhada entre instâncias', () => {
  test('abaixo do limite passa', async () => {
    mockRpc.mockResolvedValue({ data: 1, error: null });
    expect(await isRateLimited(TEL)).toBe(false);
  });

  test('exatamente no limite ainda passa', async () => {
    mockRpc.mockResolvedValue({ data: LIMITE_POR_JANELA, error: null });
    expect(await isRateLimited(TEL)).toBe(false);
  });

  test('acima do limite bloqueia', async () => {
    mockRpc.mockResolvedValue({ data: LIMITE_POR_JANELA + 1, error: null });
    expect(await isRateLimited(TEL)).toBe(true);
  });

  test('chama a RPC com o telefone e o tamanho da janela', async () => {
    mockRpc.mockResolvedValue({ data: 1, error: null });
    await isRateLimited(TEL);
    expect(mockRpc).toHaveBeenCalledWith('whatsapp_rate_bump', {
      p_phone: TEL,
      p_janela_seg: JANELA_SEGUNDOS,
    });
  });
});

describe('banco indisponível NÃO pode calar o restaurante', () => {
  test('erro na RPC → cai pra memória e deixa passar a primeira', async () => {
    // Fail-open é deliberado: bloquear cliente de verdade porque o Postgres
    // hesitou é pior que deixar passar uma rajada rara.
    mockRpc.mockResolvedValue({ data: null, error: { message: 'timeout' } });
    expect(await isRateLimited(TEL)).toBe(false);
  });

  test('RPC ausente (migração não aplicada) → cai pra memória, não quebra', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: '42883', message: 'function does not exist' } });
    expect(await isRateLimited(TEL)).toBe(false);
  });

  test('RPC estourando também cai pra memória', async () => {
    mockRpc.mockRejectedValue(new Error('rede caiu'));
    expect(await isRateLimited(TEL)).toBe(false);
  });

  test('mesmo no fallback, a rajada é barrada dentro da instância', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'fora' } });
    const tel = '5511777770000';
    let bloqueada = 0;
    for (let i = 0; i < LIMITE_POR_JANELA + 5; i++) {
      if (await isRateLimited(tel)) bloqueada++;
    }
    // Proteção degradada, mas existente — melhor que nada com o banco fora.
    expect(bloqueada).toBeGreaterThan(0);
  });
});

describe('entrada capenga', () => {
  test.each([['null', null], ['undefined', undefined], ['vazio', '']])(
    'telefone %s não bloqueia nem chama o banco',
    async (_r, tel) => {
      expect(await isRateLimited(tel)).toBe(false);
      expect(mockRpc).not.toHaveBeenCalled();
    },
  );

  test('contagem não-numérica do banco é tratada como desconhecida, não bloqueia', async () => {
    mockRpc.mockResolvedValue({ data: 'abc', error: null });
    expect(await isRateLimited(TEL)).toBe(false);
  });
});

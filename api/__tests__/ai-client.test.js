/**
 * ai-client — OpenRouter routing + credit-exhaustion (402) failover.
 *
 * Incident 2026-07-06: OpenRouter ran out of credits and every large-prompt
 * call platform-wide (prospect replies, manager AI, validation crons) died
 * with a 402. The client must fail over to direct Anthropic when the key is
 * configured, translating OpenRouter model slugs to Anthropic model IDs.
 */

const mockAnthropicCreate = jest.fn();

jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: { create: mockAnthropicCreate },
  }));
});

jest.mock('../_lib/supabase', () => ({
  // withRetry passthrough — retries are not under test here
  withRetry: async (fn) => fn(),
}));

describe('ai-client OpenRouter 402 failover', () => {
  const OLD_ENV = process.env;
  let fetchMock;

  beforeEach(() => {
    jest.resetModules();
    mockAnthropicCreate.mockReset();
    process.env = { ...OLD_ENV, OPENROUTER_API_KEY: 'or-key', ANTHROPIC_API_KEY: 'ant-key' };
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  afterAll(() => { process.env = OLD_ENV; });

  const params = {
    model: 'anthropic/claude-sonnet-4',
    max_tokens: 500,
    system: 'sys',
    messages: [{ role: 'user', content: 'oi' }],
  };

  test('402 (credits exhausted) fails over to direct Anthropic with translated model', async () => {
    fetchMock.mockResolvedValue({
      ok: false, status: 402,
      text: async () => '{"error":{"message":"Prompt tokens limit exceeded","code":402}}',
    });
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'resposta via anthropic' }],
      stop_reason: 'end_turn',
    });

    const { getAI } = require('../_lib/ai-client');
    const res = await getAI().messages.create(params);

    expect(mockAnthropicCreate).toHaveBeenCalledTimes(1);
    const sent = mockAnthropicCreate.mock.calls[0][0];
    // OpenRouter slug must NOT reach the Anthropic API.
    expect(sent.model).not.toMatch(/^anthropic\//);
    expect(sent.model).toMatch(/^claude-/);
    expect(sent.messages).toEqual(params.messages);
    expect(res.content[0].text).toBe('resposta via anthropic');
  });

  test('402 without ANTHROPIC_API_KEY still throws (no silent behavior change)', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    fetchMock.mockResolvedValue({ ok: false, status: 402, text: async () => 'no credits' });

    const { getAI } = require('../_lib/ai-client');
    await expect(getAI().messages.create(params)).rejects.toThrow(/402/);
    expect(mockAnthropicCreate).not.toHaveBeenCalled();
  });

  test('non-402 errors do not fail over', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' });

    const { getAI } = require('../_lib/ai-client');
    await expect(getAI().messages.create(params)).rejects.toThrow(/500/);
    expect(mockAnthropicCreate).not.toHaveBeenCalled();
  });

  test('healthy OpenRouter path never touches Anthropic', async () => {
    fetchMock.mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ choices: [{ message: { content: 'ok via openrouter' }, finish_reason: 'stop' }] }),
    });

    const { getAI } = require('../_lib/ai-client');
    const res = await getAI().messages.create(params);
    expect(res.content[0].text).toBe('ok via openrouter');
    expect(mockAnthropicCreate).not.toHaveBeenCalled();
  });
});

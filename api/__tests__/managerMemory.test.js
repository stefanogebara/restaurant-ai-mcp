const mockEmbeddingsCreate = jest.fn();
const mockInsert = jest.fn();
const mockFrom = jest.fn();
const mockRpc = jest.fn();

jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: {
    from: mockFrom,
    get rpc() { return mockRpc; },
  },
}));

jest.mock('openai', () => ({
  OpenAI: jest.fn().mockImplementation(() => ({
    embeddings: { create: mockEmbeddingsCreate },
  })),
}));

const { writeMemory, retrieveRelevantMemories } = require('../services/managerMemory');

const mockSupabaseAdmin = require('../_lib/supabase').supabaseAdmin;
const mockOpenAI = { embeddings: { create: mockEmbeddingsCreate } };

beforeAll(() => { process.env.OPENAI_API_KEY = 'test-key'; });
afterAll(() => { delete process.env.OPENAI_API_KEY; });
beforeEach(() => jest.clearAllMocks());

describe('writeMemory', () => {
  it('embeds content and inserts into manager_memory', async () => {
    mockEmbeddingsCreate.mockResolvedValue({ data: [{ embedding: new Array(1536).fill(0.1) }] });
    mockInsert.mockResolvedValue({ error: null });
    mockFrom.mockReturnValue({ insert: mockInsert });

    await writeMemory('rest-1', 'fact', 'menu', 'We close at 10pm', 'onboarding_interview', 8);

    expect(mockEmbeddingsCreate).toHaveBeenCalledWith({
      model: 'text-embedding-ada-002',
      input: 'We close at 10pm',
    });
    expect(mockFrom).toHaveBeenCalledWith('manager_memory');
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      restaurant_id: 'rest-1',
      type: 'fact',
      category: 'menu',
      content: 'We close at 10pm',
      importance: 8,
    }));
  });

  it('throws when supabase insert fails', async () => {
    mockEmbeddingsCreate.mockResolvedValue({ data: [{ embedding: new Array(1536).fill(0) }] });
    mockInsert.mockResolvedValue({ error: { message: 'DB error' } });
    mockFrom.mockReturnValue({ insert: mockInsert });

    await expect(writeMemory('rest-1', 'fact', 'ops', 'test', 'system')).rejects.toThrow('DB error');
  });
});

describe('retrieveRelevantMemories', () => {
  it('calls match_manager_memories rpc and returns rows', async () => {
    mockEmbeddingsCreate.mockResolvedValue({ data: [{ embedding: new Array(1536).fill(0.2) }] });
    mockRpc.mockResolvedValue({
      data: [{ id: 'mem-1', content: 'Close at 10pm', type: 'fact', category: 'ops', importance: 8, similarity: 0.92 }],
      error: null,
    });

    const results = await retrieveRelevantMemories('rest-1', 'what time do you close', 5);

    expect(mockRpc).toHaveBeenCalledWith('match_manager_memories', {
      p_restaurant_id: 'rest-1',
      p_embedding: expect.any(Array),
      p_limit: 5,
    });
    expect(results).toHaveLength(1);
    expect(results[0].content).toBe('Close at 10pm');
  });

  it('returns empty array when rpc returns null data', async () => {
    mockEmbeddingsCreate.mockResolvedValue({ data: [{ embedding: new Array(1536).fill(0) }] });
    mockRpc.mockResolvedValue({ data: null, error: null });

    const results = await retrieveRelevantMemories('rest-1', 'anything');
    expect(results).toEqual([]);
  });
});

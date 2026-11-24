/** Scoped ElevenLabs tool logs must never read or update another tenant's row. */
const rows = [
  { id: 'row-b', conversation_id: 'conversation-b', restaurant_info_id: 'restaurant-b', tools_used: [], errors_encountered: [] },
  { id: 'row-a', conversation_id: 'conversation-a', restaurant_info_id: 'restaurant-a', tools_used: [], errors_encountered: [] },
];

jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: {
    from: jest.fn(() => {
      const filters = [];
      let operation = 'read';
      let payload;
      const matches = row => filters.every(([field, value]) => row[field] === value);
      const query = {
        select: jest.fn(() => query),
        eq: jest.fn((field, value) => { filters.push([field, value]); return query; }),
        update: jest.fn(value => { operation = 'update'; payload = value; return query; }),
        insert: jest.fn(value => { operation = 'insert'; payload = value; return query; }),
        maybeSingle: jest.fn(async () => ({ data: rows.find(matches) || null, error: null })),
        single: jest.fn(async () => {
          if (operation === 'insert') {
            if (rows.some(row => row.conversation_id === payload.conversation_id)) {
              return { data: null, error: { message: 'duplicate conversation ID' } };
            }
            const inserted = { id: 'new-row', ...payload };
            rows.push(inserted);
            return { data: inserted, error: null };
          }
          return { data: rows.find(matches) || null, error: null };
        }),
        then: (resolve, reject) => Promise.resolve().then(() => {
          if (operation === 'update') rows.filter(matches).forEach(row => Object.assign(row, payload));
          return { error: null };
        }).then(resolve, reject),
      };
      return query;
    }),
  },
}));
jest.mock('../_lib/secure-logger', () => ({ createSecureLogger: () => ({ info() {}, error() {} }) }));
jest.mock('../_services/memoryExtractor', () => ({ extractMemoriesFromConversation: jest.fn() }));
jest.mock('../_lib/restaurant-loader', () => ({ getRestaurantByAgentId: jest.fn() }));

const conversationLogger = require('../_services/conversationLogger');

beforeEach(() => {
  rows[0].tools_used = [];
  rows[0].errors_encountered = [];
  rows[1].tools_used = [];
  rows[1].errors_encountered = [];
  delete rows[0].customer_name;
  delete rows[1].customer_name;
});

test('A cannot adopt or update B conversation ID', async () => {
  const logger = conversationLogger.forRestaurant('restaurant-a');

  expect(await logger.startConversation({ conversation_id: 'conversation-b' })).toBeNull();
  await logger.logToolCall('conversation-b', { tool_name: 'create_reservation', success: true });
  await logger.updateConversation('conversation-b', { customer_name: 'Injected' });

  expect(rows[0].tools_used).toEqual([]);
  expect(rows[0].customer_name).toBeUndefined();
  expect(rows.filter(row => row.conversation_id === 'conversation-b')).toHaveLength(1);
});

test('A can log its own call without changing conversation ownership', async () => {
  const logger = conversationLogger.forRestaurant('restaurant-a');

  expect(await logger.startConversation({ conversation_id: 'conversation-a' })).toMatchObject({ id: 'row-a' });
  await logger.logToolCall('conversation-a', { tool_name: 'check_availability', success: true });
  await logger.updateConversation('conversation-a', { customer_name: 'Own Guest', restaurant_info_id: 'restaurant-b' });

  expect(rows[1].tools_used).toHaveLength(1);
  expect(rows[1].customer_name).toBe('Own Guest');
  expect(rows[1].restaurant_info_id).toBe('restaurant-a');
});

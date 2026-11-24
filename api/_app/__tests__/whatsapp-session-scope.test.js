'use strict';

const rows = [];
let nextId = 1;

function mockQuery() {
  const filters = [];
  let action = 'read';
  let payload;
  const matches = row => filters.every(([op, field, value]) =>
    op === 'eq' ? row[field] === value : op === 'is' ? row[field] == null : row[field] > value);
  const run = () => {
    if (action === 'insert') {
      if (payload.inbound_provider && rows.some(r =>
        r.sender_phone === payload.sender_phone && r.inbound_provider === payload.inbound_provider &&
        r.inbound_receiver === payload.inbound_receiver)) return { data: null, error: { code: '23505' } };
      const row = { id: `row-${nextId++}`, ...payload };
      rows.push(row);
      return { data: { ...row }, error: null };
    }
    const row = rows.find(matches);
    if (action === 'update' && row) Object.assign(row, payload);
    return { data: row ? { ...row } : null, error: row ? null : { code: 'PGRST116' } };
  };
  const q = {
    select: () => q,
    eq: (field, value) => { filters.push(['eq', field, value]); return q; },
    is: (field) => { filters.push(['is', field]); return q; },
    gt: (field, value) => { filters.push(['gt', field, value]); return q; },
    order: () => q,
    limit: () => q,
    insert: value => { action = 'insert'; payload = value; return q; },
    update: value => { action = 'update'; payload = value; return q; },
    single: async () => run(),
    maybeSingle: async () => {
      const result = run();
      return result.data ? result : { data: null, error: null };
    },
    then: (resolve, reject) => Promise.resolve(run()).then(resolve, reject),
  };
  return q;
}

jest.mock('../_lib/central-supabase', () => ({
  isCentralConfigured: () => true,
  centralSupabase: { from: () => mockQuery() },
}));
jest.mock('../_lib/secure-logger', () => ({ createSecureLogger: () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(),
}) }));

const { getOrCreateSession, getSessionByPhone, setSessionRestaurant } = require('../_lib/whatsapp-sessions');
const phone = '+15550001111';
const A = { provider: 'meta', receiver: '11111111111' };
const B = { provider: 'meta', receiver: '22222222222' };

beforeEach(() => { rows.length = 0; nextId = 1; });

test('A → B → A preserves separate tenant and conversation history', async () => {
  const a = await getOrCreateSession(phone, 'conv-a', A);
  await setSessionRestaurant(a.id, 'restaurant-a');
  rows.find(r => r.id === a.id).conversation_history = [{ role: 'user', content: 'A only' }];
  const b = await getOrCreateSession(phone, 'conv-b', B);
  await setSessionRestaurant(b.id, 'restaurant-b');
  rows.find(r => r.id === b.id).conversation_history = [{ role: 'user', content: 'B only' }];
  const aAgain = await getOrCreateSession(phone, 'conv-a-2', A);
  expect(aAgain).toEqual(expect.objectContaining({ id: a.id, restaurant_id: 'restaurant-a',
    conversation_history: [{ role: 'user', content: 'A only' }] }));
  expect(await getSessionByPhone(phone, B)).toEqual(expect.objectContaining({ id: b.id,
    restaurant_id: 'restaurant-b', conversation_history: [{ role: 'user', content: 'B only' }] }));
});

test('legacy phone-only session is never read by inbound account', async () => {
  rows.push({ id: 'legacy', sender_phone: phone, inbound_provider: null, inbound_receiver: null,
    restaurant_id: 'wrong-tenant', expires_at: new Date(Date.now() + 600000).toISOString() });
  const inbound = await getOrCreateSession(phone, 'conv-a', A);
  expect(inbound.id).not.toBe('legacy');
  expect(inbound.restaurant_id).toBeUndefined();
  expect((await getSessionByPhone(phone)).id).toBe('legacy');
});

test('expired scoped row resets history and tenant instead of reviving it', async () => {
  rows.push({ id: 'expired', sender_phone: phone, inbound_provider: A.provider, inbound_receiver: A.receiver,
    restaurant_id: 'old-tenant', conversation_history: [{ role: 'user', content: 'old' }],
    expires_at: new Date(Date.now() - 60000).toISOString() });
  const session = await getOrCreateSession(phone, 'new-conv', A);
  expect(session).toEqual(expect.objectContaining({ id: 'expired', restaurant_id: null,
    conversation_history: [], conversation_id: 'new-conv' }));
});

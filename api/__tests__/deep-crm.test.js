/**
 * Deep Guest CRM Tests — Phase 1B
 *
 * Covers:
 *   1. customerMergeService (findDuplicates, mergeCustomers)
 *   2. update_profile action (validation, auth, happy path)
 *   3. Auto VIP classification (calculateTier with new rules)
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.end = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  return res;
}

// ---------------------------------------------------------------------------
// 1. customerMergeService
// ---------------------------------------------------------------------------

describe('customerMergeService', () => {
  let findDuplicates;
  let mergeCustomers;
  let mockFrom;
  let mockSelect;
  let mockEq;
  let mockIs;
  let mockSingle;
  let mockUpdate;
  let mockSchema;

  beforeEach(() => {
    jest.resetModules();

    // Build fluent query mock.
    // Each method returns a new chain-like object so chaining works.
    // Terminal calls (.is for findDuplicates, .single for mergeCustomers)
    // can be set to resolve with data via mockResolvedValue / mockResolvedValueOnce.
    mockSingle = jest.fn();
    mockIs = jest.fn();
    mockEq = jest.fn();
    mockSelect = jest.fn();
    mockUpdate = jest.fn();

    // Create a chain where every method returns an object with all methods
    const makeChain = () => {
      const c = {};
      c.select = mockSelect;
      c.update = mockUpdate;
      c.eq = mockEq;
      c.is = mockIs;
      c.single = mockSingle;
      return c;
    };

    const chain = makeChain();
    mockSelect.mockReturnValue(chain);
    mockUpdate.mockReturnValue(chain);
    mockEq.mockReturnValue(chain);
    // mockIs and mockSingle will be configured per-test as terminal calls

    mockFrom = jest.fn().mockReturnValue(chain);
    mockSchema = jest.fn().mockReturnValue({ from: mockFrom });

    // Also mock supabaseAdmin.from for reservations
    const mockAdminFrom = jest.fn().mockReturnValue({
      update: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null }),
        }),
      }),
    });

    jest.doMock('../../api/_lib/supabase', () => ({
      supabaseAdmin: {
        schema: mockSchema,
        from: mockAdminFrom,
      },
    }));

    jest.doMock('../../api/_lib/secure-logger', () => ({
      createSecureLogger: () => ({
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
      }),
    }));

    ({ findDuplicates, mergeCustomers } = require('../_services/customerMergeService'));
  });

  describe('findDuplicates', () => {
    it('returns empty array when no customers exist', async () => {
      // Chain: schema('restaurant').from('customer_ltv').select(...).eq(...).is(...)
      // The final resolution is the is() call
      mockIs.mockResolvedValue({ data: [], error: null });

      const result = await findDuplicates('rest-1');
      expect(result).toEqual([]);
    });

    it('groups customers with matching phone numbers', async () => {
      mockIs.mockResolvedValue({
        data: [
          { customer_id: 'c1', customer_name: 'Alice', customer_phone: '+5511999', customer_email: null, total_visits: 5, total_revenue: 500, last_visit_date: '2026-03-01' },
          { customer_id: 'c2', customer_name: 'Alice B', customer_phone: '+5511999', customer_email: null, total_visits: 2, total_revenue: 200, last_visit_date: '2026-02-15' },
          { customer_id: 'c3', customer_name: 'Bob', customer_phone: '+5511888', customer_email: null, total_visits: 1, total_revenue: 100, last_visit_date: '2026-01-01' },
        ],
        error: null,
      });

      const result = await findDuplicates('rest-1');
      expect(result).toHaveLength(1);
      expect(result[0].match_field).toBe('phone');
      expect(result[0].match_value).toBe('+5511999');
      expect(result[0].customers).toHaveLength(2);
    });

    it('groups customers with matching email', async () => {
      mockIs.mockResolvedValue({
        data: [
          { customer_id: 'c1', customer_name: 'Alice', customer_phone: '+5511999', customer_email: 'alice@test.com', total_visits: 5, total_revenue: 500, last_visit_date: '2026-03-01' },
          { customer_id: 'c2', customer_name: 'Alice B', customer_phone: '+5511777', customer_email: 'alice@test.com', total_visits: 2, total_revenue: 200, last_visit_date: '2026-02-15' },
        ],
        error: null,
      });

      const result = await findDuplicates('rest-1');
      expect(result).toHaveLength(1);
      expect(result[0].match_field).toBe('email');
    });

    it('throws on database error', async () => {
      mockIs.mockResolvedValue({ data: null, error: { message: 'DB down' } });
      await expect(findDuplicates('rest-1')).rejects.toEqual({ message: 'DB down' });
    });
  });

  describe('mergeCustomers', () => {
    it('throws when keepId equals mergeId', async () => {
      await expect(mergeCustomers('rest-1', 'c1', 'c1')).rejects.toThrow('Cannot merge a customer into itself');
    });

    it('throws when keep customer not found', async () => {
      jest.resetModules();

      let singleIdx = 0;
      const singleResults = [
        { data: null, error: { code: 'PGRST116' } },
        { data: { customer_id: 'c2' }, error: null },
      ];
      const buildChain = () => {
        const c = {};
        const self = () => c;
        c.select = jest.fn(self);
        c.eq = jest.fn(self);
        c.is = jest.fn(self);
        c.update = jest.fn(self);
        c.single = jest.fn(() => Promise.resolve(singleResults[singleIdx++] || { data: null, error: null }));
        c.then = (resolve) => resolve({ error: null });
        return c;
      };

      jest.doMock('../../api/_lib/supabase', () => ({
        supabaseAdmin: {
          schema: jest.fn().mockReturnValue({ from: jest.fn().mockImplementation(() => buildChain()) }),
          from: jest.fn().mockReturnValue({ update: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) }) }) }),
        },
      }));
      jest.doMock('../../api/_lib/secure-logger', () => ({ createSecureLogger: () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }) }));

      const { mergeCustomers: mc } = require('../_services/customerMergeService');
      await expect(mc('rest-1', 'c1', 'c2')).rejects.toThrow('Keep customer not found');
    });

    it('throws when merge customer not found', async () => {
      jest.resetModules();

      let singleIdx = 0;
      const singleResults = [
        { data: { customer_id: 'c1' }, error: null },
        { data: null, error: { code: 'PGRST116' } },
      ];
      const buildChain = () => {
        const c = {};
        const self = () => c;
        c.select = jest.fn(self);
        c.eq = jest.fn(self);
        c.is = jest.fn(self);
        c.update = jest.fn(self);
        c.single = jest.fn(() => Promise.resolve(singleResults[singleIdx++] || { data: null, error: null }));
        c.then = (resolve) => resolve({ error: null });
        return c;
      };

      jest.doMock('../../api/_lib/supabase', () => ({
        supabaseAdmin: {
          schema: jest.fn().mockReturnValue({ from: jest.fn().mockImplementation(() => buildChain()) }),
          from: jest.fn().mockReturnValue({ update: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) }) }) }),
        },
      }));
      jest.doMock('../../api/_lib/secure-logger', () => ({ createSecureLogger: () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }) }));

      const { mergeCustomers: mc } = require('../_services/customerMergeService');
      await expect(mc('rest-1', 'c1', 'c2')).rejects.toThrow('Merge customer not found');
    });

    it('sums visits and revenue, unions tags and allergies', async () => {
      // This test verifies the merge logic by checking that mergeCustomers
      // calls update with correct summed values. We test via a separate
      // fresh mock setup to avoid chaining issues.

      jest.resetModules();

      const keepRecord = {
        customer_id: 'c1',
        customer_name: 'Alice',
        customer_phone: '+5511999',
        customer_email: 'alice@test.com',
        total_visits: 5,
        total_revenue: 500,
        first_visit_date: '2026-01-15',
        last_visit_date: '2026-03-01',
        tags: ['regular'],
        allergies: ['peanuts'],
        dietary_restrictions: ['vegetarian'],
        seating_preferences: ['window'],
        special_occasions: { birthday: '03-15' },
      };

      const mergeRecord = {
        customer_id: 'c2',
        customer_name: null,
        customer_phone: '+5511999',
        customer_email: null,
        total_visits: 3,
        total_revenue: 300,
        first_visit_date: '2025-12-01',
        last_visit_date: '2026-02-15',
        tags: ['regular', 'vip'],
        allergies: ['shellfish'],
        dietary_restrictions: ['vegetarian', 'gluten-free'],
        seating_preferences: ['patio'],
        special_occasions: { anniversary: '06-20' },
      };

      const mergedResult = {
        customer_id: 'c1',
        customer_name: 'Alice',
        customer_phone: '+5511999',
        customer_email: 'alice@test.com',
        total_visits: 8,
        total_revenue: 800,
        tags: ['regular', 'vip'],
        allergies: ['peanuts', 'shellfish'],
        dietary_restrictions: ['vegetarian', 'gluten-free'],
        seating_preferences: ['window', 'patio'],
        special_occasions: { anniversary: '06-20', birthday: '03-15' },
      };

      // Track update calls
      let updatePayload = null;
      let updateCallCount = 0;

      // Build a mock that supports the fluent chaining used by mergeCustomers
      const buildQueryMock = (resolveValue) => {
        const proxy = new Proxy({}, {
          get(_, prop) {
            if (prop === 'then') return undefined; // not thennable itself
            if (prop === 'single') {
              return jest.fn().mockResolvedValue(resolveValue);
            }
            return jest.fn().mockReturnValue(proxy);
          },
        });
        return proxy;
      };

      let singleCallIdx = 0;
      const singleResults = [
        { data: keepRecord, error: null },    // fetch keep
        { data: mergeRecord, error: null },   // fetch merge
        { data: mergedResult, error: null },  // update keep result
      ];

      const buildChain = () => {
        const chain = {};
        const self = () => chain;
        chain.select = jest.fn(self);
        chain.eq = jest.fn(self);
        chain.is = jest.fn(self);
        chain.update = jest.fn((...args) => {
          updateCallCount++;
          if (updateCallCount === 1) updatePayload = args[0];
          return chain;
        });
        chain.single = jest.fn(() => {
          const result = singleResults[singleCallIdx] || { data: null, error: null };
          singleCallIdx++;
          return Promise.resolve(result);
        });
        // When awaited directly (no .single), resolve with no error
        chain.then = (resolve) => resolve({ error: null });
        return chain;
      };

      const mockSchemaLocal = jest.fn().mockReturnValue({
        from: jest.fn().mockImplementation(() => buildChain()),
      });

      const mockAdminFromLocal = jest.fn().mockReturnValue({
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ error: null }),
          }),
        }),
      });

      jest.doMock('../../api/_lib/supabase', () => ({
        supabaseAdmin: {
          schema: mockSchemaLocal,
          from: mockAdminFromLocal,
        },
      }));
      jest.doMock('../../api/_lib/secure-logger', () => ({
        createSecureLogger: () => ({
          info: jest.fn(), error: jest.fn(), warn: jest.fn(),
        }),
      }));

      const { mergeCustomers: mergeLocal } = require('../_services/customerMergeService');
      const result = await mergeLocal('rest-1', 'c1', 'c2');

      expect(result.total_visits).toBe(8);
      expect(result.total_revenue).toBe(800);
      expect(updatePayload).toBeTruthy();
      expect(updatePayload.total_visits).toBe(8);
      expect(updatePayload.total_revenue).toBe(800);
      expect(updatePayload.allergies).toEqual(expect.arrayContaining(['peanuts', 'shellfish']));
      expect(updatePayload.dietary_restrictions).toEqual(expect.arrayContaining(['vegetarian', 'gluten-free']));
      expect(updatePayload.seating_preferences).toEqual(expect.arrayContaining(['window', 'patio']));
      expect(updatePayload.tags).toEqual(expect.arrayContaining(['regular', 'vip']));
      expect(updatePayload.special_occasions).toEqual({ anniversary: '06-20', birthday: '03-15' });
      expect(updatePayload.first_visit_date).toBe('2025-12-01'); // earliest
      expect(updatePayload.last_visit_date).toBe('2026-03-01');  // latest
    });
  });
});

// ---------------------------------------------------------------------------
// 2. update_profile action
// ---------------------------------------------------------------------------

describe('customers API — update_profile', () => {
  let handler;
  let mockVerifyAuth;
  let mockCheckSubscription;
  let mockRequireFeature;
  let mockCrmUpdate;
  let mockCrmSingle;

  beforeEach(() => {
    jest.resetModules();

    mockVerifyAuth = jest.fn().mockResolvedValue({
      user: { restaurant_id: 'rest-1', email: 'owner@test.com' },
    });

    mockCheckSubscription = jest.fn((_req, _res, next) => next());
    mockRequireFeature = jest.fn(() => (_req, _res, next) => next());

    mockCrmSingle = jest.fn();
    mockCrmUpdate = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: mockCrmSingle,
          }),
        }),
      }),
    });

    const mockSchema = jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        update: mockCrmUpdate,
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
        single: jest.fn(),
      }),
    });

    jest.doMock('../../api/_lib/supabase', () => ({
      supabaseAdmin: { schema: mockSchema, from: jest.fn() },
    }));
    jest.doMock('../../api/_lib/auth', () => ({ verifyAuth: mockVerifyAuth }));
    jest.doMock('../../api/_lib/secure-logger', () => ({
      createSecureLogger: () => ({
        info: jest.fn(), error: jest.fn(), warn: jest.fn(),
      }),
    }));
    jest.doMock('../../api/_lib/subscription-middleware', () => ({
      checkSubscription: mockCheckSubscription,
      requireFeature: mockRequireFeature,
    }));
    jest.doMock('../../api/_lib/rate-limit', () => ({
      checkAndApplyRateLimit: jest.fn().mockResolvedValue(false),
    }));
    jest.doMock('../../api/_lib/cors', () => ({
      setInternalCors: jest.fn(),
    }));
    jest.doMock('../../api/services/customerMergeService', () => ({
      findDuplicates: jest.fn(),
      mergeCustomers: jest.fn(),
    }));

    handler = require('../customers');
  });

  it('rejects non-POST requests', async () => {
    const req = { method: 'GET', query: { action: 'update_profile' }, headers: {} };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  it('rejects missing customer_id', async () => {
    const req = {
      method: 'POST',
      query: { action: 'update_profile' },
      headers: {},
      body: { allergies: ['peanuts'] },
    };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('customer_id') })
    );
  });

  it('rejects non-array allergies', async () => {
    const req = {
      method: 'POST',
      query: { action: 'update_profile' },
      headers: {},
      body: { customer_id: 'c1', allergies: 'peanuts' },
    };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('array') })
    );
  });

  it('rejects non-string items in dietary_restrictions', async () => {
    const req = {
      method: 'POST',
      query: { action: 'update_profile' },
      headers: {},
      body: { customer_id: 'c1', dietary_restrictions: [123] },
    };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('rejects non-object special_occasions', async () => {
    const req = {
      method: 'POST',
      query: { action: 'update_profile' },
      headers: {},
      body: { customer_id: 'c1', special_occasions: 'birthday' },
    };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('JSON object') })
    );
  });

  it('rejects array as special_occasions', async () => {
    const req = {
      method: 'POST',
      query: { action: 'update_profile' },
      headers: {},
      body: { customer_id: 'c1', special_occasions: ['birthday'] },
    };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('rejects when no profile fields provided', async () => {
    const req = {
      method: 'POST',
      query: { action: 'update_profile' },
      headers: {},
      body: { customer_id: 'c1' },
    };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('No profile fields') })
    );
  });

  it('succeeds with valid profile update', async () => {
    mockCrmSingle.mockResolvedValue({
      data: {
        customer_id: 'c1',
        allergies: ['peanuts'],
        dietary_restrictions: ['vegan'],
        seating_preferences: ['window'],
        special_occasions: { birthday: '03-15' },
      },
      error: null,
    });

    const req = {
      method: 'POST',
      query: { action: 'update_profile' },
      headers: {},
      body: {
        customer_id: 'c1',
        allergies: ['peanuts'],
        dietary_restrictions: ['vegan'],
        seating_preferences: ['window'],
        special_occasions: { birthday: '03-15' },
      },
    };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true })
    );
  });

  it('rejects too many seating preferences', async () => {
    const req = {
      method: 'POST',
      query: { action: 'update_profile' },
      headers: {},
      body: {
        customer_id: 'c1',
        seating_preferences: Array.from({ length: 11 }, (_, i) => `seat-${i}`),
      },
    };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('Maximum 10') })
    );
  });
});

// ---------------------------------------------------------------------------
// 3. Auto VIP classification (calculateTier)
// ---------------------------------------------------------------------------

describe('calculateTier — auto VIP classification', () => {
  let calculateTier;

  beforeEach(() => {
    jest.resetModules();
    jest.doMock('../../api/_lib/supabase', () => ({
      supabaseAdmin: { schema: jest.fn(), from: jest.fn() },
    }));
    jest.doMock('../../api/_lib/secure-logger', () => ({
      createSecureLogger: () => ({
        info: jest.fn(), error: jest.fn(), warn: jest.fn(),
      }),
    }));
    ({ calculateTier } = require('../_services/ltvCalculator'));
  });

  it('returns "new" for 1 visit', () => {
    expect(calculateTier(1, 100, 100)).toBe('new');
  });

  it('returns "occasional" for 2-3 visits', () => {
    expect(calculateTier(2, 200, 100)).toBe('occasional');
    expect(calculateTier(3, 300, 100)).toBe('occasional');
  });

  it('returns "regular" for 4-9 visits', () => {
    expect(calculateTier(4, 400, 100)).toBe('regular');
    expect(calculateTier(9, 900, 100)).toBe('regular');
  });

  it('returns "vip" for 10+ visits AND top 20% revenue', () => {
    expect(calculateTier(10, 1000, 100, { revenueP80: 800 })).toBe('vip');
    expect(calculateTier(15, 2000, 133, { revenueP80: 1500 })).toBe('vip');
  });

  it('returns "regular" for 10+ visits but NOT top 20% revenue', () => {
    // 10 visits but revenue below P80 threshold
    expect(calculateTier(10, 500, 50, { revenueP80: 800 })).toBe('regular');
  });

  it('returns "vip" when tagged "vip" regardless of visits', () => {
    expect(calculateTier(2, 100, 50, { tags: ['vip'] })).toBe('vip');
    expect(calculateTier(1, 50, 50, { tags: ['VIP'] })).toBe('vip');
    expect(calculateTier(1, 50, 50, { tags: [' vip '] })).toBe('vip');
  });

  it('returns "at_risk" when last_visit > 60 days AND was regular', () => {
    expect(calculateTier(5, 500, 100, {
      daysSinceLastVisit: 65,
      previousTier: 'regular',
    })).toBe('at_risk');
  });

  it('returns "at_risk" when last_visit > 60 days AND was vip', () => {
    expect(calculateTier(12, 1200, 100, {
      daysSinceLastVisit: 90,
      previousTier: 'vip',
    })).toBe('at_risk');
  });

  it('does NOT return "at_risk" for occasional customer even if 60+ days', () => {
    expect(calculateTier(3, 300, 100, {
      daysSinceLastVisit: 100,
      previousTier: 'occasional',
    })).toBe('occasional');
  });

  it('does NOT return "at_risk" for new customer even if 60+ days', () => {
    expect(calculateTier(1, 100, 100, {
      daysSinceLastVisit: 120,
      previousTier: 'new',
    })).toBe('new');
  });

  it('at_risk takes priority over vip tag', () => {
    // Even if tagged vip, at_risk wins when conditions met
    expect(calculateTier(10, 1000, 100, {
      daysSinceLastVisit: 70,
      previousTier: 'vip',
      tags: ['vip'],
    })).toBe('at_risk');
  });

  it('defaults to "new" with no opts', () => {
    expect(calculateTier(1, 50, 50)).toBe('new');
  });

  it('handles undefined/null tags gracefully', () => {
    expect(calculateTier(2, 100, 50, { tags: null })).toBe('occasional');
    expect(calculateTier(2, 100, 50, { tags: undefined })).toBe('occasional');
  });
});

// ---------------------------------------------------------------------------
// 4. find_duplicates and merge actions routing
// ---------------------------------------------------------------------------

describe('customers API — find_duplicates and merge routing', () => {
  let handler;

  beforeEach(() => {
    jest.resetModules();

    jest.doMock('../../api/_lib/supabase', () => ({
      supabaseAdmin: {
        schema: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            is: jest.fn().mockReturnThis(),
          }),
        }),
        from: jest.fn(),
      },
    }));
    jest.doMock('../../api/_lib/auth', () => ({
      verifyAuth: jest.fn().mockResolvedValue({
        user: { restaurant_id: 'rest-1', email: 'owner@test.com' },
      }),
    }));
    jest.doMock('../../api/_lib/secure-logger', () => ({
      createSecureLogger: () => ({
        info: jest.fn(), error: jest.fn(), warn: jest.fn(),
      }),
    }));
    jest.doMock('../../api/_lib/subscription-middleware', () => ({
      checkSubscription: jest.fn((_req, _res, next) => next()),
      requireFeature: jest.fn(() => (_req, _res, next) => next()),
    }));
    jest.doMock('../../api/_lib/rate-limit', () => ({
      checkAndApplyRateLimit: jest.fn().mockResolvedValue(false),
    }));
    jest.doMock('../../api/_lib/cors', () => ({
      setInternalCors: jest.fn(),
    }));
    jest.doMock('../../api/services/customerMergeService', () => ({
      findDuplicates: jest.fn().mockResolvedValue([
        { match_field: 'phone', match_value: '+5511999', customers: [{ customer_id: 'c1' }, { customer_id: 'c2' }] },
      ]),
      mergeCustomers: jest.fn().mockResolvedValue({ customer_id: 'c1', total_visits: 8 }),
    }));

    handler = require('../customers');
  });

  it('find_duplicates returns duplicate groups', async () => {
    const req = { method: 'GET', query: { action: 'find_duplicates' }, headers: {} };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ total_groups: 1 }),
      })
    );
  });

  it('merge rejects non-POST', async () => {
    const req = { method: 'GET', query: { action: 'merge' }, headers: {} };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  it('merge rejects missing keep_id', async () => {
    const req = { method: 'POST', query: { action: 'merge' }, headers: {}, body: { merge_id: 'c2' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('merge rejects same keep_id and merge_id', async () => {
    const req = { method: 'POST', query: { action: 'merge' }, headers: {}, body: { keep_id: 'c1', merge_id: 'c1' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('different') })
    );
  });

  it('merge succeeds with valid ids', async () => {
    const req = { method: 'POST', query: { action: 'merge' }, headers: {}, body: { keep_id: 'c1', merge_id: 'c2' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: expect.objectContaining({ customer_id: 'c1' }) })
    );
  });

  it('available_actions includes new actions', async () => {
    const req = { method: 'GET', query: {}, headers: {} };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    const response = res.json.mock.calls[0][0];
    expect(response.available_actions).toContain('update_profile');
    expect(response.available_actions).toContain('find_duplicates');
    expect(response.available_actions).toContain('merge');
  });
});

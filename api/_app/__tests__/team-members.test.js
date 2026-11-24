/**
 * Tests for team member DB helpers added to api/_lib/supabase.js
 */

// ---------------------------------------------------------------------------
// Fake env vars before any require()
// ---------------------------------------------------------------------------
process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key';
process.env.SUPABASE_ANON_KEY = 'fake-anon-key';
process.env.JWT_SECRET = 'test-secret';

// ---------------------------------------------------------------------------
// Chainable Supabase mock — proxies all chain calls, terminal with .single()
// ---------------------------------------------------------------------------
let _singleResult = { data: null, error: null };
let _listResult = { data: null, error: null };

const mockSingle = jest.fn();
const mockMaybeSingle = jest.fn();
const mockInsert = jest.fn();
const mockUpdate = jest.fn();
const mockChain = new Proxy({}, {
  get(_, prop) {
    if (prop === 'then') return (resolve) => resolve(_listResult);
    if (prop === 'single') return mockSingle;
    if (prop === 'maybeSingle') return mockMaybeSingle;
    if (prop === 'insert') return mockInsert;
    if (prop === 'update') return mockUpdate;
    return () => mockChain;
  },
});

const mockClient = {
  schema: jest.fn(() => mockClient),
  from: jest.fn(() => mockChain),
};

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockClient),
}));

// Helper to set up mocks
function setSingle(data, error = null) {
  mockSingle.mockResolvedValueOnce({ data, error });
}
function setList(data, error = null) {
  _listResult = { data, error };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockClient.schema.mockReturnValue(mockClient);
  mockClient.from.mockReturnValue(mockChain);
  mockMaybeSingle.mockResolvedValue({ data: null, error: null });
  mockInsert.mockReturnValue(mockChain);
  mockUpdate.mockReturnValue(mockChain);
  setList(null);
});

// ---------------------------------------------------------------------------
// Import helpers under test (after mock registration)
// ---------------------------------------------------------------------------
const {
  getTeamMembers,
  addTeamMember,
  updateTeamMemberRole,
  removeTeamMember,
  acceptInvite,
} = require('../_lib/supabase');

// ============================================================
// getTeamMembers
// ============================================================
describe('getTeamMembers', () => {
  it('returns success: true with members array', async () => {
    setList([{ id: '1', email: 'host@test.com', role: 'host', status: 'active' }]);

    const result = await getTeamMembers('restaurant-uuid-123');
    expect(result.success).toBe(true);
    expect(Array.isArray(result.members)).toBe(true);
  });

  it('returns success: false when supabase errors', async () => {
    setList(null, { message: 'DB error' });

    const result = await getTeamMembers('restaurant-uuid-123');
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

// ============================================================
// addTeamMember
// ============================================================
describe('addTeamMember', () => {
  it('inserts a pending member row and returns invite_token', async () => {
    setSingle({
      id: 'member-id',
      email: 'host@test.com',
      role: 'host',
      status: 'pending',
      invite_token: 'abc123',
    });

    const result = await addTeamMember('r-id', {
      email: 'host@test.com',
      role: 'host',
      invitedBy: 'owner-uid',
    });

    expect(result.success).toBe(true);
    expect(result.member.invite_token).toBeDefined();
    expect(result.member.status).toBe('pending');
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('does not reset an active or pending member to pending when invited again', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: { id: 'existing', status: 'active' }, error: null });
    const result = await addTeamMember('r-id', { email: 'HOST@test.com', role: 'staff', invitedBy: 'owner-uid' });
    expect(result).toEqual({ success: false, error: 'already_member' });
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('reactivates an inactive member without overwriting an active one', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: { id: 'inactive-id', status: 'inactive' }, error: null });
    setSingle({ id: 'inactive-id', email: 'host@test.com', status: 'pending', invite_token: 'new-token' });
    const result = await addTeamMember('r-id', { email: 'host@test.com', role: 'host', invitedBy: 'owner-uid' });
    expect(result.success).toBe(true);
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending' }));
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('rejects invalid role', async () => {
    await expect(
      addTeamMember('r-id', { email: 'x@x.com', role: 'superadmin', invitedBy: 'uid' })
    ).rejects.toThrow('Invalid role');
  });

  it('rejects "owner" as invited role', async () => {
    await expect(
      addTeamMember('r-id', { email: 'x@x.com', role: 'owner', invitedBy: 'uid' })
    ).rejects.toThrow('Invalid role');
  });
});

// ============================================================
// updateTeamMemberRole
// ============================================================
describe('updateTeamMemberRole', () => {
  it('updates role of an existing member', async () => {
    setSingle({ id: 'member-uuid', role: 'manager' });

    const result = await updateTeamMemberRole('restaurant-uuid-123', 'member-uuid', 'manager');
    expect(result.success).toBe(true);
  });

  it('rejects invalid role', async () => {
    await expect(
      updateTeamMemberRole('r-id', 'member-id', 'superadmin')
    ).rejects.toThrow('Invalid role');
  });
});

// ============================================================
// removeTeamMember
// ============================================================
describe('removeTeamMember', () => {
  it('sets status to inactive (soft delete)', async () => {
    setSingle({ id: 'member-uuid', status: 'inactive' });

    const result = await removeTeamMember('restaurant-uuid-123', 'member-uuid');
    expect(result.success).toBe(true);
  });
});

// ============================================================
// acceptInvite
// ============================================================
describe('acceptInvite', () => {
  it('returns error for invalid token', async () => {
    setSingle(null, { message: 'not found' });

    const result = await acceptInvite('bad-token', 'user-uuid');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/invalid|expired/i);
  });

  it('returns error for expired token', async () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    setSingle({ id: 'invite-id', restaurant_id: 'r-id', invite_expires_at: yesterday, status: 'pending' });

    const result = await acceptInvite('expired-token', 'user-uuid');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/expired/i);
  });

  it('accepts a valid invite and links user_id', async () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    setSingle({ id: 'invite-id', restaurant_id: 'r-id', invite_expires_at: future, status: 'pending' });
    setSingle({ id: 'invite-id', user_id: 'user-uuid', status: 'active' });

    const result = await acceptInvite('valid-token', 'user-uuid');
    expect(result.success).toBe(true);
    expect(result.member.status).toBe('active');
  });
});

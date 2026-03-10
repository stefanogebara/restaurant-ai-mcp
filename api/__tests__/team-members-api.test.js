/**
 * Team Members & Invitations API endpoint tests
 */

process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key';
process.env.SUPABASE_ANON_KEY = 'fake-anon-key';
process.env.JWT_SECRET = 'test-secret';
process.env.CLIENT_URL = 'https://seatable.one';

const RESTAURANT_ID = 'rest-team-001';
const OWNER_USER = { sub: 'owner-uid', restaurant_id: RESTAURANT_ID, role: 'owner' };
const HOST_USER  = { sub: 'host-uid',  restaurant_id: RESTAURANT_ID, role: 'host'  };

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const mockGetTeamMembers      = jest.fn();
const mockAddTeamMember       = jest.fn();
const mockUpdateTeamMemberRole = jest.fn();
const mockRemoveTeamMember    = jest.fn();
const mockAcceptInvite        = jest.fn();
const mockSupabaseAdminQuery  = jest.fn();

jest.mock('../_lib/supabase', () => ({
  getTeamMembers:       mockGetTeamMembers,
  addTeamMember:        mockAddTeamMember,
  updateTeamMemberRole: mockUpdateTeamMemberRole,
  removeTeamMember:     mockRemoveTeamMember,
  acceptInvite:         mockAcceptInvite,
  supabaseAdmin: {
    schema: jest.fn().mockReturnThis(),
    from:   jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq:     jest.fn().mockReturnThis(),
    single: mockSupabaseAdminQuery,
  },
}));

const mockVerifyAuth = jest.fn();
jest.mock('../_lib/auth', () => ({ verifyAuth: mockVerifyAuth }));

jest.mock('../_lib/email', () => ({
  sendInviteEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../_lib/sentry', () => ({
  initSentry:       jest.fn(),
  captureException: jest.fn(),
  captureMessage:   jest.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function mockReq(method, body = {}, query = {}, headers = {}) {
  return { method, body, query, headers };
}
function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  res.end    = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockVerifyAuth.mockResolvedValue({ user: OWNER_USER });
});

// ---------------------------------------------------------------------------
// Load handlers after mocks are set up
// ---------------------------------------------------------------------------
const teamMembersHandler = require('../team-members');
const invitationsHandler = require('../invitations');

// ============================================================
// GET /api/team-members
// ============================================================
describe('GET /api/team-members', () => {
  it('returns 401 without auth', async () => {
    mockVerifyAuth.mockResolvedValueOnce({ error: 'Unauthorized', status: 401 });
    const res = mockRes();
    await teamMembersHandler(mockReq('GET'), res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns member list for authenticated user', async () => {
    mockGetTeamMembers.mockResolvedValueOnce({
      success: true,
      members: [{ id: '1', email: 'host@test.com', role: 'host', status: 'active' }],
    });
    const res = mockRes();
    await teamMembersHandler(mockReq('GET'), res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, members: expect.any(Array) })
    );
  });
});

// ============================================================
// POST /api/team-members
// ============================================================
describe('POST /api/team-members', () => {
  it('returns 403 for non-owner role', async () => {
    mockVerifyAuth.mockResolvedValueOnce({ user: HOST_USER });
    const res = mockRes();
    await teamMembersHandler(mockReq('POST', { email: 'x@x.com', role: 'host' }), res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('returns 400 when email or role missing', async () => {
    const res = mockRes();
    await teamMembersHandler(mockReq('POST', { email: 'x@x.com' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('invites a new member (owner)', async () => {
    mockAddTeamMember.mockResolvedValueOnce({
      success: true,
      member: { id: 'm1', email: 'h@t.com', invite_token: 'tok123', status: 'pending' },
    });
    const res = mockRes();
    await teamMembersHandler(mockReq('POST', { email: 'h@t.com', role: 'host' }), res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

// ============================================================
// PATCH /api/team-members
// ============================================================
describe('PATCH /api/team-members', () => {
  it('updates a member role', async () => {
    mockUpdateTeamMemberRole.mockResolvedValueOnce({
      success: true,
      member: { id: 'm1', role: 'manager' },
    });
    const res = mockRes();
    await teamMembersHandler(mockReq('PATCH', { memberId: 'm1', role: 'manager' }), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

// ============================================================
// DELETE /api/team-members
// ============================================================
describe('DELETE /api/team-members', () => {
  it('removes a member', async () => {
    mockRemoveTeamMember.mockResolvedValueOnce({ success: true, member: { id: 'm1' } });
    const res = mockRes();
    await teamMembersHandler(mockReq('DELETE', { memberId: 'm1' }), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('returns 400 when memberId missing', async () => {
    const res = mockRes();
    await teamMembersHandler(mockReq('DELETE', {}), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ============================================================
// GET /api/invitations?token=
// ============================================================
describe('GET /api/invitations', () => {
  it('returns 400 when token missing', async () => {
    const res = mockRes();
    await invitationsHandler(mockReq('GET', {}, {}), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns invite details for valid token', async () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    mockSupabaseAdminQuery.mockResolvedValueOnce({
      data: { email: 'host@test.com', role: 'host', invite_expires_at: future },
      error: null,
    });
    const res = mockRes();
    await invitationsHandler(mockReq('GET', {}, { token: 'valid-tok' }), res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, email: 'host@test.com', role: 'host' })
    );
  });

  it('returns 410 for expired token', async () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    mockSupabaseAdminQuery.mockResolvedValueOnce({
      data: { email: 'h@t.com', role: 'host', invite_expires_at: past },
      error: null,
    });
    const res = mockRes();
    await invitationsHandler(mockReq('GET', {}, { token: 'expired-tok' }), res);
    expect(res.status).toHaveBeenCalledWith(410);
  });
});

// ============================================================
// POST /api/invitations
// ============================================================
describe('POST /api/invitations', () => {
  it('returns 401 without auth', async () => {
    mockVerifyAuth.mockResolvedValueOnce({ error: 'Unauthorized', status: 401 });
    const res = mockRes();
    await invitationsHandler(mockReq('POST', { token: 'tok' }), res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 400 for missing token', async () => {
    const res = mockRes();
    await invitationsHandler(mockReq('POST', {}), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('accepts a valid invite', async () => {
    mockAcceptInvite.mockResolvedValueOnce({
      success: true,
      member: { id: 'm1', restaurant_id: RESTAURANT_ID, status: 'active' },
    });
    const res = mockRes();
    await invitationsHandler(mockReq('POST', { token: 'valid-tok' }), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

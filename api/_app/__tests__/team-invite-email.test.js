const mockSend = jest.fn();

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send: mockSend } })),
}));

process.env.RESEND_API_KEY = 're_test_team_invite';

const { sendInviteEmail } = require('../_lib/email');

const invite = {
  to: 'host@example.com',
  inviteUrl: 'https://seatable.one/join?token=test',
  role: 'host',
};

beforeEach(() => mockSend.mockReset());

test('reports provider acceptance only when Resend returns an email id', async () => {
  mockSend.mockResolvedValueOnce({ data: { id: 'email-1' }, error: null });
  expect(await sendInviteEmail(invite)).toEqual({ accepted: true });
});

test('does not claim success when Resend returns an error', async () => {
  mockSend.mockResolvedValueOnce({ data: null, error: { message: 'rejected' } });
  expect(await sendInviteEmail(invite)).toEqual({ accepted: false });
});

test('does not claim success when provider throws or gives no receipt', async () => {
  mockSend.mockRejectedValueOnce(new Error('offline'));
  mockSend.mockResolvedValueOnce({ data: null, error: null });
  expect(await sendInviteEmail(invite)).toEqual({ accepted: false });
  expect(await sendInviteEmail(invite)).toEqual({ accepted: false });
});

const { issueBookingToken, verifyBookingToken, WINDOW_SECONDS } = require('../_lib/booking-token');

const originalSecret = process.env.BOOKING_HMAC_SECRET;

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-11-18T10:00:00Z'));
  process.env.BOOKING_HMAC_SECRET = 'synthetic-booking-token-test-key';
});

afterEach(() => {
  jest.useRealTimers();
  if (originalSecret === undefined) delete process.env.BOOKING_HMAC_SECRET;
  else process.env.BOOKING_HMAC_SECRET = originalSecret;
});

test('accepts an issued token in the current and previous tenant window only', () => {
  const token = issueBookingToken('restaurant-a');
  expect(verifyBookingToken('restaurant-a', token)).toBe(true);
  expect(verifyBookingToken('restaurant-b', token)).toBe(false);
  jest.advanceTimersByTime(WINDOW_SECONDS * 1000);
  expect(verifyBookingToken('restaurant-a', token)).toBe(true);
  jest.advanceTimersByTime(WINDOW_SECONDS * 1000);
  expect(verifyBookingToken('restaurant-a', token)).toBe(false);
});

test('rejects malformed tokens and a missing signing secret', () => {
  const token = issueBookingToken('restaurant-a');
  expect(verifyBookingToken('restaurant-a', token + '!')).toBe(false);
  expect(verifyBookingToken('restaurant-a', { token })).toBe(false);
  delete process.env.BOOKING_HMAC_SECRET;
  expect(verifyBookingToken('restaurant-a', token)).toBe(false);
});

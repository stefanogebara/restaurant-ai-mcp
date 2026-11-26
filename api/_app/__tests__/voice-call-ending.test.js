/**
 * end_call on the Fly voice server.
 *
 * 24/11/2026, real Twilio call: the AI said goodbye and called end_call, but
 * the server did not offer or run that tool ("Unknown tool call: end_call"),
 * so the line stayed open until the caller hung up.
 *
 * 25/11/2026, real Twilio call: the line closed about 9 s after the booking,
 * while the caller was still saying "Sim, confirmo". Two causes:
 * - the fallback timer was a fixed 8 s, but OpenAI sends audio faster than
 *   Twilio plays it, so more than 8 s of goodbye could still be waiting;
 * - when the caller speaks we send Twilio "clear", and Twilio then returns
 *   every waiting mark at once — the end_call mark too — so the server took
 *   it as "goodbye played" and closed the stream.
 */
const {
  requestHangup, handleHangupMark, cancelHangup, trackOutgoingAudio, clearPlayback,
  END_CALL_MARK, HANGUP_MARGIN_MS, HANGUP_MAX_WAIT_MS,
} = require('../_voice-server/call-ending');

function fakeWs() { return { readyState: 1, close: jest.fn(function () { this.readyState = 3; }) }; }
const markSent = (send) => send.mock.calls.map(([m]) => m).filter((m) => m.event === 'mark');
const lastMark = (send) => markSent(send).at(-1).mark.name;

beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date('2026-11-26T12:00:00Z')); });
afterEach(() => jest.useRealTimers());

it('asks Twilio for a mark after the goodbye audio and does not close yet', () => {
  const ws = fakeWs(), send = jest.fn(), session = { streamSid: 'MZ1' };
  requestHangup(ws, session, send);
  expect(markSent(send)).toHaveLength(1);
  expect(markSent(send)[0]).toMatchObject({ event: 'mark', streamSid: 'MZ1' });
  expect(lastMark(send).startsWith(END_CALL_MARK)).toBe(true);
  expect(ws.close).not.toHaveBeenCalled();
});

it('closes the stream when Twilio has played the goodbye (Twilio then hangs up)', () => {
  const ws = fakeWs(), send = jest.fn(), session = { streamSid: 'MZ1' };
  requestHangup(ws, session, send);
  handleHangupMark(ws, session, 'other-mark');
  expect(ws.close).not.toHaveBeenCalled();
  handleHangupMark(ws, session, lastMark(send));
  expect(ws.close).toHaveBeenCalledWith(1000, 'Call ended by agent');
  jest.advanceTimersByTime(HANGUP_MAX_WAIT_MS);
  expect(ws.close).toHaveBeenCalledTimes(1);
});

it('the fallback timer waits for all queued goodbye audio, not a fixed 8 s', () => {
  const ws = fakeWs(), session = { streamSid: 'MZ1' };
  // 12 s of mulaw 8 kHz audio sent in one burst, faster than real time.
  trackOutgoingAudio(session, 12 * 8000);
  requestHangup(ws, session, jest.fn());
  jest.advanceTimersByTime(12000);
  expect(ws.close).not.toHaveBeenCalled();
  jest.advanceTimersByTime(HANGUP_MARGIN_MS);
  expect(ws.close).toHaveBeenCalledWith(1000, 'Call ended by agent');
});

it('with no audio waiting, the fallback is only the margin', () => {
  const ws = fakeWs(), session = { streamSid: 'MZ1' };
  requestHangup(ws, session, jest.fn());
  jest.advanceTimersByTime(HANGUP_MARGIN_MS - 1);
  expect(ws.close).not.toHaveBeenCalled();
  jest.advanceTimersByTime(1);
  expect(ws.close).toHaveBeenCalled();
});

it('the fallback never waits longer than the maximum', () => {
  const ws = fakeWs(), session = { streamSid: 'MZ1' };
  trackOutgoingAudio(session, 600 * 8000);
  requestHangup(ws, session, jest.fn());
  jest.advanceTimersByTime(HANGUP_MAX_WAIT_MS);
  expect(ws.close).toHaveBeenCalled();
});

it('audio played in the past does not count as waiting', () => {
  const ws = fakeWs(), session = { streamSid: 'MZ1' };
  trackOutgoingAudio(session, 5 * 8000);
  jest.advanceTimersByTime(10000);
  requestHangup(ws, session, jest.fn());
  jest.advanceTimersByTime(HANGUP_MARGIN_MS);
  expect(ws.close).toHaveBeenCalled();
});

it('audio sent after end_call moves the mark behind it', () => {
  const ws = fakeWs(), send = jest.fn(), session = { streamSid: 'MZ1' };
  requestHangup(ws, session, send);
  const first = lastMark(send);
  trackOutgoingAudio(session, 4 * 8000, { ws, send });
  const second = lastMark(send);
  expect(second).not.toBe(first);
  handleHangupMark(ws, session, first);
  expect(ws.close).not.toHaveBeenCalled();
  handleHangupMark(ws, session, second);
  expect(ws.close).toHaveBeenCalled();
});

it('the caller talking cancels the hang-up; the mark Twilio returns after "clear" closes nothing', () => {
  const ws = fakeWs(), send = jest.fn(), session = { streamSid: 'MZ1' };
  trackOutgoingAudio(session, 6 * 8000);
  requestHangup(ws, session, send);
  const mark = lastMark(send);
  expect(cancelHangup(session)).toBe(true);
  clearPlayback(session);
  handleHangupMark(ws, session, mark); // Twilio echoes cleared marks at once
  jest.advanceTimersByTime(HANGUP_MAX_WAIT_MS);
  expect(ws.close).not.toHaveBeenCalled();
});

it('after a cancelled hang-up, the next end_call works again', () => {
  const ws = fakeWs(), send = jest.fn(), session = { streamSid: 'MZ1' };
  requestHangup(ws, session, send);
  const old = lastMark(send);
  cancelHangup(session);
  requestHangup(ws, session, send);
  const fresh = lastMark(send);
  expect(fresh).not.toBe(old);
  handleHangupMark(ws, session, old);
  expect(ws.close).not.toHaveBeenCalled();
  handleHangupMark(ws, session, fresh);
  expect(ws.close).toHaveBeenCalled();
});

it('cancelling with nothing pending reports false', () => {
  expect(cancelHangup({ streamSid: 'MZ1' })).toBe(false);
});

it('a second end_call does not send a second mark', () => {
  const ws = fakeWs(), send = jest.fn(), session = { streamSid: 'MZ1' };
  requestHangup(ws, session, send); requestHangup(ws, session, send);
  expect(markSent(send)).toHaveLength(1);
});

it('a mark without a pending hang-up closes nothing', () => {
  const ws = fakeWs();
  handleHangupMark(ws, { streamSid: 'MZ1' }, END_CALL_MARK);
  handleHangupMark(ws, undefined, END_CALL_MARK);
  expect(ws.close).not.toHaveBeenCalled();
});

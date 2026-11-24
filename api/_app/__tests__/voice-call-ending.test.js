/**
 * end_call on the Fly voice server.
 *
 * 24/11/2026, real Twilio call: the AI said goodbye and called end_call, but
 * the server did not offer or run that tool ("Unknown tool call: end_call"),
 * so the line stayed open until the caller hung up.
 */
const { requestHangup, handleHangupMark, END_CALL_MARK } = require('../_voice-server/call-ending');

function fakeWs() { return { readyState: 1, close: jest.fn(function () { this.readyState = 3; }) }; }

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it('asks Twilio for a mark after the goodbye audio and does not close yet', () => {
  const ws = fakeWs(), send = jest.fn(), session = { streamSid: 'MZ1' };
  requestHangup(ws, session, send);
  expect(send).toHaveBeenCalledWith({ event: 'mark', streamSid: 'MZ1', mark: { name: END_CALL_MARK } });
  expect(ws.close).not.toHaveBeenCalled();
});

it('closes the stream when Twilio has played the goodbye (Twilio then hangs up)', () => {
  const ws = fakeWs(), session = { streamSid: 'MZ1' };
  requestHangup(ws, session, jest.fn());
  handleHangupMark(ws, session, 'other-mark');
  expect(ws.close).not.toHaveBeenCalled();
  handleHangupMark(ws, session, END_CALL_MARK);
  expect(ws.close).toHaveBeenCalledWith(1000, 'Call ended by agent');
  jest.advanceTimersByTime(20000);
  expect(ws.close).toHaveBeenCalledTimes(1);
});

it('still hangs up when Twilio never echoes the mark', () => {
  const ws = fakeWs(), session = { streamSid: 'MZ1' };
  requestHangup(ws, session, jest.fn(), 8000);
  jest.advanceTimersByTime(7999);
  expect(ws.close).not.toHaveBeenCalled();
  jest.advanceTimersByTime(1);
  expect(ws.close).toHaveBeenCalledWith(1000, 'Call ended by agent');
});

it('a second end_call does not send a second mark', () => {
  const ws = fakeWs(), send = jest.fn(), session = { streamSid: 'MZ1' };
  requestHangup(ws, session, send); requestHangup(ws, session, send);
  expect(send).toHaveBeenCalledTimes(1);
});

it('a mark without a pending hang-up closes nothing', () => {
  const ws = fakeWs();
  handleHangupMark(ws, { streamSid: 'MZ1' }, END_CALL_MARK);
  handleHangupMark(ws, undefined, END_CALL_MARK);
  expect(ws.close).not.toHaveBeenCalled();
});

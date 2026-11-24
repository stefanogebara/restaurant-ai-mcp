/**
 * Hang-up for the Fly voice server (end_call tool).
 *
 * The AI says goodbye, then calls end_call. Twilio may still be playing that
 * goodbye, so we send a mark and close the media stream only when Twilio
 * echoes it (the audio before it has played). The TwiML has nothing after
 * <Connect>, so Twilio hangs up when the stream closes. A timer closes the
 * stream if the mark never comes back.
 */

const END_CALL_MARK = 'end_call';
const HANGUP_TIMEOUT_MS = 8000;
const WS_OPEN = 1;

function closeForHangup(ws, session) {
  clearTimeout(session.hangupTimer);
  session.hangupTimer = null;
  if (ws.readyState === WS_OPEN) ws.close(1000, 'Call ended by agent');
}

function requestHangup(ws, session, send, timeoutMs = HANGUP_TIMEOUT_MS) {
  if (session.hangupRequested) return;
  session.hangupRequested = true;
  send({ event: 'mark', streamSid: session.streamSid, mark: { name: END_CALL_MARK } });
  session.hangupTimer = setTimeout(() => closeForHangup(ws, session), timeoutMs);
}

function handleHangupMark(ws, session, markName) {
  if (!session?.hangupRequested || markName !== END_CALL_MARK || !session.hangupTimer) return;
  closeForHangup(ws, session);
}

module.exports = { requestHangup, handleHangupMark, END_CALL_MARK, HANGUP_TIMEOUT_MS };

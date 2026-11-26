/**
 * Hang-up for the Fly voice server (end_call tool).
 *
 * The AI says goodbye, then calls end_call. Twilio may still be playing that
 * goodbye, so we send a mark and close the media stream only when Twilio
 * echoes it (the audio before it has played). The TwiML has nothing after
 * <Connect>, so Twilio hangs up when the stream closes.
 *
 * Real call, 25/11/2026: the line closed while the caller was still talking.
 * - OpenAI sends audio faster than Twilio plays it, so at end_call many
 *   seconds of goodbye can still be waiting. The fallback timer (for a mark
 *   that never comes back) was a fixed 8 s; it now waits for the audio still
 *   queued, plus a margin, up to a maximum.
 * - When the caller speaks we send Twilio "clear", and Twilio returns every
 *   waiting mark at once. The end_call mark then looked like "goodbye
 *   played". Now the caller talking cancels the hang-up (the AI answers and
 *   can call end_call again), and each mark has its own name, so an old mark
 *   closes nothing.
 */

const { createSecureLogger } = require('../_lib/secure-logger');

const logger = createSecureLogger('VoiceCallEnding');
const END_CALL_MARK = 'end_call';
const HANGUP_MARGIN_MS = 2000;
const HANGUP_MAX_WAIT_MS = 30000;
const MULAW_BYTES_PER_MS = 8; // Twilio media: mulaw, 8 kHz, 1 byte per sample
const WS_OPEN = 1;

function queuedAudioMs(session, now = Date.now()) {
  return Math.max(0, (session.playbackEndsAt || 0) - now);
}

function closeForHangup(ws, session, reason) {
  logger.info('Hang-up: closing stream', { streamSid: session.streamSid, reason });
  clearTimeout(session.hangupTimer);
  session.hangupTimer = null;
  session.hangupMark = null;
  if (ws.readyState === WS_OPEN) ws.close(1000, 'Call ended by agent');
}

// Send a fresh mark behind the audio queued so far and (re)arm the fallback.
function armHangup(ws, session, send) {
  session.hangupCount = (session.hangupCount || 0) + 1;
  session.hangupMark = `${END_CALL_MARK}_${session.hangupCount}`;
  send({ event: 'mark', streamSid: session.streamSid, mark: { name: session.hangupMark } });
  clearTimeout(session.hangupTimer);
  const wait = Math.min(queuedAudioMs(session) + HANGUP_MARGIN_MS, HANGUP_MAX_WAIT_MS);
  session.hangupTimer = setTimeout(() => closeForHangup(ws, session, 'timer'), wait);
  logger.info('Hang-up armed', { streamSid: session.streamSid, mark: session.hangupMark, fallbackMs: Math.round(wait) });
}

function requestHangup(ws, session, send) {
  if (session.hangupRequested) return;
  session.hangupRequested = true;
  session.hangupWs = ws;
  session.hangupSend = send;
  armHangup(ws, session, send);
}

/**
 * Record audio sent to Twilio. If a hang-up is pending, audio sent after it
 * would play after the mark, so the mark moves behind it.
 */
function trackOutgoingAudio(session, bytes, { ws, send } = {}) {
  const now = Date.now();
  session.playbackEndsAt = Math.max(session.playbackEndsAt || 0, now) + bytes / MULAW_BYTES_PER_MS;
  if (session.hangupRequested && session.hangupMark) {
    armHangup(ws || session.hangupWs, session, send || session.hangupSend);
  }
}

// After "clear", nothing is waiting to play any more.
function clearPlayback(session) {
  session.playbackEndsAt = Date.now();
}

/** The caller started talking: do not hang up on them. Returns true if a hang-up was pending. */
function cancelHangup(session) {
  if (!session?.hangupRequested) return false;
  clearTimeout(session.hangupTimer);
  session.hangupTimer = null;
  session.hangupMark = null;
  session.hangupRequested = false;
  return true;
}

function handleHangupMark(ws, session, markName) {
  if (!session?.hangupRequested || !session.hangupMark || markName !== session.hangupMark) return;
  closeForHangup(ws, session, 'mark');
}

module.exports = {
  requestHangup, handleHangupMark, cancelHangup, trackOutgoingAudio, clearPlayback, queuedAudioMs,
  END_CALL_MARK, HANGUP_MARGIN_MS, HANGUP_MAX_WAIT_MS,
};

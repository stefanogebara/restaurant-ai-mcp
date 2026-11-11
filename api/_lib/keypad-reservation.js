'use strict';

const twilio = require('twilio');

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const ACCOUNT = /^AC[a-f0-9]{32}$/i;
const CALL = /^CA[a-f0-9]{32}$/i;
const PHONE = /^\+[1-9][0-9]{7,14}$/;
const PHASE = new Set(['read', 'arm', 'result', 'end']);
const TERMINAL_CALL = new Set(['completed', 'busy', 'failed', 'no-answer', 'canceled']);

function callbackUrl(origin, id, phase) {
  if (!UUID.test(id) || !PHASE.has(phase)) throw new Error('Invalid keypad callback');
  return new URL('/keypad-reservation/' + id + '/' + phase, origin).href;
}

function speak(response, message) {
  response.say({ language: 'pt-BR' }, message);
}

function render(origin, id, phase, reply) {
  const response = new twilio.twiml.VoiceResponse();
  if (phase === 'read' && reply.state === 'reading' && typeof reply.readback === 'string') {
    speak(response, reply.readback);
    response.redirect({ method: 'POST' }, callbackUrl(origin, id, 'arm'));
    return response.toString();
  }
  if (phase === 'arm' && reply.state === 'armed') {
    response.gather({
      input: 'dtmf', numDigits: 1, finishOnKey: '',
      timeout: 8, actionOnEmptyResult: true, method: 'POST', action: callbackUrl(origin, id, 'result'),
    });
    return response.toString();
  }
  const message = {
    committed: 'A alteração foi confirmada.',
    no_change: 'A reserva permaneceu como estava.',
    conflict: 'A reserva mudou desde a leitura. Consulte os dados antes de tentar novamente.',
    unavailable: 'Não foi possível aplicar a alteração. Consulte sua reserva pelo portal.',
  }[reply.state] || 'Não foi possível confirmar a solicitação. Consulte sua reserva pelo portal.';
  speak(response, message);
  response.hangup();
  return response.toString();
}

// The origin is configured at startup. A request Host or proxy header never
// controls the URL used to validate the provider signature or build callbacks.
function createKeypadHandler({ origin, accountSid, authToken, advance }) {
  const url = new URL(origin);
  if (url.protocol !== 'https:' || url.origin !== origin || !ACCOUNT.test(accountSid) ||
      typeof authToken !== 'string' || !authToken || typeof advance !== 'function') {
    throw new Error('Invalid keypad configuration');
  }
  return async function keypad(request) {
    if (request.method !== 'POST') return { status: 405 };
    const match = /^\/keypad-reservation\/([^/]+)\/([^/]+)$/.exec(request.path);
    if (!match || !UUID.test(match[1]) || !PHASE.has(match[2])) return { status: 404 };
    const [, id, phase] = match;
    const { body, signature } = request;
    if (!body || typeof signature !== 'string' || signature.length > 128 ||
        Object.values(body).some(value => typeof value !== 'string')) return { status: 403 };
    if (!twilio.validateRequest(authToken, signature, callbackUrl(origin, id, phase), body) ||
        body.AccountSid !== accountSid || !CALL.test(body.CallSid) ||
        !PHONE.test(body.From) || !PHONE.test(body.To)) return { status: 403 };
    if (phase === 'end' && !TERMINAL_CALL.has(body.CallStatus)) return { status: 204 };
    if (phase !== 'end' && body.CallStatus !== 'in-progress') return { status: 403 };
    if (phase !== 'result' && Object.hasOwn(body, 'Digits')) return { status: 403 };
    try {
      const reply = await advance({
        p_id: id, p_account_sid: accountSid, p_call_sid: body.CallSid,
        p_from: body.From, p_to: body.To, p_phase: phase, p_digit: body.Digits ?? null,
      });
      if (!reply || reply.state === 'denied') return { status: 403 };
      if (phase === 'end') return { status: 204, state: reply.state };
      return { status: 200, xml: render(origin, id, phase, reply), state: reply.state };
    } catch {
      // A transport failure can occur after a commit. Avoid promising that
      // nothing changed, and leave any repeat to the same durable action.
      return { status: 503 };
    }
  };
}

module.exports = { callbackUrl, createKeypadHandler };

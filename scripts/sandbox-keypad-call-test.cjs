'use strict';

/**
 * Ligações REAIS no sandbox para a confirmação por tecla iniciada pela
 * recepcionista. Atenção: cada cenário é uma ligação paga (Twilio + ElevenLabs),
 * de cerca de um minuto.
 *
 * O que cada cenário prova, com uma reserva descartável às 19h:
 *   confirm  — a recepcionista recebe o pedido por voz, chama a ferramenta, a
 *              ligação vai para a leitura, o teclado abre, a tecla 1 muda para 20h.
 *   refuse   — o mesmo caminho, a tecla 2 deixa a reserva inteira igual.
 *   hangup   — o mesmo caminho, o cliente desliga com o teclado aberto e a
 *              reserva fica inteira igual.
 *
 * O banco é um Postgres LOCAL descartável, nunca o Supabase. A recepcionista é
 * um agente temporário do ElevenLabs, criado e apagado por este roteiro. A linha
 * compartilhada e o agente compartilhado não são alterados.
 *
 * Como rodar (macOS, Postgres 16 do Homebrew e cloudflared instalados):
 *   1. export LC_ALL=C; D=$(mktemp -d /tmp/kp.XXXX)
 *      initdb -A trust -U keypad -D "$D/pg"
 *      pg_ctl -D "$D/pg" -o "-p 58952 -c listen_addresses='' -k $D" -l "$D/pg.log" start
 *      psql -X -q -v ON_ERROR_STOP=1 -h "$D" -p 58952 -U keypad -d postgres \
 *        -f scripts/_lib/sandbox-keypad-schema.sql \
 *        -f supabase/migrations/20261110180955_retain_guest_reservation_table_assignment.sql \
 *        -f supabase/migrations/20261111004327_sandbox_keypad_reservation_actions.sql
 *   2. cloudflared tunnel --url http://127.0.0.1:58955 --no-autoupdate
 *      (copie a origem https://….trycloudflare.com do log)
 *   3. vercel env pull "$D/provider.env" --environment=production --yes
 *      (precisa de TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN e ELEVENLABS_API_KEY)
 *   4. KEYPAD_ORIGIN=https://….trycloudflare.com KEYPAD_CALLER=+<número verificado no Twilio> \
 *      KEYPAD_PG_SOCKET="$D" KEYPAD_PG_PORT=58952 \
 *      node --env-file="$D/provider.env" scripts/sandbox-keypad-call-test.cjs [confirm] [refuse] [hangup]
 *   5. pg_ctl -D "$D/pg" -m fast stop; rm -rf "$D"  (o arquivo de chaves fica em $D)
 *
 * Opcional: KEYPAD_EVIDENCE=/caminho/absoluto.jsonl grava uma linha por cenário.
 * KEYPAD_AGENT_VERSION, KEYPAD_AGENT_BRANCH e KEYPAD_PHONE_SID trocam a versão
 * do agente compartilhado e o número esperados, se eles mudarem.
 */

const fs = require('node:fs');
const path = require('node:path');
const { createServer } = require('node:http');
const { randomUUID, randomBytes, timingSafeEqual } = require('node:crypto');
const { execFile } = require('node:child_process');
const assert = require('node:assert/strict');
const { setTimeout: delay } = require('node:timers/promises');

const { createKeypadHandler } = require('../api/_lib/keypad-reservation');
const { createKeypadReservationRequest, SANDBOX_RESTAURANT } = require('../api/_lib/keypad-reservation-request');
const { buildKeypadTool, instructions, TOOL_NAME, GRANT_HEADER, GRANT_VARIABLE } = require('./_lib/sandbox-keypad-receptionist.cjs');

const SANDBOX_TABLE = 'a61fb25d-70ae-44a7-a624-7c43aeed928d';
const CASES = Object.freeze({ confirm: 7, refuse: 8, hangup: 9 });
const SETUP_SQL = Object.freeze([
  'scripts/_lib/sandbox-keypad-schema.sql',
  'supabase/migrations/20261110180955_retain_guest_reservation_table_assignment.sql',
  'supabase/migrations/20261111004327_sandbox_keypad_reservation_actions.sql',
]);
const DEFAULTS = Object.freeze({
  pgUser: 'keypad',
  listenPort: '58955',
  agentVersion: 'agtvrsn_5501m73w1pvbe008wpf1krphz90r',
  agentBranch: 'agtbrch_3801ks1anwt6ey6a6mvmnjfvgg2e',
  phoneSid: 'PN1ff7986aad43df43fa5c497c01a025c7',
});
const WORDS = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];

// The error names the variable, never its value: some of them are secrets.
function parseConfig(env) {
  const read = (name, valid, fallback) => {
    const value = env[name] ?? fallback;
    if (typeof value !== 'string' || !value || value === '[Sensitive]' || !valid(value)) {
      throw new Error('Variável ausente ou inválida: ' + name);
    }
    return value;
  };
  const httpsOrigin = value => {
    try { const url = new URL(value); return url.protocol === 'https:' && url.origin === value; } catch { return false; }
  };
  return Object.freeze({
    accountSid: read('TWILIO_ACCOUNT_SID', v => /^AC[a-f0-9]{32}$/i.test(v)),
    authToken: read('TWILIO_AUTH_TOKEN', () => true),
    elevenLabsKey: read('ELEVENLABS_API_KEY', () => true),
    origin: read('KEYPAD_ORIGIN', httpsOrigin),
    caller: read('KEYPAD_CALLER', v => /^\+[1-9]\d{7,14}$/.test(v)),
    pgSocket: read('KEYPAD_PG_SOCKET', v => path.isAbsolute(v)),
    pgPort: read('KEYPAD_PG_PORT', v => /^\d{2,5}$/.test(v)),
    pgUser: read('KEYPAD_PG_USER', v => /^[a-z_][a-z0-9_]{0,62}$/.test(v), DEFAULTS.pgUser),
    listenPort: Number(read('KEYPAD_LISTEN_PORT', v => /^\d{2,5}$/.test(v), DEFAULTS.listenPort)),
    agentVersion: read('KEYPAD_AGENT_VERSION', v => /^agtvrsn_[a-z0-9]+$/.test(v), DEFAULTS.agentVersion),
    agentBranch: read('KEYPAD_AGENT_BRANCH', v => /^agtbrch_[a-z0-9]+$/.test(v), DEFAULTS.agentBranch),
    phoneSid: read('KEYPAD_PHONE_SID', v => /^PN[a-f0-9]{32}$/i.test(v), DEFAULTS.phoneSid),
    evidencePath: env.KEYPAD_EVIDENCE ? read('KEYPAD_EVIDENCE', v => path.isAbsolute(v)) : null,
  });
}

function parseCases(args) {
  const cases = args.length ? [...args] : Object.keys(CASES);
  if (new Set(cases).size !== cases.length || cases.some(kind => !Object.hasOwn(CASES, kind))) {
    throw new Error('Cenários válidos: confirm, refuse, hangup (sem repetir)');
  }
  return cases;
}

// Plain dictation of the prefix lost a letter in transcription. The letters go
// with helper words; the digits go in the groups that passed on real calls.
function receiptFor(last) {
  if (!Number.isInteger(last) || last < 0 || last > 9) throw new Error('Dígito final inválido');
  const say = groups => groups.map(group => [...group].map(digit => WORDS[digit]).join(' ')).join(', ');
  const suffix = ['123', '456', '789', '01' + last];
  return {
    code: 'RES-20261111-' + suffix.join(''),
    spoken: 'Meu código começa com erre de rato, e de escola, esse de sapo. Depois, hífen, ' +
      say(['2026', '11', '11']) + ', hífen, ' + say(suffix) + '.',
  };
}

const sqlText = value => value == null ? 'NULL' : "'" + String(value).replaceAll("'", "''") + "'";

async function until(check, timeout, label) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = await check();
    if (value) return value;
    await delay(350);
  }
  throw new Error('Tempo esgotado: ' + label);
}

async function main(argv = process.argv.slice(2), env = process.env) {
  const cases = parseCases(argv);
  const config = parseConfig(env);
  const twilio = require('twilio');
  const { createApi } = require('./sync-shared-voice-vocabulary.cjs');
  const { TARGET } = require('./_lib/shared-voice-vocabulary.cjs');
  const { origin, caller, accountSid: account } = config;
  const called = TARGET.phone;
  const client = twilio(account, config.authToken);
  const api = createApi(config.elevenLabsKey);

  function db(sql, asService = false) {
    return new Promise((resolve, reject) => {
      const text = (asService ? 'SET ROLE service_role; ' : '') + sql;
      execFile('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', config.pgSocket, '-p', config.pgPort,
        '-U', config.pgUser, '-d', 'postgres', '-c', text],
      { timeout: 9000 }, (error, out) => error ? reject(new Error('SQL local falhou: ' + error.code)) : resolve(out.trim()));
    });
  }
  async function advance(args) {
    const inputs = ['p_id', 'p_account_sid', 'p_call_sid', 'p_from', 'p_to', 'p_phase', 'p_digit'].map(key => sqlText(args[key]));
    return JSON.parse(await db('SELECT public.advance_keypad_reservation(' + inputs.join(',') + ')', true));
  }
  const row = async id => JSON.parse(await db('SELECT to_jsonb(r) FROM public.reservations r WHERE id=' + sqlText(id)));

  async function provider(apiPath, method = 'GET', data) {
    const response = await fetch('https://api.elevenlabs.io/v1' + apiPath, {
      method, headers: { 'xi-api-key': config.elevenLabsKey, 'content-type': 'application/json' },
      body: data ? JSON.stringify(data) : undefined, redirect: 'error', signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      let error;
      try { error = await response.json(); } catch { /* sem corpo */ }
      const detail = error?.detail;
      const safe = Array.isArray(detail) ? detail.map(e => ({ loc: e.loc, msg: e.msg })) : { status: detail?.status, message: detail?.message };
      throw new Error('ElevenLabs ' + method + ' ' + apiPath.split('?')[0] + ' ' + response.status + ' ' + JSON.stringify(safe));
    }
    if (response.status === 204) return null;
    return response.headers.get('content-type')?.includes('json') ? response.json() : response.text();
  }

  // The shared agent answers first. Only a leg that matches the provider's own
  // conversation metadata AND Twilio's call record is taken over.
  async function inboundFor(start) {
    const args = new URLSearchParams({ agent_id: TARGET.agentId, call_start_after_unix: String(Math.floor(start / 1000) - 2), page_size: '10' });
    const list = await provider('/convai/conversations?' + args);
    const docs = await Promise.all(list.conversations.filter(c => c.start_time_unix_secs * 1000 >= start - 2500)
      .map(c => provider('/convai/conversations/' + encodeURIComponent(c.conversation_id))));
    const scoped = docs.filter(c => c.agent_id === TARGET.agentId && c.version_id === config.agentVersion && c.status === 'in-progress' &&
      c.metadata?.phone_call?.type === 'twilio' && c.metadata.phone_call.direction === 'inbound' &&
      c.metadata.phone_call.external_number === caller && c.metadata.phone_call.agent_number === called);
    assert.ok(scoped.length <= 1, 'Mais de uma perna de entrada possível');
    if (!scoped.length) return null;
    const { call_sid: sid } = scoped[0].metadata.phone_call;
    assert.match(sid, /^CA[0-9a-f]{32}$/);
    const variable = scoped[0].conversation_initiation_client_data?.dynamic_variables?.system__call_sid;
    if (variable != null) assert.equal(variable, sid, 'O provedor discorda do CallSid');
    const leg = await client.calls(sid).fetch();
    assert.equal(leg.accountSid, account); assert.equal(leg.from, caller); assert.equal(leg.to, called);
    assert.equal(leg.direction, 'inbound'); assert.equal(leg.status, 'in-progress');
    assert.ok(Math.abs(+new Date(leg.dateCreated) - start) < 20000);
    return leg;
  }

  let active = null;
  let agentId = null;
  let toolId = null;
  const columns = 'id account_sid call_sid caller called restaurant_id reservation_code reservation_snapshot action changes readback expires_at'.split(' ');
  const prepare = createKeypadReservationRequest({
    origin,
    resolveGrant(grant) {
      if (!active?.booted || typeof grant !== 'string' || !/^[0-9a-f]{64}$/.test(grant)) return null;
      return timingSafeEqual(Buffer.from(grant), Buffer.from(active.grant)) ? active.context : null;
    },
    async readReservation(tenantId, code) {
      const values = JSON.parse(await db(`SELECT coalesce(jsonb_agg(to_jsonb(r)), '[]') FROM public.reservations r
        WHERE restaurant_id=${sqlText(tenantId)} AND reservation_id=${sqlText(code)}`));
      return values.length === 1 ? values[0] : null;
    },
    async persistAction(proposal) {
      const values = columns.map(col => sqlText(typeof proposal[col] === 'object' ? JSON.stringify(proposal[col]) : proposal[col]));
      const id = await db('INSERT INTO public.keypad_reservation_actions (' + columns.join(',') + ') VALUES (' + values.join(',') +
        ') ON CONFLICT (call_sid) DO NOTHING RETURNING id', true);
      if (id) Object.assign(active, { id, proposedTime: proposal.changes.time });
      return Boolean(id);
    },
    fetchCall: sid => client.calls(sid).fetch(),
    async redirectCall(sid, url) {
      const updated = await client.calls(sid).update({ url, method: 'POST' });
      assert.equal(updated.sid, sid);
      active.redirectedByTool = true;
    },
  });
  const handler = createKeypadHandler({ origin, accountSid: account, authToken: config.authToken, advance });

  const server = createServer(async (req, res) => {
    try {
      if (req.url === '/health' && req.method === 'GET') { res.writeHead(200).end('ready'); return; }
      if (req.method !== 'POST') { res.writeHead(405).end(); return; }
      const receivedAt = Date.now();
      let text = '';
      for await (const chunk of req) { text += chunk; if (text.length > 12000) { res.writeHead(413).end(); return; } }
      const type = String(req.headers['content-type']);
      if (req.url === '/tool') {
        if (!type.startsWith('application/json')) { res.writeHead(415).end(); return; }
        const body = JSON.parse(text);
        const outcome = await prepare(req.headers[GRANT_HEADER], body);
        if (active) active.tools.push({ at: receivedAt, state: outcome.state, receiptMatched: body?.reservation_id === active.code });
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(outcome));
        return;
      }
      if (!type.startsWith('application/x-www-form-urlencoded')) { res.writeHead(415).end(); return; }
      const params = new URLSearchParams(text);
      if (params.size !== new Set(params.keys()).size) { res.writeHead(403).end(); return; }
      const body = Object.fromEntries(params);
      const signature = req.headers['x-twilio-signature'];
      // One signed bootstrap per case moves the verified leg to the temporary
      // receptionist and hands it the grant the tool needs.
      if (active && req.url === '/start/' + active.bootstrap) {
        const c = active.context;
        if (active.booted || typeof signature !== 'string' ||
          !twilio.validateRequest(config.authToken, signature, origin + req.url, body) ||
          body.AccountSid !== account || body.CallSid !== c.callSid || body.From !== caller || body.To !== called ||
          body.CallStatus !== 'in-progress') { res.writeHead(403).end(); return; }
        const twiml = await provider('/convai/twilio/register-call', 'POST', {
          agent_id: agentId, from_number: caller, to_number: called, direction: 'inbound',
          conversation_initiation_client_data: { dynamic_variables: { [GRANT_VARIABLE]: active.grant } },
        });
        assert.equal(typeof twiml, 'string'); assert.match(twiml, /<Stream\b/);
        active.booted = Date.now();
        res.writeHead(200, { 'content-type': 'text/xml', 'cache-control': 'no-store' }).end(twiml);
        return;
      }
      const result = await handler({ method: req.method, path: req.url, body, signature });
      if (active?.id && req.url.startsWith('/keypad-reservation/' + active.id + '/') && result.state) {
        const observed = await row(active.reservation);
        active.events.push({ phase: req.url.split('/').at(-1), digit: params.get('Digits'), state: result.state, receivedAt,
          at: Date.now(), bookingTime: observed.time, status: observed.status,
          unchanged: JSON.stringify(observed) === JSON.stringify(active.before) });
      }
      res.writeHead(result.status, { 'content-type': 'text/xml', 'cache-control': 'no-store' }).end(result.xml);
    } catch (error) {
      console.error('Erro no callback', error.message);
      if (!res.headersSent) res.writeHead(503).end();
    }
  });

  async function qaConversation(start) {
    const query = new URLSearchParams({ agent_id: agentId, call_start_after_unix: String(Math.floor(start / 1000) - 1), page_size: '10' });
    const matches = (await provider('/convai/conversations?' + query)).conversations.filter(c => c.start_time_unix_secs * 1000 >= start - 1000);
    assert.ok(matches.length <= 1, 'Mais de uma conversa de QA no mesmo cenário');
    return matches[0] ? provider('/convai/conversations/' + matches[0].conversation_id) : null;
  }

  async function runCase(kind) {
    const reservation = randomUUID();
    const { code, spoken } = receiptFor(CASES[kind]);
    await db(`INSERT INTO public.reservations (id,restaurant_id,reservation_id,customer_phone,customer_name,date,time,party_size,status,table_ids)
      VALUES (${sqlText(reservation)},${sqlText(SANDBOX_RESTAURANT)},${sqlText(code)},${sqlText(caller)},'Reserva de teste',
      CURRENT_DATE+${CASES[kind]},'19:00',2,'confirmed',ARRAY[${sqlText(SANDBOX_TABLE)}]::uuid[])`);
    const before = await row(reservation);
    const started = Date.now();
    active = { reservation, code, before, bootstrap: randomUUID(), grant: randomBytes(32).toString('hex'), events: [], tools: [] };
    let outgoing;
    let inbound;
    try {
      assert.equal((await client.calls.list({ to: called, status: 'in-progress', limit: 3 })).length, 0, 'A linha do sandbox já está em uso');
      // The outgoing leg plays the guest: silence first, then speech and keys.
      outgoing = await client.calls.create({ from: caller, to: called, timeLimit: 110, timeout: 20, twiml: '<Response><Pause length="95"/></Response>' });
      inbound = await until(() => inboundFor(started), 24000, 'perna de entrada verificada');
      assert.notEqual(inbound.sid, outgoing.sid);
      active.context = { restaurantId: SANDBOX_RESTAURANT, accountSid: account, callSid: inbound.sid, caller, called };
      await client.calls(inbound.sid).update({ url: origin + '/start/' + active.bootstrap, method: 'POST' });
      await until(() => active.booted, 15000, 'início assinado da recepcionista de QA');
      const qa = await until(async () => {
        const c = await qaConversation(active.booted);
        return c?.status === 'in-progress' ? c : null;
      }, 18000, 'recepcionista de QA atendendo');
      console.log(kind, 'recepcionista conectada', qa.conversation_id);

      const guest = new twilio.twiml.VoiceResponse();
      guest.pause({ length: 4 });
      guest.say({ language: 'pt-BR' }, 'Quero mudar minha reserva para as vinte horas, no mesmo dia. ' + spoken);
      guest.pause({ length: 45 });
      await client.calls(outgoing.sid).update({ twiml: guest.toString() });

      const reading = await until(() => active.events.find(e => e.phase === 'read'), 35000, 'ferramenta iniciou a leitura');
      assert.ok(active.redirectedByTool);
      assert.equal(active.proposedTime, '20:00');
      assert.equal(reading.state, 'reading'); assert.equal(reading.unchanged, true);
      const armed = await until(() => active.events.find(e => e.phase === 'arm'), 32000, 'leitura terminou e teclado abriu');
      assert.equal(armed.state, 'armed'); assert.equal(armed.unchanged, true);
      assert.ok(armed.receivedAt - reading.at > 3000, 'O teclado abriu antes da leitura terminar');

      if (kind === 'hangup') {
        await client.calls(outgoing.sid).update({ status: 'completed' });
        await until(async () => {
          const leg = await client.calls(inbound.sid).fetch();
          return leg.status === 'completed' ? leg : null;
        }, 18000, 'ligação encerrada');
        assert.ok(!active.events.some(e => e.phase === 'result'), 'Chegou tecla depois do desligamento');
        // In production Twilio's status callback sends this; here the run does.
        await advance({ p_id: active.id, p_account_sid: account, p_call_sid: inbound.sid, p_from: caller, p_to: called, p_phase: 'end', p_digit: null });
      } else {
        const digit = kind === 'confirm' ? '1' : '2';
        await delay(650);
        await client.calls(outgoing.sid).update({ twiml: '<Response><Play digits="' + digit + '"/><Pause length="15"/></Response>' });
        const result = await until(() => active.events.find(e => e.phase === 'result'), 18000, 'resultado da tecla');
        assert.equal(result.state, kind === 'confirm' ? 'committed' : 'no_change');
        assert.equal(result.digit, digit);
      }

      const after = await row(reservation);
      if (kind === 'confirm') assert.deepEqual({ ...after, time: before.time, updated_at: before.updated_at }, before);
      else assert.deepEqual(after, before);
      assert.equal(after.time, kind === 'confirm' ? '20:00:00' : '19:00:00');
      const state = await db('SELECT state FROM public.keypad_reservation_actions WHERE id=' + sqlText(active.id));
      assert.equal(state, kind === 'confirm' ? 'committed' : 'no_change');
      assert.ok(active.tools.some(e => e.receiptMatched && e.state === 'awaiting_keypad'), 'A ferramenta não recebeu o recibo exato');
      const details = await until(async () => {
        const c = await provider('/convai/conversations/' + qa.conversation_id);
        return c.transcript?.some(t => t.tool_calls?.some(call => call.tool_name === TOOL_NAME)) ? c : null;
      }, 10000, 'chamada da ferramenta na transcrição').catch(() => null);
      const evidence = { kind, conversation: qa.conversation_id, providerTranscriptToolCall: Boolean(details), realTwilioCall: true,
        toolName: TOOL_NAME, toolRedirectedCall: true, before: before.time, after: after.time, state, events: active.events };
      if (config.evidencePath) fs.appendFileSync(config.evidencePath, JSON.stringify(evidence) + '\n', { mode: 0o600 });
      console.log(JSON.stringify(evidence));
    } catch (error) {
      console.error('Cenário', kind, 'eventos', active.events, 'ferramenta', active.tools);
      if (active.booted) {
        if (inbound) await client.calls(inbound.sid).update({ status: 'completed' }).catch(() => {});
        await delay(3500);
        const c = await qaConversation(active.booted).catch(() => null);
        if (c) console.error('Transcrição', JSON.stringify(c.transcript?.map(t => ({ role: t.role, text: t.message, tools: t.tool_calls?.map(x => x.tool_name) }))));
      }
      throw error;
    } finally {
      for (const leg of [outgoing, inbound].filter(Boolean)) {
        const status = await client.calls(leg.sid).fetch().then(c => c.status).catch(() => null);
        if (status === 'in-progress') await client.calls(leg.sid).update({ status: 'completed' }).catch(() => {});
      }
      if (inbound) await db('DELETE FROM public.keypad_reservation_actions WHERE call_sid=' + sqlText(inbound.sid));
      await db('DELETE FROM public.reservations WHERE id=' + sqlText(reservation));
      active = null;
    }
  }

  try {
    // Refuse to call anything before the account, number, caller and shared
    // agent are exactly the ones the evidence was collected on.
    assert.equal(await api.getWorkspaceId(), TARGET.workspaceId);
    const [accountRecord, number, callerIds, shared] = await Promise.all([
      client.api.v2010.accounts(account).fetch(),
      client.incomingPhoneNumbers(config.phoneSid).fetch(),
      client.outgoingCallerIds.list({ phoneNumber: caller, limit: 5 }),
      api.getAgent(config.agentBranch),
    ]);
    assert.equal(accountRecord.sid, account); assert.equal(accountRecord.status, 'active');
    assert.ok(!/inner/i.test(accountRecord.friendlyName), 'Conta Twilio de outra organização');
    assert.equal(number.accountSid, account); assert.equal(number.phoneNumber, called);
    assert.equal(number.voiceUrl, 'https://api.elevenlabs.io/twilio/inbound_call');
    assert.ok(callerIds.some(id => id.phoneNumber === caller && id.accountSid === account), 'KEYPAD_CALLER não é um número verificado no Twilio');
    assert.equal(shared.version_id, config.agentVersion, 'O agente compartilhado mudou de versão');

    await new Promise(resolve => server.listen(config.listenPort, '127.0.0.1', resolve));
    await until(async () => {
      try { return (await fetch(origin + '/health', { signal: AbortSignal.timeout(3000) })).ok; } catch { return false; }
    }, 15000, 'túnel até o servidor local');

    const tool = await provider('/convai/tools', 'POST', { tool_config: buildKeypadTool(origin) });
    assert.ok(tool.id); toolId = tool.id;
    const qa = await provider('/convai/agents/create', 'POST', {
      name: 'Seatable QA Keypad ' + Date.now(),
      conversation_config: {
        agent: {
          language: 'pt', first_message: 'Olá, aqui é a recepção de testes da Seatable. Como posso ajudar?',
          dynamic_variables: { dynamic_variable_placeholders: { [GRANT_VARIABLE]: 'unavailable' } },
          prompt: { llm: 'gpt-4o-mini', tool_ids: [toolId], prompt: instructions },
        },
        asr: { quality: 'high', provider: 'elevenlabs', user_input_audio_format: 'ulaw_8000' },
        tts: { voice_id: shared.conversation_config.tts.voice_id, model_id: 'eleven_flash_v2_5', agent_output_audio_format: 'ulaw_8000' },
        conversation: { max_duration_seconds: 100 },
      },
      platform_settings: { privacy: { record_voice: false } },
    });
    assert.ok(qa.agent_id); agentId = qa.agent_id;
    const created = await provider('/convai/agents/' + agentId);
    assert.equal(created.conversation_config.asr.user_input_audio_format, 'ulaw_8000');
    assert.equal(created.conversation_config.tts.agent_output_audio_format, 'ulaw_8000');
    assert.deepEqual(created.conversation_config.agent.prompt.tool_ids, [toolId]);

    for (const kind of cases) await runCase(kind);
  } finally {
    try {
      if (agentId) { await provider('/convai/agents/' + agentId, 'DELETE'); console.log('Recepcionista de QA apagada'); }
      if (toolId) { await provider('/convai/tools/' + toolId + '?force=true', 'DELETE'); console.log('Ferramenta de QA apagada'); }
    } catch (error) {
      console.error('Limpeza falhou:', error.message, { agentId, toolId });
      process.exitCode = 1;
    }
    server.close();
  }
}

if (require.main === module) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { parseConfig, parseCases, receiptFor, SETUP_SQL, CASES, main };

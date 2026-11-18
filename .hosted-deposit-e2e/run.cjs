const assert = require('node:assert/strict');
const { randomBytes, randomUUID, createHash } = require('node:crypto');
const { execFileSync, spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const jwt = require('jsonwebtoken');
const { chromium, expect } = require('@playwright/test');

const root = path.resolve(__dirname, '..');
const migration = 'supabase/migrations/20261118194000_hosted_reservation_deposits.sql';
const publicDepositMigration = 'supabase/migrations/20261118192636_public_booking_deposits.sql';
const guardPath = path.resolve(root, '../seatable-billing-activation/.billing-e2e/catalog.cjs');
const expectedAccount = 'acct_1UdAs4AjGeKZnIF4';
const sqlLiteral = value => "'" + String(value).replaceAll("'", "''") + "'";
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const digest = input => createHash('sha256').update(input).digest('hex').slice(0, 12);

async function until(label, read, timeout = 45000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = await read();
    if (result) return result;
    await wait(250);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function pay(page, url, email) {
  const checkout = new URL(url);
  assert.equal(checkout.origin, 'https://checkout.stripe.com');
  assert.match(checkout.pathname, /\/cs_test_/);
  await page.goto(url);
  async function cardField(selector) {
    return until('visible Stripe field', async () => {
      for (const frame of page.frames()) {
        const input = frame.locator(selector).first();
        if (await input.isVisible().catch(() => false)) return { input, frame };
      }
      const card = page.getByRole('button', { name: /^card$/i }).first();
      if (await card.isVisible() && await card.isEnabled()) await card.click({ timeout: 3000 }).catch(() => {});
      return null;
    });
  }
  const { input: number, frame: form } = await cardField('#cardNumber,input[autocomplete=cc-number]');
  const emailField = form.locator('#email,input[name=email]').first();
  if (await emailField.isVisible() && await emailField.isEditable()) await emailField.fill(email);
  await number.fill('4242424242424242');
  await (await cardField('#cardExpiry,input[autocomplete=cc-exp]')).input.fill('1234');
  await (await cardField('#cardCvc,input[autocomplete=cc-csc]')).input.fill('123');
  const name = form.locator('#billingName,#cardholderName,input[name=billingName],input[autocomplete=cc-name]').first();
  if (await name.isVisible()) await name.fill('Seatable Deposit Sandbox');
  const country = form.locator('#billingCountry,select[autocomplete=country]').first();
  if (await country.isVisible() && await country.evaluate(el => el.tagName === 'SELECT')) await country.selectOption('US');
  const postal = form.locator('#billingPostalCode,input[autocomplete=postal-code]').first();
  if (await postal.isVisible()) await postal.fill('94105');
  const submit = form.getByRole('button', { name: /^(pay|pagar|authorize|autorizar|confirm)/i }).last();
  try {
    await expect(submit).toBeEnabled({ timeout: 10000 });
    await submit.click();
  } catch (error) {
    const buttons = await form.getByRole('button').allTextContents();
    console.log('Checkout buttons:', buttons.map(text => text.trim()).filter(Boolean));
    await page.screenshot({ path: path.join(__dirname, 'checkout-failure.png') });
    throw error;
  }
}

async function main() {
  assert(!process.env.STRIPE_SECRET_KEY && !process.env.STRIPE_API_KEY && !process.env.SUPABASE_URL &&
    !process.env.SEATABLE_BILLING_ACCOUNT, 'Use the clean environment in README');
  const { getSandbox } = require(guardPath);
  const sandbox = await getSandbox();
  assert.equal(sandbox.expected, expectedAccount);

  const startedAt = Math.floor(Date.now() / 1000);
  const run = randomUUID().slice(0, 8);
  const secret = randomBytes(32).toString('hex');
  const composeEnvironment = { PATH: process.env.PATH, HOME: os.homedir(), HOSTED_DEPOSIT_JWT_SECRET: secret };
  const compose = (args, input) => execFileSync('docker', [
    'compose', '-p', `seatable-hosted-deposit-${run}`, '-f', path.join(__dirname, 'compose.yaml'), ...args,
  ], { env: composeEnvironment, input, encoding: 'utf8' }).trim();
  const sql = query => compose(['exec', '-T', 'db', 'psql', '-XAtq', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1'], query);
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  const evidence = {
    sourceCommit: git('rev-parse', 'HEAD'),
    sourcePatch: digest(git('diff','HEAD','--','api/request-deposit-link.js','api/stripe-webhook.js') +
      fs.readFileSync(path.join(root, 'api/_lib/hosted-reservation-deposit.js'))),
    migration: createHash('sha256').update(fs.readFileSync(path.join(root, migration))).digest('hex'),
    account: expectedAccount, testMode: true, run, passed: false, results: {}, cleanup: [],
  };

  const sign = claims => jwt.sign(claims, secret, { expiresIn: '2h' });
  const fixtures = Object.fromEntries(['owner', 'other'].map(label => {
    const id = randomUUID();
    const user = { id: randomUUID(), aud: 'authenticated', role: 'authenticated',
      email: `hosted-${label}-${run}@example.com`, app_metadata: {}, user_metadata: {} };
    return [label, { id, user, token: sign({ sub: user.id, role: 'authenticated' }) }];
  }));
  const cases = Object.fromEntries(['attach', 'changed', 'cancelled', 'missed', 'capturedBeforeWebhook'].map(label => [label, {
    id: randomUUID(), code: `HD-${run}-${label.toLowerCase()}`, label,
  }]));
  const isFixture = session => session.metadata?.restaurant_id === fixtures.owner.id &&
    Object.values(cases).some(item => item.code === session.metadata?.reservation_id);

  const app = express();
  app.disable('x-powered-by');
  const server = http.createServer(app);
  let listener, browser;
  let cleanupFailure;
  try {
    compose(['up', '-d', '--wait', 'db']);
    for (const file of ['scripts/auditoria-reservas/fixture-schema.sql', '.hosted-deposit-e2e/fixture.sql', publicDepositMigration, migration]) {
      sql(fs.readFileSync(path.join(root, file), 'utf8'));
    }
    assert.equal(sql(`
      SELECT has_table_privilege('anon', 'public.hosted_reservation_deposits', 'SELECT'),
        has_table_privilege('authenticated', 'public.hosted_reservation_deposits', 'SELECT'),
        has_table_privilege('service_role', 'public.hosted_reservation_deposits', 'UPDATE'),
        (SELECT relrowsecurity FROM pg_class WHERE oid='public.hosted_reservation_deposits'::regclass),
        (SELECT bool_and(NOT has_function_privilege('authenticated', oid, 'EXECUTE') AND
            NOT has_function_privilege('anon', oid, 'EXECUTE') AND has_function_privilege('service_role', oid, 'EXECUTE')
            AND NOT prosecdef) FROM pg_proc
            WHERE proname IN ('begin_hosted_reservation_deposit','settle_hosted_reservation_deposit'));
    `), 'f|f|t|t|t');
    evidence.results.databasePermissions = 'RLS and service-only table/RPC grants, security invoker';
    sql(fs.readFileSync(path.join(__dirname, 'db-guards.sql'), 'utf8'));
    evidence.results.databaseGuards = ['prior capture', 'release allows retry', 'existing intent', 'supersession',
      'session expiry', 'authorization expiry'];
    for (const fixture of Object.values(fixtures)) {
      sql(`INSERT INTO restaurant.restaurant_config
        (id,user_id,email,restaurant_name,slug,country,business_hours,deposit_config)
        VALUES (${[fixture.id, fixture.user.id, fixture.user.email, 'Seatable Hosted Deposit ' + run,
          'sandbox-' + fixture.id, 'BR', '{}', '{"enabled":true,"type":"per_person","amount":12.50}'].map(sqlLiteral).join(',')});`);
    }
    for (const item of Object.values(cases)) {
      sql(`INSERT INTO public.reservations (id,restaurant_id,reservation_id,customer_name,customer_email,customer_phone,
        party_size,date,time,status) VALUES (${[item.id, fixtures.owner.id, item.code, 'Sandbox Guest',
        `hosted-guest-${run}@example.com`, '+15550101010', 2].map(sqlLiteral).join(',')},
        current_date+1,'19:00','confirmed');`);
    }

    compose(['up', '-d', 'rest']);
    const restHost = compose(['port', 'rest', '3000']);
    assert.match(restHost, /^127\.0\.0\.1:\d+$/);
    await until('PostgREST on loopback', async () => fetch('http://' + restHost + '/').then(response => response.ok).catch(() => false));
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const origin = 'http://127.0.0.1:' + server.address().port;
    const webhookPath = '/api/stripe-webhook';
    let listenerOutput = '';
    listener = spawn('stripe', [...sandbox.cliArguments, 'listen', '--skip-update', '--events',
      'checkout.session.completed', '--forward-to', origin + webhookPath], {
      env: sandbox.cliEnvironment, stdio: ['ignore', 'pipe', 'pipe'],
    });
    for (const stream of [listener.stdout, listener.stderr]) {
      stream.on('data', chunk => { listenerOutput = (listenerOutput + chunk).slice(-20000); });
    }
    const signingSecret = await until('test-only Stripe CLI listener', () => {
      if (listener.exitCode !== null) throw new Error('Stripe CLI listener exited');
      return listenerOutput.match(/Ready![\s\S]*?(whsec_[a-zA-Z0-9]+)/)?.[1];
    });

    Object.assign(process.env, {
      NODE_ENV: 'development', JWT_SECRET: secret, STRIPE_SECRET_KEY: sandbox.key, STRIPE_WEBHOOK_SECRET: signingSecret,
      SUPABASE_URL: origin, SUPABASE_SERVICE_ROLE_KEY: sign({ role: 'service_role' }),
      SUPABASE_ANON_KEY: sign({ role: 'anon' }), CLIENT_URL: origin,
    });
    app.get('/auth/v1/user', (req, res) => {
      const fixture = Object.values(fixtures).find(value => req.headers.authorization === 'Bearer ' + value.token);
      return fixture ? res.json(fixture.user) : res.status(401).json({ message: 'Unknown fixture' });
    });
    let failSettlement = false;
    app.use('/rest/v1', (req, res) => {
      if (failSettlement && req.path === '/rpc/settle_hosted_reservation_deposit') {
        failSettlement = false;
        req.resume();
        return res.status(503).json({ code: 'PGRST000', message: 'Synthetic transient failure' });
      }
      const headers = { ...req.headers, host: restHost };
      const upstream = http.request('http://' + restHost + req.url, { method: req.method, headers }, reply => {
        res.writeHead(reply.statusCode, reply.headers);
        reply.pipe(res);
      });
      upstream.on('error', () => res.status(502).end());
      req.pipe(upstream);
    });

    const webhook = require('../api/stripe-webhook');
    const requestLink = require('../api/request-deposit-link');
    const releaseDeposit = require('../api/release-deposit');
    const deliveries = [];
    let dropMissedCase = false;
    app.post(webhookPath, express.raw({ type: 'application/json' }), async (req, res) => {
      const object = JSON.parse(req.body).data?.object;
      const signature = req.headers['stripe-signature'];
      if (object && !isFixture(object) && object.id !== 'cs_test_unsigned_fixture') {
        return res.json({ ignored: true });
      }
      const delivery = { session: object?.id, body: req.body, signature, response: null, status: null };
      const responseJson = res.json.bind(res);
      res.json = payload => {
        delivery.response = payload;
        delivery.status = res.statusCode;
        deliveries.push(delivery);
        return responseJson(payload);
      };
      if (dropMissedCase && object?.metadata?.reservation_id === cases.missed.code) {
        return res.status(503).json({ simulatedOutage: true });
      }
      return webhook(req, res);
    });
    app.post('/api/request-deposit-link', express.json(), requestLink);
    app.post('/api/release-deposit', express.json(), releaseDeposit);
    app.get('/book/:slug/confirmed', (_req, res) => res.send('Local return destination'));
    const request = (item, owner = fixtures.owner) => fetch(origin + '/api/request-deposit-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(owner ? { Authorization: 'Bearer ' + owner.token } : {}) },
      body: JSON.stringify({ reservation_id: item.code }),
    });
    const replay = delivery => fetch(origin + webhookPath, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': delivery.signature }, body: delivery.body,
    });
    const state = item => JSON.parse(sql(`SELECT to_jsonb(a) - 'checkout_params' FROM public.hosted_reservation_deposits a
      WHERE booking_id=${sqlLiteral(item.id)} ORDER BY expires_at DESC LIMIT 1;`) || 'null');
    const booking = item => JSON.parse(sql(`SELECT json_build_object('intent',deposit_payment_intent_id,'amount',deposit_amount,'currency',deposit_currency,
      'time',time,'party',party_size,'status',status) FROM public.reservations WHERE id=${sqlLiteral(item.id)};`));

    assert.equal((await request(cases.attach, null)).status, 401);
    assert.equal((await request(cases.attach, fixtures.other)).status, 404);
    const unsigned = await fetch(origin + webhookPath, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { object: { id: 'cs_test_unsigned_fixture' } } }),
    });
    assert.equal(unsigned.status, 400);
    const captured = cases.capturedBeforeWebhook;
    sql(`UPDATE public.reservations SET deposit_amount=20 WHERE id=${sqlLiteral(captured.id)};`);
    const duplicateCapture = await request(captured);
    assert.equal(duplicateCapture.status, 409);
    assert.equal((await duplicateCapture.json()).already_requested, true);
    assert.equal(state(captured), null);
    sql(`UPDATE public.reservations SET deposit_amount=NULL WHERE id=${sqlLiteral(captured.id)};`);
    evidence.results.guards = { anonymous: 401, wrongTenant: 404, unsignedWebhook: 400, priorCapture: 409 };

    failSettlement = true;
    assert.equal((await request(cases.attach)).status, 500);
    assert.equal(state(cases.attach).checkout_session_id, null);
    assert.equal(booking(cases.attach).intent, null);
    const open = await Promise.all([request(cases.attach), request(cases.attach), request(cases.attach)]);
    assert.deepEqual(open.map(x => x.status), [200, 200, 200]);
    const payloads = await Promise.all(open.map(x => x.json()));
    assert.equal(new Set(payloads.map(x => x.checkout_url)).size, 1);
    assert(payloads.every(x => x.payment_intent_id === null && x.deposit_amount === 25 && x.currency === 'brl'));
    assert(payloads[0].whatsapp_message.includes(payloads[0].checkout_url) && payloads[0].customer_phone);
    const singleAttempt = state(cases.attach);
    assert(singleAttempt.checkout_session_id);
    assert.equal(sql(`SELECT count(*) FROM public.hosted_reservation_deposits WHERE booking_id=${sqlLiteral(cases.attach.id)};`), '1');
    const before = await sandbox.stripe.checkout.sessions.retrieve(singleAttempt.checkout_session_id);
    assert.equal(before.livemode, false);
    assert.equal(before.status, 'open');
    assert.equal(before.payment_intent, null);
    assert.equal(booking(cases.attach).intent, null);
    evidence.results.raceAndLostResponse = {
      first: 500, retries: [200, 200, 200], attempts: 1, session: digest(before.id), intentBefore: null, bookingBefore: null,
    };

    browser = await chromium.launch({ channel: 'chrome', headless: true });
    for (const item of Object.values(cases)) {
      console.log('Browser case', item.label);
      let payload = payloads[0];
      if (item !== cases.attach) {
        const response = await request(item);
        assert.equal(response.status, 200);
        payload = await response.json();
      }
      const sessionId = state(item).checkout_session_id;
      if (item === cases.changed) sql(`UPDATE public.reservations SET time='20:00',party_size=4 WHERE id=${sqlLiteral(item.id)};`);
      if (item === cases.cancelled) sql(`UPDATE public.reservations SET status='cancelled' WHERE id=${sqlLiteral(item.id)};`);
      if (item === cases.capturedBeforeWebhook) {
        sql(`UPDATE public.reservations SET deposit_amount=20 WHERE id=${sqlLiteral(item.id)};`);
      }
      if (item === cases.attach) failSettlement = true;
      if (item === cases.missed) dropMissedCase = true;
      const page = await browser.newPage({ locale: 'en-US', viewport: { width: 1100, height: 800 } });
      try {
        await pay(page, payload.checkout_url, `hosted-guest-${run}@example.com`);
        await page.waitForURL(url => url.origin === origin && url.pathname.endsWith('/confirmed'), { timeout: 60000 });
      } finally {
        await page.close();
      }

      const first = await until('genuine signed delivery', () => deliveries.find(delivery => delivery.session === sessionId));
      assert.match(first.signature, /^t=\d+,v1=[a-f0-9]+/);
      const event = sandbox.stripe.webhooks.constructEvent(first.body, first.signature, signingSecret);
      assert.equal(event.livemode, false);
      assert.equal(event.type, 'checkout.session.completed');
      assert.equal(event.data.object.id, sessionId);
      const session = await sandbox.stripe.checkout.sessions.retrieve(sessionId);
      assert.equal(session.livemode, false);
      assert.equal(session.amount_total, 2500);
      assert.equal(session.currency, 'brl');
      assert.equal(session.status, 'complete');
      const expected = ['attach', 'missed'].includes(item.label) ? 'attached' : 'released';

      if (item === cases.attach) {
        assert.equal(first.status, 500);
        assert.equal(state(item).state, 'pending');
        assert.equal(booking(item).intent, null);
        const repeats = await Promise.all([replay(first), replay(first)]);
        for (const response of repeats) {
          assert.equal(response.status, 200);
          assert.equal((await response.json()).hosted_deposit, 'attached');
        }
      } else if (item === cases.missed) {
        assert.equal(first.status, 503);
        assert.equal(booking(item).intent, null);
        const managerRetry = await request(item);
        assert.equal(managerRetry.status, 409);
        assert.equal((await managerRetry.json()).already_requested, true);
        dropMissedCase = false;
      } else {
        assert.equal(first.status, 200);
        assert.equal(first.response.hosted_deposit, 'released');
      }
      const duplicate = await replay(first);
      assert.equal(duplicate.status, 200);
      assert.equal((await duplicate.json()).hosted_deposit, expected);
      const intent = await sandbox.stripe.paymentIntents.retrieve(session.payment_intent);
      assert.equal(intent.livemode, false);
      assert.equal(intent.status, expected === 'attached' ? 'requires_capture' : 'canceled');
      assert.equal(intent.capture_method, 'manual');
      assert.equal(intent.amount, 2500);
      assert.equal(intent.currency, 'brl');
      assert.equal(intent.amount_received, 0);
      assert.equal(intent.amount_capturable, expected === 'attached' ? 2500 : 0);
      assert.equal(intent.transfer_data, null);
      assert.equal(intent.on_behalf_of, null);
      assert.equal(state(item).state, expected);
      assert.equal(state(item).payment_intent_id, intent.id);
      assert.equal(booking(item).intent, expected === 'attached' ? intent.id : null);
      assert.equal(booking(item).amount,
        item === cases.capturedBeforeWebhook ? 20 : expected === 'attached' ? 25 : null);
      assert.equal(booking(item).currency, expected === 'attached' ? 'brl' : null);
      if (item === cases.changed) assert.deepEqual([booking(item).time, booking(item).party], ['20:00:00', 4]);
      if (item === cases.cancelled) assert.equal(booking(item).status, 'cancelled');
      evidence.results[item.label] = {
        session: digest(session.id), event: digest(event.id), intent: digest(intent.id),
        genuineSignature: true, firstStatus: first.status, replayStatus: duplicate.status,
        booking: expected, intentStatus: intent.status, captured: intent.amount_received,
        amountMinor: intent.amount, currency: intent.currency, checkoutPaymentStatus: session.payment_status,
      };
    }
    const held = booking(cases.attach);
    const release = await fetch(origin + '/api/release-deposit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + fixtures.owner.token },
      body: JSON.stringify({ reservation_id: cases.attach.code }),
    });
    assert.equal(release.status, 200);
    assert.equal((await sandbox.stripe.paymentIntents.retrieve(held.intent)).status, 'canceled');
    const released = booking(cases.attach);
    assert.deepEqual([released.intent, released.amount, released.currency], [null, null, null]);
    evidence.results.dashboardRelease = { http: release.status, attachedCurrency: held.currency, clearedCurrency: released.currency };
    assert.equal(sql('SELECT count(*) FROM public.stripe_webhook_events_processed;'), '0');
    evidence.results.subscriptionIsolation = 'Hosted events bypassed the generic webhook ledger';
    evidence.passed = true;
  } finally {
    try {
      if (browser) await browser.close();
      // Discover even a Session whose create response never reached the app.
      for await (const session of sandbox.stripe.checkout.sessions.list({ created: { gte: startedAt }, limit: 100 })) {
        if (!isFixture(session)) continue;
        assert.equal(session.livemode, false);
        if (session.status === 'open') await sandbox.stripe.checkout.sessions.expire(session.id);
        if (session.payment_intent) {
          let intent = await sandbox.stripe.paymentIntents.retrieve(session.payment_intent);
          if (intent.status === 'requires_capture') {
            intent = await sandbox.stripe.paymentIntents.cancel(intent.id, { cancellation_reason: 'abandoned' });
          }
          assert.equal(intent.status, 'canceled');
          assert.equal(intent.amount_capturable, 0);
          assert.equal(intent.amount_received, 0);
        }
        const after = await sandbox.stripe.checkout.sessions.retrieve(session.id);
        assert.notEqual(after.status, 'open');
        evidence.cleanup.push({ session: digest(session.id), status: after.status, unresolvedHold: false });
      }
      const attachSessions = evidence.cleanup.filter(row => row.session === evidence.results.raceAndLostResponse?.session);
      if (evidence.results.missed) {
        assert.equal(attachSessions.length, 1);
        assert.equal(evidence.cleanup.length, Object.keys(cases).length, 'One provider session per case');
      }
    } catch (error) {
      cleanupFailure = error;
    } finally {
      if (listener?.exitCode === null) {
        const closed = once(listener, 'exit');
        listener.kill('SIGTERM');
        await Promise.race([closed, wait(3000)]);
      }
      if (server.listening) {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
      }
      compose(['down', '--volumes', '--remove-orphans']);
      evidence.databaseRemoved = !compose(['ps', '-aq']);
      evidence.cleanupVerified = !cleanupFailure;
      fs.writeFileSync(path.join(__dirname, 'result.json'), JSON.stringify(evidence, null, 2) + '\n');
    }
    if (cleanupFailure) throw cleanupFailure;
  }
  console.log('Hosted deposit sandbox evidence saved', evidence.run);
}

main().catch(error => {
  console.error(String(error.stack || error).replace(/(?:[a-z]{2,8}_(?:test|live)|whsec)_\w+|https:\/\/checkout\.stripe\.com[^\s]*/g, '[redacted]'));
  process.exitCode = 1;
});

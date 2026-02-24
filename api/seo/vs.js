/**
 * GET /api/seo/vs?competitor=:competitor
 *
 * Hardcoded comparison pages: Seatable vs OpenTable / Resy / SevenRooms.
 * No cache needed — pure function, ~5ms response time.
 */

const { renderPage, escapeHtml } = require('../_lib/seo-html');

const COMPETITORS = {
  opentable: {
    name: 'OpenTable',
    tagline: 'The commission-free AI alternative to OpenTable',
    metaDesc:
      'Compare Seatable vs OpenTable. No per-cover commissions, AI voice + WhatsApp reservations, 5-minute setup. See why restaurants are switching.',
    angle:
      'OpenTable charges a per-cover commission on every booking it sends you — including guests who already know your restaurant. Seatable charges a flat monthly subscription with no commission, ever.',
    rows: [
      { feature: 'AI voice reservations', seatable: true, them: false },
      { feature: 'WhatsApp bookings', seatable: true, them: false },
      { feature: 'Per-cover commission', seatable: false, them: true },
      { feature: 'Flat monthly pricing', seatable: true, them: false },
      { feature: 'Setup time', seatable: '5 minutes', them: 'Days–weeks' },
      { feature: 'Multi-language AI', seatable: true, them: false },
      { feature: '14-day free trial', seatable: true, them: false },
    ],
    body2: `<p>OpenTable's marketplace can drive discovery for new restaurants, but it comes at a cost: you pay per cover even for regulars who found you independently. As your volume grows, so does the bill.</p>
<p>Seatable is built for restaurants that already have — or are building — their own audience. The AI handles calls and messages 24/7 so your team doesn't miss a booking, and the flat subscription means your costs are predictable regardless of how many covers you do.</p>`,
  },
  resy: {
    name: 'Resy',
    tagline: 'The AI-native alternative to Resy',
    metaDesc:
      'Compare Seatable vs Resy. AI voice agent, WhatsApp, no per-cover fees. Personality-driven reservations that sound like your restaurant, not a call centre.',
    angle:
      'Resy is excellent for high-profile restaurants in major cities, but its AI capabilities are limited and its pricing reflects its premium positioning. Seatable brings AI-native reservations — voice, WhatsApp, and chat — to any restaurant at a fraction of the cost.',
    rows: [
      { feature: 'AI voice reservations', seatable: true, them: false },
      { feature: 'WhatsApp bookings', seatable: true, them: false },
      { feature: 'Per-cover commission', seatable: false, them: true },
      { feature: 'Customisable AI personality', seatable: true, them: false },
      { feature: 'Setup time', seatable: '5 minutes', them: 'Days' },
      { feature: 'Multi-language AI', seatable: true, them: false },
      { feature: '14-day free trial', seatable: true, them: false },
    ],
    body2: `<p>Resy is strong on the front-of-house experience and guest profiles, but it doesn't offer an AI agent that actually answers the phone or responds to WhatsApp messages. Your team still handles every inbound inquiry manually.</p>
<p>Seatable's AI host is trained on your restaurant's specific personality, menu, and policies — so it sounds like your best host, not a generic bot. Available 24/7, in any language, without adding to your labour costs.</p>`,
  },
  sevenrooms: {
    name: 'SevenRooms',
    tagline: 'The simple, AI-powered alternative to SevenRooms',
    metaDesc:
      'Compare Seatable vs SevenRooms. No enterprise contracts, no implementation fees. AI voice + WhatsApp reservations live in 5 minutes.',
    angle:
      "SevenRooms is a powerful enterprise platform — but it's priced and scoped for hotel groups and large chains. Seatable delivers the AI reservation capabilities that matter most, with a setup that takes 5 minutes and pricing that works for independent restaurants.",
    rows: [
      { feature: 'AI voice reservations', seatable: true, them: false },
      { feature: 'WhatsApp bookings', seatable: true, them: false },
      { feature: 'Enterprise contract required', seatable: false, them: true },
      { feature: 'Implementation fees', seatable: false, them: true },
      { feature: 'Setup time', seatable: '5 minutes', them: 'Weeks' },
      { feature: 'Multi-language AI', seatable: true, them: false },
      { feature: '14-day free trial', seatable: true, them: false },
    ],
    body2: `<p>SevenRooms is built for groups running dozens of venues and requires a significant implementation project before you go live. For independent restaurants or small groups, the cost and complexity are disproportionate.</p>
<p>Seatable gives you the AI-powered reservation layer — voice, WhatsApp, chat, and a full host dashboard — without the enterprise contract. You're live in 5 minutes and can cancel any month.</p>`,
  },
};

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).send('Method not allowed');
  }

  const { competitor } = req.query;
  if (!competitor) {
    return res.status(400).send('Missing competitor parameter');
  }

  const data = COMPETITORS[competitor.toLowerCase()];
  if (!data) {
    return res.status(404).send('Comparison page not found');
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');

  const tableRows = data.rows
    .map((row) => {
      const seatableCell =
        typeof row.seatable === 'boolean'
          ? `<td class="${row.seatable ? 'check' : 'cross'}">${row.seatable ? '✓' : '✗'}</td>`
          : `<td>${escapeHtml(String(row.seatable))}</td>`;
      const themCell =
        typeof row.them === 'boolean'
          ? `<td class="${row.them ? 'check' : 'cross'}">${row.them ? '✓' : '✗'}</td>`
          : `<td>${escapeHtml(String(row.them))}</td>`;
      return `<tr><td>${escapeHtml(row.feature)}</td>${seatableCell}${themCell}</tr>`;
    })
    .join('\n');

  const body = `
    <h1>Seatable vs ${escapeHtml(data.name)}</h1>
    <p class="lead">${escapeHtml(data.angle)}</p>
    <h2>Feature comparison</h2>
    <table>
      <thead><tr><th>Feature</th><th>Seatable</th><th>${escapeHtml(data.name)}</th></tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
    ${data.body2}<!-- body2 is hardcoded HTML — not derived from user input, no escaping needed -->
    <div class="cta-block">
      <h2>See it for yourself</h2>
      <p>Try a personalised demo in 5 minutes — no credit card, no commitment.</p>
      <a href="/demo/setup" class="cta-btn" style="display:inline-block;margin-top:1rem;">Start free demo</a>
    </div>
  `;

  return res.send(
    renderPage({
      title: `Seatable vs ${data.name}: ${data.tagline}`,
      meta: data.metaDesc,
      body,
      canonical: `/vs/${competitor.toLowerCase()}`,
    }),
  );
};

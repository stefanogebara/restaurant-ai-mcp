/**
 * São Paulo Restaurant Outreach Script
 *
 * Sends personalized PT-BR cold emails to restaurants in São Paulo.
 * Uses Gmail SMTP via nodemailer with credentials from .env.outreach
 *
 * Usage:
 *   node scripts/outreach-sp.js               # dry-run (no emails sent)
 *   node scripts/outreach-sp.js --send        # actually send emails
 *   node scripts/outreach-sp.js --send --id 3 # send to restaurant at index 3 only
 *
 * Output: logs/outreach-sp-YYYY-MM-DD.json    # per-run results
 */

const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load outreach credentials
dotenv.config({ path: path.join(__dirname, '..', '.env.outreach') });

const SEND_MODE = process.argv.includes('--send');
const SINGLE_ID = (() => {
  const idx = process.argv.indexOf('--id');
  return idx !== -1 ? parseInt(process.argv[idx + 1], 10) : null;
})();

// Auto-discover all restaurants-sp*.json files in scripts/
const SCRIPTS_DIR = __dirname;
const LOGS_DIR = path.join(__dirname, '..', 'logs');

function loadAllRestaurants() {
  const files = fs.readdirSync(SCRIPTS_DIR)
    .filter(f => f.startsWith('restaurants-sp') && f.endsWith('.json'))
    .sort();
  const all = [];
  for (const file of files) {
    const list = JSON.parse(fs.readFileSync(path.join(SCRIPTS_DIR, file), 'utf8'));
    all.push(...list.map(r => ({ ...r, _sourceFile: file })));
  }
  return all;
}

function saveRestaurant(restaurant, update) {
  const file = path.join(SCRIPTS_DIR, restaurant._sourceFile);
  const all = JSON.parse(fs.readFileSync(file, 'utf8'));
  const idx = all.findIndex(r => r.name === restaurant.name && r.email === restaurant.email);
  if (idx !== -1) Object.assign(all[idx], update);
  fs.writeFileSync(file, JSON.stringify(all, null, 2));
}

// Pause between sends (ms) — avoids Gmail rate limits
const DELAY_MS = 3000;

// ─── Email Template ───────────────────────────────────────────────────────────

function buildEmail(restaurant) {
  const { name, neighborhood, ownerName } = restaurant;
  const greeting = ownerName ? `Olá ${ownerName},` : `Olá,`;
  const demoUrl = `https://restaurant-ai-mcp.vercel.app/demo/setup?ref=sp-outreach&restaurant=${encodeURIComponent(name)}`;

  const html = `
<div style="font-family: Georgia, serif; max-width: 560px; color: #2d2d2d; line-height: 1.7;">
  <p>${greeting}</p>

  <p>
    Meu nome é Stefano, e criei o Seatable depois de perceber que a maioria dos restaurantes
    perde dinheiro de formas que nunca ficam visíveis no dia a dia.
  </p>

  <p>
    O Seatable faz duas coisas pelo <strong>${name}</strong>:
  </p>

  <p style="font-weight: bold; margin-bottom: 4px;">1. Nunca perde uma reserva</p>
  <p style="margin-top: 0;">
    Um agente de IA atende chamadas e WhatsApp <strong>24h por dia</strong>, faz reservas automaticamente
    e manda lembrete para o cliente. Nenhum equipamento especial — funciona no celular.
  </p>

  <p style="font-weight: bold; margin-bottom: 4px;">2. Um gerente de IA que conhece seu restaurante</p>
  <p style="margin-top: 0;">
    Além de reservas, o Seatable aprende como o <strong>${name}</strong> funciona. Ele lê seus dados —
    ocupação, horários de pico, padrões de no-show, clientes que somem, mesas subutilizadas —
    e aponta os <strong>pontos cegos</strong> que você não consegue ver no meio do serviço.
  </p>
  <p>
    Perguntas como <em>"qual é meu horário de maior desperdício?"</em>,
    <em>"quais clientes não voltam após a primeira visita?"</em> ou
    <em>"estou precisando de mais garçons nas sextas à noite?"</em> — ele responde em segundos,
    pelo WhatsApp ou direto no painel.
  </p>

  <p>
    Planos a partir de <strong>R$149/mês</strong>. Configuração em 24h.
  </p>

  <p>
    Criei uma demo personalizada para o <strong>${name}</strong> — você pode testar como
    ficaria na prática:
  </p>

  <p>
    <a href="${demoUrl}" style="
      display: inline-block;
      background: #8b1a2e;
      color: white;
      text-decoration: none;
      padding: 12px 24px;
      border-radius: 999px;
      font-family: sans-serif;
      font-size: 14px;
      font-weight: 600;
    ">Ver Demo Personalizada →</a>
  </p>

  <p style="color: #666; font-size: 13px; margin-top: 32px;">
    Se não for o momento certo, sem problema. Boa sorte com o serviço!
  </p>

  <p>Abraço,<br>
  <strong>Stefano</strong><br>
  Seatable — IA para restaurantes<br>
  <a href="https://restaurant-ai-mcp.vercel.app" style="color: #8b1a2e;">restaurant-ai-mcp.vercel.app</a>
  </p>

  <p style="color: #999; font-size: 11px; margin-top: 24px;">
    Para não receber mais e-mails, basta responder com "remover".
  </p>
</div>
  `.trim();

  const text = `
${greeting}

Meu nome é Stefano, e criei o Seatable depois de perceber que a maioria dos restaurantes perde dinheiro de formas que nunca ficam visíveis no dia a dia.

O Seatable faz duas coisas pelo ${name}:

1. Nunca perde uma reserva
Um agente de IA atende chamadas e WhatsApp 24h por dia, faz reservas automaticamente e manda lembrete para o cliente. Nenhum equipamento especial — funciona no celular.

2. Um gerente de IA que conhece seu restaurante
Além de reservas, o Seatable aprende como o ${name} funciona. Ele lê seus dados — ocupação, horários de pico, padrões de no-show, clientes que somem, mesas subutilizadas — e aponta os pontos cegos que você não consegue ver no meio do serviço.

Perguntas como "qual é meu horário de maior desperdício?", "quais clientes não voltam após a primeira visita?" ou "estou precisando de mais garçons nas sextas à noite?" — ele responde em segundos, pelo WhatsApp ou direto no painel.

Planos a partir de R$149/mês. Configuração em 24h.

Demo personalizada para o ${name}: ${demoUrl}

Abraço,
Stefano
Seatable — IA para restaurantes
https://restaurant-ai-mcp.vercel.app
  `.trim();

  return {
    subject: `${name}: um gerente de IA que conhece seu restaurante`,
    html,
    text,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Load all restaurant files
  const restaurants = loadAllRestaurants();

  const targets = SINGLE_ID !== null
    ? [restaurants[SINGLE_ID]].filter(Boolean)
    : restaurants.filter((r) => r.email && !r.sent && r.verified !== false);

  console.log(`\n📋 ${targets.length} restaurants to contact (${SEND_MODE ? 'LIVE' : 'DRY RUN'})\n`);

  if (!SEND_MODE) {
    for (const r of targets) {
      console.log(`  [dry] ${r.name} — ${r.email}`);
      const email = buildEmail(r);
      console.log(`       Subject: ${email.subject}\n`);
    }
    console.log('\nRun with --send to actually send emails.\n');
    return;
  }

  // Set up Gmail SMTP transport
  const transport = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  await transport.verify();
  console.log('✅ SMTP connection verified\n');

  // Ensure logs dir exists
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  const logFile = path.join(LOGS_DIR, `outreach-sp-${new Date().toISOString().split('T')[0]}.json`);
  const results = [];

  for (let i = 0; i < targets.length; i++) {
    const r = targets[i];
    console.log(`[${i + 1}/${targets.length}] Sending to ${r.name} <${r.email}>...`);

    const { subject, html, text } = buildEmail(r);
    try {
      const info = await transport.sendMail({
        from: `"${process.env.GMAIL_FROM_NAME || 'Stefano | Seatable'}" <${process.env.GMAIL_USER}>`,
        to: r.email,
        subject,
        text,
        html,
      });

      console.log(`   ✅ Sent — messageId: ${info.messageId}`);
      results.push({ restaurant: r.name, email: r.email, status: 'sent', messageId: info.messageId, sentAt: new Date().toISOString() });

      // Mark as sent in the source file
      saveRestaurant(r, { sent: true, sentAt: new Date().toISOString() });
    } catch (err) {
      console.error(`   ❌ Failed: ${err.message}`);
      results.push({ restaurant: r.name, email: r.email, status: 'error', error: err.message });
    }

    if (i < targets.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
    }
  }

  // Write results log
  fs.writeFileSync(logFile, JSON.stringify(results, null, 2));
  const sent = results.filter((r) => r.status === 'sent').length;
  const failed = results.filter((r) => r.status === 'error').length;
  console.log(`\n✅ Done — ${sent} sent, ${failed} failed. Log: ${logFile}\n`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

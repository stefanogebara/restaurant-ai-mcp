/**
 * One-off outreach email to Alife Group (NINO + Giulietta Carni All'italiana)
 * Contact was redirected from Instagram DMs to compras@alifegroup.com.br
 *
 * Usage:
 *   node scripts/send-alife-outreach.js           # dry-run
 *   node scripts/send-alife-outreach.js --send    # actually send
 */

const nodemailer = require('nodemailer');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env.outreach') });

const SEND_MODE = process.argv.includes('--send');

const NINO_DEMO_URL =
  'https://restaurant-ai-mcp.vercel.app/demo/setup?ref=email-outreach&restaurant=NINO';
const GIULIETTA_DEMO_URL =
  'https://restaurant-ai-mcp.vercel.app/demo/setup?ref=email-outreach&restaurant=Giulietta';

const subject = 'NINO + Giulietta: gestao de reservas com IA — demos personalizadas';

const html = `
<div style="font-family: Georgia, serif; max-width: 580px; color: #2d2d2d; line-height: 1.75;">
  <p>Ola,</p>

  <p>
    Conforme orientado pelo Instagram, entro em contato por aqui. Meu nome e Stefano, e criei o
    <strong>Seatable</strong> — uma plataforma de IA para gestao de restaurantes.
  </p>

  <p>
    Desenvolvemos demos personalizadas tanto para o <strong>NINO</strong> quanto para a
    <strong>Giulietta Carni All'italiana</strong>, para mostrar como o sistema ficaria na pratica
    para cada casa.
  </p>

  <p style="font-weight: bold; margin-bottom: 4px;">O que o Seatable faz:</p>

  <p style="font-weight: bold; margin-bottom: 4px;">1. Nunca perde uma reserva</p>
  <p style="margin-top: 0;">
    Um agente de IA atende chamadas e WhatsApp <strong>24 horas por dia</strong>, registra reservas
    automaticamente e envia lembretes aos clientes. Sem equipamento especial — funciona no celular.
  </p>

  <p style="font-weight: bold; margin-bottom: 4px;">2. Um gerente de IA que conhece cada restaurante</p>
  <p style="margin-top: 0;">
    O Seatable aprende como cada casa funciona: ocupacao, horarios de pico, padroes de no-show,
    clientes que somem, mesas subutilizadas. Ele aponta os pontos cegos que ficam inviziveis no
    meio do servico — e responde perguntas pelo WhatsApp ou direto no painel, em segundos.
  </p>

  <p>
    Planos a partir de <strong>R$149/mes</strong>. Configuracao em 24h.
  </p>

  <p>Demos personalizadas:</p>

  <p>
    <a href="${NINO_DEMO_URL}" style="
      display: inline-block;
      background: #8b1a2e;
      color: white;
      text-decoration: none;
      padding: 11px 22px;
      border-radius: 999px;
      font-family: sans-serif;
      font-size: 14px;
      font-weight: 600;
      margin-right: 8px;
    ">Ver Demo — NINO</a>

    <a href="${GIULIETTA_DEMO_URL}" style="
      display: inline-block;
      background: #8b1a2e;
      color: white;
      text-decoration: none;
      padding: 11px 22px;
      border-radius: 999px;
      font-family: sans-serif;
      font-size: 14px;
      font-weight: 600;
    ">Ver Demo — Giulietta</a>
  </p>

  <p>
    Fico a disposicao para uma conversa rapida ou para tirar qualquer duvida.
  </p>

  <p>Abraco,<br>
  <strong>Stefano</strong><br>
  Seatable — IA para restaurantes<br>
  <a href="https://restaurant-ai-mcp.vercel.app" style="color: #8b1a2e;">restaurant-ai-mcp.vercel.app</a>
  </p>

  <p style="color: #999; font-size: 11px; margin-top: 24px;">
    Para nao receber mais e-mails, basta responder com "remover".
  </p>
</div>
`.trim();

const text = `
Ola,

Conforme orientado pelo Instagram, entro em contato por aqui. Meu nome e Stefano, e criei o Seatable — uma plataforma de IA para gestao de restaurantes.

Desenvolvemos demos personalizadas tanto para o NINO quanto para a Giulietta Carni All'italiana, para mostrar como o sistema ficaria na pratica para cada casa.

O que o Seatable faz:

1. Nunca perde uma reserva
Um agente de IA atende chamadas e WhatsApp 24 horas por dia, registra reservas automaticamente e envia lembretes aos clientes. Sem equipamento especial — funciona no celular.

2. Um gerente de IA que conhece cada restaurante
O Seatable aprende como cada casa funciona: ocupacao, horarios de pico, padroes de no-show, clientes que somem, mesas subutilizadas. Ele aponta os pontos cegos que ficam invisiveis no meio do servico — e responde perguntas pelo WhatsApp ou direto no painel, em segundos.

Planos a partir de R$149/mes. Configuracao em 24h.

Demo personalizada — NINO:
${NINO_DEMO_URL}

Demo personalizada — Giulietta:
${GIULIETTA_DEMO_URL}

Fico a disposicao para uma conversa rapida ou para tirar qualquer duvida.

Abraco,
Stefano
Seatable — IA para restaurantes
https://restaurant-ai-mcp.vercel.app
`.trim();

async function main() {
  const recipient = 'compras@alifegroup.com.br';

  console.log('\n--- Alife Group Outreach ---');
  console.log(`To:      ${recipient}`);
  console.log(`Subject: ${subject}`);
  console.log(`Mode:    ${SEND_MODE ? 'LIVE SEND' : 'DRY RUN'}\n`);

  if (!SEND_MODE) {
    console.log('--- HTML preview (truncated) ---');
    console.log(html.slice(0, 400) + '...\n');
    console.log('Run with --send to actually deliver the email.\n');
    return;
  }

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
  console.log('SMTP connection verified.\n');

  const info = await transport.sendMail({
    from: `"${process.env.GMAIL_FROM_NAME || 'Stefano | Seatable'}" <${process.env.GMAIL_USER}>`,
    to: recipient,
    subject,
    text,
    html,
  });

  console.log(`Email sent successfully.`);
  console.log(`Message ID: ${info.messageId}`);
  console.log(`Accepted:   ${info.accepted.join(', ')}`);
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});

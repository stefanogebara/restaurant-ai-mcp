/**
 * Outreach emails to Restaurante Chou and Lina Ristorante (via Pipo)
 * Both contacts were directed from Instagram DMs to email.
 *
 * Usage:
 *   node scripts/send-chou-lina-outreach.js           # dry-run
 *   node scripts/send-chou-lina-outreach.js --send    # actually send
 */

const nodemailer = require('nodemailer');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env.outreach') });

const SEND_MODE = process.argv.includes('--send');

// ─── Email 1: Restaurante Chou ────────────────────────────────────────────────

const CHOU_DEMO_URL =
  'https://restaurant-ai-mcp.vercel.app/demo/setup?ref=email-outreach&restaurant=Chou';

const chouSubject = 'PARCERIAS COMERCIAIS — Seatable IA para gestao de reservas';

const chouHtml = `
<div style="font-family: Georgia, serif; max-width: 580px; color: #2d2d2d; line-height: 1.75;">
  <p>Ola,</p>

  <p>
    Conforme orientado pelo Instagram, entro em contato por aqui para tratar de parceria comercial.
    Meu nome e Stefano, e criei o <strong>Seatable</strong> — uma plataforma de IA para gestao
    de restaurantes.
  </p>

  <p>
    Desenvolvemos uma demo personalizada para o <strong>Restaurante Chou</strong>, para mostrar
    na pratica como o sistema funcionaria na sua operacao.
  </p>

  <p style="font-weight: bold; margin-bottom: 4px;">O que o Seatable faz:</p>

  <p style="font-weight: bold; margin-bottom: 4px;">1. Nunca perde uma reserva</p>
  <p style="margin-top: 0;">
    Um agente de IA atende chamadas e WhatsApp <strong>24 horas por dia</strong>, registra reservas
    automaticamente e envia lembretes aos clientes. Sem equipamento especial — funciona no celular.
  </p>

  <p style="font-weight: bold; margin-bottom: 4px;">2. Um gerente inteligente que conhece o seu restaurante</p>
  <p style="margin-top: 0;">
    O Seatable aprende como a sua casa funciona: ocupacao, horarios de pico, padroes de no-show,
    clientes recorrentes, mesas subutilizadas. Ele aponta os pontos cegos que ficam invisiveis
    no meio do servico — e responde perguntas pelo WhatsApp ou direto no painel, em segundos.
  </p>

  <p>
    Planos a partir de <strong>R$149/mes</strong>. Configuracao em 24h.
  </p>

  <p>Demo personalizada para o Restaurante Chou:</p>

  <p>
    <a href="${CHOU_DEMO_URL}" style="
      display: inline-block;
      background: #8b1a2e;
      color: white;
      text-decoration: none;
      padding: 11px 22px;
      border-radius: 999px;
      font-family: sans-serif;
      font-size: 14px;
      font-weight: 600;
    ">Ver Demo — Restaurante Chou</a>
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

const chouText = `
Ola,

Conforme orientado pelo Instagram, entro em contato por aqui para tratar de parceria comercial. Meu nome e Stefano, e criei o Seatable — uma plataforma de IA para gestao de restaurantes.

Desenvolvemos uma demo personalizada para o Restaurante Chou, para mostrar na pratica como o sistema funcionaria na sua operacao.

O que o Seatable faz:

1. Nunca perde uma reserva
Um agente de IA atende chamadas e WhatsApp 24 horas por dia, registra reservas automaticamente e envia lembretes aos clientes. Sem equipamento especial — funciona no celular.

2. Um gerente inteligente que conhece o seu restaurante
O Seatable aprende como a sua casa funciona: ocupacao, horarios de pico, padroes de no-show, clientes recorrentes, mesas subutilizadas. Ele aponta os pontos cegos que ficam invisiveis no meio do servico — e responde perguntas pelo WhatsApp ou direto no painel, em segundos.

Planos a partir de R$149/mes. Configuracao em 24h.

Demo personalizada — Restaurante Chou:
${CHOU_DEMO_URL}

Fico a disposicao para uma conversa rapida ou para tirar qualquer duvida.

Abraco,
Stefano
Seatable — IA para restaurantes
https://restaurant-ai-mcp.vercel.app
`.trim();

// ─── Email 2: Lina Ristorante (via Pipo) ─────────────────────────────────────

const LINA_DEMO_URL =
  'https://restaurant-ai-mcp.vercel.app/demo/setup?ref=email-outreach&restaurant=Lina%20Ristorante';

const linaSubject = 'Lina Ristorante — gestao de reservas com IA para o seu restaurante';

const linaHtml = `
<div style="font-family: Georgia, serif; max-width: 580px; color: #2d2d2d; line-height: 1.75;">
  <p>Ola,</p>

  <p>
    Conforme orientado pelo Instagram da <strong>Lina Ristorante</strong>, entro em contato por
    aqui com o departamento de compras. Meu nome e Stefano, e criei o <strong>Seatable</strong>
    — uma plataforma de IA para gestao de restaurantes.
  </p>

  <p>
    Desenvolvemos uma demo personalizada para a <strong>Lina Ristorante</strong>, para mostrar
    na pratica como o sistema funcionaria na operacao de voces.
  </p>

  <p style="font-weight: bold; margin-bottom: 4px;">O que o Seatable faz:</p>

  <p style="font-weight: bold; margin-bottom: 4px;">1. Nunca perde uma reserva</p>
  <p style="margin-top: 0;">
    Um agente de IA atende chamadas e WhatsApp <strong>24 horas por dia</strong>, registra reservas
    automaticamente e envia lembretes aos clientes. Sem equipamento especial — funciona no celular.
  </p>

  <p style="font-weight: bold; margin-bottom: 4px;">2. Um gerente inteligente que conhece o seu restaurante</p>
  <p style="margin-top: 0;">
    O Seatable aprende como a casa funciona: ocupacao, horarios de pico, padroes de no-show,
    clientes recorrentes, mesas subutilizadas. Ele aponta os pontos cegos que ficam invisiveis
    no meio do servico — e responde perguntas pelo WhatsApp ou direto no painel, em segundos.
  </p>

  <p>
    Planos a partir de <strong>R$149/mes</strong>. Configuracao em 24h.
  </p>

  <p>Demo personalizada para a Lina Ristorante:</p>

  <p>
    <a href="${LINA_DEMO_URL}" style="
      display: inline-block;
      background: #8b1a2e;
      color: white;
      text-decoration: none;
      padding: 11px 22px;
      border-radius: 999px;
      font-family: sans-serif;
      font-size: 14px;
      font-weight: 600;
    ">Ver Demo — Lina Ristorante</a>
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

const linaText = `
Ola,

Conforme orientado pelo Instagram da Lina Ristorante, entro em contato por aqui com o departamento de compras. Meu nome e Stefano, e criei o Seatable — uma plataforma de IA para gestao de restaurantes.

Desenvolvemos uma demo personalizada para a Lina Ristorante, para mostrar na pratica como o sistema funcionaria na operacao de voces.

O que o Seatable faz:

1. Nunca perde uma reserva
Um agente de IA atende chamadas e WhatsApp 24 horas por dia, registra reservas automaticamente e envia lembretes aos clientes. Sem equipamento especial — funciona no celular.

2. Um gerente inteligente que conhece o seu restaurante
O Seatable aprende como a casa funciona: ocupacao, horarios de pico, padroes de no-show, clientes recorrentes, mesas subutilizadas. Ele aponta os pontos cegos que ficam invisiveis no meio do servico — e responde perguntas pelo WhatsApp ou direto no painel, em segundos.

Planos a partir de R$149/mes. Configuracao em 24h.

Demo personalizada — Lina Ristorante:
${LINA_DEMO_URL}

Fico a disposicao para uma conversa rapida ou para tirar qualquer duvida.

Abraco,
Stefano
Seatable — IA para restaurantes
https://restaurant-ai-mcp.vercel.app
`.trim();

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const emails = [
    {
      label: 'Restaurante Chou',
      recipient: 'financeiro@chou.com.br',
      subject: chouSubject,
      html: chouHtml,
      text: chouText,
    },
    {
      label: 'Lina Ristorante (via Pipo)',
      recipient: 'fernando@piporestaurante.com',
      subject: linaSubject,
      html: linaHtml,
      text: linaText,
    },
  ];

  console.log('\n=== Chou + Lina Outreach ===');
  console.log(`Mode: ${SEND_MODE ? 'LIVE SEND' : 'DRY RUN'}\n`);

  for (const email of emails) {
    console.log(`--- ${email.label} ---`);
    console.log(`To:      ${email.recipient}`);
    console.log(`Subject: ${email.subject}`);

    if (!SEND_MODE) {
      console.log('HTML preview (first 300 chars):');
      console.log(email.html.slice(0, 300) + '...\n');
      continue;
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

    const info = await transport.sendMail({
      from: `"${process.env.GMAIL_FROM_NAME || 'Stefano | Seatable'}" <${process.env.GMAIL_USER}>`,
      to: email.recipient,
      subject: email.subject,
      text: email.text,
      html: email.html,
    });

    console.log(`Sent successfully.`);
    console.log(`Message ID: ${info.messageId}`);
    console.log(`Accepted:   ${info.accepted.join(', ')}\n`);
  }

  if (!SEND_MODE) {
    console.log('Run with --send to actually deliver the emails.\n');
  }
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});

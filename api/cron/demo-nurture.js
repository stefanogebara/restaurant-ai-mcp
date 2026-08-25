/**
 * Cron Job: Demo Nurture Emails
 *
 * Sends conversion emails to demo users at:
 * - Day-3 email: demos expiring in ~96h (4 days left) — feature spotlight + social proof
 * - Day-5 email: demos expiring in ~48h (2 days left) — urgency reminder
 * - Day-7 email: demos expiring today — last-chance CTA
 *
 * Runs daily at 10 AM UTC — "0 10 * * *"
 */

const { supabaseAdmin } = require('../_lib/supabase');
const { createSecureLogger } = require('../_lib/secure-logger');
const { initSentry, captureMessage } = require('../_lib/sentry');
const { Resend } = require('resend');
const { logCronRun } = require('../_lib/cron-tracker');
const { isCronEnabled } = require('../_lib/cron-config');
const { bearerEquals } = require('../_lib/secure-compare');

initSentry();
const logger = createSecureLogger('CronDemoNurture');

const BASE_URL = process.env.CLIENT_URL || 'https://seatable.one';

// Resend free tier: 10 req/s burst limit. Add 100ms delay between sends to stay safe.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FROM_ADDRESS = 'Seatable <bookings@seatable.one>';

// Lazy-init Resend client (same pattern as api/demo.js)
let resendClient = null;
function getResendClient() {
  if (!resendClient && process.env.RESEND_API_KEY) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

// ---------------------------------------------------------------------------
// Nurture emails — localizados (pt-BR default do mercado, en/es), curtos e
// honestos. A reescrita de F3 (Demo em Conversa) trocou o gancho: em vez de
// "seu demo expira", o lembrete é a CONVERSA — a recepcionista atendeu o dono
// em segundos; imagine no WhatsApp de verdade. Saiu tambem o depoimento
// fabricado ("Trattoria da Marco, Milan" e um preset ficticio — apresentar
// isso como cliente real era mentira) e entrou escape de HTML nos campos
// controlados pelo usuario (nome/restaurante — mesma classe do SEC-04).
// ---------------------------------------------------------------------------

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function pickLang(agentLanguage) {
  const l = String(agentLanguage || '').toLowerCase();
  if (l.startsWith('pt')) return 'pt';
  if (l.startsWith('es')) return 'es';
  return 'en';
}

const NURTURE_COPY = {
  pt: {
    fallbackName: 'tudo bem',
    day3: {
      subject: (r) => `Sua recepcionista do ${r} ainda está de plantão`,
      title: (n) => `${n}, faltam 4 dias de demo`,
      body: (r) => [
        `Lembra da conversa em que a IA do <strong>${r}</strong> fechou uma reserva com você em segundos? É exatamente assim que ela atende um cliente de verdade — no WhatsApp, às 2 da manhã, com os seus horários.`,
        'Abra o painel e mande mais uma mensagem para ela. Cada conversa dessas é uma ligação que sua equipe não precisou atender.',
      ],
      cta: 'Abrir meu demo',
    },
    day5: {
      subject: () => 'Seu demo expira em 2 dias',
      title: (n) => `${n}, faltam 2 dias`,
      body: (r) => [
        `Seu demo do <strong>${r}</strong> expira em 2 dias. Crie sua conta para manter tudo que você já configurou — mesas, reservas e a recepcionista prontas para transferir.`,
        '14 dias grátis, sem cartão de crédito.',
      ],
      cta: 'Manter meus dados',
    },
    day7: {
      subject: () => 'Último dia do seu demo na Seatable',
      title: (n) => `${n}, hoje é o último dia`,
      body: (r) => [
        `Hoje o demo do <strong>${r}</strong> expira e os dados são apagados. Se a recepcionista fez sentido para a sua casa, é um clique para ela continuar existindo — tudo que você configurou vai junto.`,
      ],
      cta: 'Criar minha conta',
    },
  },
  en: {
    fallbackName: 'there',
    day3: {
      subject: (r) => `Your ${r} receptionist is still on duty`,
      title: (n) => `${n}, 4 days left on your demo`,
      body: (r) => [
        `Remember the conversation where <strong>${r}</strong>'s AI booked a table with you in seconds? That is exactly how it answers a real guest — on WhatsApp, at 2am, with your hours.`,
        'Open the dashboard and send it another message. Every one of those conversations is a phone call your team did not have to take.',
      ],
      cta: 'Open my demo',
    },
    day5: {
      subject: () => 'Your demo expires in 2 days',
      title: (n) => `${n}, 2 days left`,
      body: (r) => [
        `Your <strong>${r}</strong> demo expires in 2 days. Create your account to keep everything you set up — tables, reservations and your receptionist, ready to transfer.`,
        '14-day free trial, no credit card.',
      ],
      cta: 'Keep my data',
    },
    day7: {
      subject: () => 'Last day of your Seatable demo',
      title: (n) => `${n}, today is the last day`,
      body: (r) => [
        `Today your <strong>${r}</strong> demo expires and its data is deleted. If the receptionist made sense for your restaurant, keeping it alive is one click — everything you configured carries over.`,
      ],
      cta: 'Create my account',
    },
  },
  es: {
    fallbackName: 'hola',
    day3: {
      subject: (r) => `Tu recepcionista de ${r} sigue de guardia`,
      title: (n) => `${n}, quedan 4 días de demo`,
      body: (r) => [
        `¿Recuerdas la conversación en la que la IA de <strong>${r}</strong> cerró una reserva contigo en segundos? Así atiende a un cliente real — por WhatsApp, a las 2 de la mañana, con tus horarios.`,
        'Abre el panel y mándale otro mensaje. Cada una de esas conversaciones es una llamada que tu equipo no tuvo que atender.',
      ],
      cta: 'Abrir mi demo',
    },
    day5: {
      subject: () => 'Tu demo expira en 2 días',
      title: (n) => `${n}, quedan 2 días`,
      body: (r) => [
        `Tu demo de <strong>${r}</strong> expira en 2 días. Crea tu cuenta para conservar todo lo que configuraste — mesas, reservas y tu recepcionista, listas para transferir.`,
        '14 días gratis, sin tarjeta de crédito.',
      ],
      cta: 'Conservar mis datos',
    },
    day7: {
      subject: () => 'Último día de tu demo en Seatable',
      title: (n) => `${n}, hoy es el último día`,
      body: (r) => [
        `Hoy expira tu demo de <strong>${r}</strong> y sus datos se borran. Si la recepcionista tuvo sentido para tu restaurante, mantenerla viva es un clic — todo lo que configuraste se conserva.`,
      ],
      cta: 'Crear mi cuenta',
    },
  },
};

function renderNurtureHtml({ title, paragraphs, cta, ctaUrl }) {
  const ps = paragraphs
    .map((p) => `<p style="color:#57534E;margin:0 0 16px 0;line-height:1.7;">${p}</p>`)
    .join('\n');
  return `
    <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="font-size: 28px; color: #1C1917; margin: 0;">
          Seatable<span style="color: #9F1239;">.</span>
        </h1>
      </div>
      <div style="background: #FAFAF9; border: 1px solid #E7E5E4; border-radius: 16px; padding: 32px; margin-bottom: 24px;">
        <h2 style="font-size: 22px; color: #1C1917; margin: 0 0 16px 0;">${title}</h2>
        ${ps}
        <div style="text-align: center; margin: 24px 0 0 0;">
          <a href="${ctaUrl}"
             style="display:inline-block;padding:14px 28px;background:#9F1239;color:white;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px;">
            ${cta}
          </a>
        </div>
      </div>
      <div style="text-align: center; margin-top: 32px; padding-top: 24px; border-top: 1px solid #E7E5E4;">
        <p style="color: #A8A29E; font-size: 12px; margin: 0;">
          Seatable — Gestão de Restaurantes com IA
        </p>
      </div>
    </div>
  `;
}

function makeNurtureSender(dayKey, ctaUrlFor) {
  return async function sendNurtureEmail({ contactName, contactEmail, restaurantName, demoToken, agentLanguage }) {
    const resend = getResendClient();
    if (!resend) {
      logger.warn(`RESEND_API_KEY not set, skipping ${dayKey} nurture email`);
      return { success: false, reason: 'no_resend_key' };
    }
    const copy = NURTURE_COPY[pickLang(agentLanguage)][dayKey];
    const fallback = NURTURE_COPY[pickLang(agentLanguage)].fallbackName;
    const nome = esc(contactName || fallback);
    const rest = esc(restaurantName);
    try {
      await resend.emails.send({
        from: FROM_ADDRESS,
        to: contactEmail,
        subject: copy.subject(restaurantName),
        html: renderNurtureHtml({
          title: copy.title(nome),
          paragraphs: copy.body(rest),
          cta: copy.cta,
          ctaUrl: ctaUrlFor(demoToken),
        }),
      });
      logger.info(`${dayKey} nurture email sent to: ${contactEmail}`);
      return { success: true };
    } catch (err) {
      logger.error(`Failed to send ${dayKey} nurture email to ${contactEmail}:`, err.message);
      return { success: false, error: err.message };
    }
  };
}

// day3 leva de volta ao demo (re-engajar); day5/day7 levam direto ao signup
// com o token preservado (prefill do onboarding).
const sendDay3Email = makeNurtureSender('day3', (t) => `${BASE_URL}/demo/${t}`);
const sendDay5Email = makeNurtureSender('day5', (t) => `${BASE_URL}/login?from=demo&token=${t}`);
const sendDay7Email = makeNurtureSender('day7', (t) => `${BASE_URL}/login?from=demo&token=${t}`);


// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
module.exports = async (req, res) => {
  // Verify CRON_SECRET Bearer token
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    logger.error('CRON_SECRET not configured - denying request');
    return res.status(500).json({ success: false, error: 'Cron not configured' });
  }
  const authHeader = req.headers.authorization;
  if (!bearerEquals(authHeader, cronSecret)) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Phase U.3 kill switch — ops can disable via cron_config table.
  if (!(await isCronEnabled('demo-nurture'))) {
    logger.warn('demo-nurture cron disabled by ops, skipping run');
    return res.status(200).json({ success: true, skipped: 'disabled_by_ops' });
  }

  // Verify Supabase admin client is available
  if (!supabaseAdmin) {
    logger.error('supabaseAdmin not initialized - missing Supabase credentials');
    return res.status(500).json({ success: false, error: 'Database not configured' });
  }

  try {
    logger.info('Starting demo nurture job...');

    const now = new Date();
    const nowIso = now.toISOString();

    // Day-3 window: demo expires between now+95h and now+97h (4 days left)
    const day3Start = new Date(now.getTime() + 95 * 60 * 60 * 1000).toISOString();
    const day3End   = new Date(now.getTime() + 97 * 60 * 60 * 1000).toISOString();

    // Day-5 window: demo expires between now+47h and now+49h (2 days left)
    const day5Start = new Date(now.getTime() + 47 * 60 * 60 * 1000).toISOString();
    const day5End   = new Date(now.getTime() + 49 * 60 * 60 * 1000).toISOString();

    // Day-7 window: demo expires between now-1h and now+1h (last day)
    const day7Start = new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString();
    const day7End   = new Date(now.getTime() + 1 * 60 * 60 * 1000).toISOString();

    logger.info(`Day-3 window: ${day3Start} — ${day3End}`);
    logger.info(`Day-5 window: ${day5Start} — ${day5End}`);
    logger.info(`Day-7 window: ${day7Start} — ${day7End}`);

    const SELECT_FIELDS = 'id, restaurant_name, demo_token, demo_contact_email, demo_contact_name, demo_expires_at, agent_language, demo_converted_at';

    /**
     * Fetch demo candidates for a given time window and dedup column.
     * Falls back gracefully if the dedup column hasn't been migrated yet.
     */
    async function fetchDemoCandidates(start, end, dedupCol) {
      let query = supabaseAdmin
        .schema('restaurant')
        .from('restaurant_config')
        .select(SELECT_FIELDS)
        .eq('is_demo', true)
        .gte('demo_expires_at', start)
        .lte('demo_expires_at', end);

      // Add dedup filter — may fail if migration hasn't run yet
      query = query.is(dedupCol, null);

      const { data, error } = await query;
      if (error) {
        // If the column doesn't exist yet, log a warning and skip (migration pending)
        if (error.message && error.message.includes('does not exist')) {
          logger.warn(`Dedup column ${dedupCol} missing — run migration 20260311_demo_nurture_columns.sql. Skipping this window.`);
          return [];
        }
        throw error;
      }
      return data || [];
    }

    // Fetch day-3 candidates
    let day3Demos;
    try {
      day3Demos = await fetchDemoCandidates(day3Start, day3End, 'demo_day3_sent_at');
    } catch (err) {
      logger.error('Error fetching day-3 demos:', err);
      return res.status(500).json({ success: false, error: 'Failed to fetch day-3 demos' });
    }

    // Fetch day-5 candidates
    let day5Demos;
    try {
      day5Demos = await fetchDemoCandidates(day5Start, day5End, 'demo_day5_sent_at');
    } catch (err) {
      logger.error('Error fetching day-5 demos:', err);
      return res.status(500).json({ success: false, error: 'Failed to fetch day-5 demos' });
    }

    // Fetch day-7 candidates
    let day7Demos;
    try {
      day7Demos = await fetchDemoCandidates(day7Start, day7End, 'demo_day7_sent_at');
    } catch (err) {
      logger.error('Error fetching day-7 demos:', err);
      return res.status(500).json({ success: false, error: 'Failed to fetch day-7 demos' });
    }

    logger.info(
      `Found ${day3Demos?.length || 0} day-3, ` +
      `${day5Demos?.length || 0} day-5, ` +
      `${day7Demos?.length || 0} day-7 demos`,
    );

    const results = {
      day3: { sent: 0, failed: 0, skipped: 0 },
      day5: { sent: 0, failed: 0, skipped: 0 },
      day7: { sent: 0, failed: 0, skipped: 0 },
    };

    /**
     * Process a batch of demos: send emails sequentially (Resend rate limit),
     * then batch-update all successful IDs in a single DB call.
     */
    /**
     * V.4 fix: claim-then-send, with rollback on failure.
     *
     * Previously the batch sent ALL emails first, THEN updated the dedup
     * column at the end. If Vercel retried after Resend success but before
     * the batch DB write, every email in the batch went out twice on the
     * retry. Now the order is:
     *
     *   1. Compare-and-set the dedup column to NOW WHERE col IS NULL.
     *      If 0 rows updated, somebody else already claimed this slot
     *      (concurrent invocation or in-flight retry) — skip silently.
     *   2. Fire the Resend send.
     *   3. If send fails, NULL the column back so the next cron run can
     *      retry. This gives at-most-once delivery semantics: each demo
     *      either gets one email or none, never two.
     */
    async function processDemoBatch(demos, sendFn, dedupCol, dayKey) {
      for (const demo of (demos || [])) {
        if (!demo.demo_contact_email) {
          logger.info(`Skipping ${dayKey} for demo ${demo.id} — no contact email`);
          results[dayKey].skipped++;
          continue;
        }

        // Converteu = missão cumprida. Mandar "seu demo expira" para quem já
        // criou conta era o comportamento antigo (o convert nunca marcava
        // nada que o nurture lesse) — ruído no pior momento possível: logo
        // depois do signup.
        if (demo.demo_converted_at) {
          logger.info(`Skipping ${dayKey} for demo ${demo.id} — already converted`);
          results[dayKey].skipped++;
          continue;
        }

        // Step 1: atomically claim the dedup slot. Filter on `dedupCol IS NULL`
        // so the UPDATE only fires when nobody else has sent this email yet.
        const { data: claimed, error: claimErr } = await supabaseAdmin
          .schema('restaurant')
          .from('restaurant_config')
          .update({ [dedupCol]: nowIso })
          .eq('id', demo.id)
          .is(dedupCol, null)
          .select('id');

        if (claimErr) {
          logger.error(`Failed to claim ${dedupCol} for demo ${demo.id}:`, claimErr.message);
          results[dayKey].failed++;
          await sleep(100);
          continue;
        }
        if (!claimed || claimed.length === 0) {
          // Already sent (or being sent by another instance). Skip.
          results[dayKey].skipped++;
          continue;
        }

        // Step 2: fire the send. Slot is already claimed, so a Vercel
        // retry that lands here AFTER the send will find the column
        // populated and skip via the .is(dedupCol, null) filter above.
        const emailResult = await sendFn({
          // Sem nome, o template usa a saudação genérica do idioma — não
          // "there" hardcoded num e-mail pt-BR.
          contactName: demo.demo_contact_name || null,
          contactEmail: demo.demo_contact_email,
          restaurantName: demo.restaurant_name,
          demoToken: demo.demo_token,
          agentLanguage: demo.agent_language,
        });

        if (emailResult.success) {
          results[dayKey].sent++;
        } else {
          // Step 3: rollback the claim so a future run can retry this
          // customer. Without the rollback a transient Resend error
          // (500, rate-limit) would permanently mark the demo as
          // "nurtured" with no email actually delivered.
          results[dayKey].failed++;
          const { error: rollbackErr } = await supabaseAdmin
            .schema('restaurant')
            .from('restaurant_config')
            .update({ [dedupCol]: null })
            .eq('id', demo.id);
          if (rollbackErr) {
            logger.warn(`Send failed AND rollback failed for demo ${demo.id} — manual fix needed:`, rollbackErr.message);
          }
        }
        await sleep(100);
      }
    }

    // Process all three tiers
    await processDemoBatch(day3Demos, sendDay3Email, 'demo_day3_sent_at', 'day3');
    await processDemoBatch(day5Demos, sendDay5Email, 'demo_day5_sent_at', 'day5');
    await processDemoBatch(day7Demos, sendDay7Email, 'demo_day7_sent_at', 'day7');

    const totalFailed = results.day3.failed + results.day5.failed + results.day7.failed;
    if (totalFailed > 0) {
      captureMessage(
        `CronDemoNurture: ${totalFailed} nurture email(s) failed`,
        'warning',
        { results, run_at: nowIso }
      );
    }

    const summary = {
      success: true,
      run_at: nowIso,
      day3: results.day3,
      day5: results.day5,
      day7: results.day7,
    };

    logger.info('Demo nurture job complete:', JSON.stringify(summary, null, 2));
    await logCronRun('demo-nurture', { day3: results.day3.sent, day5: results.day5.sent, day7: results.day7.sent });

    return res.status(200).json(summary);
  } catch (error) {
    logger.error('Fatal error in demo nurture job:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message,
    });
  }
};

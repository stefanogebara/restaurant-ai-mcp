const { Resend } = require('resend');
const { createSecureLogger } = require('./secure-logger');
const logger = createSecureLogger('EmailService');

// Lazy-init Resend client
let resendClient = null;
function getResendClient() {
  if (!resendClient && process.env.RESEND_API_KEY) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

const FROM_ADDRESS = 'Seatable <bookings@seatable.one>';

// Escape user-provided strings before embedding in HTML to prevent injection
function he(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// Shared Seatable email wrapper (consistent branding)
function wrapEmailHtml(bodyHtml) {
  return `
    <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="font-size: 28px; color: #1C1917; margin: 0;">
          Seatable<span style="color: #9F1239;">.</span>
        </h1>
      </div>
      ${bodyHtml}
      <div style="text-align: center; margin-top: 32px; padding-top: 24px; border-top: 1px solid #E7E5E4;">
        <p style="color: #A8A29E; font-size: 12px; margin: 0;">
          Powered by Seatable - AI Restaurant Management
        </p>
      </div>
    </div>
  `;
}

/**
 * Send a payment receipt email
 */
async function sendPaymentReceiptEmail({ customerEmail, amount, currency, invoiceId }) {
  const resend = getResendClient();
  if (!resend) { logger.warn('RESEND_API_KEY not set, skipping receipt email'); return; }

  try {
    await resend.emails.send({
      from: FROM_ADDRESS,
      to: customerEmail,
      subject: 'Payment Receipt - Seatable',
      html: wrapEmailHtml(`
        <div style="background: #FAFAF9; border: 1px solid #E7E5E4; border-radius: 16px; padding: 32px; margin-bottom: 24px;">
          <h2 style="font-size: 22px; color: #1C1917; margin: 0 0 8px 0;">Payment Received</h2>
          <p style="color: #57534E; margin: 0 0 24px 0;">Thank you for your payment.</p>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #E7E5E4; color: #78716C; font-size: 14px;">Amount</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #E7E5E4; color: #1C1917; font-weight: 600; text-align: right;">${amount} ${currency}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; color: #78716C; font-size: 14px;">Invoice</td>
              <td style="padding: 12px 0; color: #1C1917; font-weight: 600; text-align: right; font-family: monospace;">${invoiceId}</td>
            </tr>
          </table>
        </div>
        <p style="color: #78716C; font-size: 13px; text-align: center; margin: 0;">
          Questions about your bill? Contact us at hello@seatable.one
        </p>
      `),
    });
    logger.info('Payment receipt email sent to:', customerEmail);
  } catch (err) {
    logger.error('Failed to send receipt email:', err.message);
  }
}

/**
 * Send a payment failure notification email
 */
async function sendPaymentFailedEmail({ customerEmail, amount, currency, invoiceId }) {
  const resend = getResendClient();
  if (!resend) { logger.warn('RESEND_API_KEY not set, skipping payment failed email'); return; }

  try {
    await resend.emails.send({
      from: FROM_ADDRESS,
      to: customerEmail,
      subject: 'Payment Failed - Action Required',
      html: wrapEmailHtml(`
        <div style="background: #FEF2F2; border: 1px solid #FECACA; border-radius: 16px; padding: 32px; margin-bottom: 24px;">
          <h2 style="font-size: 22px; color: #991B1B; margin: 0 0 8px 0;">Payment Failed</h2>
          <p style="color: #57534E; margin: 0 0 24px 0;">We were unable to process your payment. Please update your payment method to avoid service interruption.</p>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #FECACA; color: #78716C; font-size: 14px;">Amount Due</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #FECACA; color: #991B1B; font-weight: 600; text-align: right;">${amount} ${currency}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; color: #78716C; font-size: 14px;">Invoice</td>
              <td style="padding: 12px 0; color: #1C1917; font-weight: 600; text-align: right; font-family: monospace;">${invoiceId}</td>
            </tr>
          </table>
        </div>
        <p style="color: #78716C; font-size: 13px; text-align: center; margin: 0;">
          Need help? Contact us at hello@seatable.one
        </p>
      `),
    });
    logger.info('Payment failed email sent to:', customerEmail);
  } catch (err) {
    logger.error('Failed to send payment failed email:', err.message);
  }
}

/**
 * Send a trial ending reminder email
 */
async function sendTrialEndingEmail({ customerEmail, trialEndsAt }) {
  const resend = getResendClient();
  if (!resend) { logger.warn('RESEND_API_KEY not set, skipping trial ending email'); return; }

  const formattedDate = new Date(trialEndsAt).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  try {
    await resend.emails.send({
      from: FROM_ADDRESS,
      to: customerEmail,
      subject: 'Your Seatable Trial Ends Soon',
      html: wrapEmailHtml(`
        <div style="background: #FFFBEB; border: 1px solid #FDE68A; border-radius: 16px; padding: 32px; margin-bottom: 24px;">
          <h2 style="font-size: 22px; color: #92400E; margin: 0 0 8px 0;">Your Trial Ends Soon</h2>
          <p style="color: #57534E; margin: 0 0 16px 0;">
            Your free trial will end on <strong>${formattedDate}</strong>.
            To continue using Seatable without interruption, make sure your payment method is set up.
          </p>
          <p style="color: #57534E; margin: 0;">
            After the trial, your subscription will automatically begin based on your chosen plan.
          </p>
        </div>
        <p style="color: #78716C; font-size: 13px; text-align: center; margin: 0;">
          Questions? Contact us at hello@seatable.one
        </p>
      `),
    });
    logger.info('Trial ending email sent to:', customerEmail);
  } catch (err) {
    logger.error('Failed to send trial ending email:', err.message);
  }
}

/**
 * Send a retention campaign email
 */
async function sendRetentionCampaignEmail({ customerEmail, customerName, message, campaignType }) {
  const resend = getResendClient();
  if (!resend) { logger.warn('RESEND_API_KEY not set, skipping retention email'); return { sent: false, reason: 'no_api_key' }; }

  const subjectMap = {
    win_back: 'We Miss You!',
    loyalty_reward: 'A Special Reward For You',
    reservation_reminder: 'Time to Book Again?',
  };

  try {
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: customerEmail,
      subject: subjectMap[campaignType] || 'A Message From Your Restaurant',
      html: wrapEmailHtml(`
        <div style="background: #FAFAF9; border: 1px solid #E7E5E4; border-radius: 16px; padding: 32px; margin-bottom: 24px;">
          <h2 style="font-size: 22px; color: #1C1917; margin: 0 0 16px 0;">
            ${customerName ? `Hi ${he(customerName)},` : 'Hello,'}
          </h2>
          <p style="color: #57534E; margin: 0; font-size: 15px; line-height: 1.6;">
            ${he(message)}
          </p>
        </div>
      `),
    });
    if (error) {
      logger.error('Failed to send retention email:', error.message || JSON.stringify(error));
      return { sent: false, reason: error.message || 'resend_error' };
    }
    logger.info('Retention campaign email sent to:', customerEmail);
    return { sent: true };
  } catch (err) {
    logger.error('Failed to send retention email:', err.message);
    return { sent: false, reason: err.message };
  }
}

/**
 * Send a reservation confirmation email to the customer
 */
async function sendReservationConfirmationEmail({
  customerEmail, customerName, restaurantName, reservationId,
  partySize, date, time, specialRequests, cancellationPolicy
}) {
  const resend = getResendClient();
  if (!resend) { logger.warn('RESEND_API_KEY not set, skipping confirmation email'); return; }

  const formattedDate = new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  try {
    await resend.emails.send({
      from: FROM_ADDRESS,
      to: customerEmail,
      subject: `Reservation Confirmed — ${restaurantName}`,
      html: wrapEmailHtml(`
        <div style="background: #FAFAF9; border: 1px solid #E7E5E4; border-radius: 16px; padding: 32px; margin-bottom: 24px;">
          <h2 style="font-size: 22px; color: #1C1917; margin: 0 0 8px 0;">
            Your reservation is confirmed!
          </h2>
          <p style="color: #57534E; margin: 0 0 24px 0;">
            Hi ${he(customerName)}, here are your booking details:
          </p>

          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #E7E5E4; color: #78716C; font-size: 14px;">Restaurant</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #E7E5E4; color: #1C1917; font-weight: 600; text-align: right;">${he(restaurantName)}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #E7E5E4; color: #78716C; font-size: 14px;">Date</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #E7E5E4; color: #1C1917; font-weight: 600; text-align: right;">${he(formattedDate)}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #E7E5E4; color: #78716C; font-size: 14px;">Time</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #E7E5E4; color: #1C1917; font-weight: 600; text-align: right;">${he(time)}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #E7E5E4; color: #78716C; font-size: 14px;">Party Size</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #E7E5E4; color: #1C1917; font-weight: 600; text-align: right;">${partySize} ${partySize === 1 ? 'guest' : 'guests'}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; color: #78716C; font-size: 14px;">Confirmation ID</td>
              <td style="padding: 12px 0; color: #9F1239; font-weight: 700; text-align: right; font-family: monospace;">${he(reservationId)}</td>
            </tr>
          </table>

          ${specialRequests ? `
          <div style="margin-top: 16px; padding: 12px; background: white; border-radius: 8px; border: 1px solid #E7E5E4;">
            <p style="color: #78716C; font-size: 12px; margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 1px;">Special Requests</p>
            <p style="color: #1C1917; margin: 0; font-size: 14px;">${he(specialRequests)}</p>
          </div>
          ` : ''}
        </div>

        ${cancellationPolicy ? `
        <p style="color: #78716C; font-size: 13px; text-align: center; margin: 0 0 16px 0;">
          ${he(cancellationPolicy)}
        </p>
        ` : ''}
        <p style="color: #78716C; font-size: 13px; text-align: center; margin: 0;">
          Need to modify or cancel? Contact the restaurant directly.
        </p>
      `),
    });
    logger.info('Reservation confirmation email sent to:', customerEmail);
  } catch (err) {
    logger.error('Failed to send reservation confirmation email:', err.message);
  }
}

/**
 * Send a new booking alert to the restaurant owner
 */
async function sendNewBookingAlertEmail({
  ownerEmail, restaurantName, customerName, customerPhone,
  customerEmail, reservationId, partySize, date, time, specialRequests
}) {
  const resend = getResendClient();
  if (!resend) { logger.warn('RESEND_API_KEY not set, skipping owner alert email'); return; }

  const formattedDate = new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  try {
    await resend.emails.send({
      from: FROM_ADDRESS,
      to: ownerEmail,
      subject: `New Reservation — ${customerName}, ${partySize} guests on ${formattedDate}`,
      html: wrapEmailHtml(`
        <div style="background: #FAFAF9; border: 1px solid #E7E5E4; border-radius: 16px; padding: 32px; margin-bottom: 24px;">
          <h2 style="font-size: 22px; color: #1C1917; margin: 0 0 8px 0;">
            New Reservation
          </h2>
          <p style="color: #57534E; margin: 0 0 24px 0;">
            A new booking has been made via your online portal.
          </p>

          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #E7E5E4; color: #78716C; font-size: 14px;">Guest Name</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #E7E5E4; color: #1C1917; font-weight: 600; text-align: right;">${he(customerName)}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #E7E5E4; color: #78716C; font-size: 14px;">Date</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #E7E5E4; color: #1C1917; font-weight: 600; text-align: right;">${he(formattedDate)}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #E7E5E4; color: #78716C; font-size: 14px;">Time</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #E7E5E4; color: #1C1917; font-weight: 600; text-align: right;">${he(time)}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #E7E5E4; color: #78716C; font-size: 14px;">Party Size</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #E7E5E4; color: #1C1917; font-weight: 600; text-align: right;">${partySize} ${partySize === 1 ? 'guest' : 'guests'}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #E7E5E4; color: #78716C; font-size: 14px;">Phone</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #E7E5E4; color: #1C1917; font-weight: 600; text-align: right;">${he(customerPhone)}</td>
            </tr>
            ${customerEmail ? `
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #E7E5E4; color: #78716C; font-size: 14px;">Email</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #E7E5E4; color: #1C1917; font-weight: 600; text-align: right;">${he(customerEmail)}</td>
            </tr>
            ` : ''}
            <tr>
              <td style="padding: 12px 0; color: #78716C; font-size: 14px;">Confirmation ID</td>
              <td style="padding: 12px 0; color: #9F1239; font-weight: 700; text-align: right; font-family: monospace;">${he(reservationId)}</td>
            </tr>
          </table>

          ${specialRequests ? `
          <div style="margin-top: 16px; padding: 12px; background: white; border-radius: 8px; border: 1px solid #E7E5E4;">
            <p style="color: #78716C; font-size: 12px; margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 1px;">Special Requests</p>
            <p style="color: #1C1917; margin: 0; font-size: 14px;">${he(specialRequests)}</p>
          </div>
          ` : ''}
        </div>
        <p style="color: #78716C; font-size: 13px; text-align: center; margin: 0;">
          Manage all reservations in your <a href="https://seatable.one/host-dashboard/simple" style="color: #9F1239;">Seatable dashboard</a>.
        </p>
      `),
    });
    logger.info('New booking alert sent to restaurant owner:', ownerEmail);
  } catch (err) {
    logger.error('Failed to send new booking alert email:', err.message);
  }
}

/**
 * Send a referral reward notification to the referrer
 */
async function sendReferralRewardEmail(to, { referrerName, refereeRestaurantName, creditAmount }) {
  const resend = getResendClient();
  if (!resend) { logger.warn('RESEND_API_KEY not set, skipping referral reward email'); return; }

  const displayCredit = typeof creditAmount === 'number'
    ? `EUR ${(creditAmount / 100).toFixed(2)}`
    : String(creditAmount);

  const plainText = [
    `Hi ${referrerName || 'there'},`,
    '',
    `Great news — ${refereeRestaurantName || 'the restaurant you referred'} just made their first payment on Seatable.`,
    '',
    `As a thank you, we've applied 1 month free (${displayCredit} credit) to your account.`,
    'The credit will automatically reduce your next invoice.',
    '',
    'Keep spreading the word — every restaurant you refer earns you another free month.',
    '',
    'Thanks for being part of Seatable.',
    '',
    'The Seatable Team',
    'hello@seatable.one',
  ].join('\n');

  try {
    await resend.emails.send({
      from: FROM_ADDRESS,
      to,
      subject: 'You earned a referral reward!',
      html: wrapEmailHtml(`
        <div style="background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 16px; padding: 32px; margin-bottom: 24px;">
          <h2 style="font-size: 22px; color: #14532D; margin: 0 0 8px 0;">You earned a referral reward!</h2>
          <p style="color: #57534E; margin: 0 0 16px 0;">
            Hi ${he(referrerName || 'there')},
          </p>
          <p style="color: #57534E; margin: 0 0 16px 0;">
            <strong style="color: #1C1917;">${he(refereeRestaurantName || 'The restaurant you referred')}</strong>
            just made their first payment on Seatable — which means your referral reward has been unlocked.
          </p>
          <div style="background: white; border: 1px solid #BBF7D0; border-radius: 10px; padding: 20px; margin: 20px 0; text-align: center;">
            <p style="color: #78716C; font-size: 13px; margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 1px;">Credit applied to your account</p>
            <p style="color: #14532D; font-size: 28px; font-weight: 700; margin: 0;">${he(displayCredit)}</p>
            <p style="color: #78716C; font-size: 13px; margin: 4px 0 0 0;">1 month free</p>
          </div>
          <p style="color: #57534E; margin: 0;">
            The credit will automatically be applied to your next invoice — no action needed on your part.
            Keep spreading the word; every restaurant you refer earns you another free month.
          </p>
        </div>
        <p style="color: #78716C; font-size: 13px; text-align: center; margin: 0;">
          Questions? Contact us at <a href="mailto:hello@seatable.one" style="color: #9F1239;">hello@seatable.one</a>
        </p>
      `),
      text: plainText,
    });
    logger.info('Referral reward email sent to:', to);
  } catch (err) {
    logger.error('Failed to send referral reward email:', err.message);
  }
}

/**
 * Send a team member invitation email
 */
async function sendInviteEmail({ to, inviteUrl, role }) {
  const resend = getResendClient();
  if (!resend) { logger.warn('RESEND_API_KEY not set, skipping invite email'); return; }

  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);

  try {
    await resend.emails.send({
      from: FROM_ADDRESS,
      to,
      subject: `You're invited to join a restaurant team as ${roleLabel}`,
      html: wrapEmailHtml(`
        <div style="background: #FAFAF9; border: 1px solid #E7E5E4; border-radius: 16px; padding: 32px; margin-bottom: 24px;">
          <h2 style="font-size: 22px; color: #1C1917; margin: 0 0 8px 0;">You're invited!</h2>
          <p style="color: #57534E; margin: 0 0 24px 0;">
            You've been invited to join a restaurant team on Seatable as a
            <strong style="color: #1C1917;">${he(roleLabel)}</strong>.
            Click the button below to accept your invitation.
          </p>
          <div style="text-align: center; margin: 24px 0;">
            <a href="${inviteUrl}"
               style="display:inline-block;padding:14px 28px;background:#9F1239;color:white;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px;">
              Accept Invitation
            </a>
          </div>
          <p style="color: #A8A29E; font-size: 12px; text-align: center; margin: 0;">
            This invitation expires in 7 days. If you weren't expecting this email, you can safely ignore it.
          </p>
        </div>
      `),
    });
    logger.info('Invite email sent to:', to);
  } catch (err) {
    logger.error('Failed to send invite email:', err.message);
  }
}

/**
 * Send a reservation cancellation email to the customer
 */
async function sendReservationCancellationEmail({
  customerEmail, customerName, restaurantName, reservationId,
  partySize, date, time, reason
}) {
  const resend = getResendClient();
  if (!resend) { logger.warn('RESEND_API_KEY not set, skipping cancellation email'); return; }

  const formattedDate = new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  try {
    await resend.emails.send({
      from: FROM_ADDRESS,
      to: customerEmail,
      subject: `Reservation Cancelled — ${restaurantName}`,
      html: wrapEmailHtml(`
        <div style="background: #FEF2F2; border: 1px solid #FECACA; border-radius: 16px; padding: 32px; margin-bottom: 24px;">
          <h2 style="font-size: 22px; color: #991B1B; margin: 0 0 8px 0;">
            Reservation Cancelled
          </h2>
          <p style="color: #57534E; margin: 0 0 24px 0;">
            Hi ${he(customerName)}, your reservation has been cancelled.
          </p>

          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #FECACA; color: #78716C; font-size: 14px;">Restaurant</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #FECACA; color: #1C1917; font-weight: 600; text-align: right;">${he(restaurantName)}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #FECACA; color: #78716C; font-size: 14px;">Date</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #FECACA; color: #1C1917; font-weight: 600; text-align: right;">${he(formattedDate)}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #FECACA; color: #78716C; font-size: 14px;">Time</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #FECACA; color: #1C1917; font-weight: 600; text-align: right;">${he(time)}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #FECACA; color: #78716C; font-size: 14px;">Party Size</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #FECACA; color: #1C1917; font-weight: 600; text-align: right;">${partySize} ${partySize === 1 ? 'guest' : 'guests'}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; color: #78716C; font-size: 14px;">Confirmation ID</td>
              <td style="padding: 12px 0; color: #9F1239; font-weight: 700; text-align: right; font-family: monospace;">${he(reservationId)}</td>
            </tr>
          </table>

          ${reason ? `
          <div style="margin-top: 16px; padding: 12px; background: white; border-radius: 8px; border: 1px solid #FECACA;">
            <p style="color: #78716C; font-size: 12px; margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 1px;">Reason</p>
            <p style="color: #1C1917; margin: 0; font-size: 14px;">${he(reason)}</p>
          </div>
          ` : ''}
        </div>
        <p style="color: #78716C; font-size: 13px; text-align: center; margin: 0;">
          Would you like to rebook? Contact the restaurant directly or visit our booking page.
        </p>
      `),
    });
    logger.info('Reservation cancellation email sent to:', customerEmail);
  } catch (err) {
    logger.error('Failed to send reservation cancellation email:', err.message);
  }
}

/**
 * Send a reservation modification email to the customer
 */
async function sendReservationModificationEmail({
  customerEmail, customerName, restaurantName, reservationId,
  partySize, date, time, changes
}) {
  const resend = getResendClient();
  if (!resend) { logger.warn('RESEND_API_KEY not set, skipping modification email'); return; }

  const formattedDate = new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  const changeLines = (changes || []).map(c => `<li style="color: #57534E; margin-bottom: 4px;">${he(c)}</li>`).join('');

  try {
    await resend.emails.send({
      from: FROM_ADDRESS,
      to: customerEmail,
      subject: `Reservation Updated — ${restaurantName}`,
      html: wrapEmailHtml(`
        <div style="background: #FFFBEB; border: 1px solid #FDE68A; border-radius: 16px; padding: 32px; margin-bottom: 24px;">
          <h2 style="font-size: 22px; color: #92400E; margin: 0 0 8px 0;">
            Reservation Updated
          </h2>
          <p style="color: #57534E; margin: 0 0 24px 0;">
            Hi ${he(customerName)}, your reservation has been updated. Here are the current details:
          </p>

          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #FDE68A; color: #78716C; font-size: 14px;">Restaurant</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #FDE68A; color: #1C1917; font-weight: 600; text-align: right;">${he(restaurantName)}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #FDE68A; color: #78716C; font-size: 14px;">Date</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #FDE68A; color: #1C1917; font-weight: 600; text-align: right;">${he(formattedDate)}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #FDE68A; color: #78716C; font-size: 14px;">Time</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #FDE68A; color: #1C1917; font-weight: 600; text-align: right;">${he(time)}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #FDE68A; color: #78716C; font-size: 14px;">Party Size</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #FDE68A; color: #1C1917; font-weight: 600; text-align: right;">${partySize} ${partySize === 1 ? 'guest' : 'guests'}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; color: #78716C; font-size: 14px;">Confirmation ID</td>
              <td style="padding: 12px 0; color: #9F1239; font-weight: 700; text-align: right; font-family: monospace;">${he(reservationId)}</td>
            </tr>
          </table>

          ${changeLines ? `
          <div style="margin-top: 16px; padding: 12px; background: white; border-radius: 8px; border: 1px solid #FDE68A;">
            <p style="color: #78716C; font-size: 12px; margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 1px;">What Changed</p>
            <ul style="margin: 0; padding-left: 18px; font-size: 14px;">${changeLines}</ul>
          </div>
          ` : ''}
        </div>
        <p style="color: #78716C; font-size: 13px; text-align: center; margin: 0;">
          Need to make further changes? Contact the restaurant directly.
        </p>
      `),
    });
    logger.info('Reservation modification email sent to:', customerEmail);
  } catch (err) {
    logger.error('Failed to send reservation modification email:', err.message);
  }
}

module.exports = {
  sendPaymentReceiptEmail,
  sendPaymentFailedEmail,
  sendTrialEndingEmail,
  sendRetentionCampaignEmail,
  sendReservationConfirmationEmail,
  sendNewBookingAlertEmail,
  sendReservationCancellationEmail,
  sendReservationModificationEmail,
  sendInviteEmail,
  sendReferralRewardEmail,
  wrapEmailHtml,
};

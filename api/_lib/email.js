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

const FROM_ADDRESS = 'Seatable <bookings@seatable.io>';

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
          Questions about your bill? Contact us at hello@seatable.io
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
          Need help? Contact us at hello@seatable.io
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
          Questions? Contact us at hello@seatable.io
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
    await resend.emails.send({
      from: FROM_ADDRESS,
      to: customerEmail,
      subject: subjectMap[campaignType] || 'A Message From Your Restaurant',
      html: wrapEmailHtml(`
        <div style="background: #FAFAF9; border: 1px solid #E7E5E4; border-radius: 16px; padding: 32px; margin-bottom: 24px;">
          <h2 style="font-size: 22px; color: #1C1917; margin: 0 0 16px 0;">
            ${customerName ? `Hi ${customerName},` : 'Hello,'}
          </h2>
          <p style="color: #57534E; margin: 0; font-size: 15px; line-height: 1.6;">
            ${message}
          </p>
        </div>
      `),
    });
    logger.info('Retention campaign email sent to:', customerEmail);
    return { sent: true };
  } catch (err) {
    logger.error('Failed to send retention email:', err.message);
    return { sent: false, reason: err.message };
  }
}

module.exports = {
  sendPaymentReceiptEmail,
  sendPaymentFailedEmail,
  sendTrialEndingEmail,
  sendRetentionCampaignEmail,
  wrapEmailHtml,
};

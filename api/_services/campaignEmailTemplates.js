/**
 * Campaign Email Templates
 *
 * Provides branded email templates for automated campaigns:
 * - Thank you (post-visit)
 * - Birthday reminder
 * - Lapsed customer (30/60/90 days)
 * - Review request (with Google Reviews link)
 *
 * All emails include an unsubscribe link in the footer.
 */

const { Resend } = require('resend');
const { createSecureLogger } = require('../_lib/secure-logger');
const { wrapEmailHtml } = require('../_lib/email');

const logger = createSecureLogger('CampaignEmailTemplates');

let resendClient = null;
function getResendClient() {
  if (!resendClient && process.env.RESEND_API_KEY) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

const FROM_ADDRESS = 'Seatable <bookings@seatable.one>';

function he(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function unsubscribeFooter(unsubscribeUrl) {
  if (!unsubscribeUrl) return '';
  return `
    <div style="text-align: center; margin-top: 24px; padding-top: 16px; border-top: 1px solid #E7E5E4;">
      <p style="color: #A8A29E; font-size: 11px; margin: 0;">
        You received this because you visited our restaurant.
        <a href="${he(unsubscribeUrl)}" style="color: #A8A29E; text-decoration: underline;">Unsubscribe</a>
      </p>
    </div>
  `;
}

/**
 * Template: Post-visit thank you
 */
function buildThankYouEmail({ customerName, restaurantName, unsubscribeUrl }) {
  const greeting = customerName ? `Hi ${he(customerName)},` : 'Hello,';
  return {
    subject: `Thank you for visiting ${restaurantName}!`,
    html: wrapEmailHtml(`
      <div style="background: #FAFAF9; border: 1px solid #E7E5E4; border-radius: 16px; padding: 32px; margin-bottom: 24px;">
        <h2 style="font-size: 22px; color: #1C1917; margin: 0 0 16px 0;">
          ${greeting}
        </h2>
        <p style="color: #57534E; margin: 0 0 16px 0; font-size: 15px; line-height: 1.6;">
          Thank you for dining with us at <strong>${he(restaurantName)}</strong>. We hope you enjoyed your experience!
        </p>
        <p style="color: #57534E; margin: 0; font-size: 15px; line-height: 1.6;">
          We look forward to welcoming you again soon.
        </p>
      </div>
      ${unsubscribeFooter(unsubscribeUrl)}
    `),
  };
}

/**
 * Template: Birthday reminder
 */
function buildBirthdayEmail({ customerName, restaurantName, unsubscribeUrl }) {
  const greeting = customerName ? `Happy Birthday, ${he(customerName)}!` : 'Happy Birthday!';
  return {
    subject: `Happy Birthday from ${restaurantName}!`,
    html: wrapEmailHtml(`
      <div style="background: #FAFAF9; border: 1px solid #E7E5E4; border-radius: 16px; padding: 32px; margin-bottom: 24px;">
        <h2 style="font-size: 22px; color: #1C1917; margin: 0 0 16px 0;">
          ${greeting}
        </h2>
        <p style="color: #57534E; margin: 0 0 16px 0; font-size: 15px; line-height: 1.6;">
          Your birthday is coming up and we would love to celebrate with you at <strong>${he(restaurantName)}</strong>!
        </p>
        <p style="color: #57534E; margin: 0; font-size: 15px; line-height: 1.6;">
          Book a table and let us make your birthday special.
        </p>
      </div>
      ${unsubscribeFooter(unsubscribeUrl)}
    `),
  };
}

/**
 * Template: Lapsed customer (30/60/90 days)
 */
function buildLapsedEmail({ customerName, restaurantName, daysAway, unsubscribeUrl }) {
  const greeting = customerName ? `Hi ${he(customerName)},` : 'Hello,';
  return {
    subject: `We miss you at ${restaurantName}!`,
    html: wrapEmailHtml(`
      <div style="background: #FAFAF9; border: 1px solid #E7E5E4; border-radius: 16px; padding: 32px; margin-bottom: 24px;">
        <h2 style="font-size: 22px; color: #1C1917; margin: 0 0 16px 0;">
          ${greeting}
        </h2>
        <p style="color: #57534E; margin: 0 0 16px 0; font-size: 15px; line-height: 1.6;">
          It has been ${daysAway} days since your last visit to <strong>${he(restaurantName)}</strong>. We would love to see you again!
        </p>
        <p style="color: #57534E; margin: 0; font-size: 15px; line-height: 1.6;">
          Come back and discover what is new on our menu.
        </p>
      </div>
      ${unsubscribeFooter(unsubscribeUrl)}
    `),
  };
}

/**
 * Template: Review request with Google Reviews link
 */
function buildReviewRequestEmail({ customerName, restaurantName, googleReviewUrl, unsubscribeUrl }) {
  const greeting = customerName ? `Hi ${he(customerName)},` : 'Hello,';
  return {
    subject: `How was your experience at ${restaurantName}?`,
    html: wrapEmailHtml(`
      <div style="background: #FAFAF9; border: 1px solid #E7E5E4; border-radius: 16px; padding: 32px; margin-bottom: 24px;">
        <h2 style="font-size: 22px; color: #1C1917; margin: 0 0 16px 0;">
          ${greeting}
        </h2>
        <p style="color: #57534E; margin: 0 0 16px 0; font-size: 15px; line-height: 1.6;">
          Thank you for dining at <strong>${he(restaurantName)}</strong>. We hope you had a great time!
        </p>
        <p style="color: #57534E; margin: 0 0 24px 0; font-size: 15px; line-height: 1.6;">
          Would you take a moment to share your experience? Your feedback helps us improve.
        </p>
        <div style="text-align: center;">
          <a href="${he(googleReviewUrl)}"
             style="display: inline-block; background: #9F1239; color: #fff; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px;">
            Leave a Review
          </a>
        </div>
      </div>
      ${unsubscribeFooter(unsubscribeUrl)}
    `),
  };
}

/**
 * Send a campaign email using the appropriate template.
 * @param {object} params
 * @param {string} params.triggerType - The automation trigger type
 * @param {string} params.customerEmail - Recipient email
 * @param {string} params.customerName - Recipient name
 * @param {string} params.restaurantName - Restaurant name
 * @param {string} [params.googleReviewUrl] - Google review URL (for review_request)
 * @param {number} [params.daysAway] - Days since last visit (for lapsed triggers)
 * @param {string} [params.unsubscribeUrl] - Unsubscribe link
 * @returns {{ sent: boolean, reason?: string }}
 */
async function sendCampaignEmail(params) {
  const resend = getResendClient();
  if (!resend) {
    logger.warn('RESEND_API_KEY not set, skipping campaign email');
    return { sent: false, reason: 'no_api_key' };
  }

  if (!params.customerEmail) {
    return { sent: false, reason: 'no_email' };
  }

  let template;
  switch (params.triggerType) {
    case 'post_visit_thank_you':
      template = buildThankYouEmail(params);
      break;
    case 'birthday_reminder':
      template = buildBirthdayEmail(params);
      break;
    case 'lapsed_30d':
    case 'lapsed_60d':
    case 'lapsed_90d':
      template = buildLapsedEmail(params);
      break;
    case 'review_request':
      template = buildReviewRequestEmail(params);
      break;
    default:
      return { sent: false, reason: 'unknown_trigger_type' };
  }

  try {
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: params.customerEmail,
      subject: template.subject,
      html: template.html,
    });

    if (error) {
      logger.error('Campaign email send failed', { error: error.message || JSON.stringify(error) });
      return { sent: false, reason: error.message || 'resend_error' };
    }

    logger.info('Campaign email sent', {
      trigger: params.triggerType,
      email: params.customerEmail.substring(0, 3) + '***',
    });
    return { sent: true };
  } catch (err) {
    logger.error('Campaign email exception', { error: err.message });
    return { sent: false, reason: err.message };
  }
}

module.exports = {
  sendCampaignEmail,
  buildThankYouEmail,
  buildBirthdayEmail,
  buildLapsedEmail,
  buildReviewRequestEmail,
};

const Stripe = require('stripe');
const { verifyAuth } = require('./_lib/auth');
const { setInternalCors, handlePreflight } = require('./_lib/cors');
const { getSubscriptions } = require('./_lib/supabase');
const { createSecureLogger } = require('./_lib/secure-logger');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const logger = createSecureLogger('CustomerPortal');
const manageableStatuses = new Set(['active', 'trialing', 'past_due', 'unpaid', 'paused', 'incomplete']);

module.exports = async (req, res) => {
  setInternalCors(req, res);
  if (handlePreflight(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (await checkAndApplyRateLimit(req, res, 'customer_portal')) return;

  const auth = await verifyAuth(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const { restaurant_id: restaurantId, role } = auth.user;
  if (!restaurantId) return res.status(400).json({ error: 'Restaurant setup required' });
  if (role !== 'owner') return res.status(403).json({ error: 'Forbidden' });

  try {
    const result = await getSubscriptions(restaurantId);
    if (!result.success) throw new Error('Unable to look up billing records');

    const stripeRecords = result.data.records.filter(({ fields }) =>
      typeof fields['Customer ID'] === 'string' && fields['Customer ID'].startsWith('cus_'),
    );
    const record = stripeRecords.find(({ fields }) => manageableStatuses.has(fields.Status)) || stripeRecords[0];
    if (!record) {
      return res.status(400).json({ error: 'No Stripe customer found for this restaurant' });
    }

    const customerId = record.fields['Customer ID'];
    const customer = await stripe.customers.retrieve(customerId);
    if (!customer || customer.deleted || customer.id !== customerId) {
      return res.status(400).json({ error: 'No Stripe customer found for this restaurant' });
    }

    // Older customers can lack Stripe metadata. Their trusted restaurant
    // subscription record still binds the customer to this tenant.
    const customerRestaurantId = customer.metadata?.restaurant_id;
    if (customerRestaurantId && customerRestaurantId !== restaurantId) {
      logger.warn('Billing portal rejected conflicting customer ownership');
      return res.status(403).json({ error: 'Forbidden' });
    }

    const returnOrigin = process.env.CLIENT_URL || 'https://seatable.one';
    const allowedOrigins = ['https://seatable.one', 'https://restaurant-ai-mcp.vercel.app', returnOrigin];
    const origin = allowedOrigins.includes(req.headers.origin) ? req.headers.origin : returnOrigin;

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/subscription/manage`,
    });
    return res.status(200).json({ url: portalSession.url });
  } catch (error) {
    logger.error('Error creating portal session', { code: error?.code });
    return res.status(500).json({
      error: 'Unable to open the billing portal. Please try again or contact support.',
    });
  }
};

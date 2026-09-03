const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const { createSecureLogger } = require('./_lib/secure-logger');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const { verifyJWT } = require('./_lib/auth');
const { supabaseAdmin } = require('./_lib/supabase');
const { setInternalCors, handlePreflight } = require('./_lib/cors');
const logger = createSecureLogger('VerifySession');

module.exports = async (req, res) => {
  setInternalCors(req, res);
  if (handlePreflight(req, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (await checkAndApplyRateLimit(req, res, 'api')) return;

  // Require JWT auth — session data contains Stripe PII
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const authUser = await verifyJWT(token).catch(() => null);
  if (!authUser) return res.status(401).json({ error: 'Authentication required' });

  try {
    const { session_id } = req.query;

    if (!session_id) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    // Retrieve the checkout session from Stripe with line items expanded
    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ['line_items.data.price']
    });

    // Map Stripe price IDs to plan names
    const planMapping = {
      [process.env.STRIPE_STARTER_PRICE_ID]: 'Starter',
      [process.env.STRIPE_GROWTH_PRICE_ID]: 'Growth',
      [process.env.STRIPE_SCALE_PRICE_ID]: 'Scale',
    };

    // Extract plan from line items
    let plan = 'Starter'; // Default to Starter
    if (session.line_items && session.line_items.data.length > 0) {
      const priceId = session.line_items.data[0].price.id;
      plan = planMapping[priceId] || 'Starter';
    }

    // Reject sessions that weren't paid (expired, cancelled, etc.)
    if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
      return res.status(402).json({
        error: 'Payment not completed',
        status: session.payment_status,
      });
    }

    // Verify the session belongs to the authenticated user by matching customer_email
    const sessionEmail = session.customer_details?.email;
    if (sessionEmail && authUser.sub) {
      // A coluna e `email`, nao `customer_email` — esta ultima nao existe em
      // restaurant_config. Com a coluna errada o select falhava (42703), o
      // cliente do Supabase devolvia data null SEM lancar, `restaurant` ficava
      // null, e o bloco de posse abaixo era pulado inteiro: o 403 NUNCA
      // disparou. Qualquer usuario autenticado lia qualquer sessao de checkout
      // do Stripe pelo session_id — e-mail, valor, subscription.
      //
      // O `error` agora e lido: se a consulta falhar, a resposta e recusar,
      // nao liberar. Falha de verificacao nao pode virar acesso.
      const { data: restaurant, error: restaurantErr } = await supabaseAdmin
        .schema('restaurant')
        .from('restaurant_config')
        .select('email')
        .eq('user_id', authUser.sub)
        .limit(1)
        .single();

      if (restaurantErr && restaurantErr.code !== 'PGRST116') {
        logger.error('verify-session: falha ao carregar o restaurante para checar posse', { error: restaurantErr.message });
        return res.status(403).json({ success: false, error: 'Forbidden' });
      }

      // If we found a restaurant record, enforce ownership
      if (restaurant) {
        if (!restaurant.email) {
          logger.warn('verify-session: restaurant has no email, skipping ownership check', { userId: authUser.sub });
        } else if (restaurant.email.toLowerCase() !== String(sessionEmail).toLowerCase()) {
          logger.warn('verify-session ownership mismatch', { userId: authUser.sub });
          return res.status(403).json({ success: false, error: 'Forbidden' });
        }
      }
    }

    // Return relevant session information
    return res.status(200).json({
      status: session.payment_status,
      customer_id: session.customer,
      customer_email: session.customer_details?.email,
      subscription_id: session.subscription,
      amount_total: session.amount_total,
      currency: session.currency,
      plan: plan, // Add plan to response
    });
  } catch (error) {
    logger.error('Error verifying session:', error);
    return res.status(500).json({
      error: 'Failed to verify session',
    });
  }
};

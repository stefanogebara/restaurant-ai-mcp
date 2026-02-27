/**
 * localStorage Key Constants
 *
 * All localStorage keys in one place — prevents typos and makes
 * refactoring safe. Import from here instead of using raw strings.
 */

/** Authenticated user's email address */
export const LS_CUSTOMER_EMAIL = 'customer_email';

/** Restaurant ID from JWT / OAuth flow */
export const LS_RESTAURANT_ID = 'restaurant_id';

/** Referral code captured from ?ref= query param on landing page */
export const LS_REFERRAL_CODE = 'referral_code';

/** i18next active language code (e.g. 'en', 'es') */
export const LS_LANGUAGE = 'i18nextLng';

/** Flag: has the first-reservation PostHog event been fired this session */
export const LS_FIRST_RESERVATION_TRACKED = 'seatable_first_reservation_tracked';

/** Serialized onboarding form data (JSON) — cleared on completion */
export const LS_ONBOARDING_DATA = 'onboarding_data';

/** Current onboarding step number — cleared on completion */
export const LS_ONBOARDING_STEP = 'onboarding_step';

/** Stripe customer ID set after successful subscription */
export const LS_STRIPE_CUSTOMER_ID = 'stripe_customer_id';

/** Subscription plan name set after successful subscription */
export const LS_SUBSCRIPTION_PLAN = 'subscription_plan';

/** Demo token saved so it survives auth redirects and email/password login */
export const LS_PENDING_DEMO_TOKEN = 'pending_demo_token';

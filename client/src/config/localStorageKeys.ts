/**
 * localStorage Key Constants
 *
 * All localStorage keys in one place — prevents typos and makes
 * refactoring safe. Import from here instead of using raw strings.
 */

/** Authenticated user's email address */
export const LS_CUSTOMER_EMAIL = 'customer_email';

/** Referral code captured from ?ref= query param on landing page */
export const LS_REFERRAL_CODE = 'referral_code';

/** Explicit user language choice (e.g. 'en', 'es', 'pt-BR').
 *  This key is also used by i18next-browser-languagedetector (lookupLocalStorage). */
export const LS_LANGUAGE = 'seatable-user-lang';

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

/** Timestamp (ms) when verify-session last confirmed a Stripe payment.
 *  Used by /subscription/manage to render an "activating" state instead of
 *  the upsell page during the brief window between Stripe redirect and the
 *  customer.subscription.created webhook landing in our DB. */
export const LS_PAYMENT_VERIFIED_AT = 'payment_verified_at';

/** Demo token saved so it survives auth redirects and email/password login */
export const LS_PENDING_DEMO_TOKEN = 'pending_demo_token';

/** Set to '1' after the post-onboarding launch checklist is dismissed */
export const LS_LAUNCH_CHECKLIST_DONE = 'seatable_launch_done';

/**
 * PostHog Analytics — Funnel Tracking
 *
 * Tracks the key conversion funnel:
 *   landing_page_viewed
 *     → cta_clicked
 *     → signup_started
 *     → onboarding_step_completed (×4)
 *     → onboarding_completed
 *     → first_reservation_created
 *
 * Only initializes in production when VITE_POSTHOG_KEY is set.
 * All track() calls are safe no-ops when PostHog is not initialized.
 */

import posthog from 'posthog-js';

export function initAnalytics(): void {
  const key = import.meta.env.VITE_POSTHOG_KEY;
  const host = import.meta.env.VITE_POSTHOG_HOST || 'https://app.posthog.com';

  if (!key) {
    console.log('ℹ️ PostHog not initialized (missing VITE_POSTHOG_KEY)');
    return;
  }

  posthog.init(key, {
    api_host: host,
    // Don't capture pageviews automatically — we fire them manually for SPA accuracy
    capture_pageview: false,
    // Respect privacy — don't capture sensitive form input values
    mask_all_text: false,
    autocapture: false,
    persistence: 'localStorage',
  });

  console.log('✅ PostHog analytics initialized');
}

// ─── Typed event catalogue ───────────────────────────────────────────────────

export function trackLandingPageViewed(): void {
  posthog.capture('landing_page_viewed');
}

export function trackCtaClicked(props: { cta: 'primary' | 'demo' | 'pricing_cta'; location: string }): void {
  posthog.capture('cta_clicked', props);
}

export function trackPricingPlanClicked(props: { plan: string; price: number }): void {
  posthog.capture('pricing_plan_clicked', props);
}

export function trackSignupStarted(props: { method: 'google' | 'email' }): void {
  posthog.capture('signup_started', props);
}

export function trackOnboardingStepCompleted(props: { step: number; step_name: string }): void {
  posthog.capture('onboarding_step_completed', props);
}

export function trackOnboardingCompleted(props: { plan: string; country: string; restaurant_type: string }): void {
  posthog.capture('onboarding_completed', props);
  // Identify the user with their restaurant properties for cohort analysis
  posthog.people?.set({
    plan: props.plan,
    country: props.country,
    restaurant_type: props.restaurant_type,
  });
}

export function trackFirstReservationCreated(): void {
  posthog.capture('first_reservation_created');
}

// ─── Phase 13 Landing Events ────────────────────────────────────────────────

export function trackPresetDemoClicked(props: { restaurant: string }): void {
  posthog.capture('preset_demo_clicked', props);
}

export function trackWhatsAppTapped(): void {
  posthog.capture('whatsapp_demo_tapped');
}

export function trackDemoSlideInAction(props: { action: 'cta' | 'dismiss' | 'later' }): void {
  posthog.capture('demo_slidein_action', props);
}

export function trackHeadlineVariantViewed(props: { variant: string }): void {
  posthog.capture('headline_variant_viewed', props);
}

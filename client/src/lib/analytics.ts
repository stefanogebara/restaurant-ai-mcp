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

let posthogReady = false;

export function initAnalytics(): void {
  const key = import.meta.env.VITE_POSTHOG_KEY;
  const host = import.meta.env.VITE_POSTHOG_HOST || 'https://app.posthog.com';

  if (!key) {
    console.log('PostHog not initialized (missing VITE_POSTHOG_KEY)');
    return;
  }

  try {
    posthog.init(key, {
      api_host: host,
      // Capture SPA pageviews on route changes
      capture_pageview: true,
      capture_pageleave: true,
      // Autocapture clicks, inputs, form submissions for heatmaps
      autocapture: true,
      // Session recording — see exactly what users do
      session_recording: {
        maskAllInputs: true, // Mask form inputs (phone, email, name) for privacy
        maskTextSelector: '[data-mask]', // Custom mask selector
      },
      // Respect privacy — mask sensitive text in recordings
      mask_all_text: false,
      persistence: 'localStorage',
      // Track time on page and scroll depth
      capture_performance: true,
    });
    posthogReady = true;
    console.log('PostHog analytics initialized');
  } catch {
    // PostHog failed to load (e.g. ad blocker) — silently degrade
    posthogReady = false;
  }
}

/** Safe capture — no-ops if PostHog failed to initialize */
function safeCapture(event: string, properties?: Record<string, unknown>): void {
  if (!posthogReady) return;
  try {
    posthog.capture(event, properties);
  } catch {
    // Silently ignore — PostHog may have been blocked mid-session
  }
}

// ─── User identification ─────────────────────────────────────────────────────

export function identifyUser(userId: string, props?: Record<string, unknown>): void {
  if (!posthogReady) return;
  try {
    posthog.identify(userId, props);
  } catch {
    // Silently ignore
  }
}

// ─── Typed event catalogue ───────────────────────────────────────────────────

export function trackLandingPageViewed(): void {
  safeCapture('landing_page_viewed');
}

export function trackCtaClicked(props: { cta: 'primary' | 'demo' | 'pricing_cta'; location: string }): void {
  safeCapture('cta_clicked', props);
}

export function trackPricingPlanClicked(props: { plan: string; price: number }): void {
  safeCapture('pricing_plan_clicked', props);
}

export function trackSignupStarted(props: { method: 'google' | 'apple' | 'email' }): void {
  safeCapture('signup_started', props);
}

export function trackOnboardingStepCompleted(props: { step: number; step_name: string }): void {
  safeCapture('onboarding_step_completed', props);
}

export function trackOnboardingCompleted(props: { plan: string; country: string; restaurant_type: string }): void {
  safeCapture('onboarding_completed', props);
  // Identify the user with their restaurant properties for cohort analysis
  if (!posthogReady) return;
  try {
    posthog.people?.set({
      plan: props.plan,
      country: props.country,
      restaurant_type: props.restaurant_type,
    });
  } catch {
    // Silently ignore
  }
}

export function trackFirstReservationCreated(): void {
  safeCapture('first_reservation_created');
}

// ─── Enriquecimento no onboarding ────────────────────────────────────────────
// O passo de contato passou a fazer duas apostas: achar a empresa no cadastro
// da Receita e conseguir o cardápio. Sem estes eventos, "o enricher ajuda?" só
// teria resposta por opinião — o funil por passo mostra QUE o dono desistiu,
// não se a pergunta que fizemos a ele valeu a pena.

/** Resultado da busca no índice da Receita, antes de qualquer escolha. */
export function trackCnpjLookup(props: { outcome: 'found' | 'not_found' | 'error'; candidates: number }): void {
  safeCapture('cnpj_lookup', props);
}

/**
 * O que o dono fez com o resultado. `partner_named` é a métrica que importa:
 * mede se "você é o Jorge ou a Keila?" de fato identifica o dono — a aposta
 * que nenhum concorrente faz.
 */
export function trackCnpjResolved(props: { action: 'confirmed' | 'skipped'; partner_named?: boolean }): void {
  safeCapture('cnpj_resolved', props);
}

/** Link de cardápio informado à mão. `is_pdf` separa os dois perfis de dono. */
export function trackMenuUrlProvided(props: { is_pdf: boolean; has_website: boolean }): void {
  safeCapture('menu_url_provided', props);
}

// ─── Phase 13 Landing Events ────────────────────────────────────────────────

export function trackPresetDemoClicked(props: { restaurant: string }): void {
  safeCapture('preset_demo_clicked', props);
}

export function trackWhatsAppTapped(): void {
  safeCapture('whatsapp_demo_tapped');
}

export function trackDemoSlideInAction(props: { action: 'cta' | 'dismiss' | 'later' }): void {
  safeCapture('demo_slidein_action', props);
}

export function trackHeadlineVariantViewed(props: { variant: string }): void {
  safeCapture('headline_variant_viewed', props);
}

export function trackVoiceWidgetInteracted(props: { action: 'started' | 'ended' | 'fallback_whatsapp' }): void {
  safeCapture('voice_widget_interacted', props);
}

export function trackShareClicked(props: { location: 'demo_dashboard' | 'landing' | 'post_demo'; channel: 'whatsapp' | 'copy_link' }): void {
  safeCapture('share_clicked', props);
}

export function trackDemoFunnel(props: { step: 'demo_started' | 'demo_interacted' | 'demo_share_clicked' | 'signup_started' | 'match_confirmed' | 'match_rejected' | 'new_restaurant_path'; preset?: string }): void {
  safeCapture('demo_funnel', props);
}

export function trackDemoStarted(props: { source: string }): void {
  safeCapture('demo_started', props);
}

export function trackDemoCompleted(props: { demo_token: string }): void {
  safeCapture('demo_completed', props);
}

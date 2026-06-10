/**
 * PricingPage — /precos
 *
 * The full pricing grid moved here from the landing page (2026-06).
 * Rationale: the landing was doing too many jobs (demo + voice + WhatsApp +
 * pricing + walkthrough), and ads/SEO want a clean "pricing" destination.
 * The landing keeps a one-price teaser linking here.
 *
 * Everything below reuses the landing's existing components — PricingSection
 * carries its own heading, tier grid, FAQ-adjacent footnotes and Stripe
 * checkout wiring unchanged.
 */

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import LandingNav from '../components/LandingNav';
import PricingSection from '../components/PricingSection';
import Footer from '../components/Footer';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';

export default function PricingPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('pageTitles.pricing', 'Planos e Preços | Seatable'));

  // Pricing deep-links used to be /#pricing anchors; arriving here should
  // always start at the top regardless of any stale hash.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen text-deep-charcoal font-sans selection:bg-burgundy selection:text-white overflow-x-hidden">
      <LandingNav />

      {/* Trust strip — the LGPD / encryption / human-support reassurance the
          Brazilian SMB owner always asks about right before seeing prices. */}
      <div className="pt-12 pb-2">
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 px-6 mb-3">
          <span className="inline-flex items-center gap-1.5 text-[11px] text-warm-stone">
            <span aria-hidden="true">🔒</span>
            {t('landing.trustLgpd', 'LGPD-compliant · Data stays in Brazil')}
          </span>
          <span className="inline-flex items-center gap-1.5 text-[11px] text-warm-stone">
            <span aria-hidden="true">🛡️</span>
            {t('landing.trustEncrypted', 'End-to-end encrypted')}
          </span>
          <span className="inline-flex items-center gap-1.5 text-[11px] text-warm-stone">
            <span aria-hidden="true">📞</span>
            {t('landing.trustHumanSupport', 'Real humans answer in 24h')}
          </span>
        </div>
        <div className="text-center">
          <p className="text-xs uppercase tracking-[2px] text-burgundy font-semibold mb-2">
            {t('landing.betaBadge', 'Beta partners welcome')}
          </p>
          <p className="text-sm text-warm-stone font-light max-w-md mx-auto px-6">
            {t('landing.betaSubtitle', '14-day free trial · no credit card · cancel anytime')}
          </p>
        </div>
      </div>

      <PricingSection />

      <Footer />
    </div>
  );
}

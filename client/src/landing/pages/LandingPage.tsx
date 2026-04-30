import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { trackLandingPageViewed } from '../../lib/analytics';
import { LS_REFERRAL_CODE } from '../../config/localStorageKeys';
import ErrorBoundary from '../../components/common/ErrorBoundary';
import LandingNav from '../components/LandingNav';
import HeroSection from '../components/HeroSection';
import PresetDemoSection from '../components/PresetDemoSection';
import InlineDemoSection from '../components/InlineDemoSection';
import VoiceWidgetSection from '../components/VoiceWidgetSection';
import WhatsAppWidgetSection from '../components/WhatsAppWidgetSection';
import BeforeAfterSection from '../components/BeforeAfterSection';
import DashboardWalkthroughSection from '../components/DashboardWalkthroughSection';
import PricingSection from '../components/PricingSection';
import SharePrompt from '../components/SharePrompt';
import Footer from '../components/Footer';

export default function LandingPage() {
  const { t } = useTranslation();
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    trackLandingPageViewed();
  }, []);

  // Referral tracking
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (!ref || ref.length > 20) return;

    fetch('/api/referral?action=track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ referral_code: ref }),
    })
      .then((res) => {
        if (!res.ok) return null;
        return res.json();
      })
      .then((data) => {
        if (data?.valid === true) {
          localStorage.setItem(LS_REFERRAL_CODE, ref);
          params.delete('ref');
          const newSearch = params.toString();
          const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '') + window.location.hash;
          history.replaceState(null, '', newUrl);
        }
      })
      .catch(() => {});
  }, []);

  // Smooth scroll + scroll-to-top button
  useEffect(() => {
    document.documentElement.style.scrollBehavior = 'smooth';

    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 600);
    };
    window.addEventListener('scroll', handleScroll);

    return () => {
      document.documentElement.style.scrollBehavior = 'auto';
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  return (
    <div className="min-h-screen bg-warm-white text-deep-charcoal font-sans selection:bg-burgundy selection:text-white overflow-x-hidden">
      <LandingNav />

      {/* 1. Hero — pain-first headline + split-screen WhatsApp/Dashboard animation */}
      <HeroSection />

      {/* 2. Try it — 3 preset cards on mobile, inline browser demo on desktop */}
      <div className="lg:hidden">
        <PresetDemoSection />
      </div>
      <div className="hidden lg:block">
        <ErrorBoundary silent>
          <InlineDemoSection />
        </ErrorBoundary>
      </div>

      {/* 3. Pricing — M19: moved up from position 8 to 3. Serious prospects
          want to know cost early, before scrolling through deep product
          demos. The "Beta partners welcome" badge below adds context without
          fabricating testimonials. */}
      <div className="text-center pt-12 pb-2">
        <p className="text-xs uppercase tracking-[2px] text-burgundy font-semibold mb-2">
          {t('landing.betaBadge', 'Beta partners welcome')}
        </p>
        <p className="text-sm text-warm-stone font-light max-w-md mx-auto px-6">
          {t('landing.betaSubtitle', '30-day free trial · no credit card · cancel anytime')}
        </p>
      </div>
      <PricingSection />

      {/* 4. Call our AI — voice widget with ElevenLabs agent */}
      <ErrorBoundary silent>
        <VoiceWidgetSection />
      </ErrorBoundary>

      {/* 5. Text our AI — WhatsApp widget with real number */}
      <WhatsAppWidgetSection />

      {/* 6. Before/After — social proof with animated stats */}
      <BeforeAfterSection />

      {/* 7. Dashboard Walkthrough — animated "silent movie" of AI features */}
      <ErrorBoundary silent>
        <DashboardWalkthroughSection />
      </ErrorBoundary>

      {/* 8. Share prompt — viral referral */}
      <div className="max-w-md mx-auto px-6 mt-4 mb-8">
        <SharePrompt location="landing" />
      </div>

      {/* 10. Final CTA */}
      <section className="px-6 sm:px-16 pb-24">
        <div className="max-w-[700px] mx-auto bg-deep-charcoal rounded-3xl p-16 sm:p-20 text-center">
          <h2 className="font-serif text-3xl sm:text-[40px] font-medium text-white mb-4 tracking-tight">
            {t('landing.cta.heading', 'Ready to reimagine')}{' '}<br />{t('landing.cta.headingLine2', 'your restaurant?')}
          </h2>
          <p className="text-[16px] text-stone-300 font-light mb-9">
            {t('landing.cta.subtitle', 'Join the first restaurants using Seatable. 30-day free trial, no credit card required.')}
          </p>
          <a
            href="/demo/setup"
            className="inline-block px-8 py-3.5 bg-burgundy hover:bg-burgundy-dark text-white text-[15px] font-semibold rounded-full transition-colors"
          >
            {t('landing.cta.button', 'Create Your Restaurant')}
          </a>
        </div>
      </section>

      {/* 8. Footer */}
      <Footer />

      {/* Scroll to Top */}
      {showScrollTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-6 right-6 z-40 w-12 h-12 bg-deep-charcoal hover:bg-burgundy text-white rounded-full flex items-center justify-center transition-colors shadow-lg"
          aria-label={t('landing.scrollToTop', 'Scroll to top')}
        >
          <ArrowUp className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}

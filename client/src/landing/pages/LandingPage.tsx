import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { trackLandingPageViewed } from '../../lib/analytics';
import { LS_REFERRAL_CODE } from '../../config/localStorageKeys';
import { ArrowUp } from 'lucide-react';
import LandingNav from '../components/LandingNav';
import HeroSection from '../components/HeroSection';
import SocialProofSection from '../components/SocialProofSection';
import FeaturesGrid from '../components/FeaturesGrid';
import HowItWorksSection from '../components/HowItWorksSection';
import InteractiveDemoSection from '../components/InteractiveDemoSection';
import PricingSection from '../components/PricingSection';
import FAQSection from '../components/FAQSection';
import ContactForm from '../components/ContactForm';
import Footer from '../components/Footer';

export default function LandingPage() {
  const { t } = useTranslation();
  const [showScrollTop, setShowScrollTop] = useState(false);

  // PT-BR auto-detection moved to i18n/config.ts (global, applies to all routes)

  useEffect(() => {
    trackLandingPageViewed();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (!ref || ref.length > 20) return;

    fetch('/api/referral?action=track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ referral_code: ref }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data?.valid === true) {
          localStorage.setItem(LS_REFERRAL_CODE, ref);
          params.delete('ref');
          const newSearch = params.toString();
          const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '') + window.location.hash;
          history.replaceState(null, '', newUrl);
        }
      })
      .catch(() => {
        // fire-and-forget — silently drop errors
      });
  }, []);

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

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-warm-white text-deep-charcoal font-sans selection:bg-burgundy selection:text-white overflow-x-hidden">
      <LandingNav />
      <HeroSection />
      <SocialProofSection />
      <FeaturesGrid />
      <HowItWorksSection />
      <PricingSection />

      {/* CTA */}
      <section className="px-6 sm:px-16 pb-24">
        <div className="max-w-[700px] mx-auto bg-deep-charcoal rounded-3xl p-16 sm:p-20 text-center">
          <h2 className="font-serif text-3xl sm:text-[40px] font-medium text-white mb-4 tracking-tight">
            {t('landing.cta.heading')}<br />{t('landing.cta.headingLine2')}
          </h2>
          <p className="text-[16px] text-muted-stone font-light mb-9">
            {t('landing.cta.subtitle')}
          </p>
          <a
            href="/#pricing"
            className="inline-block px-8 py-3.5 bg-burgundy hover:bg-burgundy-dark text-white text-[15px] font-semibold rounded-full transition-colors"
          >
            {t('landing.cta.button')}
          </a>
        </div>
      </section>

      <InteractiveDemoSection />
      <FAQSection />
      <ContactForm />
      <Footer />

      {/* Scroll to Top */}
      {showScrollTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-8 right-8 z-40 w-12 h-12 bg-deep-charcoal hover:bg-burgundy text-white rounded-full flex items-center justify-center transition-colors"
          aria-label="Scroll to top"
        >
          <ArrowUp className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}

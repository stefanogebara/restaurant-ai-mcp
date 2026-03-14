import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { trackCtaClicked } from '../../lib/analytics';
import HeroSplitScreen from './HeroSplitScreen';

const HEADLINES: Record<string, { key: string; fallback: string }> = {
  a: { key: 'landing.hero.headlineA', fallback: 'Last night at 2 AM, someone booked a table at your restaurant.' },
  b: { key: 'landing.hero.headlineB', fallback: 'The host that never calls in sick.' },
  c: { key: 'landing.hero.headlineC', fallback: 'Your restaurant never sleeps.' },
};

export default function HeroSection() {
  const { t } = useTranslation();
  const [params] = useSearchParams();

  // A/B headline via ?headline=a|b|c (default: a)
  const variant = (params.get('headline') || 'a').toLowerCase();
  const headline = HEADLINES[variant] || HEADLINES.a;

  const scrollToDemo = () => {
    trackCtaClicked({ cta: 'primary', location: 'hero' });
    const el = document.getElementById('try-demo');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section
      className="pt-24 pb-16 px-6 sm:px-16 max-w-[1200px] mx-auto text-center"
      data-headline-variant={variant}
    >
      {/* Badge */}
      <div className="inline-block text-xs font-semibold tracking-[1.5px] uppercase text-burgundy bg-burgundy/[6%] border border-burgundy/15 px-4 py-1.5 rounded-full mb-8">
        {t('landing.badge')}
      </div>

      {/* Pain-first headline */}
      <h1 className="font-serif text-4xl sm:text-5xl lg:text-[64px] font-medium leading-[1.08] tracking-tight text-deep-charcoal mb-3 max-w-[800px] mx-auto">
        {t(headline.key, headline.fallback)}
      </h1>

      {/* AI answered line (only for variant a) */}
      {variant === 'a' && (
        <p className="font-serif text-3xl sm:text-4xl lg:text-[48px] font-medium leading-[1.1] tracking-tight text-burgundy mb-7">
          {t('landing.hero.headlineA2', 'Your AI answered.')}
        </p>
      )}

      {/* Subtitle */}
      <p className="text-lg text-warm-stone font-light leading-[1.7] max-w-[600px] mx-auto mb-10">
        {t('landing.hero.subtitle2', 'Seatable handles WhatsApp, phone calls, and walk-ins — so your team focuses on hospitality.')}
      </p>

      {/* Single CTA */}
      <button
        type="button"
        onClick={scrollToDemo}
        className="px-10 py-4 bg-burgundy hover:bg-burgundy-dark text-white text-base font-semibold rounded-full transition-colors shadow-lg shadow-burgundy/20"
      >
        {t('landing.hero.ctaNew', 'See it live ↓')}
      </button>

      {/* Split-screen animation */}
      <div className="mt-16 px-0 sm:px-4">
        <HeroSplitScreen />
      </div>
    </section>
  );
}

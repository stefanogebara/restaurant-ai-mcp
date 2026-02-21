import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

export default function HeroSection() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <section className="pt-24 pb-20 px-6 sm:px-16 max-w-[1200px] mx-auto text-center">
      {/* Badge */}
      <div className="inline-block text-xs font-semibold tracking-[1.5px] uppercase text-burgundy bg-[rgba(159,18,57,0.06)] border border-[rgba(159,18,57,0.15)] px-4 py-1.5 rounded-full mb-8">
        {t('landing.badge')}
      </div>

      {/* Heading */}
      <h1 className="font-serif text-5xl sm:text-[72px] font-medium leading-[1.05] tracking-tight text-deep-charcoal mb-7">
        {t('landing.hero.heading')}<br /><em className="text-burgundy">{t('landing.hero.headingEm')}</em>
      </h1>

      {/* Subtitle */}
      <p className="text-[19px] text-warm-stone font-light leading-[1.7] max-w-[560px] mx-auto mb-12">
        {t('landing.hero.subtitle')}
      </p>

      {/* CTA Buttons */}
      <div className="flex flex-col sm:flex-row gap-4 justify-center">
        <button
          onClick={() => {
            const el = document.getElementById('pricing');
            if (el) el.scrollIntoView({ behavior: 'smooth' });
            else navigate('/#pricing');
          }}
          className="px-8 py-3.5 bg-burgundy hover:bg-burgundy-dark text-white text-[15px] font-semibold rounded-full transition-colors"
        >
          {t('landing.hero.cta')}
        </button>
        <button
          onClick={() => navigate('/live-demo')}
          className="px-8 py-3.5 border border-border-gray text-stone-gray text-[15px] font-medium rounded-full hover:border-muted-stone transition-colors"
        >
          {t('landing.hero.demo')}
        </button>
      </div>

      {/* Early Access Note */}
      <p className="mt-10 text-sm text-warm-stone">
        {t('landing.hero.earlyAccess')}
      </p>
    </section>
  );
}

import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../../components/common/ThiingsIcon';

export default function EditorialClosingSection() {
  const { t } = useTranslation();

  return (
    <>
      <section className="mx-auto max-w-[1120px] px-6 py-24 sm:px-10 sm:py-32">
        <div className="grid gap-10 border-y hairline py-10 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted-stone">{t('landing.editorial.pricingEyebrow', 'Simple starting point')}</p>
            <h2 className="mt-4 font-serif text-4xl leading-tight text-deep-charcoal sm:text-5xl">{t('landing.pricingTeaser.heading', 'Plans from R$ 497/month')}</h2>
            <p className="mt-3 text-sm text-muted-stone">{t('landing.pricingTeaser.subtitle', '14 days free · no credit card · cancel anytime')}</p>
          </div>
          <Link to="/precos" className="inline-flex min-h-[50px] items-center justify-center gap-2 rounded-full border border-deep-charcoal/15 px-7 text-sm text-deep-charcoal transition-colors hover:bg-deep-charcoal hover:text-white">
            {t('landing.pricingTeaser.cta', 'See plans and pricing')}<ThiingsIcon name="arrow-right" pxSize={15} />
          </Link>
        </div>
        <div className="mt-6 flex flex-wrap gap-x-7 gap-y-3 text-[11px] text-muted-stone">
          <span className="inline-flex items-center gap-2"><ThiingsIcon name="lock" pxSize={14} />{t('landing.trustLgpd', 'LGPD-compliant')}</span>
          <span className="inline-flex items-center gap-2"><ThiingsIcon name="shield-check" pxSize={14} />{t('landing.trustEncrypted', 'Encrypted data')}</span>
          <span className="inline-flex items-center gap-2"><ThiingsIcon name="phone" pxSize={14} />{t('landing.trustHumanSupport', 'Human support within 24h')}</span>
        </div>
      </section>

      <section className="px-3 pb-3">
        <div className="landing-closing-field relative mx-auto min-h-[660px] max-w-[1380px] overflow-hidden rounded-[32px] px-6 py-16 text-white sm:rounded-[38px] sm:px-12 sm:py-20 lg:px-20">
          <div className="relative z-10 flex min-h-[530px] max-w-[850px] flex-col justify-between">
            <p className="text-[11px] uppercase tracking-[0.17em] text-white/65">{t('landing.editorial.closingEyebrow', 'Ready when the next guest is')}</p>
            <div>
              <h2 className="font-sans text-[clamp(3.2rem,8vw,7.5rem)] leading-[0.87] tracking-[-0.075em] text-white">
                {t('landing.editorial.closingLine1', 'MAKE THE')}<br />
                {t('landing.editorial.closingLine2', 'ROOM FEEL')}<br />
                {t('landing.editorial.closingLine3', 'EFFORTLESS.')}
              </h2>
              <p className="mt-8 max-w-[540px] text-base leading-relaxed text-white/70">{t('landing.editorial.closingBody', 'Give us your restaurant name and city. Seatable builds a personalized preview with your real hours, identity, and guest journey.')}</p>
              <Link to="/demo/setup" className="mt-8 inline-flex min-h-[54px] items-center gap-2 rounded-full bg-white px-8 text-sm text-deep-charcoal transition-transform hover:-translate-y-0.5">
                {t('landing.editorial.closingCta', 'Create my restaurant preview')}<ThiingsIcon name="arrow-right" pxSize={15} />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

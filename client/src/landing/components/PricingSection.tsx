import { PRICING_TIERS } from '../data/demoData';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { trackPricingPlanClicked } from '../../lib/analytics';
import { useAuth } from '../../contexts/AuthContext';
import { withBillingPlan } from '../../lib/billingHandoff';
import { currencyFromLanguage } from '../../utils/currency';

const FEATURE_COUNTS: Record<string, number> = {
  starter: 5,
  growth: 6,
  scale: 6,
};

/** Pick the right price string for the current currency */
function tierPrice(tier: (typeof PRICING_TIERS)[number], currency: 'BRL' | 'USD' | 'EUR'): string {
  if (currency === 'BRL') return tier.brlPrice ?? tier.price;
  if (currency === 'EUR') return tier.eurPrice ?? tier.price;
  return tier.price;
}

export default function PricingSection() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const currency = currencyFromLanguage(i18n.language);

  return (
    <section id="pricing" className="py-24 px-6 sm:px-16">
      <div className="max-w-[1100px] mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="text-xs font-semibold tracking-[2px] uppercase text-burgundy mb-4">{t('landing.pricing.label')}</div>
          <h2 className="font-serif text-4xl sm:text-[48px] font-medium tracking-tight text-deep-charcoal mb-3">
            {t('landing.pricing.heading')}
          </h2>
          <p className="text-lg text-warm-stone font-light">{t('landing.pricing.subheading')}</p>
        </div>

        <p className="text-center text-xs text-warm-stone mb-6">
          {t('landing.pricing.authWallHint')}
        </p>

        {/* Pricing Grid */}
        <div className="glass-panel grid grid-cols-1 md:grid-cols-3 gap-[1px] bg-glass-border-dark overflow-hidden">
          {PRICING_TIERS.map((tier) => {
            const isFeatured = !!tier.highlighted;
            const tierKey = tier.key;
            const planName = t(`landing.pricing.${tierKey}.name`, tier.name);
            const featureCount = FEATURE_COUNTS[tierKey] || tier.features.length;
            return (
              <div key={tierKey} className={`relative px-8 sm:px-9 py-12 ${isFeatured ? 'bg-deep-charcoal' : 'bg-white/45 backdrop-blur-[18px]'}`}>
                {/* "Mais popular" badge on the featured tier — anchors the
                    visitor's eye to the recommended plan. The audit found
                    the dark-charcoal background was doing all the work to
                    signal "this one's the default", but visitors who don't
                    read visual hierarchy that way had to guess. Pill sits
                    over the top edge of the card so it reads as a tag,
                    not part of the layout. */}
                {isFeatured && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                    <span className="inline-block px-3 py-1 rounded-full bg-burgundy text-white text-[10px] font-bold tracking-[1.5px] uppercase shadow-sm">
                      {t('landing.pricing.mostPopular', 'Mais popular')}
                    </span>
                  </div>
                )}

                {/* Plan label */}
                <div className={`text-xs font-semibold tracking-[1.5px] uppercase mb-2 ${isFeatured ? 'text-rose-400' : 'text-warm-stone'}`}>
                  {planName}
                </div>

                {/* Price */}
                <div className={`font-serif text-4xl sm:text-[48px] font-medium tracking-tight leading-none mb-1 ${isFeatured ? 'text-white' : 'text-deep-charcoal'}`}>
                  {tierPrice(tier, currency)}
                  <span className={`text-lg font-normal ${isFeatured ? 'text-stone-400' : 'text-muted-stone'}`}>
                    /{t(`landing.pricing.perMonth`)}
                  </span>
                </div>

                {/* Description */}
                <p className={`text-sm font-light mb-8 ${isFeatured ? 'text-stone-400' : 'text-warm-stone'}`}>
                  {t(`landing.pricing.${tierKey}.desc`, tier.description)}
                </p>

                {/* Features */}
                <ul className="mb-9">
                  {Array.from({ length: featureCount }, (_, i) => (
                    <li
                      key={i}
                      className={`text-sm py-3 border-b flex items-center gap-2.5 ${
                        isFeatured ? 'text-stone-300 border-charcoal-dark' : 'text-deep-charcoal border-glass-border-dark'
                      }`}
                    >
                      <span className="w-[5px] h-[5px] rounded-full bg-burgundy flex-shrink-0" />
                      {t(`landing.pricing.${tierKey}.f${i + 1}`, tier.features[i] || '')}
                    </li>
                  ))}
                </ul>

                <Link
                  to={withBillingPlan(user ? '/welcome' : '/login', tierKey)}
                  onClick={() => trackPricingPlanClicked({ plan: tier.name, price: 0 })}
                  aria-label={`${planName} — ${tierPrice(tier, currency)} /${t('landing.pricing.perMonth')}`}
                  className={`w-full py-3.5 rounded-full text-sm font-semibold transition-colors flex items-center justify-center ${
                    isFeatured
                      ? 'bg-burgundy text-white hover:bg-burgundy-dark'
                      : 'border border-stone-300 text-deep-charcoal hover:border-muted-stone'
                  }`}
                >
                  {t(`landing.pricing.${tierKey}.cta`, tier.cta)}
                </Link>
              </div>
            );
          })}
        </div>

        {/* Metered Billing Disclosure */}
        <div className="mt-10 p-5 glass-card text-center">
          <p className="text-xs text-stone-gray leading-relaxed">
            <span className="font-semibold text-deep-charcoal">{t('landing.pricing.usageBased')}</span>{' '}
            {t('landing.pricing.usageDetail', { currency })}
          </p>
        </div>

        {/* Bottom Note */}
        <p className="text-center text-sm text-muted-stone mt-6">
          {t('landing.pricing.customSolution')}{' '}
          <Link to="/demo/setup" className="text-burgundy hover:text-burgundy-dark font-medium transition-colors min-h-[44px] inline-flex items-center">
            {t('landing.pricing.enterpriseLink')}
          </Link>
        </p>
      </div>
    </section>
  );
}

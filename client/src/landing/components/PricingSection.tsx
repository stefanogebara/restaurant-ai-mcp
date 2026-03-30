import { Loader2 } from 'lucide-react';
import { PRICING_TIERS } from '../data/demoData';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { authFetch } from '../../services/api';
import { supabase } from '../../lib/supabase';
import { trackCtaClicked, trackPricingPlanClicked } from '../../lib/analytics';
import { useToast } from '../../contexts/ToastContext';
import { detectCurrency } from '../../utils/currency';

const TIER_KEYS: Record<string, string> = {
  Essencial: 'starter',
  Profissional: 'growth',
  Enterprise: 'scale',
  // Legacy mappings
  Starter: 'starter',
  Growth: 'growth',
  Scale: 'scale',
};

const FEATURE_COUNTS: Record<string, number> = {
  starter: 5,
  growth: 6,
  scale: 6,
};

export default function PricingSection() {
  const { t } = useTranslation();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const navigate = useNavigate();
  const toast = useToast();
  const isBRL = detectCurrency() === 'BRL';

  const scrollToContact = () => {
    const element = document.getElementById('contact');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleSubscribe = async (priceId: string, planName: string, price = 0) => {
    trackPricingPlanClicked({ plan: planName, price });
    try {
      setLoadingPlan(planName);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setLoadingPlan(null);
        navigate('/login?redirect=pricing');
        return;
      }

      const apiUrl = import.meta.env.VITE_API_URL
        ? `${import.meta.env.VITE_API_URL}/api/create-checkout-session`
        : '/api/create-checkout-session';

      const response = await authFetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId, planName }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 400 && errorData.error?.includes('Restaurant setup required')) {
          setLoadingPlan(null);
          navigate('/onboarding?reason=subscribe');
          return;
        }
        throw new Error(errorData.error || 'Failed to create checkout session');
      }

      const { url } = await response.json();
      window.location.href = url;
    } catch (error) {
      console.error('Error creating checkout session:', error);
      toast.error(t('landing.pricing.checkoutError'));
      setLoadingPlan(null);
    }
  };

  return (
    <section id="pricing" className="py-24 px-6 sm:px-16 bg-white border-t border-border-gray">
      <div className="max-w-[1100px] mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="text-xs font-semibold tracking-[2px] uppercase text-burgundy mb-4">{t('landing.pricing.label')}</div>
          <h2 className="font-serif text-4xl sm:text-[48px] font-medium tracking-tight text-deep-charcoal mb-3">
            {t('landing.pricing.heading')}
          </h2>
          <p className="text-lg text-warm-stone font-light">{t('landing.pricing.subheading')}</p>
        </div>

        {/* Pricing Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-[2px] bg-border-gray rounded-[20px] overflow-hidden">
          {PRICING_TIERS.map((tier, index) => {
            const isFeatured = !!tier.highlighted;
            const tierKey = TIER_KEYS[tier.name] || tier.name.toLowerCase();
            const featureCount = FEATURE_COUNTS[tierKey] || tier.features.length;
            return (
              <div key={index} className={`relative px-8 sm:px-9 py-12 ${isFeatured ? 'bg-deep-charcoal' : 'bg-warm-white'}`}>
                {/* Plan label */}
                <div className={`text-xs font-semibold tracking-[1.5px] uppercase mb-2 ${isFeatured ? 'text-rose-400' : 'text-warm-stone'}`}>
                  {t(`landing.pricing.${tierKey}.name`, tier.name)}
                </div>

                {/* Price */}
                <div className={`font-serif text-4xl sm:text-[48px] font-medium tracking-tight leading-none mb-1 ${isFeatured ? 'text-white' : 'text-deep-charcoal'}`}>
                  {isBRL ? (tier.brlPrice ?? tier.price) : tier.price}
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
                        isFeatured ? 'text-stone-300 border-charcoal-dark' : 'text-deep-charcoal border-border-gray'
                      }`}
                    >
                      <span className="w-[5px] h-[5px] rounded-full bg-burgundy flex-shrink-0" />
                      {t(`landing.pricing.${tierKey}.f${i + 1}`, tier.features[i] || '')}
                    </li>
                  ))}
                </ul>

                {/* CTA Button */}
                <button
                  type="button"
                  onClick={() => {
                    const id = tier.priceId;
                    if (id) {
                      handleSubscribe(id, tier.name);
                    } else {
                      trackCtaClicked({ cta: 'pricing_cta', location: `pricing_${tier.name.toLowerCase()}` });
                      scrollToContact();
                    }
                  }}
                  disabled={loadingPlan === tier.name}
                  className={`w-full py-3.5 rounded-full text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2 ${
                    isFeatured
                      ? 'bg-burgundy text-white hover:bg-burgundy-dark'
                      : 'border border-stone-300 text-deep-charcoal hover:border-muted-stone'
                  }`}
                >
                  {loadingPlan === tier.name ? (
                    <>
                      <Loader2 aria-hidden="true" className="w-4 h-4 animate-spin" />
                      {t('common.loading')}
                    </>
                  ) : (
                    t(`landing.pricing.${tierKey}.cta`, tier.cta)
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* Metered Billing Disclosure */}
        <div className="mt-10 p-5 bg-soft-gray rounded-2xl border border-border-gray text-center">
          <p className="text-xs text-stone-gray leading-relaxed">
            <span className="font-semibold text-deep-charcoal">{t('landing.pricing.usageBased')}</span>{' '}
            {t('landing.pricing.usageDetail', { currency: isBRL ? 'BRL' : 'USD' })}
          </p>
        </div>

        {/* Bottom Note */}
        <p className="text-center text-sm text-muted-stone mt-6">
          {t('landing.pricing.customSolution')}{' '}
          <button type="button" onClick={scrollToContact} className="text-burgundy hover:text-burgundy-dark font-medium transition-colors min-h-[44px] inline-flex items-center">
            {t('landing.pricing.enterpriseLink')}
          </button>
        </p>
      </div>
    </section>
  );
}

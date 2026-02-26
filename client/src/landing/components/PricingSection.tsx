import { Loader2 } from 'lucide-react';
import { PRICING_TIERS } from '../data/demoData';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authFetch } from '../../services/api';
import { supabase } from '../../lib/supabase';
import { trackCtaClicked, trackPricingPlanClicked } from '../../lib/analytics';

export default function PricingSection() {
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const navigate = useNavigate();

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
      alert('Failed to start checkout. Please try again.');
      setLoadingPlan(null);
    }
  };

  return (
    <section id="pricing" className="py-24 px-6 sm:px-16 bg-white border-t border-border-gray">
      <div className="max-w-[1100px] mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="text-xs font-semibold tracking-[2px] uppercase text-burgundy mb-4">Pricing</div>
          <h2 className="font-serif text-4xl sm:text-[48px] font-medium tracking-tight text-deep-charcoal mb-3">
            Simple, transparent pricing.
          </h2>
          <p className="text-[17px] text-warm-stone font-light">No hidden fees. Cancel anytime.</p>
        </div>

        {/* Pricing Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-[2px] bg-border-gray rounded-[20px] overflow-hidden">
          {PRICING_TIERS.map((tier, index) => {
            const isFeatured = !!tier.highlighted;
            return (
              <div key={index} className={`relative px-8 sm:px-9 py-12 ${isFeatured ? 'bg-deep-charcoal' : 'bg-warm-white'}`}>
                {/* Plan label */}
                <div className={`text-xs font-semibold tracking-[1.5px] uppercase mb-2 ${isFeatured ? 'text-burgundy' : 'text-warm-stone'}`}>
                  {tier.name}
                </div>

                {/* Price */}
                <div className={`font-serif text-[48px] font-medium tracking-tight leading-none mb-1 ${isFeatured ? 'text-white' : 'text-deep-charcoal'}`}>
                  {tier.price}<span className="text-lg font-normal text-muted-stone">{tier.period}</span>
                </div>

                {/* Description */}
                <p className={`text-sm font-light mb-8 ${isFeatured ? 'text-muted-stone' : 'text-warm-stone'}`}>
                  {tier.description}
                </p>

                {/* Features */}
                <ul className="mb-9">
                  {tier.features.map((f, i) => (
                    <li
                      key={i}
                      className={`text-sm py-3 border-b flex items-center gap-2.5 ${
                        isFeatured ? 'text-stone-300 border-charcoal-dark' : 'text-deep-charcoal border-border-gray'
                      }`}
                    >
                      <span className="w-[5px] h-[5px] rounded-full bg-burgundy flex-shrink-0" />
                      {f}
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
                      Loading...
                    </>
                  ) : (
                    tier.cta
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* Metered Billing Disclosure */}
        <div className="mt-10 p-5 bg-soft-gray rounded-2xl border border-border-gray text-center">
          <p className="text-xs text-stone-gray leading-relaxed">
            <span className="font-semibold text-deep-charcoal">Usage-based fees apply</span> beyond plan limits:{' '}
            additional reservations, AI phone calls, SMS notifications, and WhatsApp messages are billed per use.
            All prices in EUR. Cancel or upgrade anytime.
          </p>
        </div>

        {/* Bottom Note */}
        <p className="text-center text-sm text-muted-stone mt-6">
          Need a custom solution?{' '}
          <button type="button" onClick={scrollToContact} className="text-burgundy hover:text-burgundy-dark font-medium transition-colors">
            Contact us for enterprise pricing
          </button>
        </p>
      </div>
    </section>
  );
}

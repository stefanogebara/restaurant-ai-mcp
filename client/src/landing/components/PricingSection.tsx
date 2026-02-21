import { Loader2 } from 'lucide-react';
import { PRICING_TIERS, PRICING_TIERS_BRL } from '../data/demoData';
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { authFetch } from '../../services/api';
import { supabase } from '../../lib/supabase';
import { detectCurrency } from '../../utils/currency';
import { useToast } from '../../contexts/ToastContext';

export default function PricingSection() {
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const { error: showError } = useToast();
  const navigate = useNavigate();

  const currency = useMemo(() => detectCurrency(), []);
  const tiers = currency === 'BRL' ? PRICING_TIERS_BRL : PRICING_TIERS;

  const scrollToContact = () => {
    const element = document.getElementById('contact');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleSubscribe = async (priceId: string, planName: string) => {
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
        body: JSON.stringify({ priceId, planName, currency }),
      });

      if (!response.ok) {
        throw new Error('Failed to create checkout session');
      }

      const { url } = await response.json();
      window.location.href = url;
    } catch (error) {
      console.error('Error creating checkout session:', error);
      showError('Failed to start checkout. Please try again.');
      setLoadingPlan(null);
    }
  };

  const handleTierClick = (tier: typeof tiers[number]) => {
    // Free tier goes directly to onboarding
    if ('isFree' in tier && tier.isFree) {
      navigate('/onboarding');
      return;
    }

    const id = tier.priceId;
    if (id) {
      handleSubscribe(id, tier.name);
    } else {
      scrollToContact();
    }
  };

  return (
    <section id="pricing" className="py-24 px-6 sm:px-16 bg-white border-t border-border-gray">
      <div className="max-w-[1100px] mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="text-xs font-semibold tracking-[2px] uppercase text-burgundy mb-4">
            {currency === 'BRL' ? 'Planos e Preços' : 'Pricing'}
          </div>
          <h2 className="font-serif text-4xl sm:text-[48px] font-medium tracking-tight text-deep-charcoal mb-3">
            {currency === 'BRL' ? 'Simples e transparente.' : 'Simple, transparent pricing.'}
          </h2>
          <p className="text-[17px] text-warm-stone font-light">
            {currency === 'BRL' ? 'Sem taxas ocultas. Cancele quando quiser.' : 'No hidden fees. Cancel anytime.'}
          </p>
        </div>

        {/* Pricing Grid */}
        <div className={`grid grid-cols-1 ${tiers.length === 4 ? 'md:grid-cols-4' : 'md:grid-cols-3'} gap-[2px] bg-border-gray rounded-[20px] overflow-hidden`}>
          {tiers.map((tier, index) => {
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
                        isFeatured ? 'text-[#D6D3D1] border-charcoal-dark' : 'text-deep-charcoal border-border-gray'
                      }`}
                    >
                      <span className="w-[5px] h-[5px] rounded-full bg-burgundy flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>

                {/* CTA Button */}
                <button
                  onClick={() => handleTierClick(tier)}
                  disabled={loadingPlan === tier.name}
                  className={`w-full py-3.5 rounded-full text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2 ${
                    isFeatured
                      ? 'bg-burgundy text-white hover:bg-burgundy-dark'
                      : 'border border-[#D6D3D1] text-deep-charcoal hover:border-muted-stone'
                  }`}
                >
                  {loadingPlan === tier.name ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
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

        {/* Bottom Note */}
        <p className="text-center text-sm text-muted-stone mt-10">
          {currency === 'BRL' ? (
            <>
              Precisa de uma solução personalizada?{' '}
              <button onClick={scrollToContact} className="text-burgundy hover:text-burgundy-dark font-medium transition-colors">
                Entre em contato
              </button>
            </>
          ) : (
            <>
              Need a custom solution?{' '}
              <button onClick={scrollToContact} className="text-burgundy hover:text-burgundy-dark font-medium transition-colors">
                Contact us for enterprise pricing
              </button>
            </>
          )}
        </p>
      </div>
    </section>
  );
}

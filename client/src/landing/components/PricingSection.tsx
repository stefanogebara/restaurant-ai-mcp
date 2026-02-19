import { Loader2 } from 'lucide-react';
import { PRICING_TIERS } from '../data/demoData';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authFetch } from '../../services/api';
import { supabase } from '../../lib/supabase';

export default function PricingSection() {
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const navigate = useNavigate();

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
        body: JSON.stringify({ priceId, planName }),
      });

      if (!response.ok) {
        throw new Error('Failed to create checkout session');
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
    <section id="pricing" className="py-24 px-6 sm:px-16 bg-white border-t border-[#E7E5E4]">
      <div className="max-w-[1100px] mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="text-xs font-semibold tracking-[2px] uppercase text-[#9F1239] mb-4">Pricing</div>
          <h2 className="font-serif text-4xl sm:text-[48px] font-medium tracking-tight text-[#1C1917] mb-3">
            Simple, transparent pricing.
          </h2>
          <p className="text-[17px] text-[#78716C] font-light">No hidden fees. Cancel anytime.</p>
        </div>

        {/* Pricing Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-[2px] bg-[#E7E5E4] rounded-[20px] overflow-hidden">
          {PRICING_TIERS.map((tier, index) => {
            const isFeatured = !!tier.highlighted;
            return (
              <div key={index} className={`relative px-8 sm:px-9 py-12 ${isFeatured ? 'bg-[#1C1917]' : 'bg-[#FAFAF9]'}`}>
                {/* Plan label */}
                <div className={`text-xs font-semibold tracking-[1.5px] uppercase mb-2 ${isFeatured ? 'text-[#9F1239]' : 'text-[#78716C]'}`}>
                  {tier.name}
                </div>

                {/* Price */}
                <div className={`font-serif text-[48px] font-medium tracking-tight leading-none mb-1 ${isFeatured ? 'text-white' : 'text-[#1C1917]'}`}>
                  {tier.price}<span className="text-lg font-normal text-[#A8A29E]">{tier.period}</span>
                </div>

                {/* Description */}
                <p className={`text-sm font-light mb-8 ${isFeatured ? 'text-[#A8A29E]' : 'text-[#78716C]'}`}>
                  {tier.description}
                </p>

                {/* Features */}
                <ul className="mb-9">
                  {tier.features.map((f, i) => (
                    <li
                      key={i}
                      className={`text-sm py-3 border-b flex items-center gap-2.5 ${
                        isFeatured ? 'text-[#D6D3D1] border-[#292524]' : 'text-[#1C1917] border-[#E7E5E4]'
                      }`}
                    >
                      <span className="w-[5px] h-[5px] rounded-full bg-[#9F1239] flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>

                {/* CTA Button */}
                <button
                  onClick={() => {
                    const id = tier.priceId;
                    id ? handleSubscribe(id, tier.name) : scrollToContact();
                  }}
                  disabled={loadingPlan === tier.name}
                  className={`w-full py-3.5 rounded-full text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2 ${
                    isFeatured
                      ? 'bg-[#9F1239] text-white hover:bg-[#881337]'
                      : 'border border-[#D6D3D1] text-[#1C1917] hover:border-[#A8A29E]'
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
        <p className="text-center text-sm text-[#A8A29E] mt-10">
          Need a custom solution?{' '}
          <button onClick={scrollToContact} className="text-[#9F1239] hover:text-[#881337] font-medium transition-colors">
            Contact us for enterprise pricing
          </button>
        </p>
      </div>
    </section>
  );
}

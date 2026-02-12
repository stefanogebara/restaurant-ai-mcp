import { motion } from 'framer-motion';
import ThiingsIcon from '../../components/common/ThiingsIcon';
import Spinner from '../../components/common/Spinner';
import { PRICING_TIERS } from '../data/demoData';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authFetch } from '../../services/api';
import { supabase } from '../../lib/supabase';

export default function PricingSection() {
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [isAnnual, setIsAnnual] = useState(false);
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

      // Check if user is logged in before starting checkout
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
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          priceId,
          planName,
        }),
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
    <section id="pricing" className="py-24 px-6 bg-[#FAFAF9]">
      <div className="max-w-5xl mx-auto">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="font-serif text-3xl md:text-4xl italic mb-4 text-[#1C1917]">
            Simple, Transparent Pricing
          </h2>
          <div className="w-16 h-0.5 bg-[#9F1239] mx-auto opacity-50 mb-6"></div>
          <p className="text-lg text-[#57534E] max-w-2xl mx-auto font-light">
            Choose the plan that fits your restaurant. All plans include a 14-day free trial.
          </p>
        </motion.div>

        {/* Billing Toggle */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
          className="flex items-center justify-center gap-4 mb-12"
        >
          <span className={`text-sm font-medium transition-colors ${!isAnnual ? 'text-[#1C1917]' : 'text-[#A8A29E]'}`}>
            Monthly
          </span>
          <button
            onClick={() => setIsAnnual(!isAnnual)}
            className="relative w-14 h-7 rounded-full transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-[#9F1239] focus:ring-offset-2"
            style={{ backgroundColor: isAnnual ? '#9F1239' : '#E7E5E4' }}
            aria-label={isAnnual ? 'Switch to monthly billing' : 'Switch to annual billing'}
          >
            <div
              className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow-md transition-transform duration-300 ${
                isAnnual ? 'translate-x-7' : 'translate-x-0.5'
              }`}
            />
          </button>
          <span className={`text-sm font-medium transition-colors ${isAnnual ? 'text-[#1C1917]' : 'text-[#A8A29E]'}`}>
            Annual
          </span>
          {isAnnual && (
            <span className="text-xs font-bold text-[#9F1239] bg-[#9F1239]/10 px-2.5 py-1 rounded-full">
              Save 20%
            </span>
          )}
        </motion.div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {PRICING_TIERS.map((tier, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className={`relative bg-white p-8 md:p-10 rounded-[2rem] border transition-all duration-500 hover:shadow-2xl hover:-translate-y-1 ${
                tier.highlighted
                  ? 'border-[#9F1239] shadow-xl'
                  : 'border-[#E7E5E4]'
              }`}
            >
              {/* Best Value Badge */}
              {tier.highlighted && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                  <div className="px-4 py-1.5 bg-[#9F1239] text-white rounded-full text-xs font-bold uppercase tracking-wider">
                    Most Popular
                  </div>
                </div>
              )}

              {/* Plan Name */}
              <h3 className="font-serif text-2xl text-[#1C1917] mb-2">{tier.name}</h3>
              <p className="text-[#57534E] text-sm mb-6 font-light">{tier.description}</p>

              {/* Price */}
              <div className="mb-8">
                {tier.price !== 'Custom' ? (
                  <div className="flex items-baseline">
                    <span className="text-5xl font-serif font-bold text-[#1C1917]">
                      {isAnnual
                        ? `€${(parseFloat(tier.price.replace('€', '')) * 0.8).toFixed(2)}`
                        : tier.price
                      }
                    </span>
                    <span className="text-[#57534E] ml-2 text-sm">
                      {isAnnual ? '/mo, billed annually' : tier.period}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-baseline">
                    <span className="text-5xl font-serif font-bold text-[#1C1917]">{tier.price}</span>
                  </div>
                )}
                {isAnnual && tier.price !== 'Custom' && (
                  <p className="text-xs text-[#9F1239] mt-2 font-medium">
                    €{(parseFloat(tier.price.replace('€', '')) * 0.8 * 12).toFixed(0)}/year (save €{(parseFloat(tier.price.replace('€', '')) * 0.2 * 12).toFixed(0)})
                  </p>
                )}
              </div>

              {/* Features */}
              <ul className="space-y-4 mb-8">
                {tier.features.map((feature, featureIndex) => (
                  <li key={featureIndex} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-[#9F1239]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <ThiingsIcon name="check" size="xs" pxSize={12} />
                    </div>
                    <span className="text-[#57534E] text-sm">{feature}</span>
                  </li>
                ))}
              </ul>

              {/* CTA Button */}
              <button
                onClick={() => tier.priceId ? handleSubscribe(tier.priceId, tier.name) : scrollToContact()}
                disabled={loadingPlan === tier.name}
                className={`w-full px-6 py-4 font-bold text-sm tracking-widest uppercase transition-all duration-300 rounded-2xl flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                  tier.highlighted
                    ? 'bg-[#9F1239] text-white hover:bg-[#881337] shadow-xl shadow-[#9F1239]/20'
                    : 'border border-[#1C1917] text-[#1C1917] hover:bg-[#1C1917] hover:text-white'
                }`}
              >
                {loadingPlan === tier.name ? (
                  <>
                    <Spinner size="sm" />
                    Loading...
                  </>
                ) : (
                  <>
                    {tier.cta}
                    <ThiingsIcon name="arrow-right" size="xs" />
                  </>
                )}
              </button>
            </motion.div>
          ))}
        </div>

        {/* Bottom Note */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="text-center mt-16"
        >
          <p className="text-[#57534E] mb-4 font-light">
            Need a custom solution? We offer flexible enterprise plans for multi-location restaurants.
          </p>
          <button
            onClick={scrollToContact}
            className="text-[#9F1239] hover:text-[#881337] font-bold text-sm uppercase tracking-widest inline-flex items-center gap-2 transition-colors"
          >
            Contact us for enterprise pricing
            <ThiingsIcon name="arrow-right" size="xs" />
          </button>
        </motion.div>
      </div>
    </section>
  );
}

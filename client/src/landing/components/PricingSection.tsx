import { motion } from 'framer-motion';
import { Check, ArrowRight, Loader2 } from 'lucide-react';
import { PRICING_TIERS } from '../data/demoData';
import { useState } from 'react';

export default function PricingSection() {
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  const scrollToContact = () => {
    const element = document.getElementById('contact');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleSubscribe = async (priceId: string, planName: string) => {
    try {
      setLoadingPlan(planName);

      const apiUrl = import.meta.env.VITE_API_URL
        ? `${import.meta.env.VITE_API_URL}/api/create-checkout-session`
        : '/api/create-checkout-session';

      const response = await fetch(apiUrl, {
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

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {PRICING_TIERS.map((tier, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className={`relative bg-white p-8 md:p-10 rounded-[2rem] border transition-all duration-500 hover:shadow-2xl ${
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
                <div className="flex items-baseline">
                  <span className="text-5xl font-serif font-bold text-[#1C1917]">{tier.price}</span>
                  {tier.period && <span className="text-[#57534E] ml-2 text-sm">{tier.period}</span>}
                </div>
              </div>

              {/* Features */}
              <ul className="space-y-4 mb-8">
                {tier.features.map((feature, featureIndex) => (
                  <li key={featureIndex} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-[#9F1239]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check className="w-3 h-3 text-[#9F1239]" />
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
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    {tier.cta}
                    <ArrowRight className="w-4 h-4" />
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
            <ArrowRight className="w-4 h-4" />
          </button>
        </motion.div>
      </div>
    </section>
  );
}

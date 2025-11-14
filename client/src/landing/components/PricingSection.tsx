import { motion } from 'framer-motion';
import { CheckCircle, ArrowRight, Loader2 } from 'lucide-react';
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

      // Call API to create Stripe checkout session
      const apiUrl = import.meta.env.VITE_API_URL
        ? `${import.meta.env.VITE_API_URL}/api/create-checkout-session`
        : '/api/create-checkout-session'; // Use relative URL in production

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

      // Redirect to Stripe Checkout
      window.location.href = url;
    } catch (error) {
      console.error('Error creating checkout session:', error);
      alert('Failed to start checkout. Please try again.');
      setLoadingPlan(null);
    }
  };

  return (
    <section id="pricing" className="relative py-24 bg-[#0a0a0f] overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 section-gradient-1 opacity-50" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            <span className="gradient-text">Simple</span>, Transparent Pricing
          </h2>
          <p className="text-xl text-gray-400 max-w-3xl mx-auto">
            Choose the plan that fits your restaurant. All plans include a 14-day free trial.
          </p>
        </motion.div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {PRICING_TIERS.map((tier, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className={`relative ${
                tier.highlighted
                  ? 'glass-strong border-2 border-indigo-500/50 scale-105'
                  : 'glass-card'
              } p-8 ${tier.highlighted ? 'md:-mt-4 md:mb-4' : ''}`}
            >
              {/* Best Value Badge */}
              {tier.highlighted && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                  <div className="px-4 py-1 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full text-xs font-bold text-white">
                    MOST POPULAR
                  </div>
                </div>
              )}

              {/* Plan Name */}
              <h3 className="text-2xl font-bold text-white mb-2">{tier.name}</h3>
              <p className="text-gray-400 text-sm mb-6">{tier.description}</p>

              {/* Price */}
              <div className="mb-8">
                <div className="flex items-baseline">
                  <span className="text-5xl font-bold gradient-text">{tier.price}</span>
                  {tier.period && <span className="text-gray-400 ml-2">{tier.period}</span>}
                </div>
              </div>

              {/* Features */}
              <ul className="space-y-4 mb-8">
                {tier.features.map((feature, featureIndex) => (
                  <li key={featureIndex} className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <span className="text-gray-300 text-sm">{feature}</span>
                  </li>
                ))}
              </ul>

              {/* CTA Button */}
              <button
                onClick={() => tier.priceId ? handleSubscribe(tier.priceId, tier.name) : scrollToContact()}
                disabled={loadingPlan === tier.name}
                className={`w-full px-6 py-3 ${
                  tier.highlighted ? 'glass-button-primary' : 'glass-button'
                } text-white font-semibold flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {loadingPlan === tier.name ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    {tier.cta}
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>

              {/* Decorative glow for highlighted tier */}
              {tier.highlighted && (
                <div className="absolute -inset-4 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 rounded-2xl blur-2xl -z-10" />
              )}
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
          <p className="text-gray-400 mb-4">
            Need a custom solution? We offer flexible enterprise plans for multi-location
            restaurants.
          </p>
          <button
            onClick={scrollToContact}
            className="text-indigo-400 hover:text-indigo-300 font-semibold inline-flex items-center gap-2"
          >
            Contact us for enterprise pricing
            <ArrowRight className="w-4 h-4" />
          </button>
        </motion.div>
      </div>
    </section>
  );
}

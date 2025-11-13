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
    <section id="pricing" className="relative py-24 bg-gradient-to-br from-cream-200 to-cream-300 overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-parchment-texture opacity-20" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="font-display text-4xl md:text-5xl font-bold text-burgundy-900 mb-4">
            Choose Your Plan
          </h2>
          <p className="font-sans text-lg text-charcoal-600 max-w-3xl mx-auto">
            Transparent pricing for restaurants of all sizes. All plans include a 14-day free trial.
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
                  ? 'bg-gradient-to-br from-burgundy-900 to-burgundy-800 border-2 border-gold-400 transform scale-105 shadow-2xl'
                  : 'bg-cream-50 border-2 border-cream-400 hover:border-burgundy-300 shadow-md hover:shadow-xl'
              } rounded-2xl p-8 transition-all duration-300`}
            >
              {/* Most Popular Badge */}
              {tier.highlighted && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-6 py-2 bg-gradient-to-r from-gold-500 to-gold-600 text-charcoal-900 font-sans font-bold text-sm rounded-full shadow-gold">
                  ⭐ Most Popular
                </div>
              )}

              {/* Plan Name */}
              <div className="text-center mb-6">
                <h3 className={`font-display font-bold text-2xl mb-2 ${tier.highlighted ? 'text-cream-50' : 'text-charcoal-800'}`}>
                  {tier.name}
                </h3>
                <p className={`font-sans text-sm ${tier.highlighted ? 'text-cream-300' : 'text-charcoal-600'}`}>
                  {tier.description}
                </p>
              </div>

              {/* Price */}
              <div className="text-center mb-8">
                {tier.name === 'Enterprise' ? (
                  <div className="font-display text-4xl font-bold text-gold-600">
                    Custom
                  </div>
                ) : (
                  <div className="flex items-baseline justify-center">
                    <span className={`font-mono text-5xl font-bold ${tier.highlighted ? 'text-gold-400' : 'text-burgundy-900'}`}>
                      {tier.price}
                    </span>
                    {tier.period && (
                      <span className={`font-sans text-xl ml-2 ${tier.highlighted ? 'text-cream-300' : 'text-charcoal-500'}`}>
                        {tier.period}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Features */}
              <ul className="space-y-4 mb-8">
                {tier.features.map((feature, featureIndex) => (
                  <li key={featureIndex} className="flex items-start gap-3">
                    <CheckCircle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${tier.highlighted ? 'text-gold-400' : 'text-success-500'}`} />
                    <span className={`font-sans text-sm ${tier.highlighted ? 'text-cream-100' : 'text-charcoal-700'}`}>
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>

              {/* CTA Button */}
              <button
                onClick={() => tier.priceId ? handleSubscribe(tier.priceId, tier.name) : scrollToContact()}
                disabled={loadingPlan === tier.name}
                className={`w-full px-6 py-3 font-sans font-semibold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed ${
                  tier.highlighted
                    ? 'bg-gradient-to-r from-gold-500 to-gold-600 text-charcoal-900 shadow-gold hover:-translate-y-1 hover:shadow-2xl'
                    : 'bg-gradient-to-r from-burgundy-700 to-burgundy-800 text-cream-50 shadow-burgundy hover:-translate-y-1'
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
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
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
          <p className="font-sans text-charcoal-600 mb-4">
            Need a custom solution? We offer flexible enterprise plans for multi-location restaurants.
          </p>
          <button
            onClick={scrollToContact}
            className="font-sans text-burgundy-700 hover:text-burgundy-900 font-semibold inline-flex items-center gap-2 hover:gap-3 transition-all"
          >
            Contact us for enterprise pricing
            <ArrowRight className="w-4 h-4" />
          </button>
        </motion.div>
      </div>
    </section>
  );
}

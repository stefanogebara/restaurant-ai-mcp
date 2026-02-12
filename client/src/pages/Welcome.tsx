/**
 * Welcome Page - Post-Login Landing
 * Shows platform features and pricing plans after user authentication
 * Modern Elegant Design
 */

import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { useSubscription } from '../hooks/useSubscription';
import { authFetch } from '../services/api';
import ThiingsIcon from '../components/common/ThiingsIcon';
import Spinner from '../components/common/Spinner';
import type { IconName } from '../components/common/ThiingsIcon';

const FEATURES: Array<{ icon: IconName; title: string; description: string }> = [
  {
    icon: 'phone',
    title: 'AI Voice Reservations',
    description: 'Let AI handle phone calls and take reservations 24/7 in multiple languages'
  },
  {
    icon: 'dashboard',
    title: 'Real-Time Dashboard',
    description: 'Monitor table status, occupancy, and reservations in real-time'
  },
  {
    icon: 'bar-chart',
    title: 'Smart Analytics',
    description: 'Track peak hours, customer preferences, and revenue insights'
  },
  {
    icon: 'users',
    title: 'Waitlist Management',
    description: 'Automated waitlist with real-time notifications and time estimates'
  },
  {
    icon: 'clock',
    title: 'Table Optimization',
    description: 'Smart seating algorithms to maximize your restaurant capacity'
  },
  {
    icon: 'bell',
    title: 'Automated Notifications',
    description: 'Email confirmations, reminders, and updates to your customers'
  }
];

const PLANS = [
  {
    name: 'Basic',
    price: '€49.99',
    description: 'Perfect for small restaurants',
    priceId: 'price_1SMyEOKf4yCMjmH5kXx1RUyo',
    features: [
      'AI reservations',
      'Host dashboard',
      'Basic analytics',
      'Email support',
      'Up to 50 reservations/month'
    ],
    highlighted: false
  },
  {
    name: 'Professional',
    price: '€99.99',
    description: 'For growing restaurants',
    priceId: 'price_1SMyFUKf4yCMjmH5jh4mReyI',
    features: [
      'Everything in Basic',
      'Advanced analytics',
      'Waitlist management',
      'Priority support',
      'Unlimited reservations',
      'Automated notifications'
    ],
    highlighted: true
  }
];

export default function Welcome() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const subscriptionQuery = useSubscription();
  const hasActiveSubscription = subscriptionQuery.data?.has_subscription && subscriptionQuery.data?.subscription?.is_active;

  // Note: Reservation fetch errors on the welcome page are expected
  // when restaurant is not fully set up yet - they are handled gracefully
  // by the API layer and don't affect this page's functionality.

  const handleGetStarted = async (priceId: string, planName: string) => {
    try {
      setLoadingPlan(planName);
      setCheckoutError(null);

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
          email: user?.email,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create checkout session');
      }

      const { url } = await response.json();
      window.location.href = url;
    } catch (error) {
      console.error('Error creating checkout session:', error);
      setCheckoutError('Failed to start checkout. Please try again.');
      setLoadingPlan(null);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const fadeIn = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } }
  };

  return (
    <div className="min-h-screen bg-[#FAFAF9]">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-b border-[#E7E5E4]">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="font-serif text-2xl text-[#1C1917]">
            Seatable<span className="text-[#9F1239]">.</span>
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-sm text-[#57534E]">
              {user?.email}
            </span>
            <Link
              to="/host-dashboard/simple"
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-[#9F1239] text-[#9F1239] rounded-lg hover:bg-[#9F1239] hover:text-white transition-all duration-200"
            >
              <ThiingsIcon name="dashboard" size="xs" />
              Go to Dashboard
            </Link>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 px-4 py-2 text-sm text-[#57534E] hover:text-[#1C1917] transition-colors"
            >
              <ThiingsIcon name="logout" size="xs" />
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-32 pb-16 px-6">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeIn}
          className="max-w-4xl mx-auto text-center"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#9F1239]/10 text-[#9F1239] rounded-full text-sm font-medium mb-6">
            <ThiingsIcon name="sparkles" size="xs" />
            Welcome to Seatable
          </div>
          <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl text-[#1C1917] mb-6">
            Let's Get Your Restaurant <br />
            <span className="italic font-light">Up and Running</span>
          </h1>
          <p className="text-lg text-[#57534E] max-w-2xl mx-auto font-light">
            You're just a few steps away from transforming how your restaurant handles reservations.
            Choose a plan and let's set everything up.
          </p>
        </motion.div>
      </section>

      {/* Features Grid */}
      <section className="py-16 px-6 bg-white border-y border-[#E7E5E4]">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeIn}
            className="text-center mb-12"
          >
            <h2 className="font-serif text-3xl text-[#1C1917] mb-4">
              Everything You Need
            </h2>
            <p className="text-[#57534E] font-light">
              Powerful features to streamline your restaurant operations
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="bg-[#FAFAF9] border border-[#E7E5E4] rounded-2xl p-6 hover:shadow-lg transition-shadow"
              >
                <div className="w-12 h-12 bg-[#9F1239]/10 rounded-xl flex items-center justify-center mb-4">
                  <ThiingsIcon name={feature.icon} pxSize={24} />
                </div>
                <h3 className="font-semibold text-[#1C1917] mb-2">{feature.title}</h3>
                <p className="text-sm text-[#57534E] font-light">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {subscriptionQuery.isLoading ? (
        <section className="py-20 px-6">
          <div className="max-w-2xl mx-auto text-center">
            <div className="h-8 w-48 bg-[#E7E5E4] rounded-lg animate-pulse mx-auto mb-4"></div>
            <div className="h-4 w-64 bg-[#F5F5F4] rounded animate-pulse mx-auto mb-12"></div>
            <div className="bg-white rounded-[2rem] border border-[#E7E5E4] p-12">
              <div className="w-16 h-16 bg-[#F5F5F4] rounded-full animate-pulse mx-auto mb-6"></div>
              <div className="h-6 w-40 bg-[#E7E5E4] rounded-lg animate-pulse mx-auto mb-3"></div>
              <div className="h-4 w-56 bg-[#F5F5F4] rounded animate-pulse mx-auto mb-8"></div>
              <div className="h-12 w-48 bg-[#E7E5E4] rounded-2xl animate-pulse mx-auto"></div>
            </div>
          </div>
        </section>
      ) : hasActiveSubscription ? (
        <section className="py-20 px-6">
          <div className="max-w-2xl mx-auto text-center">
            <div className="bg-white border-2 border-[#9F1239]/20 rounded-[2rem] p-12 shadow-xl">
              <div className="w-16 h-16 bg-[#9F1239]/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <ThiingsIcon name="sparkles" pxSize={32} />
              </div>
              <h2 className="font-serif text-3xl text-[#1C1917] mb-4">You're All Set!</h2>
              <p className="text-[#57534E] font-light mb-2">
                Your <span className="font-semibold text-[#9F1239]">{subscriptionQuery.data?.subscription?.plan}</span> plan is active.
              </p>
              <p className="text-sm text-[#A8A29E] mb-8">
                Head to your dashboard to start managing reservations.
              </p>
              <Link
                to="/host-dashboard/simple"
                className="inline-flex items-center gap-2 px-8 py-4 bg-[#9F1239] text-white font-bold text-sm tracking-widest uppercase rounded-2xl hover:bg-[#881337] transition-all duration-300 shadow-lg shadow-[#9F1239]/20"
              >
                Go to Dashboard
                <ThiingsIcon name="arrow-right" size="xs" />
              </Link>
            </div>
          </div>
        </section>
      ) : (
        <>
          {/* Pricing Section */}
          <section className="py-20 px-6">
            <div className="max-w-5xl mx-auto">
              <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeIn}
                className="text-center mb-12"
              >
                <h2 className="font-serif text-3xl text-[#1C1917] mb-4">
                  Choose Your Plan
                </h2>
                <p className="text-[#57534E] font-light">
                  All plans include a 14-day free trial. No credit card required to start.
                </p>
              </motion.div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
                {PLANS.map((plan, index) => (
                  <motion.div
                    key={plan.name}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.1 }}
                    className={`
                      relative bg-white border-2 rounded-[2rem] p-8
                      ${plan.highlighted
                        ? 'border-[#9F1239] shadow-xl shadow-[#9F1239]/10'
                        : 'border-[#E7E5E4]'
                      }
                    `}
                  >
                    {plan.highlighted && (
                      <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                        <span className="bg-[#9F1239] text-white text-xs font-bold px-4 py-1 rounded-full uppercase tracking-wider">
                          Most Popular
                        </span>
                      </div>
                    )}

                    <div className="text-center mb-6">
                      <h3 className="font-serif text-2xl text-[#1C1917] mb-2">{plan.name}</h3>
                      <p className="text-sm text-[#57534E] font-light mb-4">{plan.description}</p>
                      <div className="flex items-baseline justify-center gap-1">
                        <span className="font-serif text-4xl font-bold text-[#1C1917]">{plan.price}</span>
                        <span className="text-[#57534E]">/month</span>
                      </div>
                    </div>

                    <ul className="space-y-3 mb-8">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-3">
                          <ThiingsIcon name="check" size="sm" className="flex-shrink-0 mt-0.5" />
                          <span className="text-[#57534E] text-sm">{feature}</span>
                        </li>
                      ))}
                    </ul>

                    <button
                      onClick={() => handleGetStarted(plan.priceId, plan.name)}
                      disabled={loadingPlan === plan.name}
                      className={`
                        w-full py-4 rounded-2xl font-bold text-sm tracking-widest uppercase
                        flex items-center justify-center gap-2 transition-all duration-300
                        disabled:opacity-50 disabled:cursor-not-allowed
                        ${plan.highlighted
                          ? 'bg-[#9F1239] text-white hover:bg-[#881337] shadow-lg shadow-[#9F1239]/20'
                          : 'bg-[#1C1917] text-white hover:bg-[#9F1239]'
                        }
                      `}
                    >
                      {loadingPlan === plan.name ? (
                        <>
                          <Spinner size="sm" />
                          Loading...
                        </>
                      ) : (
                        <>
                          Get Started
                          <ThiingsIcon name="arrow-right" size="xs" />
                        </>
                      )}
                    </button>
                  </motion.div>
                ))}
              </div>

              <motion.p
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                className="text-center text-sm text-[#57534E] mt-8"
              >
                Need a custom solution?{' '}
                <Link to="/#contact" className="text-[#9F1239] hover:underline">
                  Contact us for enterprise pricing
                </Link>
              </motion.p>
            </div>
          </section>

          {/* CTA Section */}
          <section className="py-16 px-6 bg-[#1C1917]">
            <div className="max-w-4xl mx-auto text-center">
              <h2 className="font-serif text-3xl text-white mb-4">
                Ready to Transform Your Restaurant?
              </h2>
              <p className="text-white/70 font-light mb-8">
                Start automating reservations and delighting customers with AI-powered table management.
              </p>
              <button
                onClick={() => handleGetStarted('price_1SMyFUKf4yCMjmH5jh4mReyI', 'Professional')}
                disabled={loadingPlan === 'Professional'}
                className="px-8 py-4 bg-[#9F1239] text-white font-bold text-sm tracking-widest uppercase rounded-2xl hover:bg-[#881337] transition-all duration-300 shadow-xl shadow-[#9F1239]/30 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2 mx-auto"
              >
                {loadingPlan === 'Professional' ? (
                  <>
                    <Spinner size="sm" />
                    Loading...
                  </>
                ) : (
                  'Start Free Trial'
                )}
              </button>
            </div>
          </section>

          {/* Checkout Error Toast */}
          {checkoutError && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-red-600 text-white px-6 py-3 rounded-xl shadow-lg text-sm font-medium animate-fade-in-up">
              {checkoutError}
              <button onClick={() => setCheckoutError(null)} className="ml-3 text-white/80 hover:text-white">&times;</button>
            </div>
          )}
        </>
      )}

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-[#E7E5E4]">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <span className="font-serif text-[#1C1917]">
            Seatable<span className="text-[#9F1239]">.</span>
          </span>
          <span className="text-sm text-[#57534E]">
            © {new Date().getFullYear()} Seatable AI. All rights reserved.
          </span>
        </div>
      </footer>
    </div>
  );
}

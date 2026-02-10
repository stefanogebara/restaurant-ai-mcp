import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle, ArrowRight, Loader2, Sparkles } from 'lucide-react';
import { authFetch } from '../services/api';

export default function SubscriptionSuccess() {
  const navigate = useNavigate();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [customerEmail, setCustomerEmail] = useState<string>('');
  const [plan, setPlan] = useState<string>('Basic');

  useEffect(() => {
    const verifySession = async () => {
      // Get session ID from URL parameters
      const params = new URLSearchParams(window.location.search);
      const id = params.get('session_id');
      setSessionId(id);

      if (!id) {
        setLoading(false);
        return;
      }

      try {
        // Verify session with backend
        const apiUrl = import.meta.env.VITE_API_URL
          ? `${import.meta.env.VITE_API_URL}/api/verify-session`
          : '/api/verify-session';

        const response = await authFetch(`${apiUrl}?session_id=${id}`);

        if (response.ok) {
          const data = await response.json();

          // Store customer data in localStorage
          if (data.customer_id) {
            localStorage.setItem('stripe_customer_id', data.customer_id);
          }
          if (data.plan) {
            setPlan(data.plan);
            localStorage.setItem('subscription_plan', data.plan);
          }
          if (data.customer_email) {
            setCustomerEmail(data.customer_email);
            localStorage.setItem('customer_email', data.customer_email);

            // Check if onboarding is complete
            // For new customers, redirect to onboarding
            // This will be a new subscription, so redirect to onboarding
            setTimeout(() => {
              navigate(`/onboarding?email=${encodeURIComponent(data.customer_email)}&plan=${encodeURIComponent(data.plan || 'Basic')}`);
            }, 3000); // Give user 3 seconds to see success message
          }
        }
      } catch (error) {
        console.error('Error verifying session:', error);
      } finally {
        setLoading(false);
      }
    };

    verifySession();
  }, [navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAFAF9] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-[#9F1239] animate-spin mx-auto mb-4" />
          <p className="text-[#57534E]">Verifying your subscription...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAF9]">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-b border-[#E7E5E4]">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="font-serif text-2xl text-[#1C1917]">
            Seatable<span className="text-[#9F1239]">.</span>
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <div className="pt-24 pb-16 px-6 flex items-center justify-center min-h-screen">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="max-w-2xl w-full"
        >
          <div className="bg-white border border-[#E7E5E4] rounded-[2rem] p-8 md:p-12 text-center shadow-xl">
            {/* Success Icon */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
              className="w-20 h-20 rounded-full bg-[#16a34a] flex items-center justify-center mx-auto mb-6"
            >
              <CheckCircle className="w-12 h-12 text-white" />
            </motion.div>

            {/* Heading */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="font-serif text-4xl text-[#1C1917] mb-4"
            >
              Welcome to Seatable!
            </motion.h1>

            {/* Plan Badge */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#9F1239]/10 text-[#9F1239] rounded-full text-sm font-semibold mb-4"
            >
              <Sparkles className="w-4 h-4" />
              {plan} Plan Activated
            </motion.div>

            {/* Description */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="text-lg text-[#57534E] mb-4 font-light"
            >
              Your subscription is now active. Your 14-day free trial has started!
            </motion.p>

            {customerEmail && (
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="text-[#16a34a] font-semibold mb-8"
              >
                Redirecting you to onboarding in 3 seconds...
              </motion.p>
            )}

            {/* Session Info */}
            {sessionId && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="bg-[#F5F5F4] border border-[#E7E5E4] p-4 rounded-xl mb-8"
              >
                <p className="text-sm text-[#57534E] mb-1">Session ID</p>
                <p className="text-xs text-[#A8A29E] font-mono break-all">{sessionId}</p>
              </motion.div>
            )}

            {/* What's Next */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="text-left mb-8 bg-[#F5F5F4] border border-[#E7E5E4] p-6 rounded-xl"
            >
              <h2 className="text-xl font-bold text-[#1C1917] mb-4">What's next?</h2>
              <ul className="space-y-3">
                {[
                  'Check your email for order confirmation',
                  'Complete the onboarding to set up your restaurant',
                  'Access your host dashboard to manage reservations',
                  'Explore analytics to track your restaurant performance',
                ].map((item, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-[#16a34a] flex-shrink-0 mt-0.5" />
                    <span className="text-[#57534E]">{item}</span>
                  </li>
                ))}
              </ul>
            </motion.div>

            {/* Action Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
              className="flex flex-col gap-4"
            >
              <div className="flex flex-col sm:flex-row gap-4">
                <button
                  onClick={() => navigate('/onboarding')}
                  className="flex-1 px-6 py-4 bg-[#9F1239] hover:bg-[#881337] text-white font-bold text-sm tracking-widest uppercase rounded-2xl flex items-center justify-center gap-2 group transition-all duration-300 shadow-lg shadow-[#9F1239]/20"
                >
                  Continue to Onboarding
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>
                <button
                  onClick={() => navigate('/subscription/manage')}
                  className="flex-1 px-6 py-4 border border-[#E7E5E4] text-[#1C1917] hover:bg-[#F5F5F4] font-bold text-sm tracking-widest uppercase rounded-2xl transition-all duration-300"
                >
                  Manage Subscription
                </button>
              </div>
              <button
                onClick={() => navigate('/')}
                className="px-6 py-3 text-[#57534E] hover:text-[#1C1917] font-semibold transition-colors"
              >
                Back to Home
              </button>
            </motion.div>

            {/* Support Note */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
              className="text-sm text-[#A8A29E] mt-8"
            >
              Need help getting started?{' '}
              <a
                href="mailto:stefanogebara@gmail.com"
                className="text-[#9F1239] hover:text-[#881337] transition-colors"
              >
                Contact our support team
              </a>
            </motion.p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

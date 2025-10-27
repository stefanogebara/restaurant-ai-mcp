import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle, ArrowRight, Loader2 } from 'lucide-react';

export default function SubscriptionSuccess() {
  const navigate = useNavigate();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [customerEmail, setCustomerEmail] = useState<string | null>(null);

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
        const response = await fetch(
          `${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/verify-session?session_id=${id}`
        );

        if (response.ok) {
          const data = await response.json();

          // Store customer ID in localStorage for later use
          if (data.customer_id) {
            localStorage.setItem('stripe_customer_id', data.customer_id);
          }

          setCustomerEmail(data.customer_email);
        }
      } catch (error) {
        console.error('Error verifying session:', error);
      } finally {
        setLoading(false);
      }
    };

    verifySession();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Verifying your subscription...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="max-w-2xl w-full"
      >
        <div className="glass-card p-8 md:p-12 text-center">
          {/* Success Icon */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
            className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center mx-auto mb-6"
          >
            <CheckCircle className="w-12 h-12 text-white" />
          </motion.div>

          {/* Heading */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-4xl font-bold mb-4"
          >
            <span className="gradient-text">Welcome to Restaurant AI!</span>
          </motion.h1>

          {/* Description */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="text-xl text-gray-300 mb-8"
          >
            Your subscription is now active. Your 14-day free trial has started!
          </motion.p>

          {/* Session Info */}
          {sessionId && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="glass-subtle p-4 rounded-lg mb-8"
            >
              <p className="text-sm text-gray-400 mb-1">Session ID</p>
              <p className="text-xs text-gray-500 font-mono break-all">{sessionId}</p>
            </motion.div>
          )}

          {/* What's Next */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="text-left mb-8"
          >
            <h2 className="text-xl font-bold text-white mb-4">What's next?</h2>
            <ul className="space-y-3">
              {[
                'Check your email for order confirmation',
                'Access your host dashboard to manage reservations',
                'Integrate the AI phone assistant with your phone number',
                'Explore analytics to track your restaurant performance',
              ].map((item, index) => (
                <li key={index} className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-300">{item}</span>
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
                onClick={() => navigate('/host-dashboard')}
                className="flex-1 px-6 py-3 glass-button-primary text-white font-semibold flex items-center justify-center gap-2 group"
              >
                Go to Dashboard
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
              <button
                onClick={() => navigate('/subscription/manage')}
                className="flex-1 px-6 py-3 glass-button text-white font-semibold"
              >
                Manage Subscription
              </button>
            </div>
            <button
              onClick={() => navigate('/')}
              className="px-6 py-3 glass-button text-white font-semibold"
            >
              Back to Home
            </button>
          </motion.div>

          {/* Support Note */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="text-sm text-gray-400 mt-8"
          >
            Need help getting started?{' '}
            <a
              href="mailto:support@restaurant-ai-mcp.com"
              className="text-indigo-400 hover:text-indigo-300"
            >
              Contact our support team
            </a>
          </motion.p>
        </div>
      </motion.div>
    </div>
  );
}

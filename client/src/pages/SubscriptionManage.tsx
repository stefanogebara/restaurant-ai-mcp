import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CreditCard, Calendar, CheckCircle, XCircle, Loader2, ArrowRight, Settings } from 'lucide-react';

interface SubscriptionData {
  status: 'active' | 'trialing' | 'canceled' | 'past_due' | 'none';
  planName: string;
  planPrice: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
  trialEnd?: string;
}

export default function SubscriptionManage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [managingSubscription, setManagingSubscription] = useState(false);

  useEffect(() => {
    const fetchSubscription = async () => {
      try {
        // Get customer ID from localStorage (stored after successful checkout)
        // In production with full auth, this would come from your user session
        const customerId =
          searchParams.get('customer_id') ||
          localStorage.getItem('stripe_customer_id') ||
          'cus_placeholder';

        const response = await fetch(
          `${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/get-subscription?customerId=${customerId}`
        );

        if (!response.ok) {
          throw new Error('Failed to fetch subscription');
        }

        const data = await response.json();
        setSubscription(data);
      } catch (error) {
        console.error('Error fetching subscription:', error);
        // Set to 'none' if there's an error
        setSubscription({
          status: 'none',
          planName: 'No Plan',
          planPrice: 'N/A',
        });
      } finally {
        setLoading(false);
      }
    };

    fetchSubscription();
  }, [searchParams]);

  const handleManageSubscription = async () => {
    try {
      setManagingSubscription(true);

      // Get customer ID from localStorage (stored after successful checkout)
      // In production with full auth, this would come from your user session
      const customerId =
        localStorage.getItem('stripe_customer_id') ||
        'cus_placeholder';

      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/customer-portal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customerId,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create portal session');
      }

      const { url } = await response.json();

      // Redirect to Stripe Customer Portal
      window.location.href = url;
    } catch (error) {
      console.error('Error accessing customer portal:', error);
      alert('Failed to open subscription management. Please try again.');
      setManagingSubscription(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'text-emerald-400';
      case 'trialing':
        return 'text-blue-400';
      case 'canceled':
        return 'text-gray-400';
      case 'past_due':
        return 'text-red-400';
      default:
        return 'text-gray-400';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
      case 'trialing':
        return <CheckCircle className="w-6 h-6 text-emerald-400" />;
      case 'canceled':
      case 'past_due':
        return <XCircle className="w-6 h-6 text-red-400" />;
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading subscription details...</p>
        </div>
      </div>
    );
  }

  if (!subscription || subscription.status === 'none') {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="max-w-2xl w-full"
        >
          <div className="glass-card p-8 md:p-12 text-center">
            <XCircle className="w-16 h-16 text-gray-400 mx-auto mb-6" />
            <h1 className="text-3xl font-bold mb-4 text-white">No Active Subscription</h1>
            <p className="text-gray-400 mb-8">
              You don't have an active subscription yet. Choose a plan to get started!
            </p>
            <button
              onClick={() => navigate('/#pricing')}
              className="px-6 py-3 glass-button-primary text-white font-semibold inline-flex items-center gap-2 group"
            >
              View Pricing Plans
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] py-12 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8"
        >
          <h1 className="text-4xl font-bold mb-2">
            <span className="gradient-text">Subscription Management</span>
          </h1>
          <p className="text-gray-400">Manage your Restaurant AI subscription</p>
        </motion.div>

        {/* Current Subscription Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="glass-card p-8 mb-6"
        >
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
                <CreditCard className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">{subscription.planName} Plan</h2>
                <p className="text-gray-400">{subscription.planPrice}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {getStatusIcon(subscription.status)}
              <span className={`font-semibold capitalize ${getStatusColor(subscription.status)}`}>
                {subscription.status}
              </span>
            </div>
          </div>

          {/* Subscription Details */}
          <div className="space-y-4">
            {subscription.status === 'trialing' && subscription.trialEnd && (
              <div className="glass-subtle p-4 rounded-lg">
                <div className="flex items-center gap-3 mb-2">
                  <Calendar className="w-5 h-5 text-blue-400" />
                  <span className="font-semibold text-white">Free Trial Active</span>
                </div>
                <p className="text-gray-400 text-sm">
                  Your 14-day free trial ends on <strong>{subscription.trialEnd}</strong>
                </p>
              </div>
            )}

            {subscription.currentPeriodEnd && (
              <div className="glass-subtle p-4 rounded-lg">
                <div className="flex items-center gap-3 mb-2">
                  <Calendar className="w-5 h-5 text-indigo-400" />
                  <span className="font-semibold text-white">
                    {subscription.cancelAtPeriodEnd ? 'Subscription Ends' : 'Next Billing Date'}
                  </span>
                </div>
                <p className="text-gray-400 text-sm">
                  {subscription.cancelAtPeriodEnd ? (
                    <>Your subscription will end on <strong>{subscription.currentPeriodEnd}</strong></>
                  ) : (
                    <>Your next payment is due on <strong>{subscription.currentPeriodEnd}</strong></>
                  )}
                </p>
              </div>
            )}

            {subscription.cancelAtPeriodEnd && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
                <p className="text-red-400 text-sm">
                  ⚠️ Your subscription is set to cancel at the end of the current billing period.
                </p>
              </div>
            )}
          </div>
        </motion.div>

        {/* Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="space-y-4"
        >
          <button
            onClick={handleManageSubscription}
            disabled={managingSubscription}
            className="w-full px-6 py-4 glass-button-primary text-white font-semibold flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {managingSubscription ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Opening Portal...
              </>
            ) : (
              <>
                <Settings className="w-5 h-5" />
                Manage Subscription
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>

          <button
            onClick={() => navigate('/')}
            className="w-full px-6 py-3 glass-button text-white font-semibold"
          >
            Back to Home
          </button>
        </motion.div>

        {/* Help Section */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-8 text-center"
        >
          <p className="text-sm text-gray-400">
            Need help?{' '}
            <a
              href="mailto:support@restaurant-ai-mcp.com"
              className="text-indigo-400 hover:text-indigo-300"
            >
              Contact our support team
            </a>
          </p>
        </motion.div>
      </div>
    </div>
  );
}

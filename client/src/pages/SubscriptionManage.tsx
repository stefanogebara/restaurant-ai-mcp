import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CreditCard, Calendar, CheckCircle, XCircle, Loader2, ArrowRight, Settings, Sparkles, Star } from 'lucide-react';
import { authFetch } from '../services/api';

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

        const apiUrl = import.meta.env.VITE_API_URL
          ? `${import.meta.env.VITE_API_URL}/api/get-subscription`
          : '/api/get-subscription';

        const response = await authFetch(`${apiUrl}?customerId=${customerId}`);

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

      const apiUrl = import.meta.env.VITE_API_URL
        ? `${import.meta.env.VITE_API_URL}/api/customer-portal`
        : '/api/customer-portal';

      const response = await authFetch(apiUrl, {
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
        return 'text-[#16a34a]';
      case 'trialing':
        return 'text-[#0ea5e9]';
      case 'canceled':
        return 'text-[#57534E]';
      case 'past_due':
        return 'text-[#dc2626]';
      default:
        return 'text-[#57534E]';
    }
  };

  const getStatusBg = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-[#16a34a]/10 border-[#16a34a]/30';
      case 'trialing':
        return 'bg-[#0ea5e9]/10 border-[#0ea5e9]/30';
      case 'canceled':
        return 'bg-[#F5F5F4] border-[#E7E5E4]';
      case 'past_due':
        return 'bg-[#dc2626]/10 border-[#dc2626]/30';
      default:
        return 'bg-[#F5F5F4] border-[#E7E5E4]';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
      case 'trialing':
        return <CheckCircle className="w-5 h-5 text-[#16a34a]" />;
      case 'canceled':
      case 'past_due':
        return <XCircle className="w-5 h-5 text-[#dc2626]" />;
      default:
        return null;
    }
  };

  const getPlanIcon = (planName: string) => {
    switch (planName.toLowerCase()) {
      case 'professional':
        return <Star className="w-6 h-6 text-white" />;
      default:
        return <CreditCard className="w-6 h-6 text-white" />;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAFAF9] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-[#9F1239] animate-spin mx-auto mb-4" />
          <p className="text-[#57534E]">Loading subscription details...</p>
        </div>
      </div>
    );
  }

  if (!subscription || subscription.status === 'none') {
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

        <div className="pt-24 pb-16 px-6 flex items-center justify-center min-h-screen">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="max-w-2xl w-full"
          >
            <div className="bg-white border border-[#E7E5E4] rounded-[2rem] p-8 md:p-12 text-center shadow-xl">
              <XCircle className="w-16 h-16 text-[#A8A29E] mx-auto mb-6" />
              <h1 className="font-serif text-3xl text-[#1C1917] mb-4">No Active Subscription</h1>
              <p className="text-[#57534E] mb-8 font-light">
                You don't have an active subscription yet. Choose a plan to get started!
              </p>
              <button
                onClick={() => navigate('/#pricing')}
                className="px-8 py-4 bg-[#9F1239] hover:bg-[#881337] text-white font-bold text-sm tracking-widest uppercase rounded-2xl inline-flex items-center gap-2 group transition-all duration-300 shadow-lg shadow-[#9F1239]/20"
              >
                View Pricing Plans
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </motion.div>
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
          <button
            onClick={() => navigate('/host-dashboard/simple')}
            className="px-4 py-2 text-sm text-[#57534E] hover:text-[#1C1917] transition-colors"
          >
            Go to Dashboard
          </button>
        </div>
      </header>

      <div className="pt-32 pb-16 px-6">
        <div className="max-w-3xl mx-auto">
          {/* Page Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-8 text-center"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#9F1239]/10 text-[#9F1239] rounded-full text-sm font-medium mb-4">
              <Sparkles className="w-4 h-4" />
              Subscription Management
            </div>
            <h1 className="font-serif text-4xl text-[#1C1917] mb-2">
              Manage Your Plan
            </h1>
            <p className="text-[#57534E] font-light">View and manage your Seatable subscription</p>
          </motion.div>

          {/* Current Subscription Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="bg-white border border-[#E7E5E4] rounded-[2rem] p-8 mb-6 shadow-lg"
          >
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-[#9F1239] flex items-center justify-center">
                  {getPlanIcon(subscription.planName)}
                </div>
                <div>
                  <h2 className="font-serif text-2xl text-[#1C1917]">{subscription.planName} Plan</h2>
                  <p className="text-[#57534E]">{subscription.planPrice}</p>
                </div>
              </div>
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${getStatusBg(subscription.status)}`}>
                {getStatusIcon(subscription.status)}
                <span className={`font-semibold capitalize text-sm ${getStatusColor(subscription.status)}`}>
                  {subscription.status}
                </span>
              </div>
            </div>

            {/* Subscription Details */}
            <div className="space-y-4">
              {subscription.status === 'trialing' && subscription.trialEnd && (
                <div className="bg-[#0ea5e9]/10 border border-[#0ea5e9]/30 p-4 rounded-xl">
                  <div className="flex items-center gap-3 mb-2">
                    <Calendar className="w-5 h-5 text-[#0ea5e9]" />
                    <span className="font-semibold text-[#1C1917]">Free Trial Active</span>
                  </div>
                  <p className="text-[#57534E] text-sm">
                    Your 14-day free trial ends on <strong className="text-[#1C1917]">{subscription.trialEnd}</strong>
                  </p>
                </div>
              )}

              {subscription.currentPeriodEnd && (
                <div className="bg-[#F5F5F4] border border-[#E7E5E4] p-4 rounded-xl">
                  <div className="flex items-center gap-3 mb-2">
                    <Calendar className="w-5 h-5 text-[#9F1239]" />
                    <span className="font-semibold text-[#1C1917]">
                      {subscription.cancelAtPeriodEnd ? 'Subscription Ends' : 'Next Billing Date'}
                    </span>
                  </div>
                  <p className="text-[#57534E] text-sm">
                    {subscription.cancelAtPeriodEnd ? (
                      <>Your subscription will end on <strong className="text-[#1C1917]">{subscription.currentPeriodEnd}</strong></>
                    ) : (
                      <>Your next payment is due on <strong className="text-[#1C1917]">{subscription.currentPeriodEnd}</strong></>
                    )}
                  </p>
                </div>
              )}

              {subscription.cancelAtPeriodEnd && (
                <div className="bg-[#dc2626]/10 border border-[#dc2626]/30 rounded-xl p-4">
                  <p className="text-[#dc2626] text-sm font-medium">
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
              className="w-full px-6 py-4 bg-[#9F1239] hover:bg-[#881337] text-white font-bold text-sm tracking-widest uppercase rounded-2xl flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 shadow-lg shadow-[#9F1239]/20"
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
              className="w-full px-6 py-4 border border-[#E7E5E4] text-[#1C1917] hover:bg-[#F5F5F4] font-bold text-sm tracking-widest uppercase rounded-2xl transition-all duration-300"
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
            <p className="text-sm text-[#A8A29E]">
              Need help?{' '}
              <a
                href="mailto:stefanogebara@gmail.com"
                className="text-[#9F1239] hover:text-[#881337] transition-colors"
              >
                Contact our support team
              </a>
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

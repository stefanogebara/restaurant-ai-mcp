import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { SkeletonSubscription } from '../components/common/Skeleton';
import { authFetch } from '../services/api';

interface SubscriptionData {
  status: 'active' | 'trialing' | 'canceled' | 'past_due' | 'none';
  planName: string;
  planPrice: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
  trialEnd?: string;
}

const plans = [
  { name: 'Starter', price: '€29', desc: 'For small restaurants getting started.', features: ['AI Chat & WhatsApp', 'Host dashboard', 'Basic analytics', '50 reservations/mo', 'Email support'] },
  { name: 'Growth', price: '€99', desc: 'For growing restaurants that want more.', features: ['Everything in Starter', 'AI Voice agent', 'Advanced analytics', '150 reservations/mo', 'SMS notifications'], featured: true },
  { name: 'Scale', price: '€199', desc: 'For high-volume restaurants.', features: ['Everything in Growth', 'Unlimited reservations', 'Unlimited SMS', 'Priority support', 'Custom integrations'] },
];

const planTiers = ['starter', 'growth', 'scale'];

export default function SubscriptionManage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [managingSubscription, setManagingSubscription] = useState(false);

  useEffect(() => {
    const fetchSubscription = async () => {
      try {
        const customerId =
          searchParams.get('customer_id') ||
          localStorage.getItem('stripe_customer_id');

        if (!customerId) {
          setSubscription({ status: 'none', planName: 'No Plan', planPrice: 'N/A' });
          return;
        }

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
        setSubscription({ status: 'none', planName: 'No Plan', planPrice: 'N/A' });
      } finally {
        setLoading(false);
      }
    };

    fetchSubscription();
  }, [searchParams]);

  const handleManageSubscription = async () => {
    try {
      setManagingSubscription(true);

      const customerId = localStorage.getItem('stripe_customer_id');

      if (!customerId) {
        alert('No subscription found. Please subscribe first.');
        setManagingSubscription(false);
        return;
      }

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

  if (loading) {
    return <SkeletonSubscription />;
  }

  if (!subscription || subscription.status === 'none') {
    return (
      <div className="min-h-screen bg-[#FAFAF9] flex flex-col">
        <header className="flex justify-between items-center px-6 sm:px-10 py-4 border-b border-[#E7E5E4] bg-white">
          <div className="font-serif text-lg font-semibold text-[#1C1917]">
            seatable<span className="text-[#9F1239]">.</span>
          </div>
        </header>

        <div className="flex-1 flex items-center justify-center p-6">
          <div className="bg-white border border-[#E7E5E4] rounded-2xl p-12 max-w-md text-center">
            <div className="w-16 h-16 rounded-full bg-[#F5F5F4] flex items-center justify-center mx-auto mb-5">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#A8A29E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            </div>
            <h1 className="font-serif text-2xl font-medium text-[#1C1917] mb-2">No Active Subscription</h1>
            <p className="text-[15px] text-[#78716C] font-light mb-8">
              You don't have an active subscription yet. Choose a plan to get started!
            </p>
            <button
              onClick={() => navigate('/#pricing')}
              className="px-8 py-3.5 bg-[#9F1239] hover:bg-[#881337] text-white text-sm font-semibold rounded-full transition-colors"
            >
              View Pricing Plans
            </button>
          </div>
        </div>
      </div>
    );
  }

  const currentPlanName = subscription.planName.toLowerCase();
  const currentTierIndex = planTiers.indexOf(currentPlanName);

  return (
    <div className="min-h-screen bg-[#FAFAF9] flex flex-col">
      {/* Top Bar */}
      <header className="flex justify-between items-center px-6 sm:px-10 py-4 border-b border-[#E7E5E4] bg-white">
        <div className="font-serif text-lg font-semibold text-[#1C1917]">
          seatable<span className="text-[#9F1239]">.</span>
        </div>
        <button onClick={() => navigate('/host-dashboard/simple')} className="text-[13px] text-[#78716C] hover:text-[#57534E] flex items-center gap-1.5 transition-colors">
          &larr; Back to Dashboard
        </button>
      </header>

      <div className="flex-1 px-6 sm:px-16 py-12">
        <div className="max-w-[1100px] mx-auto">
          {/* Header */}
          <div className="mb-10">
            <h1 className="font-serif text-[32px] font-medium text-[#1C1917] tracking-tight mb-2">Subscription &amp; Billing</h1>
            <p className="text-[15px] text-[#78716C] font-light">Manage your plan, billing info, and usage.</p>
          </div>

          {/* Current Plan Card */}
          <div className="bg-white border border-[#E7E5E4] rounded-2xl px-8 py-7 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-12">
            <div>
              <div className="flex items-center gap-2.5 mb-1">
                <span className="text-xl font-bold text-[#1C1917]">{subscription.planName} Plan</span>
                <span className="text-xs font-semibold tracking-wide uppercase text-[#9F1239] bg-[rgba(159,18,57,0.08)] px-3.5 py-1.5 rounded-full">Current</span>
              </div>
              <div className="text-sm text-[#78716C]">{subscription.planPrice} &middot; Billed monthly</div>
            </div>
            <div className="flex items-center gap-5">
              <div>
                <span className={`text-xs font-semibold px-3 py-1.5 rounded-full ${
                  subscription.status === 'active' ? 'bg-[rgba(22,163,74,0.08)] text-[#16a34a]' :
                  subscription.status === 'trialing' ? 'bg-[rgba(14,165,233,0.08)] text-[#0ea5e9]' :
                  subscription.status === 'past_due' ? 'bg-[rgba(220,38,38,0.08)] text-[#dc2626]' :
                  'bg-[#F5F5F4] text-[#57534E]'
                }`}>
                  {subscription.status === 'trialing' ? 'Trial' : subscription.status.charAt(0).toUpperCase() + subscription.status.slice(1)}
                </span>
                {subscription.currentPeriodEnd && (
                  <div className="text-[13px] text-[#78716C] mt-1.5">
                    {subscription.cancelAtPeriodEnd ? 'Ends' : 'Next billing'}: {subscription.currentPeriodEnd}
                  </div>
                )}
                {subscription.status === 'trialing' && subscription.trialEnd && (
                  <div className="text-[13px] text-[#78716C] mt-1.5">Trial ends: {subscription.trialEnd}</div>
                )}
              </div>
              <button
                onClick={handleManageSubscription}
                disabled={managingSubscription}
                className="px-5 py-2.5 border border-[#E7E5E4] rounded-[10px] text-[13px] font-medium text-[#57534E] bg-white hover:border-[#A8A29E] transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {managingSubscription ? (
                  <><div className="w-3.5 h-3.5 border-2 border-[#57534E] border-t-transparent rounded-full animate-spin" />Opening...</>
                ) : 'Manage Billing'}
              </button>
            </div>
          </div>

          {subscription.cancelAtPeriodEnd && (
            <div className="bg-[rgba(220,38,38,0.04)] border border-[rgba(220,38,38,0.2)] rounded-2xl p-5 mb-12 -mt-8">
              <p className="text-sm text-[#dc2626] font-medium">Your subscription is set to cancel at the end of the current billing period.</p>
            </div>
          )}

          {/* Plan Comparison */}
          <div className="mb-9">
            <div className="text-xs font-semibold tracking-[2px] uppercase text-[#9F1239] mb-3">Plans</div>
            <h2 className="font-serif text-[28px] font-medium tracking-tight text-[#1C1917] mb-2">Choose the right plan</h2>
            <p className="text-[15px] text-[#78716C] font-light">No hidden fees. Cancel anytime.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-[2px] bg-[#E7E5E4] rounded-[20px] overflow-hidden">
            {plans.map((p) => {
              const isCurrent = currentPlanName === p.name.toLowerCase();
              const isFeatured = !!p.featured;
              const tierIndex = planTiers.indexOf(p.name.toLowerCase());
              const buttonLabel = isCurrent ? 'Current Plan' : tierIndex > currentTierIndex ? 'Upgrade' : 'Downgrade';

              return (
                <div key={p.name} className={`relative px-8 py-10 ${isFeatured ? 'bg-[#1C1917]' : 'bg-[#FAFAF9]'}`}>
                  {isCurrent && (
                    <span className={`absolute top-4 right-4 text-xs font-semibold px-3 py-1 rounded-full ${isFeatured ? 'bg-[rgba(159,18,57,0.3)] text-white' : 'bg-[rgba(159,18,57,0.08)] text-[#9F1239]'}`}>
                      Current Plan
                    </span>
                  )}
                  <div className={`text-xs font-semibold tracking-[1.5px] uppercase mb-2 ${isFeatured ? 'text-[#9F1239]' : 'text-[#78716C]'}`}>{p.name}</div>
                  <div className={`font-serif text-[48px] font-medium tracking-tight leading-none mb-1 ${isFeatured ? 'text-white' : 'text-[#1C1917]'}`}>
                    {p.price}<span className="text-lg font-normal text-[#A8A29E]">/mo</span>
                  </div>
                  <p className={`text-sm font-light mb-7 ${isFeatured ? 'text-[#A8A29E]' : 'text-[#78716C]'}`}>{p.desc}</p>
                  <ul className="mb-8">
                    {p.features.map((f, i) => (
                      <li key={i} className={`text-sm py-2.5 border-b flex items-center gap-2.5 ${isFeatured ? 'text-[#D6D3D1] border-[#292524]' : 'text-[#1C1917] border-[#E7E5E4]'}`}>
                        <span className="w-[5px] h-[5px] rounded-full bg-[#9F1239] flex-shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={isCurrent ? undefined : handleManageSubscription}
                    disabled={isCurrent || managingSubscription}
                    className={`w-full py-3.5 rounded-full text-sm font-semibold transition-colors ${
                      isFeatured && !isCurrent ? 'bg-[#9F1239] text-white hover:bg-[#881337]' :
                      isCurrent ? 'border border-[#D6D3D1] text-[#A8A29E] cursor-default' :
                      'border border-[#D6D3D1] text-[#1C1917] hover:border-[#A8A29E]'
                    }`}
                  >
                    {buttonLabel}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Help */}
          <p className="text-center text-sm text-[#A8A29E] mt-10">
            Need help?{' '}
            <a href="mailto:hello@seatable.io" className="text-[#9F1239] hover:text-[#881337] transition-colors">Contact our support team</a>
          </p>
        </div>
      </div>
    </div>
  );
}

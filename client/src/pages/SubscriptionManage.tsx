import ThiingsIcon from '../components/common/ThiingsIcon';
import { usePermission } from '../hooks/usePermission';
import { useNavigate } from 'react-router-dom';
import { SkeletonSubscription } from '../components/common/Skeleton';
import { useToast } from '../contexts/ToastContext';
import { useSubscriptionData, useCustomerPortal } from '../hooks/useSubscriptionManage';

const plans = [
  { name: 'Starter', price: '€29', desc: 'For small restaurants getting started.', features: ['AI Chat & WhatsApp', 'Host dashboard', 'Basic analytics', '50 reservations/mo', 'Email support'] },
  { name: 'Growth', price: '€99', desc: 'For growing restaurants that want more.', features: ['Everything in Starter', 'AI Voice agent', 'Advanced analytics', '150 reservations/mo', 'SMS notifications'], featured: true },
  { name: 'Scale', price: '€199', desc: 'For high-volume restaurants.', features: ['Everything in Growth', 'Unlimited reservations', 'Unlimited SMS', 'Priority support', 'Custom integrations'] },
];

const planTiers = ['starter', 'growth', 'scale'];

export default function SubscriptionManage() {
  const { can } = usePermission();
  const navigate = useNavigate();
  const { error } = useToast();

  const { data: subscription, isLoading } = useSubscriptionData();
  const portal = useCustomerPortal();

  const handleManageSubscription = () => {
    portal.mutate(undefined, {
      onSuccess: ({ url }) => { window.location.href = url; },
      onError: (err) => error(err.message || 'Failed to open subscription management. Please try again.'),
    });
  };

  if (!can('manageSubscription')) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <p className="text-stone-gray text-sm">Only the restaurant owner can manage the subscription.</p>
      </div>
    );
  }

  if (isLoading) {
    return <SkeletonSubscription />;
  }

  if (!subscription || subscription.status === 'none') {
    return (
      <div className="min-h-screen bg-warm-white flex flex-col">
        <header className="flex justify-between items-center px-6 sm:px-10 py-4 border-b border-border-gray bg-white">
          <div className="font-serif text-lg font-semibold text-deep-charcoal">
            seatable<span className="text-burgundy">.</span>
          </div>
        </header>

        <div className="flex-1 flex items-center justify-center p-6">
          <div className="bg-white border border-border-gray rounded-2xl p-12 max-w-md text-center">
            <div className="w-16 h-16 rounded-full bg-soft-gray flex items-center justify-center mx-auto mb-5" aria-hidden="true">
              <ThiingsIcon name="close" pxSize={28} className="text-muted-stone" />
            </div>
            <h1 className="font-serif text-2xl font-medium text-deep-charcoal mb-2">No Active Subscription</h1>
            <p className="text-[15px] text-warm-stone font-light mb-8">
              You don't have an active subscription yet. Choose a plan to get started!
            </p>
            <button
              onClick={() => navigate('/#pricing')}
              className="px-8 py-3.5 bg-burgundy hover:bg-burgundy-dark text-white text-sm font-semibold rounded-full transition-colors"
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
    <div className="min-h-screen bg-warm-white flex flex-col">
      {/* Top Bar */}
      <header className="flex justify-between items-center px-6 sm:px-10 py-4 border-b border-border-gray bg-white">
        <div className="font-serif text-lg font-semibold text-deep-charcoal">
          seatable<span className="text-burgundy">.</span>
        </div>
        <button type="button" onClick={() => navigate('/host-dashboard/simple')} className="text-[13px] text-warm-stone hover:text-stone-gray flex items-center gap-1.5 transition-colors">
          &larr; Back to Dashboard
        </button>
      </header>

      <div className="flex-1 px-6 sm:px-16 py-12">
        <div className="max-w-[1100px] mx-auto">
          {/* Header */}
          <div className="mb-10">
            <h1 className="font-serif text-[32px] font-medium text-deep-charcoal tracking-tight mb-2">Subscription &amp; Billing</h1>
            <p className="text-[15px] text-warm-stone font-light">Manage your plan, billing info, and usage.</p>
          </div>

          {/* Current Plan Card */}
          <div className="bg-white border border-border-gray rounded-2xl px-8 py-7 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-12">
            <div>
              <div className="flex items-center gap-2.5 mb-1">
                <span className="text-xl font-bold text-deep-charcoal">{subscription.planName} Plan</span>
                <span className="text-xs font-semibold tracking-wide uppercase text-burgundy bg-burgundy/[8%] px-3.5 py-1.5 rounded-full">Current</span>
              </div>
              <div className="text-sm text-warm-stone">{subscription.planPrice} &middot; Billed monthly</div>
            </div>
            <div className="flex items-center gap-5">
              <div>
                <span className={`text-xs font-semibold px-3 py-1.5 rounded-full ${
                  subscription.status === 'active' ? 'bg-green-600/[8%] text-green-600' :
                  subscription.status === 'trialing' ? 'bg-sky-500/[8%] text-sky-500' :
                  subscription.status === 'past_due' ? 'bg-red-600/[8%] text-red-600' :
                  'bg-soft-gray text-stone-gray'
                }`}>
                  {subscription.status === 'trialing' ? 'Trial' : subscription.status.charAt(0).toUpperCase() + subscription.status.slice(1)}
                </span>
                {subscription.currentPeriodEnd && (
                  <div className="text-[13px] text-warm-stone mt-1.5">
                    {subscription.cancelAtPeriodEnd ? 'Ends' : 'Next billing'}: {subscription.currentPeriodEnd}
                  </div>
                )}
                {subscription.status === 'trialing' && subscription.trialEnd && (
                  <div className="text-[13px] text-warm-stone mt-1.5">Trial ends: {subscription.trialEnd}</div>
                )}
              </div>
              <button
                onClick={handleManageSubscription}
                disabled={portal.isPending}
                className="px-5 py-2.5 border border-border-gray rounded-xl text-[13px] font-medium text-stone-gray bg-white hover:border-muted-stone transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {portal.isPending ? (
                  <><div aria-hidden="true" className="w-3.5 h-3.5 border-2 border-stone-gray border-t-transparent rounded-full animate-spin" />Opening...</>
                ) : 'Manage Billing'}
              </button>
            </div>
          </div>

          {subscription.cancelAtPeriodEnd && (
            <div className="bg-red-600/[4%] border border-red-600/20 rounded-2xl p-5 mb-12 -mt-8">
              <p className="text-sm text-red-600 font-medium">Your subscription is set to cancel at the end of the current billing period.</p>
            </div>
          )}

          {/* Plan Comparison */}
          <div className="mb-9">
            <div className="text-xs font-semibold tracking-[2px] uppercase text-burgundy mb-3">Plans</div>
            <h2 className="font-serif text-[28px] font-medium tracking-tight text-deep-charcoal mb-2">Choose the right plan</h2>
            <p className="text-[15px] text-warm-stone font-light">No hidden fees. Cancel anytime.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-[2px] bg-border-gray rounded-[20px] overflow-hidden">
            {plans.map((p) => {
              const isCurrent = currentPlanName === p.name.toLowerCase();
              const isFeatured = !!p.featured;
              const tierIndex = planTiers.indexOf(p.name.toLowerCase());
              const buttonLabel = isCurrent ? 'Current Plan' : tierIndex > currentTierIndex ? 'Upgrade' : 'Downgrade';

              return (
                <div key={p.name} className={`relative px-8 py-10 ${isFeatured ? 'bg-deep-charcoal' : 'bg-warm-white'}`}>
                  {isCurrent && (
                    <span className={`absolute top-4 right-4 text-xs font-semibold px-3 py-1 rounded-full ${isFeatured ? 'bg-burgundy/30 text-white' : 'bg-burgundy/[8%] text-burgundy'}`}>
                      Current Plan
                    </span>
                  )}
                  <div className={`text-xs font-semibold tracking-[1.5px] uppercase mb-2 ${isFeatured ? 'text-burgundy' : 'text-warm-stone'}`}>{p.name}</div>
                  <div className={`font-serif text-[48px] font-medium tracking-tight leading-none mb-1 ${isFeatured ? 'text-white' : 'text-deep-charcoal'}`}>
                    {p.price}<span className="text-lg font-normal text-muted-stone">/mo</span>
                  </div>
                  <p className={`text-sm font-light mb-7 ${isFeatured ? 'text-muted-stone' : 'text-warm-stone'}`}>{p.desc}</p>
                  <ul className="mb-8">
                    {p.features.map((f, i) => (
                      <li key={i} className={`text-sm py-2.5 border-b flex items-center gap-2.5 ${isFeatured ? 'text-stone-300 border-charcoal-dark' : 'text-deep-charcoal border-border-gray'}`}>
                        <span className="w-[5px] h-[5px] rounded-full bg-burgundy flex-shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={isCurrent ? undefined : handleManageSubscription}
                    disabled={isCurrent || portal.isPending}
                    className={`w-full py-3.5 rounded-full text-sm font-semibold transition-colors ${
                      isFeatured && !isCurrent ? 'bg-burgundy text-white hover:bg-burgundy-dark' :
                      isCurrent ? 'border border-border-gray text-muted-stone cursor-default' :
                      'border border-border-gray text-deep-charcoal hover:border-muted-stone'
                    }`}
                  >
                    {buttonLabel}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Help */}
          <p className="text-center text-sm text-muted-stone mt-10">
            Need help?{' '}
            <a href="mailto:hello@seatable.io" className="text-burgundy hover:text-burgundy-dark transition-colors">Contact our support team</a>
          </p>
        </div>
      </div>
    </div>
  );
}

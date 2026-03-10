import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../components/common/ThiingsIcon';
import { usePermission } from '../hooks/usePermission';
import { useNavigate } from 'react-router-dom';
import { SkeletonSubscription } from '../components/common/Skeleton';
import { useToast } from '../contexts/ToastContext';
import { useSubscriptionData, useCustomerPortal } from '../hooks/useSubscriptionManage';

const planTiers = ['starter', 'growth', 'scale'];

export default function SubscriptionManage() {
  const { t } = useTranslation();
  const { can } = usePermission();
  const navigate = useNavigate();
  const { error } = useToast();

  const plans = [
    { key: 'starter', name: t('subscription.starterName'), price: t('subscription.starterPrice'), desc: t('subscription.starterDesc'), features: [t('subscription.starterF1'), t('subscription.starterF2'), t('subscription.starterF3'), t('subscription.starterF4'), t('subscription.starterF5')] },
    { key: 'growth', name: t('subscription.growthName'), price: t('subscription.growthPrice'), desc: t('subscription.growthDesc'), features: [t('subscription.growthF1'), t('subscription.growthF2'), t('subscription.growthF3'), t('subscription.growthF4'), t('subscription.growthF5')], featured: true },
    { key: 'scale', name: t('subscription.scaleName'), price: t('subscription.scalePrice'), desc: t('subscription.scaleDesc'), features: [t('subscription.scaleF1'), t('subscription.scaleF2'), t('subscription.scaleF3'), t('subscription.scaleF4'), t('subscription.scaleF5')] },
  ];

  const { data: subscription, isLoading } = useSubscriptionData();
  const portal = useCustomerPortal();

  const handleManageSubscription = () => {
    portal.mutate(undefined, {
      onSuccess: ({ url }) => { window.location.href = url; },
      onError: (err) => error(err.message || t('subscription.failedToOpen')),
    });
  };

  if (!can('manageSubscription')) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <p className="text-stone-gray text-sm">{t('subscription.ownerOnly')}</p>
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
            <h1 className="font-serif text-2xl font-medium text-deep-charcoal mb-2">{t('subscription.noActiveSubscription')}</h1>
            <p className="text-[15px] text-warm-stone font-light mb-8">
              {t('subscription.noActiveSubscriptionDesc')}
            </p>
            <button
              onClick={() => navigate('/#pricing')}
              className="px-8 py-3.5 bg-burgundy hover:bg-burgundy-dark text-white text-sm font-semibold rounded-full transition-colors"
            >
              {t('subscription.viewPricingPlans')}
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
          &larr; {t('subscription.backToDashboard')}
        </button>
      </header>

      <div className="flex-1 px-6 sm:px-16 py-12">
        <div className="max-w-[1100px] mx-auto">
          {/* Header */}
          <div className="mb-10">
            <h1 className="font-serif text-[32px] font-medium text-deep-charcoal tracking-tight mb-2">{t('subscription.title')}</h1>
            <p className="text-[15px] text-warm-stone font-light">{t('subscription.manageSubtitle')}</p>
          </div>

          {/* Current Plan Card */}
          <div className="bg-white border border-border-gray rounded-2xl px-8 py-7 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-12">
            <div>
              <div className="flex items-center gap-2.5 mb-1">
                <span className="text-xl font-bold text-deep-charcoal">{t('subscription.plan', { name: subscription.planName })}</span>
                <span className="text-xs font-semibold tracking-wide uppercase text-burgundy bg-burgundy/[8%] px-3.5 py-1.5 rounded-full">{t('subscription.current')}</span>
              </div>
              <div className="text-sm text-warm-stone">{subscription.planPrice} &middot; {t('subscription.billedMonthly')}</div>
            </div>
            <div className="flex items-center gap-5">
              <div>
                <span className={`text-xs font-semibold px-3 py-1.5 rounded-full ${
                  subscription.status === 'active' ? 'bg-green-600/[8%] text-green-600' :
                  subscription.status === 'trialing' ? 'bg-sky-500/[8%] text-sky-500' :
                  subscription.status === 'past_due' ? 'bg-red-600/[8%] text-red-600' :
                  'bg-soft-gray text-stone-gray'
                }`}>
                  {subscription.status === 'trialing' ? t('subscription.trial') : subscription.status.charAt(0).toUpperCase() + subscription.status.slice(1)}
                </span>
                {subscription.currentPeriodEnd && (
                  <div className="text-[13px] text-warm-stone mt-1.5">
                    {subscription.cancelAtPeriodEnd ? t('subscription.ends') : t('subscription.nextBilling')}: {subscription.currentPeriodEnd}
                  </div>
                )}
                {subscription.status === 'trialing' && subscription.trialEnd && (
                  <div className="text-[13px] text-warm-stone mt-1.5">{t('subscription.trialEnds')}: {subscription.trialEnd}</div>
                )}
              </div>
              <button
                onClick={handleManageSubscription}
                disabled={portal.isPending}
                className="px-5 py-2.5 border border-border-gray rounded-xl text-[13px] font-medium text-stone-gray bg-white hover:border-muted-stone transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {portal.isPending ? (
                  <><div aria-hidden="true" className="w-3.5 h-3.5 border-2 border-stone-gray border-t-transparent rounded-full animate-spin" />{t('subscription.opening')}</>
                ) : t('subscription.manageBilling')}
              </button>
            </div>
          </div>

          {subscription.cancelAtPeriodEnd && (
            <div className="bg-red-600/[4%] border border-red-600/20 rounded-2xl p-5 mb-12 -mt-8">
              <p className="text-sm text-red-600 font-medium">{t('subscription.cancelNotice')}</p>
            </div>
          )}

          {/* Plan Comparison */}
          <div className="mb-9">
            <div className="text-xs font-semibold tracking-[2px] uppercase text-burgundy mb-3">{t('subscription.plans')}</div>
            <h2 className="font-serif text-[28px] font-medium tracking-tight text-deep-charcoal mb-2">{t('subscription.chooseRightPlan')}</h2>
            <p className="text-[15px] text-warm-stone font-light">{t('subscription.noHiddenFees')}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-[2px] bg-border-gray rounded-[20px] overflow-hidden">
            {plans.map((p) => {
              const isCurrent = currentPlanName === p.key;
              const isFeatured = !!p.featured;
              const tierIndex = planTiers.indexOf(p.key);
              const buttonLabel = isCurrent ? t('subscription.currentPlan') : tierIndex > currentTierIndex ? t('subscription.upgrade') : t('subscription.downgrade');

              return (
                <div key={p.key} className={`relative px-8 py-10 ${isFeatured ? 'bg-deep-charcoal' : 'bg-warm-white'}`}>
                  {isCurrent && (
                    <span className={`absolute top-4 right-4 text-xs font-semibold px-3 py-1 rounded-full ${isFeatured ? 'bg-burgundy/30 text-white' : 'bg-burgundy/[8%] text-burgundy'}`}>
                      {t('subscription.currentPlan')}
                    </span>
                  )}
                  <div className={`text-xs font-semibold tracking-[1.5px] uppercase mb-2 ${isFeatured ? 'text-burgundy' : 'text-warm-stone'}`}>{p.name}</div>
                  <div className={`font-serif text-[48px] font-medium tracking-tight leading-none mb-1 ${isFeatured ? 'text-white' : 'text-deep-charcoal'}`}>
                    {p.price}<span className="text-lg font-normal text-muted-stone">{t('subscription.perMonth')}</span>
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
            {t('subscription.needHelp')}{' '}
            <a href="mailto:hello@seatable.one" className="text-burgundy hover:text-burgundy-dark transition-colors">{t('subscription.contactSupport')}</a>
          </p>
        </div>
      </div>
    </div>
  );
}

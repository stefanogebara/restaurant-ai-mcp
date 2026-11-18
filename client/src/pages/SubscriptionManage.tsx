import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../components/common/ThiingsIcon';
import { usePermission } from '../hooks/usePermission';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { SkeletonSubscription } from '../components/common/Skeleton';
import { useToast } from '../contexts/ToastContext';
import { useSubscriptionData, useCustomerPortal } from '../hooks/useSubscriptionManage';
import { currencyFromLanguage, formatPriceLocale, type SupportedCurrency } from '../utils/currency';
import { getPlanPrices } from '../config/planFeatures';
import { authFetch } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import {
  BILLING_PLANS, hasRecentVerifiedCheckout, parseBillingPlan, readBillingPlan, rememberBillingPlan, type BillingPlan,
} from '../lib/billingHandoff';

const planTiers = Object.keys(BILLING_PLANS);

function isSafeCheckoutUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  try {
    return new URL(url).origin === 'https://checkout.stripe.com';
  } catch {
    return false;
  }
}

/** Map any plan name variant to the canonical English tier key */
function planNameToTierKey(raw: string): string {
  const mapping: Record<string, string> = {
    starter: 'starter',
    inicial: 'starter',
    basic: 'starter',
    professional: 'growth',
    growth: 'growth',
    crescimento: 'growth',
    pro: 'scale',
    scale: 'scale',
    enterprise: 'scale',
    escala: 'scale',
  };
  return mapping[raw.toLowerCase()] ?? raw.toLowerCase();
}

export default function SubscriptionManage() {
  const { t, i18n } = useTranslation();
  const { can } = usePermission();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { error } = useToast();
  const { data: subscription, isLoading, isError, refetch: refetchSubscription } = useSubscriptionData();
  const portal = useCustomerPortal();
  const [loadingCheckoutPlan, setLoadingCheckoutPlan] = useState<BillingPlan | null>(null);
  const checkoutInFlight = useRef(false);
  const planFromUrl = parseBillingPlan(searchParams.get('plan'));
  const selectedPlan = planFromUrl ?? (user ? readBillingPlan(user.id) : null);

  // Derive currency from the active subscription's billing currency (so BRL subs show BRL prices,
  // EUR subs show EUR prices), falling back to i18n language detection for unauthenticated views.
  const currency: SupportedCurrency =
    (subscription?.currency as SupportedCurrency | undefined) ?? currencyFromLanguage(i18n.language);
  const prices = getPlanPrices(currency);

  const plans = [
    { key: 'starter' as const, name: t('subscription.starterName'), price: formatPriceLocale(prices.starter, currency), desc: t('subscription.starterDesc'), features: [t('subscription.starterF1'), t('subscription.starterF2'), t('subscription.starterF3'), t('subscription.starterF4'), t('subscription.starterF5')] },
    { key: 'growth' as const, name: t('subscription.growthName'), price: formatPriceLocale(prices.growth, currency), desc: t('subscription.growthDesc'), features: [t('subscription.growthF1'), t('subscription.growthF2'), t('subscription.growthF3'), t('subscription.growthF4'), t('subscription.growthF5')], featured: true },
    { key: 'scale' as const, name: t('subscription.scaleName'), price: formatPriceLocale(prices.scale, currency), desc: t('subscription.scaleDesc'), features: [t('subscription.scaleF1'), t('subscription.scaleF2'), t('subscription.scaleF3'), t('subscription.scaleF4'), t('subscription.scaleF5')] },
  ];

  const handleManageSubscription = () => {
    portal.mutate(undefined, {
      onSuccess: ({ url }) => { window.location.href = url; },
      onError: () => {
        // For any portal failure (no subscription, portal not configured, etc.)
        // redirect to pricing so the user can pick/re-subscribe
        error(t('subscription.portalError', 'Could not open the billing portal. Redirecting to plans...'));
        navigate('/subscription/manage#pricing');
      },
    });
  };

  const handleCheckout = async (plan: BillingPlan, betaCode?: string | null) => {
    if (checkoutInFlight.current) return;
    checkoutInFlight.current = true;
    setLoadingCheckoutPlan(plan);
    try {
      const apiUrl = import.meta.env.VITE_API_URL
        ? `${import.meta.env.VITE_API_URL}/api/create-checkout-session`
        : '/api/create-checkout-session';
      const response = await authFetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planName: BILLING_PLANS[plan], ...(betaCode ? { betaCode } : {}) }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !isSafeCheckoutUrl(body?.url)) {
        throw new Error(typeof body?.error === 'string' ? body.error : t('subscription.checkoutFailed'));
      }
      if (user) rememberBillingPlan(user.id, plan);
      window.location.assign(body.url);
    } catch (err: unknown) {
      error(err instanceof Error ? err.message : t('subscription.genericError'));
      checkoutInFlight.current = false;
      setLoadingCheckoutPlan(null);
    }
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

  if (isError) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p role="alert" className="text-sm text-deep-charcoal">{t('subscription.lookupFailed')}</p>
        <button type="button" onClick={() => void refetchSubscription()}
          className="text-sm font-semibold text-burgundy underline underline-offset-2">
          {t('welcome.lookupRetry')}
        </button>
      </div>
    );
  }

  const hasNoRealPlan = !subscription || subscription.status === 'none' || subscription.planName === 'Free';
  if (user && subscription?.hasBillingPortal !== true && hasRecentVerifiedCheckout(user.id)) {
    return <PendingActivation onRefetch={refetchSubscription} />;
  }
  if (hasNoRealPlan) {
    return <NoPlanPricing selectedPlan={selectedPlan} loadingPlan={loadingCheckoutPlan} onCheckout={handleCheckout} />;
  }

  const currentTierKey = planNameToTierKey(subscription.planName);
  const displayPlanName = plans.find(plan => plan.key === currentTierKey)?.name ?? subscription.planName;
  const currentTierIndex = planTiers.indexOf(currentTierKey);
  // Use locale-aware price from plan cards instead of raw Stripe price
  const currentPlanPrice = plans.find(p => p.key === (planTiers[currentTierIndex] ?? ''))?.price;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top Bar */}
      <header className="flex justify-between items-center px-6 sm:px-10 py-4 border-b border-glass-border-dark bg-glass-panel backdrop-blur-glass-nav">
        <div className="font-serif text-lg text-deep-charcoal">
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

          {(subscription.hasBillingPortal === false || subscription.status === 'canceled') && selectedPlan && (
            <SelectedCheckout plan={selectedPlan} busy={Boolean(loadingCheckoutPlan)} onCheckout={() => handleCheckout(selectedPlan)} />
          )}

          {/* Current Plan */}
          {/* Audit found double-labeling: the "ATUAL" pill here AND the
              "Plano Atual" badge on the matching tier card below repeated
              the same signal twice. Dropped the inline pill; the in-card
              badge already anchors which plan is current spatially. */}
          <div className="border-b border-[#E7E5E4] px-0 py-7 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-12">
            <div>
              <div className="flex items-center gap-2.5 mb-1">
                <span className="text-xl font-bold text-deep-charcoal">{t('subscription.plan', { name: displayPlanName })}</span>
              </div>
              <div className="text-sm text-warm-stone">{(currentPlanPrice ?? (subscription.planPrice ?? '').replace(/\/m[êe]s|\/mo$/i, '')).trim()}{t('subscription.perMonth')} &middot; {t('subscription.billedMonthly')}</div>
            </div>
            <div className="flex items-center gap-5">
              <div>
                <span className={`text-xs font-semibold px-3 py-1.5 rounded-full ${
                  subscription.status === 'active' ? 'bg-rose-600/[8%] text-rose-600' :
                  subscription.status === 'trialing' ? 'bg-stone-500/[8%] text-stone-500' :
                  subscription.status === 'past_due' ? 'bg-red-600/[8%] text-red-600' :
                  'bg-soft-gray text-stone-gray'
                }`}>
                  {subscription.status === 'trialing' ? t('subscription.trial') :
                   subscription.status === 'active' ? t('subscription.statusActive') :
                   subscription.status === 'past_due' ? t('subscription.statusPastDue') :
                   subscription.status === 'canceled' ? t('subscription.statusCanceled') :
                   String(subscription.status)}
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
              {subscription.hasBillingPortal !== false && (
                <button
                  onClick={handleManageSubscription}
                  disabled={portal.isPending}
                  className="px-5 py-2.5 border border-glass-border-dark rounded-xl text-[13px] font-medium text-stone-gray bg-white/60 hover:bg-white/85 hover:border-muted-stone transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {portal.isPending ? (
                    <><div aria-hidden="true" className="w-3.5 h-3.5 border-2 border-stone-gray border-t-transparent rounded-full animate-spin" />{t('subscription.opening')}</>
                  ) : t('subscription.manageBilling')}
                </button>
              )}
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

          <div className="glass-panel grid grid-cols-1 md:grid-cols-3 gap-px bg-glass-border-dark rounded-lg overflow-hidden">
            {plans.map((p) => {
              const isCurrent = currentTierKey === p.key;
              const isFeatured = !!p.featured;
              const tierIndex = planTiers.indexOf(p.key);
              const isCanceled = subscription.status === 'canceled';
              const buttonLabel = isCanceled
                ? t('subscription.resubscribe', 'Resubscribe')
                : isCurrent ? t('subscription.currentPlan') : tierIndex > currentTierIndex ? t('subscription.upgrade') : t('subscription.downgrade');

              return (
                <div key={p.key} className={`relative px-8 py-10 ${isFeatured ? 'bg-deep-charcoal' : 'bg-white/45 backdrop-blur-glass-card'}`}>
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
                    onClick={(isCurrent && !isCanceled) ? undefined : () => {
                      if (isCanceled || !subscription.hasBillingPortal) {
                        handleCheckout(p.key);
                      } else {
                        handleManageSubscription();
                      }
                    }}
                    disabled={(isCurrent && !isCanceled) || portal.isPending || Boolean(loadingCheckoutPlan)}
                    className={`w-full py-3.5 rounded-full text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${
                      (isCanceled || (isFeatured && !isCurrent)) ? 'bg-burgundy text-white hover:bg-burgundy-dark' :
                      (isCurrent && !isCanceled) ? 'border border-border-gray text-muted-stone cursor-default' :
                      'border border-border-gray text-deep-charcoal hover:border-muted-stone'
                    } ${(portal.isPending || loadingCheckoutPlan === p.key) && !(isCurrent && !isCanceled) ? 'opacity-60' : ''}`}
                  >
                    {(portal.isPending || loadingCheckoutPlan === p.key) && !(isCurrent && !isCanceled) && (
                      <div aria-hidden="true" className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    )}
                    {(portal.isPending || loadingCheckoutPlan === p.key) && !(isCurrent && !isCanceled) ? t('subscription.opening', 'Opening...') : buttonLabel}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Help */}
          <p className="text-center text-sm text-muted-stone mt-10">
            {t('subscription.needHelp')}{' '}
            <a href="mailto:hello@seatable.one" className="text-burgundy hover:text-burgundy-dark transition-colors">{t('subscription.contactSupportLink')}</a>
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Plan picker shown to users with no active subscription ─────────────────

function SelectedCheckout({ plan, busy, onCheckout }: { plan: BillingPlan; busy: boolean; onCheckout: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="hairline flex flex-wrap items-center justify-between gap-4 py-5 mb-6">
      <p className="text-deep-charcoal">{t('subscription.selectedPlan', { plan: t(`landing.pricing.${plan}.name`) })}</p>
      <button type="button" onClick={onCheckout} disabled={busy}
        className="min-h-11 rounded-full bg-burgundy px-6 py-2 text-sm font-semibold text-white hover:bg-burgundy-dark disabled:opacity-60">
        {busy ? t('subscription.loading') : t('subscription.continueCheckout')}
      </button>
    </div>
  );
}

function NoPlanPricing({ selectedPlan, loadingPlan, onCheckout }: {
  selectedPlan: BillingPlan | null;
  loadingPlan: BillingPlan | null;
  onCheckout: (plan: BillingPlan, betaCode: string | null) => void;
}) {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const betaFromUrl = searchParams.get('beta');
  const betaCode = betaFromUrl || (() => {
    try { return sessionStorage.getItem('seatable_beta_code'); }
    catch { return null; }
  })();

  useEffect(() => {
    if (betaFromUrl) {
      try { sessionStorage.setItem('seatable_beta_code', betaFromUrl); } catch { /* URL still carries the code */ }
    }
  }, [betaFromUrl]);

  const NO_PLAN_TIERS = [
    {
      key: 'starter' as const,
      name: t('subscription.starterName'),
      brl: 'R$497',
      desc: t('subscription.starterDesc'),
      features: [t('subscription.starterF1'), t('subscription.starterF2'), t('subscription.starterF3'), t('subscription.starterF4'), t('subscription.starterF5')],
      highlighted: false,
    },
    {
      key: 'growth' as const,
      name: t('subscription.growthName'),
      brl: 'R$1.497',
      desc: t('subscription.growthDesc'),
      features: [t('subscription.growthF1'), t('subscription.growthF2'), t('subscription.growthF3'), t('subscription.growthF4'), t('subscription.growthF5')],
      highlighted: true,
      trial: true,
    },
    {
      key: 'scale' as const,
      name: t('subscription.scaleName'),
      brl: 'R$2.997',
      desc: t('subscription.scaleDesc'),
      features: [t('subscription.scaleF1'), t('subscription.scaleF2'), t('subscription.scaleF3'), t('subscription.scaleF4'), t('subscription.scaleF5')],
      highlighted: false,
    },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex justify-between items-center px-6 sm:px-10 py-4 border-b border-glass-border-dark bg-glass-panel backdrop-blur-glass-nav">
        <div className="font-serif text-lg text-deep-charcoal">
          seatable<span className="text-burgundy">.</span>
        </div>
        <a href="/host-dashboard/simple" className="text-[13px] text-warm-stone hover:text-stone-gray transition-colors">
          {t('subscription.accessDashboard')}
        </a>
      </header>

      <div className="flex-1 px-6 sm:px-16 py-12">
        <div className="max-w-[1100px] mx-auto">
          {betaCode && (
            <div className="mb-10 bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 flex items-center gap-3">
              <ThiingsIcon name="party" pxSize={15} className="text-emerald-600 text-lg" />
              <div>
                <p className="text-sm font-semibold text-amber-900">{t('subscription.betaTitle')}</p>
                <p className="text-xs text-amber-700 mt-0.5">{t('subscription.betaDesc')}</p>
              </div>
            </div>
          )}

          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-burgundy/[6%] rounded-full mb-5">
              <span className="text-xs font-semibold tracking-[1.5px] uppercase text-burgundy">{t('subscription.plans')}</span>
            </div>
            <h1 className="font-serif text-[40px] font-medium tracking-tight text-deep-charcoal mb-3">
              {t('subscription.chooseRightPlan')}
            </h1>
            <p className="text-[17px] text-warm-stone font-light">
              {betaCode ? t('subscription.betaNoFees') : t('subscription.noHiddenFees')}
            </p>
          </div>

          {selectedPlan && (
            <SelectedCheckout plan={selectedPlan} busy={Boolean(loadingPlan)} onCheckout={() => onCheckout(selectedPlan, betaCode)} />
          )}

          <div className="glass-panel grid grid-cols-1 md:grid-cols-3 gap-px bg-glass-border-dark rounded-[20px] overflow-hidden">
            {NO_PLAN_TIERS.map((tier) => {
              const isLoading = loadingPlan === tier.key;
              return (
                <div key={tier.key} className={`relative px-8 py-12 ${tier.highlighted ? 'bg-deep-charcoal' : 'bg-white/45 backdrop-blur-glass-card'}`}>
                  {tier.trial && !betaCode && (
                    <div className="absolute top-0 inset-x-0 flex justify-center">
                      <span className="bg-burgundy text-white text-[11px] font-semibold tracking-wide uppercase px-4 py-1 rounded-b-lg">
                        {t('subscription.trialBadge')}
                      </span>
                    </div>
                  )}
                  <div className={`text-xs font-semibold tracking-[1.5px] uppercase mb-2 ${tier.highlighted ? 'text-burgundy' : 'text-warm-stone'}`}>
                    {tier.name}
                  </div>
                  <div className={`font-serif text-[42px] font-medium tracking-tight leading-none mb-1 ${tier.highlighted ? 'text-white' : 'text-deep-charcoal'}`}>
                    {tier.brl}<span className={`text-base font-normal ${tier.highlighted ? 'text-muted-stone' : 'text-warm-stone'}`}>{t('subscription.perMonth')}</span>
                  </div>
                  <p className={`text-sm font-light mb-7 mt-2 ${tier.highlighted ? 'text-muted-stone' : 'text-warm-stone'}`}>{tier.desc}</p>
                  <ul className="mb-8 space-y-0">
                    {tier.features.map((f) => (
                      <li key={f} className={`text-sm py-2.5 border-b flex items-center gap-2.5 ${tier.highlighted ? 'text-stone-300 border-white/10' : 'text-deep-charcoal border-border-gray'}`}>
                        <span className="w-[5px] h-[5px] rounded-full bg-burgundy flex-shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => onCheckout(tier.key, betaCode)}
                    disabled={!!loadingPlan}
                    className={`w-full py-3.5 rounded-full text-sm font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-60 ${
                      tier.highlighted
                        ? 'bg-burgundy text-white hover:bg-burgundy-dark'
                        : 'border border-glass-border-dark text-deep-charcoal hover:border-muted-stone bg-white/70'
                    }`}
                  >
                    {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                    {/* Consistent label across plans (audit BUG #15). The
                        "14 DAYS FREE" badge above the Professional card already
                        communicates the trial — we don't need to mix labels. */}
                    {isLoading ? t('subscription.loading') : t('subscription.start')}
                  </button>
                </div>
              );
            })}
          </div>

          <p className="text-center text-sm text-muted-stone mt-8">
            {t('subscription.needHelp')}{' '}
            <a href="mailto:hello@seatable.one" className="text-burgundy hover:text-burgundy-dark transition-colors">
              {t('subscription.faleConosco')}
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── "We're activating your subscription" shown right after Stripe success ──
// Polls the subscription endpoint every 4 seconds until the webhook lands and
// the real plan data shows up. Bounded by PENDING_ACTIVATION_WINDOW_MS via the
// marker check in the parent — once that window passes we fall through to
// NoPlanPricing on next render.

function PendingActivation({ onRefetch }: { onRefetch: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  useEffect(() => {
    const id = setInterval(() => onRefetch(), 4000);
    return () => clearInterval(id);
  }, [onRefetch]);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex justify-between items-center px-6 sm:px-10 py-4 border-b border-glass-border-dark bg-glass-panel backdrop-blur-glass-nav">
        <div className="font-serif text-lg text-deep-charcoal">
          seatable<span className="text-burgundy">.</span>
        </div>
      </header>
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-[480px] w-full glass-panel p-12 text-center">
          <Loader2 className="w-8 h-8 text-burgundy animate-spin mx-auto mb-5" />
          <h1 className="font-serif text-2xl font-medium text-deep-charcoal mb-2">
            {t('subscription.activatingTitle', 'Activating your subscription')}
          </h1>
          <p className="text-sm text-warm-stone font-light mb-6">
            {t('subscription.activationPending')}
          </p>
          <button
            type="button"
            onClick={() => navigate('/host-dashboard/simple')}
            className="px-7 py-3 border border-border-gray text-stone-gray text-sm font-medium rounded-full hover:border-muted-stone transition-colors"
          >
            {t('subscription.goToDashboard')}
          </button>
        </div>
      </div>
    </div>
  );
}

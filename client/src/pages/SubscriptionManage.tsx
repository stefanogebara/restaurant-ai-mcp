import { useTranslation } from 'react-i18next';
import { usePermission } from '../hooks/usePermission';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { SkeletonSubscription } from '../components/common/Skeleton';
import { useToast } from '../contexts/ToastContext';
import { useSubscriptionData, useCustomerPortal } from '../hooks/useSubscriptionManage';
import { currencyFromLanguage, formatPriceLocale, type SupportedCurrency } from '../utils/currency';
import { getPlanPrices } from '../config/planFeatures';
import { authFetch } from '../services/api';
import { LS_PAYMENT_VERIFIED_AT } from '../config/localStorageKeys';

/** Window during which we treat a fresh Stripe payment as "subscription pending
 *  activation" rather than "no subscription". Webhooks usually land within
 *  seconds; we give them 10 minutes before falling back to the upsell page. */
const PENDING_ACTIVATION_WINDOW_MS = 10 * 60 * 1000;

function readPendingActivationMarker(): boolean {
  const raw = localStorage.getItem(LS_PAYMENT_VERIFIED_AT);
  if (!raw) return false;
  const ts = Number(raw);
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts < PENDING_ACTIVATION_WINDOW_MS;
}

const planTiers = ['starter', 'growth', 'scale'];

// Open-redirect guard for /api/create-checkout-session responses. Stripe
// hosted checkout returns absolute https URLs on a known set of domains. Reject
// anything that doesn't match — a compromised backend or upstream bug returning
// an attacker-controlled URL would otherwise carry the user off seatable.one
// to a phishing page right when they're about to enter card details.
const ALLOWED_CHECKOUT_HOSTS = new Set(['checkout.stripe.com', 'billing.stripe.com']);
function isSafeCheckoutUrl(url: unknown): url is string {
  if (typeof url !== 'string' || !url) return false;
  // Allow same-origin relative paths too (some flows return /something).
  if (url.startsWith('/') && !url.startsWith('//')) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && ALLOWED_CHECKOUT_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

const PLAN_PRICE_IDS: Record<string, string> = {
  starter: import.meta.env.VITE_STRIPE_STARTER_PRICE_ID || '',
  growth: import.meta.env.VITE_STRIPE_GROWTH_PRICE_ID || '',
  scale: import.meta.env.VITE_STRIPE_SCALE_PRICE_ID || '',
};

const PLAN_NAMES: Record<string, string> = {
  starter: 'Starter',
  growth: 'Growth',
  scale: 'Scale',
};

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

/** Map legacy/orphaned plan names to current localized display names (Portuguese) */
function normalizePlanName(raw: string): string {
  const mapping: Record<string, string> = {
    starter: 'Inicial',
    professional: 'Crescimento',
    growth: 'Crescimento',
    pro: 'Escala',
    basic: 'Inicial',
    enterprise: 'Escala',
    scale: 'Escala',
  };
  return mapping[raw.toLowerCase()] ?? raw;
}

export default function SubscriptionManage() {
  const { t, i18n } = useTranslation();
  const { can } = usePermission();
  const navigate = useNavigate();
  const { error } = useToast();
  const { data: subscription, isLoading, refetch: refetchSubscription } = useSubscriptionData();
  const portal = useCustomerPortal();
  const [loadingCheckoutPlan, setLoadingCheckoutPlan] = useState<string | null>(null);

  // Derive currency from the active subscription's billing currency (so BRL subs show BRL prices,
  // EUR subs show EUR prices), falling back to i18n language detection for unauthenticated views.
  const currency: SupportedCurrency =
    (subscription?.currency as SupportedCurrency | undefined) ?? currencyFromLanguage(i18n.language);
  const prices = getPlanPrices(currency);

  const plans = [
    { key: 'starter', name: t('subscription.starterName'), price: formatPriceLocale(prices.starter, currency), desc: t('subscription.starterDesc'), features: [t('subscription.starterF1'), t('subscription.starterF2'), t('subscription.starterF3'), t('subscription.starterF4'), t('subscription.starterF5')] },
    { key: 'growth', name: t('subscription.growthName'), price: formatPriceLocale(prices.growth, currency), desc: t('subscription.growthDesc'), features: [t('subscription.growthF1'), t('subscription.growthF2'), t('subscription.growthF3'), t('subscription.growthF4'), t('subscription.growthF5')], featured: true },
    { key: 'scale', name: t('subscription.scaleName'), price: formatPriceLocale(prices.scale, currency), desc: t('subscription.scaleDesc'), features: [t('subscription.scaleF1'), t('subscription.scaleF2'), t('subscription.scaleF3'), t('subscription.scaleF4'), t('subscription.scaleF5')] },
  ];

  const handleManageSubscription = () => {
    portal.mutate(undefined, {
      onSuccess: ({ url }) => { window.location.href = url; },
      onError: (_err) => {
        // For any portal failure (no subscription, portal not configured, etc.)
        // redirect to pricing so the user can pick/re-subscribe
        error(t('subscription.portalError', 'Could not open the billing portal. Redirecting to plans...'));
        navigate('/subscription/manage#pricing');
      },
    });
  };

  const handleUpgradeCheckout = async (planKey: string) => {
    const priceId = PLAN_PRICE_IDS[planKey];
    const planName = PLAN_NAMES[planKey];
    if (!priceId) { error(t('subscription.priceNotConfigured', 'Price not configured. Please contact support.')); return; }
    try {
      setLoadingCheckoutPlan(planKey);
      const apiUrl = import.meta.env.VITE_API_URL
        ? `${import.meta.env.VITE_API_URL}/api/create-checkout-session`
        : '/api/create-checkout-session';
      const response = await authFetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId, planName }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || t('subscription.checkoutFailed', 'Failed to create checkout session'));
      }
      const { url } = await response.json();
      if (!isSafeCheckoutUrl(url)) {
        console.error('[SubscriptionManage] backend returned unsafe checkout URL', url);
        throw new Error(t('subscription.checkoutFailed', 'Failed to create checkout session'));
      }
      window.location.href = url;
    } catch (err: unknown) {
      error(err instanceof Error ? err.message : t('subscription.genericError', 'Something went wrong. Please try again.'));
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

  // Treat "Free" plan (seeded by onboarding, no real Stripe customer) as no subscription
  const hasNoRealPlan = !subscription || subscription.status === 'none' || subscription.planName === 'Free';
  if (hasNoRealPlan) {
    // If the user JUST paid (verify-session set LS_PAYMENT_VERIFIED_AT within the
    // last 10 min) but Stripe's customer.subscription.created webhook hasn't
    // landed in our DB yet, render an "activating" state with polling instead of
    // the upsell cards. Showing the upsell to someone whose card was just
    // charged looks like the payment failed.
    if (readPendingActivationMarker()) {
      return <PendingActivation onRefetch={() => refetchSubscription()} />;
    }
    return <NoPlanPricing />;
  }

  const displayPlanName = normalizePlanName(subscription.planName);
  const currentTierKey = planNameToTierKey(subscription.planName);
  const currentTierIndex = planTiers.indexOf(currentTierKey);
  // Use locale-aware price from plan cards instead of raw Stripe price
  const currentPlanPrice = plans.find(p => p.key === (planTiers[currentTierIndex] ?? ''))?.price;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top Bar */}
      <header className="flex justify-between items-center px-6 sm:px-10 py-4 border-b border-glass-border-dark bg-glass-panel backdrop-blur-glass-nav">
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

          {/* Current Plan */}
          <div className="border-b border-[#E5E7EB] px-0 py-7 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-12">
            <div>
              <div className="flex items-center gap-2.5 mb-1">
                <span className="text-xl font-bold text-deep-charcoal">{t('subscription.plan', { name: displayPlanName })}</span>
                <span className="text-xs font-semibold tracking-wide uppercase text-burgundy bg-burgundy/[8%] px-3.5 py-1.5 rounded-full">{t('subscription.current')}</span>
              </div>
              <div className="text-sm text-warm-stone">{(currentPlanPrice ?? (subscription.planPrice ?? '').replace(/\/m[êe]s|\/mo$/i, '')).trim()}{t('subscription.perMonth')} &middot; {t('subscription.billedMonthly')}</div>
            </div>
            <div className="flex items-center gap-5">
              <div>
                <span className={`text-xs font-semibold px-3 py-1.5 rounded-full ${
                  subscription.status === 'active' ? 'bg-rose-600/[8%] text-rose-600' :
                  subscription.status === 'trialing' ? 'bg-sky-500/[8%] text-sky-500' :
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
                      // If no billing portal (DB override plan), route plan changes through Stripe checkout
                      if (!subscription.hasBillingPortal) {
                        handleUpgradeCheckout(p.key);
                      } else {
                        handleManageSubscription();
                      }
                    }}
                    disabled={(isCurrent && !isCanceled) || portal.isPending || loadingCheckoutPlan === p.key}
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

function NoPlanPricing() {
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const { error } = useToast();
  const { t } = useTranslation();

  const NO_PLAN_TIERS = [
    {
      key: 'starter',
      name: t('subscription.starterName'),
      priceId: import.meta.env.VITE_STRIPE_STARTER_PRICE_ID || '',
      brl: 'R$497',
      desc: t('subscription.starterDesc'),
      features: [t('subscription.starterF1'), t('subscription.starterF2'), t('subscription.starterF3'), t('subscription.starterF4'), t('subscription.starterF5')],
      highlighted: false,
      planName: 'Starter',
    },
    {
      key: 'growth',
      name: t('subscription.growthName'),
      priceId: import.meta.env.VITE_STRIPE_GROWTH_PRICE_ID || '',
      brl: 'R$1.497',
      desc: t('subscription.growthDesc'),
      features: [t('subscription.growthF1'), t('subscription.growthF2'), t('subscription.growthF3'), t('subscription.growthF4'), t('subscription.growthF5')],
      highlighted: true,
      planName: 'Growth',
      trial: true,
    },
    {
      key: 'scale',
      name: t('subscription.scaleName'),
      priceId: import.meta.env.VITE_STRIPE_SCALE_PRICE_ID || '',
      brl: 'R$2.997',
      desc: t('subscription.scaleDesc'),
      features: [t('subscription.scaleF1'), t('subscription.scaleF2'), t('subscription.scaleF3'), t('subscription.scaleF4'), t('subscription.scaleF5')],
      highlighted: false,
      planName: 'Scale',
    },
  ];

  // Beta access: read ?beta=CODE from URL and persist in sessionStorage
  const betaCode = (() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('beta');
    if (fromUrl) { sessionStorage.setItem('seatable_beta_code', fromUrl); return fromUrl; }
    return sessionStorage.getItem('seatable_beta_code') || null;
  })();

  const handleCheckout = async (priceId: string, planName: string) => {
    if (!priceId) { error(t('subscription.priceNotConfigured', 'Price not configured. Please contact support.')); return; }
    try {
      setLoadingPlan(planName);
      const apiUrl = import.meta.env.VITE_API_URL
        ? `${import.meta.env.VITE_API_URL}/api/create-checkout-session`
        : '/api/create-checkout-session';
      const response = await authFetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId, planName, ...(betaCode ? { betaCode } : {}) }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || t('subscription.checkoutFailed', 'Failed to create checkout session'));
      }
      const { url } = await response.json();
      if (!isSafeCheckoutUrl(url)) {
        console.error('[SubscriptionManage] backend returned unsafe checkout URL', url);
        throw new Error(t('subscription.checkoutFailed', 'Failed to create checkout session'));
      }
      window.location.href = url;
    } catch (err: unknown) {
      error(err instanceof Error ? err.message : t('subscription.genericError', 'Something went wrong. Please try again.'));
      setLoadingPlan(null);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex justify-between items-center px-6 sm:px-10 py-4 border-b border-glass-border-dark bg-glass-panel backdrop-blur-glass-nav">
        <div className="font-serif text-lg font-semibold text-deep-charcoal">
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
              <span className="text-lg">🎉</span>
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

          <div className="glass-panel grid grid-cols-1 md:grid-cols-3 gap-px bg-glass-border-dark rounded-[20px] overflow-hidden">
            {NO_PLAN_TIERS.map((tier) => {
              const isLoading = loadingPlan === tier.planName;
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
                    onClick={() => handleCheckout(tier.priceId, tier.planName)}
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
        <div className="font-serif text-lg font-semibold text-deep-charcoal">
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
            {t('subscription.activatingDesc', "Payment received. We're finalising your plan — this usually takes 30 seconds. You can stay on this page or head to your dashboard.")}
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

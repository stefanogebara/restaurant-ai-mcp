import { useTranslation } from 'react-i18next';
import { usePermission } from '../hooks/usePermission';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { SkeletonSubscription } from '../components/common/Skeleton';
import { useToast } from '../contexts/ToastContext';
import { useSubscriptionData, useCustomerPortal } from '../hooks/useSubscriptionManage';
import { currencyFromLanguage, formatPriceLocale } from '../utils/currency';
import { getPlanPrices } from '../config/planFeatures';
import { authFetch } from '../services/api';

const planTiers = ['starter', 'growth', 'scale'];

/** Map legacy/orphaned plan names to current plan names (Portuguese) */
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
  const currency = currencyFromLanguage(i18n.language);
  const prices = getPlanPrices(currency);

  const perMonth = t('subscription.perMonth');

  const plans = [
    { key: 'starter', name: t('subscription.starterName'), price: formatPriceLocale(prices.starter, currency) + perMonth, desc: t('subscription.starterDesc'), features: [t('subscription.starterF1'), t('subscription.starterF2'), t('subscription.starterF3'), t('subscription.starterF4'), t('subscription.starterF5')] },
    { key: 'growth', name: t('subscription.growthName'), price: formatPriceLocale(prices.growth, currency) + perMonth, desc: t('subscription.growthDesc'), features: [t('subscription.growthF1'), t('subscription.growthF2'), t('subscription.growthF3'), t('subscription.growthF4'), t('subscription.growthF5')], featured: true },
    { key: 'scale', name: t('subscription.scaleName'), price: formatPriceLocale(prices.scale, currency) + perMonth, desc: t('subscription.scaleDesc'), features: [t('subscription.scaleF1'), t('subscription.scaleF2'), t('subscription.scaleF3'), t('subscription.scaleF4'), t('subscription.scaleF5')] },
  ];

  const { data: subscription, isLoading } = useSubscriptionData();
  const portal = useCustomerPortal();

  const handleManageSubscription = () => {
    portal.mutate(undefined, {
      onSuccess: ({ url }) => { window.location.href = url; },
      onError: (err) => {
        const message = err.message || t('subscription.failedToOpen');
        // If no active subscription (e.g. canceled), redirect to pricing
        if (message.includes('No active subscription')) {
          error(message);
          navigate('/#pricing');
        } else {
          // Show a helpful contact-support message for portal failures
          error(t('subscription.portalError', 'Unable to open billing portal. Please contact support at hello@seatable.one'));
        }
      },
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
    return <NoPlanPricing />;
  }

  const displayPlanName = normalizePlanName(subscription.planName);
  const currentPlanName = displayPlanName.toLowerCase();
  const currentTierIndex = planTiers.indexOf(currentPlanName);
  // Use locale-aware price from plan cards instead of raw Stripe price
  const currentPlanPrice = plans.find(p => p.key === (planTiers[currentTierIndex] ?? ''))?.price;

  return (
    <div className="min-h-screen bg-white flex flex-col">
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

          {/* Current Plan */}
          <div className="border-b border-[#E5E7EB] px-0 py-7 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-12">
            <div>
              <div className="flex items-center gap-2.5 mb-1">
                <span className="text-xl font-bold text-deep-charcoal">{t('subscription.plan', { name: displayPlanName })}</span>
                <span className="text-xs font-semibold tracking-wide uppercase text-burgundy bg-burgundy/[8%] px-3.5 py-1.5 rounded-full">{t('subscription.current')}</span>
              </div>
              <div className="text-sm text-warm-stone">{currentPlanPrice ?? subscription.planPrice}{t('subscription.perMonth')} &middot; {t('subscription.billedMonthly')}</div>
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-px border border-[#E5E7EB] rounded-lg overflow-hidden">
            {plans.map((p) => {
              const isCurrent = currentPlanName === p.key;
              const isFeatured = !!p.featured;
              const tierIndex = planTiers.indexOf(p.key);
              const isCanceled = subscription.status === 'canceled';
              const buttonLabel = isCanceled
                ? t('subscription.resubscribe', 'Resubscribe')
                : isCurrent ? t('subscription.currentPlan') : tierIndex > currentTierIndex ? t('subscription.upgrade') : t('subscription.downgrade');

              return (
                <div key={p.key} className={`relative px-8 py-10 ${isFeatured ? 'bg-deep-charcoal' : 'bg-white'}`}>
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
                    onClick={(isCurrent && !isCanceled) ? undefined : handleManageSubscription}
                    disabled={(isCurrent && !isCanceled) || portal.isPending}
                    className={`w-full py-3.5 rounded-full text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${
                      (isCanceled || (isFeatured && !isCurrent)) ? 'bg-burgundy text-white hover:bg-burgundy-dark' :
                      (isCurrent && !isCanceled) ? 'border border-border-gray text-muted-stone cursor-default' :
                      'border border-border-gray text-deep-charcoal hover:border-muted-stone'
                    } ${portal.isPending && !(isCurrent && !isCanceled) ? 'opacity-60' : ''}`}
                  >
                    {portal.isPending && !(isCurrent && !isCanceled) && (
                      <div aria-hidden="true" className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    )}
                    {portal.isPending && !(isCurrent && !isCanceled) ? t('subscription.opening', 'Opening...') : buttonLabel}
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

// ─── Plan picker shown to users with no active subscription ─────────────────

const NO_PLAN_TIERS = [
  {
    key: 'starter',
    name: 'Essencial',
    priceId: import.meta.env.VITE_STRIPE_STARTER_PRICE_ID || '',
    brl: 'R$497',
    desc: 'Perfeito para restaurantes pequenos',
    features: ['Reservas com IA (Chat + WhatsApp)', 'Painel do anfitrião', 'Análises básicas', 'Suporte por e-mail', 'Até 50 reservas/mês'],
    highlighted: false,
    planName: 'Starter',
  },
  {
    key: 'growth',
    name: 'Profissional',
    priceId: import.meta.env.VITE_STRIPE_GROWTH_PRICE_ID || '',
    brl: 'R$1.497',
    desc: 'Para restaurantes em crescimento',
    features: ['Tudo do Essencial', 'Agente de voz com IA', 'Análises avançadas', 'Gestão de lista de espera', 'Até 150 reservas/mês', 'Notificações por SMS'],
    highlighted: true,
    planName: 'Growth',
    trial: true,
  },
  {
    key: 'scale',
    name: 'Enterprise',
    priceId: import.meta.env.VITE_STRIPE_SCALE_PRICE_ID || '',
    brl: 'R$2.997',
    desc: 'Para restaurantes de alto volume',
    features: ['Tudo do Profissional', 'Reservas ilimitadas', 'SMS ilimitado', 'Suporte prioritário', 'Integrações personalizadas'],
    highlighted: false,
    planName: 'Scale',
  },
];

function NoPlanPricing() {
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const { error } = useToast();

  const handleCheckout = async (priceId: string, planName: string) => {
    if (!priceId) { error('Price not configured. Please contact support.'); return; }
    try {
      setLoadingPlan(planName);
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
        throw new Error(data.error || 'Failed to create checkout session');
      }
      const { url } = await response.json();
      window.location.href = url;
    } catch (err: unknown) {
      error(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setLoadingPlan(null);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="flex justify-between items-center px-6 sm:px-10 py-4 border-b border-border-gray bg-white">
        <div className="font-serif text-lg font-semibold text-deep-charcoal">
          seatable<span className="text-burgundy">.</span>
        </div>
        <a href="/host-dashboard/simple" className="text-[13px] text-warm-stone hover:text-stone-gray transition-colors">
          Acessar painel →
        </a>
      </header>

      <div className="flex-1 px-6 sm:px-16 py-12">
        <div className="max-w-[1100px] mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-burgundy/[6%] rounded-full mb-5">
              <span className="text-xs font-semibold tracking-[1.5px] uppercase text-burgundy">Planos</span>
            </div>
            <h1 className="font-serif text-[40px] font-medium tracking-tight text-deep-charcoal mb-3">
              Escolha seu plano
            </h1>
            <p className="text-[17px] text-warm-stone font-light">
              Sem taxas ocultas. Cancele quando quiser.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-[2px] bg-border-gray rounded-[20px] overflow-hidden">
            {NO_PLAN_TIERS.map((tier) => {
              const isLoading = loadingPlan === tier.planName;
              return (
                <div key={tier.key} className={`relative px-8 py-12 ${tier.highlighted ? 'bg-deep-charcoal' : 'bg-warm-white'}`}>
                  {tier.trial && (
                    <div className="absolute top-0 inset-x-0 flex justify-center">
                      <span className="bg-burgundy text-white text-[11px] font-semibold tracking-wide uppercase px-4 py-1 rounded-b-lg">
                        14 dias grátis
                      </span>
                    </div>
                  )}
                  <div className={`text-xs font-semibold tracking-[1.5px] uppercase mb-2 ${tier.highlighted ? 'text-burgundy' : 'text-warm-stone'}`}>
                    {tier.name}
                  </div>
                  <div className={`font-serif text-[42px] font-medium tracking-tight leading-none mb-1 ${tier.highlighted ? 'text-white' : 'text-deep-charcoal'}`}>
                    {tier.brl}<span className={`text-base font-normal ${tier.highlighted ? 'text-muted-stone' : 'text-warm-stone'}`}>/mês</span>
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
                        : 'border border-border-gray text-deep-charcoal hover:border-muted-stone bg-white'
                    }`}
                  >
                    {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                    {isLoading ? 'Aguarde...' : tier.trial ? 'Começar Teste Grátis' : 'Começar'}
                  </button>
                </div>
              );
            })}
          </div>

          <p className="text-center text-sm text-muted-stone mt-8">
            Precisa de ajuda?{' '}
            <a href="mailto:hello@seatable.one" className="text-burgundy hover:text-burgundy-dark transition-colors">
              Fale conosco
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

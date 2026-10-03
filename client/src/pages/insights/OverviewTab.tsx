import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import TonightBriefingCard from '../../components/insights/TonightBriefingCard';
import CustomerIntelligenceCard from '../../components/insights/CustomerIntelligenceCard';
import WeeklyForecastCard from '../../components/insights/WeeklyForecastCard';
import CampaignManager from '../../components/dashboard/CampaignManager';
import StrategyMetricsWidget from '../../components/dashboard/StrategyMetricsWidget';
import { useHostDashboard } from '../../hooks/useHostDashboard';
import { useCustomerList } from '../../hooks/useCustomers';
import { useLTVStats } from '../../hooks/useLTVData';
import { usePlanFeature } from '../../hooks/usePlanFeature';
import ThiingsIcon from '../../components/common/ThiingsIcon';

export default function OverviewTab() {
  const { t } = useTranslation();
  const { data: dashboard, isLoading, isError: dashboardError, refetch: refetchDashboard } = useHostDashboard();
  // Lifetime signal for the brand-new detector below. limit:1 keeps the
  // payload tiny — we only need `total`.
  const { data: customerProbe, isLoading: customersLoading, isError: customersError, refetch: refetchCustomers } = useCustomerList({ limit: 1, offset: 0 });
  const { data: ltvStats } = useLTVStats();
  const { hasAccess: hasCustomerAccess, isLoading: customerPlanLoading } = usePlanFeature('customerLTV');
  const { hasAccess: hasAnalyticsAccess, isLoading: analyticsPlanLoading } = usePlanFeature('advancedAnalytics');

  // No-signal detector: zero future reservations, zero active parties, and
  // zero CRM customers means every insight card would render an empty box.
  // Five identical empty boxes read as "broken" to a new owner — show a single
  // page-level explainer instead until there's data to display. The copy must
  // not claim this restaurant has never had a reservation: CRM can be empty
  // even when a historical reservation exists outside this snapshot.
  //
  // E2E sweep 2026-06-09 caught a false positive: an ESTABLISHED restaurant
  // (18 CRM customers) on a quiet night with zero upcoming reservations was
  // shown "Seus insights aparecem após as primeiras reservas" — wrong and
  // mildly insulting. "Right now" signals aren't enough; also require a
  // zero LIFETIME signal (no customers ever) before claiming brand-new.
  const hasNoOverviewSignals = !isLoading && !customersLoading && !dashboardError && !customersError && !!dashboard
    && (dashboard.upcoming_reservations?.length ?? 0) === 0
    && (dashboard.active_parties?.length ?? 0) === 0
    && (dashboard.summary?.upcoming_reservations ?? 0) === 0
    && customerProbe?.total === 0;

  if ((isLoading && !dashboard) || (customersLoading && !customerProbe)) {
    return (
      <section aria-busy="true" aria-label={t('common.loading')} className="space-y-5 py-7">
        <div className="h-3 w-28 animate-pulse rounded-full bg-brand-line" />
        <div className="h-10 w-3/5 max-w-md animate-pulse rounded-lg bg-brand-line" />
        <div className="h-px w-full bg-brand-line" />
      </section>
    );
  }

  if ((!dashboard && dashboardError) || (!customerProbe && customersError)) {
    return (
      <section role="alert" className="max-w-2xl border-t border-brand-line py-12 text-brand-ink sm:py-20">
        <ThiingsIcon name="alert-circle" pxSize={28} className="text-red-700" />
        <h2 className="mt-5 font-brand text-[30px] leading-tight tracking-tight sm:text-[38px]">
          {t('insights.overviewErrorTitle')}
        </h2>
        <p className="mt-3 text-[15px] text-brand-muted">{t('insights.overviewErrorHint')}</p>
        <button
          type="button"
          onClick={async () => { await Promise.all([refetchDashboard(), refetchCustomers()]); }}
          className="mt-7 rounded-full bg-brand-action px-5 py-2.5 text-sm font-medium text-brand-paper transition-colors hover:bg-brand-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-action"
        >
          {t('common.retry')}
        </button>
      </section>
    );
  }

  if (hasNoOverviewSignals) {
    return (
      <section className="max-w-3xl border-t border-brand-line py-12 text-brand-ink sm:py-20">
        <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-brand-muted">{t('insights.pageTitle')}</p>
        <h2 className="mt-4 max-w-[19ch] font-brand text-[34px] leading-[1.04] tracking-[-0.05em] sm:text-[52px]">
          {t('insights.emptyTitle', 'Ainda não há sinais para esta visão')}
        </h2>
        <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-brand-muted sm:text-[16px]">
          {t('insights.emptyHint', 'Não encontramos reservas futuras nem clientes no histórico disponível. Compartilhe o link de reservas ou registre um atendimento para começar a acompanhar a casa.')}
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            to="/host-dashboard/simple"
            className="inline-flex items-center rounded-full bg-brand-action px-5 py-2.5 text-sm font-medium text-brand-paper transition-colors hover:bg-brand-ink"
          >
            {t('insights.emptyGoToDashboard', 'Ir para o painel')}
          </Link>
          <Link
            to="/host-dashboard/settings"
            className="inline-flex items-center rounded-full border border-brand-line px-4 py-2 text-sm font-medium text-brand-ink transition-colors hover:border-brand-action"
          >
            {t('insights.emptyConfigure', 'Configurar restaurante')}
          </Link>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-3 text-brand-ink sm:space-y-5">
      <div>
        <TonightBriefingCard appearance="hero" />
      </div>

      <section aria-labelledby="customers-overview-title" className="border-t border-brand-line pt-3 sm:pt-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-2">
          <h2 id="customers-overview-title" className="font-brand text-[22px] leading-tight tracking-[-0.04em] text-brand-ink sm:text-[29px]">
            {hasCustomerAccess && ltvStats && ltvStats.high_risk_customers > 0
              ? t('insights.customersNeedAttention', { count: ltvStats.high_risk_customers })
              : t('insights.customerSection')}
          </h2>
          {hasCustomerAccess && ltvStats && ltvStats.high_risk_customers > 0 && (
            <Link to="/host-dashboard/customers" className="hidden text-[13px] font-medium text-brand-action underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-brand-action sm:inline-flex">
              {t('insights.viewAllCustomers')} <span aria-hidden="true" className="ml-1">→</span>
            </Link>
          )}
        </div>
        {!customerPlanLoading && !hasCustomerAccess ? (
          <p className="mt-4 border-y border-brand-line py-7 text-[15px] text-brand-muted">
            {t('insights.customerPlanUnavailable')}
          </p>
        ) : (
          <div className="mt-2 grid grid-cols-1 gap-6 sm:mt-5 sm:gap-9 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
            <CustomerIntelligenceCard appearance="hero" />
            <WeeklyForecastCard appearance="hero" />
          </div>
        )}
      </section>

      <section className="border-t border-brand-line pt-4 sm:pt-5">
        {analyticsPlanLoading ? (
          <div role="status" aria-label={t('common.loading')} className="h-20 animate-pulse bg-brand-line/50" />
        ) : hasAnalyticsAccess ? (
          <StrategyMetricsWidget appearance="hero" />
        ) : (
          <>
            <h2 className="font-brand text-[26px] leading-tight tracking-[-0.03em] text-brand-ink sm:text-[30px]">{t('strategy.scorecard')}</h2>
            <p className="mt-4 border-t border-brand-line py-7 text-[15px] text-brand-muted">{t('insights.locked_advancedAnalytics')}</p>
          </>
        )}
      </section>

      <CampaignManager appearance="hero" />
    </div>
  );
}

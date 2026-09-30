import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import TonightBriefingCard from '../../components/insights/TonightBriefingCard';
import CustomerIntelligenceCard from '../../components/insights/CustomerIntelligenceCard';
import WeeklyForecastCard from '../../components/insights/WeeklyForecastCard';
import CampaignManager from '../../components/dashboard/CampaignManager';
import StrategyMetricsWidget from '../../components/dashboard/StrategyMetricsWidget';
import { useHostDashboard } from '../../hooks/useHostDashboard';
import { useCustomerList } from '../../hooks/useCustomers';

export default function OverviewTab() {
  const { t } = useTranslation();
  const { data: dashboard, isLoading } = useHostDashboard();
  // Lifetime signal for the brand-new detector below. limit:1 keeps the
  // payload tiny — we only need `total`.
  const { data: customerProbe, isLoading: customersLoading } = useCustomerList({ limit: 1, offset: 0 });

  // Brand-new restaurant detector: zero reservations + zero active parties
  // means every insight card below would render its own "Nenhuma X" empty box.
  // Five identical empty boxes read as "broken" to a new owner — show a single
  // page-level explainer instead until there's data to display.
  //
  // E2E sweep 2026-06-09 caught a false positive: an ESTABLISHED restaurant
  // (18 CRM customers) on a quiet night with zero upcoming reservations was
  // shown "Seus insights aparecem após as primeiras reservas" — wrong and
  // mildly insulting. "Right now" signals aren't enough; also require a
  // zero LIFETIME signal (no customers ever) before claiming brand-new.
  const isBrandNew = !isLoading && !customersLoading && !!dashboard
    && (dashboard.upcoming_reservations?.length ?? 0) === 0
    && (dashboard.active_parties?.length ?? 0) === 0
    && (dashboard.summary?.upcoming_reservations ?? 0) === 0
    && (customerProbe?.total ?? 0) === 0;

  if (isBrandNew) {
    return (
      <section className="mx-auto max-w-2xl border-t hairline py-12 sm:py-20">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-stone">{t('insights.pageTitle')}</p>
        <h2 className="mt-3 font-serif text-3xl sm:text-4xl text-deep-charcoal">
          {t('insights.emptyTitle', 'Seus insights aparecem após as primeiras reservas')}
        </h2>
        <p className="mt-4 text-[15px] text-muted-stone leading-relaxed max-w-lg">
          {t('insights.emptyHint', 'Briefing da noite, inteligência de clientes, previsão semanal — tudo isso é calculado a partir do histórico do seu restaurante. Compartilhe seu link de reservas ou adicione um walk-in para começar a ver dados aqui.')}
        </p>
        <div className="mt-7 flex flex-wrap items-center gap-3">
          <Link
            to="/host-dashboard/simple"
            className="inline-flex items-center px-5 py-2.5 rounded-full bg-burgundy hover:bg-burgundy-dark text-white text-sm font-semibold transition-colors"
          >
            {t('insights.emptyGoToDashboard', 'Ir para o painel')}
          </Link>
          <Link
            to="/host-dashboard/settings"
            className="inline-flex items-center px-4 py-2 rounded-full border border-glass-border-dark bg-white/60 backdrop-blur-glass-chip text-deep-charcoal text-sm font-medium hover:bg-white/85 transition-colors"
          >
            {t('insights.emptyConfigure', 'Configurar restaurante')}
          </Link>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-5">
      <div>
        <TonightBriefingCard />
      </div>

      <section aria-labelledby="customers-overview-title" className="pt-1 sm:pt-3">
        <h2 id="customers-overview-title" className="font-serif text-[27px] leading-none text-deep-charcoal sm:text-[31px]">
          {t('insights.customerSection')}
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:mt-5 sm:gap-9 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <CustomerIntelligenceCard />
          <WeeklyForecastCard />
        </div>
      </section>

      <section className="pt-1 sm:pt-3">
        <StrategyMetricsWidget />
      </section>

      <CampaignManager />
    </div>
  );
}

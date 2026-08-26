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
      <div className="text-center py-16 max-w-lg mx-auto">
        <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-burgundy/10 flex items-center justify-center">
          <svg className="w-6 h-6 text-burgundy" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <h2 className="text-base font-semibold text-deep-charcoal mb-1">
          {t('insights.emptyTitle', 'Seus insights aparecem após as primeiras reservas')}
        </h2>
        <p className="text-sm text-stone-500 leading-relaxed mb-6">
          {t('insights.emptyHint', 'Briefing da noite, inteligência de clientes, previsão semanal — tudo isso é calculado a partir do histórico do seu restaurante. Compartilhe seu link de reservas ou adicione um walk-in para começar a ver dados aqui.')}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
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
      </div>
    );
  }

  return (
    <>
      {/* 2x2 grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <TonightBriefingCard />
        <CustomerIntelligenceCard />
        <WeeklyForecastCard />
      </div>

      {/* Strategy Scorecard */}
      <div className="border-t border-[#E7E5E4] mt-8 mb-8" />
      <div className="mt-6">
        <StrategyMetricsWidget />
        <div className="mt-2 flex justify-end">
          <Link
            to="/host-dashboard/voice-settings"
            className="text-xs text-muted-stone hover:text-burgundy transition-colors"
          >
            {t('insights.editStrategy', 'Edit AI strategy document')} →
          </Link>
        </div>
      </div>

      {/* WhatsApp Campaigns */}
      <div className="border-t border-[#E7E5E4] mt-8 mb-8" />
      <div className="mt-6">
        <CampaignManager />
      </div>
    </>
  );
}

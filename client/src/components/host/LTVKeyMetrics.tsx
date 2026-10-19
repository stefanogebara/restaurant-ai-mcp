import { useTranslation } from 'react-i18next';
import HelpTooltip from '../common/HelpTooltip';
import { formatCurrency } from './ltvHelpers';
import type { LTVStats } from './ltvDashboard.types';
import type { SupportedCurrency } from '../../utils/currency';

interface LTVKeyMetricsProps {
  stats: LTVStats;
  currency: SupportedCurrency;
}

export default function LTVKeyMetrics({ stats, currency }: LTVKeyMetricsProps) {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-1 gap-0 sm:grid-cols-3 sm:gap-6">
      <div className="hairline py-4 sm:border-b-0 sm:border-r sm:border-glass-border-dark sm:pr-6">
        <div className="text-3xl font-serif text-deep-charcoal">{stats.total_customers}</div>
        <div className="mt-1 text-xs text-muted-stone">{t('ltv.metricCustomers')}</div>
      </div>

      <div className="hairline py-4 sm:border-b-0 sm:border-r sm:border-glass-border-dark sm:pr-6">
        <div className="text-3xl font-serif text-deep-charcoal">{formatCurrency(stats.avg_ltv, currency)}</div>
        <div className="mt-1 flex items-center gap-1 text-xs text-muted-stone">
          {t('ltv.metricAverage')}
          <HelpTooltip
            title={t('ltv.metricAverage')}
            content={t('ltv.forecastHint')}
            position="bottom"
            size="sm"
          />
        </div>
      </div>

      <div className="py-4">
        <div className="text-3xl font-serif text-deep-charcoal">{formatCurrency(stats.total_ltv, currency)}</div>
        <div className="mt-1 text-xs text-muted-stone">{t('ltv.metricTotal')}</div>
      </div>
    </div>
  );
}

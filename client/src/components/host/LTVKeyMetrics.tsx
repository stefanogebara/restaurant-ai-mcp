import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../common/ThiingsIcon';
import HelpTooltip from '../common/HelpTooltip';
import { formatCurrency } from './ltvHelpers';
import type { LTVStats } from './ltvDashboard.types';

interface LTVKeyMetricsProps {
  stats: LTVStats;
}

export default function LTVKeyMetrics({ stats }: LTVKeyMetricsProps) {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div className="p-4 bg-burgundy/10 rounded-xl border border-burgundy/20">
        <div className="flex items-center justify-between mb-2">
          <ThiingsIcon name="users" size="sm" />
          <span className="text-2xl font-bold text-deep-charcoal">{stats.total_customers}</span>
        </div>
        <div className="text-xs text-stone-gray">Total Customers</div>
      </div>

      <div className="p-4 bg-green-600/10 rounded-xl border border-green-600/20">
        <div className="flex items-center justify-between mb-2">
          <ThiingsIcon name="trending-up" size="sm" />
          <span className="text-2xl font-bold text-deep-charcoal">{formatCurrency(stats.avg_ltv)}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="text-xs text-stone-gray">Avg Lifetime Value</div>
          <HelpTooltip
            title={t('ltv.tooltipTitle', 'What is LTV?')}
            content={t('ltv.tooltipContent', 'Total revenue a customer generates over their relationship with you.\n\nComponents:\n• Average spend per visit: €45\n• Visit frequency: 3x per year\n• Customer lifespan: 3 years\n• LTV = €45 × 3 × 3 = €405\n\nWhy it matters:\nFocus retention efforts on high-LTV customers')}
            position="bottom"
            size="sm"
          />
        </div>
      </div>

      <div className="p-4 bg-violet-600/10 rounded-xl border border-violet-600/20">
        <div className="flex items-center justify-between mb-2">
          <ThiingsIcon name="dollar" size="sm" />
          <span className="text-2xl font-bold text-deep-charcoal">{formatCurrency(stats.total_ltv)}</span>
        </div>
        <div className="text-xs text-stone-gray">Total LTV</div>
      </div>
    </div>
  );
}

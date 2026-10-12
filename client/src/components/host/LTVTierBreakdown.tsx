import { useTranslation } from 'react-i18next';
import HelpTooltip from '../common/HelpTooltip';
import { getTierColor, getTierBgColor, getTierIcon } from './ltvHelpers';
import type { LTVStats } from './ltvDashboard.types';

interface LTVTierBreakdownProps {
  tiers: LTVStats['tiers'];
}

export default function LTVTierBreakdown({ tiers }: LTVTierBreakdownProps) {
  const { t } = useTranslation();
  const totalTierCustomers = Object.values(tiers).reduce((sum, count) => sum + count, 0);

  return (
    <section className="hairline pt-8">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h2 className="font-serif text-2xl text-deep-charcoal">{t('ltv.segmentsTitle')}</h2>
          <HelpTooltip
            title={t('ltv.segmentsTitle')}
            content={t('ltv.segmentsHint')}
            position="right"
            size="sm"
          />
        </div>
        <span className="text-xs text-stone-gray">{t('ltv.totalCount', { count: totalTierCustomers })}</span>
      </div>
      <div className="space-y-2">
        {Object.entries(tiers).map(([tier, count]) => {
          const percentage = totalTierCustomers > 0 ? (count / totalTierCustomers) * 100 : 0;
          return (
            <div key={tier} className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${getTierBgColor(tier)} border`}>
                <span className={getTierColor(tier)}>{getTierIcon(tier)}</span>
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-deep-charcoal">{t(`ltv.tier.${tier}`)}</span>
                  <span className="text-sm text-stone-gray">{count} ({percentage.toFixed(0)}%)</span>
                </div>
                <div className="w-full bg-white h-2 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${tier === 'vip' ? 'bg-ocre-600' : tier === 'regular' ? 'bg-emerald-600' : tier === 'occasional' ? 'bg-stone-gray' : tier === 'new' ? 'bg-muted-stone' : 'bg-amber-600'}`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

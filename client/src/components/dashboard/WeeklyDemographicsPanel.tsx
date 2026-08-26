import { useTranslation } from 'react-i18next';
import { buildDemoRows } from './weeklyReportHelpers';
import { colors } from '../../utils/colors';
import type { WeeklyReportData } from './weeklyReport.types';

interface WeeklyDemographicsPanelProps {
  demographics: WeeklyReportData['demographics'];
}

export default function WeeklyDemographicsPanel({ demographics }: WeeklyDemographicsPanelProps) {
  const { t } = useTranslation();
  const demoRows = buildDemoRows(demographics, t);

  const hasData = demoRows.some((row) => (row.pct !== null && row.pct > 0) || (row.count !== null && row.count > 0));

  return (
    <div className="overflow-hidden">
      <div className="flex items-center justify-between py-5 border-b border-[#E7E5E4]">
        <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-stone">{t('analytics.guestDemographics')}</span>
      </div>
      {!hasData ? (
        <div className="text-center py-10 px-6">
          <p className="text-sm font-semibold text-deep-charcoal mb-1">{t('analytics.noDemographicsTitle', 'No demographic data yet')}</p>
          <p className="text-xs text-stone-gray">{t('analytics.noDemographicsHint', 'Guest profiles will build over time as customers visit and interact.')}</p>
        </div>
      ) : demoRows.map((row) => (
        <div key={row.rank} className="flex items-center py-3.5 border-b border-[#F5F5F4] last:border-b-0 gap-3.5">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-[13px] font-bold flex-shrink-0"
            style={{ background: `${row.color}12`, color: row.color }}
          >
            {row.rank}
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-deep-charcoal">{row.label}</div>
            <div className="text-xs text-warm-stone">{row.detail}</div>
          </div>
          <div className="text-base font-bold" style={{ color: row.rank <= 2 ? row.color : colors.deepCharcoal }}>
            {row.pct !== null ? `${row.pct}%` : row.count}
          </div>
        </div>
      ))}
    </div>
  );
}

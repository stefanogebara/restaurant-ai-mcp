import { useTranslation } from 'react-i18next';
import { buildDemoRows } from './weeklyReportHelpers';
import { colors } from '../../utils/colors';
import type { WeeklyReportData } from './weeklyReport.types';

interface WeeklyDemographicsPanelProps {
  demographics: WeeklyReportData['demographics'];
}

export default function WeeklyDemographicsPanel({ demographics }: WeeklyDemographicsPanelProps) {
  const { t } = useTranslation();
  const demoRows = buildDemoRows(demographics);

  return (
    <div className="bg-white rounded-2xl border border-border-gray overflow-hidden">
      <div className="flex items-center justify-between px-6 py-5 border-b border-soft-gray">
        <span className="text-[15px] font-semibold tracking-tight">{t('analytics.guestDemographics')}</span>
      </div>
      {demoRows.map((row) => (
        <div key={row.rank} className="flex items-center px-6 py-3.5 border-b border-soft-gray last:border-b-0 gap-3.5">
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

import { useTranslation } from 'react-i18next';
import { getBarColor, getBarTextColor } from './weeklyReportHelpers';
import type { WeeklyReportData } from './weeklyReport.types';

interface WeeklyBusiestTimesChartProps {
  times: WeeklyReportData['busiest']['times'];
}

export default function WeeklyBusiestTimesChart({ times }: WeeklyBusiestTimesChartProps) {
  const { t } = useTranslation();
  const maxTimeCovers = Math.max(...times.map(t => t.covers), 1);

  return (
    <div className="overflow-hidden">
      <div className="flex items-center justify-between py-5 border-b border-[#E7E5E4]">
        <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-stone">{t('analytics.busiestTimes')}</span>
      </div>
      <div className="py-6 space-y-3">
        {times.map((time) => {
          const widthPct = Math.max((time.covers / maxTimeCovers) * 100, 5);
          return (
            <div key={time.time} className="flex items-center gap-3">
              <div className="w-[50px] text-[13px] text-warm-stone text-right flex-shrink-0">{time.time}</div>
              <div className="flex-1 h-6 bg-soft-gray rounded-lg overflow-hidden">
                <div
                  className="h-full rounded-lg flex items-center pl-2.5"
                  style={{ width: `${widthPct}%`, background: getBarColor(time.covers, maxTimeCovers) }}
                >
                  <span className="text-[11px] font-semibold" style={{ color: getBarTextColor(time.covers, maxTimeCovers) }}>{time.covers}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

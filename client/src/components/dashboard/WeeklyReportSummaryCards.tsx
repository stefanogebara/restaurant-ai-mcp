import { useTranslation } from 'react-i18next';
import type { WeeklyReportData } from './weeklyReport.types';

interface WeeklyReportSummaryCardsProps {
  summary: WeeklyReportData['summary'];
}

export default function WeeklyReportSummaryCards({ summary }: WeeklyReportSummaryCardsProps) {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-8 border-b border-[#E5E7EB] pb-5">
      <div className="py-5 text-center">
        <div className="text-[11px] font-medium text-muted-stone mb-1.5 tracking-wide">{t('analytics.totalReservations')}</div>
        <div className="text-2xl font-bold tracking-tight">{summary.total_reservations}</div>
        {summary.previous_covers === 0 && summary.total_covers > 0 ? (
          <div className="text-[11px] font-medium mt-1 text-stone-600">{t('analytics.new', 'New')}</div>
        ) : summary.previous_covers >= 3 && (
          <div className={`text-[11px] font-medium mt-1 ${summary.covers_change_percent >= 0 ? 'text-rose-600' : 'text-red-600'}`}>
            {summary.covers_change_percent >= 0 ? '+' : ''}{summary.covers_change_percent}% {t('analytics.vsPrevWeek', 'vs prev week')}
          </div>
        )}
      </div>
      <div className="py-5 text-center">
        <div className="text-[11px] font-medium text-muted-stone mb-1.5 tracking-wide">{t('analytics.walkIns')}</div>
        <div className="text-2xl font-bold tracking-tight">{summary.walk_in_count}</div>
      </div>
      <div className="py-5 text-center">
        <div className="text-[11px] font-medium text-muted-stone mb-1.5 tracking-wide">{t('analytics.cancellations')}</div>
        <div className="text-2xl font-bold tracking-tight text-red-600">{summary.cancelled_count}</div>
        <div className="text-[11px] font-medium text-warm-stone mt-1">{summary.cancellation_rate}% {t('analytics.rate', 'rate')}</div>
      </div>
      <div className="py-5 text-center">
        <div className="text-[11px] font-medium text-muted-stone mb-1.5 tracking-wide">{t('analytics.avgPartySize')}</div>
        <div className="text-2xl font-bold tracking-tight">{summary.avg_party_size}</div>
        <div className="text-[11px] font-medium text-warm-stone mt-1">{summary.total_covers} {t('analytics.coversTotal', 'covers total')}</div>
      </div>
      <div className="py-5 text-center">
        <div className="text-[11px] font-medium text-muted-stone mb-1.5 tracking-wide">{t('analytics.totalCovers')}</div>
        <div className="text-2xl font-bold tracking-tight text-burgundy">{summary.total_covers}</div>
        {summary.previous_covers === 0 && summary.total_covers > 0 ? (
          <div className="text-[11px] font-medium mt-1 text-stone-600">{t('analytics.new', 'New')}</div>
        ) : summary.previous_covers >= 3 && (
          <div className={`text-[11px] font-medium mt-1 ${summary.covers_change_percent >= 0 ? 'text-rose-600' : 'text-red-600'}`}>
            {summary.covers_change_percent >= 0 ? '+' : ''}{summary.covers_change_percent}%
          </div>
        )}
      </div>
    </div>
  );
}

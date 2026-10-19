import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import ThiingsIcon from '../../components/common/ThiingsIcon';
import { SkeletonWeeklyReport } from '../../components/common/Skeleton';
import { useWeeklyReport } from '../../hooks/useWeeklyReport';
import WeeklyReportHeader from '../../components/dashboard/WeeklyReportHeader';
import WeeklyReportSummaryCards from '../../components/dashboard/WeeklyReportSummaryCards';
import WeeklyBusiestTimesChart from '../../components/dashboard/WeeklyBusiestTimesChart';
import WeeklyDemographicsPanel from '../../components/dashboard/WeeklyDemographicsPanel';
import WeeklyPreferencesPanel from '../../components/dashboard/WeeklyPreferencesPanel';
import { authFetch } from '../../services/api';
import { initialReportPeriod, isValidReportPeriod, shiftReportPeriod } from '../../utils/reportPeriod';

export default function ReportsTab() {
  const { t } = useTranslation();
  const [appliedPeriod, setAppliedPeriod] = useState(() => initialReportPeriod(window.location.search));
  const [startDate, setStartDate] = useState(appliedPeriod.start);
  const [endDate, setEndDate] = useState(appliedPeriod.end);
  const [shareToast, setShareToast] = useState<string | null>(null);
  const [sendingPdf, setSendingPdf] = useState(false);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { data: report, isLoading, isError, refetch } = useWeeklyReport(appliedPeriod.start, appliedPeriod.end);
  const hasActivity = Boolean(report && (report.summary.total_reservations > 0 || report.summary.total_covers > 0));
  const deliveryStatus = useQuery<{ available: boolean; reason: string | null }>({
    queryKey: ['report-pdf', 'status'],
    queryFn: async () => {
      const response = await authFetch('/api/report-pdf?action=status');
      if (!response.ok) throw new Error('Report delivery status unavailable');
      return response.json();
    },
    enabled: hasActivity,
    staleTime: 5 * 60 * 1000,
  });
  const draftPeriod = { start: startDate, end: endDate };
  const canApply = isValidReportPeriod(draftPeriod);
  const hasPendingChanges = startDate !== appliedPeriod.start || endDate !== appliedPeriod.end;

  useEffect(() => {
    if (!shareToast) return undefined;
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setShareToast(null), 3000);
    return () => { if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current); };
  }, [shareToast]);

  const movePeriod = (direction: -1 | 1) => {
    const next = shiftReportPeriod(appliedPeriod, direction);
    setStartDate(next.start);
    setEndDate(next.end);
    setAppliedPeriod(next);
  };

  const handleSendWhatsApp = async () => {
    if (!hasActivity || sendingPdf) return;
    setSendingPdf(true);
    try {
      const params = new URLSearchParams({
        action: 'send_whatsapp', start_date: appliedPeriod.start, end_date: appliedPeriod.end,
      });
      const response = await authFetch(`/api/report-pdf?${params}`, { method: 'POST' });
      const body = await response.json();
      setShareToast(response.ok && body.success
        ? t('reports.pdfSent')
        : t('reports.pdfError'));
    } catch {
      setShareToast(t('reports.pdfError'));
    } finally {
      setSendingPdf(false);
    }
  };

  const handleShare = async () => {
    const url = new URL(window.location.href);
    url.pathname = '/host-dashboard/insights';
    url.searchParams.set('tab', 'reports');
    url.searchParams.set('start_date', appliedPeriod.start);
    url.searchParams.set('end_date', appliedPeriod.end);
    if (navigator.share) {
      try {
        await navigator.share({ title: t('reports.periodTitle'), url: url.toString() });
        return;
      } catch {
        // If sharing is unavailable or cancelled, the authenticated link can be copied.
      }
    }
    try {
      await navigator.clipboard.writeText(url.toString());
      setShareToast(t('common.copiedToClipboard'));
    } catch {
      setShareToast(t('common.shareFailed'));
    }
  };

  return (
    <div className="report-print space-y-10">
      <WeeklyReportHeader
        startDate={startDate} endDate={endDate}
        onStartDateChange={setStartDate} onEndDateChange={setEndDate}
        onPrevious={() => movePeriod(-1)} onNext={() => movePeriod(1)}
        onApply={() => { if (canApply) setAppliedPeriod(draftPeriod); }}
        onPrint={() => window.print()} onShare={handleShare}
        canExport={hasActivity && !isLoading && !isError}
        canApply={canApply} hasPendingChanges={hasPendingChanges}
      />

      {hasActivity && !isLoading && !isError && deliveryStatus.data?.available && (
        <div className="print:hidden">
          <button type="button" onClick={handleSendWhatsApp} disabled={sendingPdf}
            className="inline-flex items-center gap-2 rounded-full bg-burgundy px-5 py-2.5 text-sm font-medium text-white hover:bg-burgundy-dark disabled:opacity-50">
            <ThiingsIcon name="chat" size="xs" />
            {sendingPdf ? t('reports.generating') : t('reports.sendWhatsApp')}
          </button>
          <p className="mt-2 text-xs text-muted-stone">{t('reports.sendHint')}</p>
        </div>
      )}

      {hasActivity && deliveryStatus.data && !deliveryStatus.data.available && (
        <p role="status" className="text-sm text-amber-700">
          {deliveryStatus.data.reason === 'phone_unverified'
            ? t('reports.phoneUnverified')
            : t('reports.deliveryUnavailable')}
        </p>
      )}

      {isLoading ? <SkeletonWeeklyReport /> : isError ? (
        <div role="alert" className="border-t hairline py-8">
          <p className="font-serif text-2xl text-deep-charcoal">{t('dashboard.errorTitle')}</p>
          <p className="mt-2 text-sm text-stone-gray">{t('errors.serverError')}</p>
          <button type="button" onClick={() => refetch()} className="mt-4 rounded-full bg-burgundy px-5 py-2 text-sm text-white">
            {t('common.retry')}
          </button>
        </div>
      ) : !report ? (
        <p className="border-t hairline py-8 text-sm text-stone-gray">{t('analytics.noReportData')}</p>
      ) : !hasActivity ? (
        <p role="status" className="border-t hairline py-10 text-sm text-stone-gray">{t('reports.noActivity')}</p>
      ) : (
        <div className="space-y-12">
          {report.summary.covers_estimated && <p role="note" className="text-sm text-ocre-600">{t('reports.coversEstimateNote')}</p>}
          {report.summary.covers_comparison_valid === false && <p role="note" className="text-sm text-stone-gray">{t('reports.comparisonUnavailable')}</p>}
          <WeeklyReportSummaryCards summary={report.summary} />
          <WeeklyBusiestTimesChart times={report.busiest.times} />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <WeeklyDemographicsPanel demographics={report.demographics} />
            <WeeklyPreferencesPanel preferences={report.preferences} />
          </div>
        </div>
      )}

      {shareToast && (
        <div role="status" className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-deep-charcoal px-4 py-2 text-sm text-white shadow-lg">
          {shareToast}
        </div>
      )}
    </div>
  );
}

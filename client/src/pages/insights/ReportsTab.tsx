import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../../components/common/ThiingsIcon';
import { SkeletonWeeklyReport } from '../../components/common/Skeleton';
import { useWeeklyReport } from '../../hooks/useWeeklyReport';
import WeeklyReportHeader from '../../components/dashboard/WeeklyReportHeader';
import WeeklyReportSummaryCards from '../../components/dashboard/WeeklyReportSummaryCards';
import WeeklyBusiestTimesChart from '../../components/dashboard/WeeklyBusiestTimesChart';
import WeeklyDemographicsPanel from '../../components/dashboard/WeeklyDemographicsPanel';
import WeeklyPreferencesPanel from '../../components/dashboard/WeeklyPreferencesPanel';
import { useAuth } from '../../contexts/AuthContext';
import { formatLocalDate, parseLocalDate } from '../../utils/timeFormatting';

export default function ReportsTab() {
  const today = new Date();
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const { t } = useTranslation();
  const { session } = useAuth();

  // Local timezone — see formatLocalDate docs. UTC made São Paulo at 23:00 see
  // tomorrow's date as the report endpoint.
  const [startDate, setStartDate] = useState(formatLocalDate(weekAgo));
  const [endDate, setEndDate] = useState(formatLocalDate(today));

  const { data: report, isLoading, isError, refetch } = useWeeklyReport(startDate, endDate);

  const handlePrevious = () => {
    // parseLocalDate, not `new Date(str)` — the latter parses YYYY-MM-DD as
    // UTC midnight, shifting the pagination an extra day for negative-UTC users.
    const start = parseLocalDate(startDate);
    const end = parseLocalDate(endDate);
    const diffMs = end.getTime() - start.getTime();
    const newEnd = new Date(start.getTime() - 24 * 60 * 60 * 1000);
    const newStart = new Date(newEnd.getTime() - diffMs);
    setStartDate(formatLocalDate(newStart));
    setEndDate(formatLocalDate(newEnd));
  };

  const handleNext = () => {
    const start = parseLocalDate(startDate);
    const end = parseLocalDate(endDate);
    const diffMs = end.getTime() - start.getTime();
    const newStart = new Date(end.getTime() + 24 * 60 * 60 * 1000);
    const newEnd = new Date(newStart.getTime() + diffMs);
    setStartDate(formatLocalDate(newStart));
    setEndDate(formatLocalDate(newEnd));
  };

  const [shareToast, setShareToast] = useState<string | null>(null);
  const [sendingPdf, setSendingPdf] = useState(false);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Single auto-dismiss effect for shareToast — replaces 3 separate inline
  // setTimeouts that lacked unmount cleanup and could fire setState on an
  // unmounted component if the user navigated mid-toast.
  useEffect(() => {
    if (!shareToast) return undefined;
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setShareToast(null), 3000);
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, [shareToast]);

  const handleSendWhatsApp = async () => {
    setSendingPdf(true);
    try {
      const apiBase = import.meta.env.VITE_API_URL || '/api';
      const res = await fetch(`${apiBase}/report-pdf?action=send_whatsapp`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
      });
      const data = await res.json();
      if (data.success) {
        setShareToast(t('reports.pdfSent', 'Report sent via WhatsApp!'));
      } else {
        setShareToast(data.error || t('reports.pdfError', 'Failed to send report'));
      }
    } catch (err) {
      console.error('[ReportsTab] send WhatsApp failed', err);
      setShareToast(t('reports.pdfError', 'Failed to send report'));
    } finally {
      setSendingPdf(false);
    }
  };

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: `${t('analytics.weeklyReports')} ${startDate} – ${endDate}`, url });
        return;
      } catch (err) {
        // User cancelled or share failed — log + fall through to clipboard.
        console.error('[ReportsTab] navigator.share failed', err);
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareToast(t('common.copiedToClipboard', 'Link copied!'));
    } catch (err) {
      console.error('[ReportsTab] clipboard write failed', err);
      setShareToast(t('common.shareFailed', 'Could not copy link'));
    }
  };

  if (isLoading) {
    return <SkeletonWeeklyReport />;
  }

  // A failed report fetch must not fall through to the "no data" empty state —
  // that tells a user with real data they have none and offers no retry.
  if (isError) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="text-center">
          <div className="w-14 h-14 mx-auto mb-3 bg-red-50 rounded-2xl flex items-center justify-center">
            <ThiingsIcon name="alert-circle" pxSize={24} />
          </div>
          <p className="font-semibold text-deep-charcoal">{t('dashboard.errorTitle')}</p>
          <p className="text-sm text-stone-gray mt-1 mb-4">{t('errors.serverError')}</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-burgundy hover:bg-burgundy-dark text-white text-sm font-semibold rounded-xl transition-colors"
          >
            <ThiingsIcon name="refresh" size="xs" />
            {t('common.retry')}
          </button>
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-soft-gray rounded-2xl flex items-center justify-center">
            <ThiingsIcon name="bar-chart" pxSize={28} />
          </div>
          <p className="font-semibold text-deep-charcoal">{t('analytics.noReportData')}</p>
          <p className="text-sm text-stone-gray mt-1">{t('analytics.selectDateRange')}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-12">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex-1">
            <WeeklyReportHeader
              startDate={startDate}
              endDate={endDate}
              onStartDateChange={setStartDate}
              onEndDateChange={setEndDate}
              onPrevious={handlePrevious}
              onNext={handleNext}
              onApply={() => refetch()}
              onPrint={() => window.print()}
              onShare={handleShare}
            />
          </div>
          <div className="flex-shrink-0 sm:pt-1">
            <button
              type="button"
              onClick={handleSendWhatsApp}
              disabled={sendingPdf}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#25D366] hover:bg-[#1DA851] disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-colors whitespace-nowrap"
              aria-label={t('reports.sendWhatsApp', 'Send via WhatsApp')}
            >
              {sendingPdf ? (
                <>
                  <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" aria-hidden="true" />
                  {t('reports.generating', 'Generating...')}
                </>
              ) : (
                <>
                  <ThiingsIcon name="chat" size="xs" />
                  {t('reports.sendWhatsApp', 'Send via WhatsApp')}
                </>
              )}
            </button>
          </div>
        </div>
        <WeeklyReportSummaryCards summary={report.summary} />
        <WeeklyBusiestTimesChart times={report.busiest.times} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <WeeklyDemographicsPanel demographics={report.demographics} />
          <WeeklyPreferencesPanel preferences={report.preferences} />
        </div>
      </div>

      {/* Share toast */}
      {shareToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-deep-charcoal text-white text-sm rounded-xl shadow-lg">
          {shareToast}
        </div>
      )}
    </>
  );
}

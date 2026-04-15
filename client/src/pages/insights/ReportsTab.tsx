import { useState } from 'react';
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

export default function ReportsTab() {
  const today = new Date();
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const { t } = useTranslation();
  const { session } = useAuth();

  const [startDate, setStartDate] = useState(weekAgo.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(today.toISOString().split('T')[0]);

  const { data: report, isLoading, refetch } = useWeeklyReport(startDate, endDate);

  const handlePrevious = () => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffMs = end.getTime() - start.getTime();
    const newEnd = new Date(start.getTime() - 24 * 60 * 60 * 1000);
    const newStart = new Date(newEnd.getTime() - diffMs);
    setStartDate(newStart.toISOString().split('T')[0]);
    setEndDate(newEnd.toISOString().split('T')[0]);
  };

  const handleNext = () => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffMs = end.getTime() - start.getTime();
    const newStart = new Date(end.getTime() + 24 * 60 * 60 * 1000);
    const newEnd = new Date(newStart.getTime() + diffMs);
    setStartDate(newStart.toISOString().split('T')[0]);
    setEndDate(newEnd.toISOString().split('T')[0]);
  };

  const [shareToast, setShareToast] = useState<string | null>(null);
  const [sendingPdf, setSendingPdf] = useState(false);

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
        setShareToast(t('reports.pdfSent', 'Relatório enviado via WhatsApp!'));
      } else {
        setShareToast(data.error || t('reports.pdfError', 'Erro ao enviar relatório'));
      }
    } catch {
      setShareToast(t('reports.pdfError', 'Erro ao enviar relatório'));
    } finally {
      setSendingPdf(false);
      setTimeout(() => setShareToast(null), 3000);
    }
  };

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: `${t('analytics.weeklyReports')} ${startDate} – ${endDate}`, url });
        return;
      } catch {
        // user cancelled or share failed — fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareToast(t('common.copiedToClipboard', 'Link copied!'));
      setTimeout(() => setShareToast(null), 2000);
    } catch {
      setShareToast(t('common.shareFailed', 'Could not copy link'));
      setTimeout(() => setShareToast(null), 2000);
    }
  };

  if (isLoading) {
    return <SkeletonWeeklyReport />;
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
              aria-label={t('reports.sendWhatsApp', 'Enviar por WhatsApp')}
            >
              {sendingPdf ? (
                <>
                  <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" aria-hidden="true" />
                  {t('reports.generating', 'Gerando...')}
                </>
              ) : (
                <>
                  <ThiingsIcon name="chat" size="xs" />
                  {t('reports.sendWhatsApp', 'Enviar por WhatsApp')}
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

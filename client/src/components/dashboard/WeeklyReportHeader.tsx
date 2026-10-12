import { useTranslation } from 'react-i18next';

interface WeeklyReportHeaderProps {
  startDate: string;
  endDate: string;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onPrevious: () => void;
  onNext: () => void;
  onApply: () => void;
  onPrint: () => void;
  onShare: () => void;
  canExport: boolean;
  canApply: boolean;
  hasPendingChanges: boolean;
}

export default function WeeklyReportHeader({
  startDate, endDate, onStartDateChange, onEndDateChange,
  onPrevious, onNext, onApply, onPrint, onShare,
  canExport, canApply, hasPendingChanges,
}: WeeklyReportHeaderProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-5 print:hidden">
      <div>
        <h2 className="font-serif text-3xl text-deep-charcoal">{t('reports.periodTitle')}</h2>
        <p className="mt-1 text-sm text-muted-stone">{t('reports.periodHint')}</p>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-end gap-2 min-w-0">
          <button type="button" onClick={onPrevious} aria-label={t('analytics.previousPeriod')}
            className="h-10 w-9 shrink-0 rounded-full border border-glass-border-dark text-deep-charcoal hover:bg-soft-gray">
            ←
          </button>
          <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 min-[480px]:grid-cols-2">
            <label className="min-w-0 text-[11px] text-muted-stone">
              <span className="mb-1 block">{t('reports.startDate')}</span>
              <input type="date" value={startDate} onChange={event => onStartDateChange(event.target.value)}
                aria-label={t('reports.startDate')}
                className="w-full min-w-0 rounded-xl border border-glass-border-dark bg-warm-white px-2 py-2 text-xs text-deep-charcoal focus:outline-none focus:ring-2 focus:ring-burgundy" />
            </label>
            <label className="min-w-0 text-[11px] text-muted-stone">
              <span className="mb-1 block">{t('reports.endDate')}</span>
              <input type="date" value={endDate} onChange={event => onEndDateChange(event.target.value)}
                aria-label={t('reports.endDate')}
                className="w-full min-w-0 rounded-xl border border-glass-border-dark bg-warm-white px-2 py-2 text-xs text-deep-charcoal focus:outline-none focus:ring-2 focus:ring-burgundy" />
            </label>
          </div>
          <button type="button" onClick={onNext} aria-label={t('analytics.nextPeriod')}
            className="h-10 w-9 shrink-0 rounded-full border border-glass-border-dark text-deep-charcoal hover:bg-soft-gray">
            →
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={onApply} disabled={!canApply || !hasPendingChanges}
            className="rounded-full bg-burgundy px-5 py-2 text-sm font-medium text-white disabled:opacity-50">
            {t('reports.applyPeriod')}
          </button>
          {!canApply && <span role="alert" className="text-xs text-red-700">{t('reports.invalidPeriod')}</span>}
          {canApply && hasPendingChanges && <span className="text-xs text-amber-700">{t('reports.pendingPeriod')}</span>}
        </div>
      </div>

      {canExport && (
        <div className="flex flex-wrap gap-2 border-t hairline pt-4">
          <button type="button" onClick={onPrint}
            className="rounded-full border border-glass-border-dark px-4 py-2 text-sm text-deep-charcoal hover:bg-soft-gray">
            {t('reports.printOrSave')}
          </button>
          <button type="button" onClick={onShare}
            className="rounded-full border border-glass-border-dark px-4 py-2 text-sm text-deep-charcoal hover:bg-soft-gray">
            {t('reports.shareLink')}
          </button>
          <span className="self-center text-xs text-muted-stone">{t('reports.accessNote')}</span>
        </div>
      )}
    </div>
  );
}

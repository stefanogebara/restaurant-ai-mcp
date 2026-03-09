import { useTranslation } from 'react-i18next';

interface WeeklyReportHeaderProps {
  startDate: string;
  endDate: string;
  onStartDateChange: (v: string) => void;
  onEndDateChange: (v: string) => void;
  onPrevious: () => void;
  onNext: () => void;
  onApply: () => void;
  onPrint: () => void;
  onShare: () => void;
}

export default function WeeklyReportHeader({
  startDate, endDate, onStartDateChange, onEndDateChange,
  onPrevious, onNext, onApply, onPrint, onShare,
}: WeeklyReportHeaderProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pl-12 sm:pl-0">
      <h1 className="text-2xl font-bold text-deep-charcoal tracking-tight">
        Reports <span className="font-light text-warm-stone">/ Weekly</span>
      </h1>
      <div className="flex items-center gap-2.5 print:hidden">
        <div className="flex items-center gap-1.5 px-2 py-2 bg-white border border-border-gray rounded-xl text-[13px] font-medium text-stone-gray">
          <button onClick={onPrevious} aria-label="Previous period" className="px-2 py-0.5 text-stone-gray hover:text-deep-charcoal transition-colors">←</button>
          <input
            type="date"
            value={startDate}
            onChange={(e) => onStartDateChange(e.target.value)}
            className="bg-transparent border-0 text-[13px] text-stone-gray w-[110px] cursor-pointer"
          />
          <span className="text-muted-stone">&ndash;</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => onEndDateChange(e.target.value)}
            className="bg-transparent border-0 text-[13px] text-stone-gray w-[110px] cursor-pointer"
          />
          <button type="button" onClick={onApply} className="ml-1 text-burgundy font-semibold text-xs hover:text-burgundy-dark transition-colors">{t('common.apply')}</button>
          <button onClick={onNext} aria-label="Next period" className="px-2 py-0.5 text-stone-gray hover:text-deep-charcoal transition-colors">→</button>
        </div>
        <button
          onClick={onPrint}
          className="px-4 py-2 bg-white border border-border-gray text-stone-gray hover:border-muted-stone rounded-xl text-[13px] font-medium transition-colors"
        >
          {t('analytics.downloadPdf')}
        </button>
        <button
          type="button"
          onClick={onShare}
          className="px-4 py-2 bg-burgundy text-white hover:bg-burgundy-dark rounded-xl text-[13px] font-medium transition-colors"
        >
          {t('analytics.shareReport')}
        </button>
      </div>
    </div>
  );
}

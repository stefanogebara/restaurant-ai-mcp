import { useTranslation } from 'react-i18next';
import { formatLocalDate } from '../../utils/timeFormatting';

export type DatePreset = 'today' | '7d' | '30d' | '90d' | 'this_month' | 'last_month' | 'custom';

export interface DateRangeValue {
  preset: DatePreset;
  startDate: string;
  endDate: string;
}

// Keep the reporting period readable on narrow screens without repeating the
// month and year when both endpoints belong to the same calendar month.
// eslint-disable-next-line react-refresh/only-export-components
export function formatPeriodLabel(startDate: string, endDate: string, language: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return '—';
  const start = new Date(`${startDate}T12:00:00Z`);
  const end = new Date(`${endDate}T12:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '—';
  const format = (date: Date, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(language, { ...options, timeZone: 'UTC' }).format(date);
  const fullDate = (date: Date) => format(date, { day: 'numeric', month: 'short', year: 'numeric' });

  if (startDate === endDate) return fullDate(start);
  if (startDate.slice(0, 7) === endDate.slice(0, 7)) {
    return `${format(start, { day: 'numeric' })}–${fullDate(end)}`;
  }
  if (startDate.slice(0, 4) === endDate.slice(0, 4)) {
    return `${format(start, { day: 'numeric', month: 'short' })} – ${fullDate(end)}`;
  }
  return `${fullDate(start)} – ${fullDate(end)}`;
}

function formatCompactPeriodLabel(startDate: string, endDate: string, language: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return '—';
  const start = new Date(`${startDate}T12:00:00Z`);
  const end = new Date(`${endDate}T12:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '—';
  const datePart = (date: Date, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(language, { ...options, timeZone: 'UTC' }).format(date);
  if (startDate === endDate) return `${datePart(start, { day: 'numeric' })} ${datePart(end, { month: 'short' })}`;
  if (startDate.slice(0, 4) !== endDate.slice(0, 4)) {
    return `${datePart(start, { day: '2-digit', month: '2-digit', year: '2-digit' })}–${datePart(end, { day: '2-digit', month: '2-digit', year: '2-digit' })}`;
  }
  if (startDate.slice(0, 7) === endDate.slice(0, 7)) {
    return `${datePart(start, { day: 'numeric' })}–${datePart(end, { day: 'numeric' })} ${datePart(end, { month: 'short' })}`;
  }
  return `${datePart(start, { day: 'numeric' })} ${datePart(start, { month: 'short' })} – ${datePart(end, { day: 'numeric' })} ${datePart(end, { month: 'short' })}`;
}

// eslint-disable-next-line react-refresh/only-export-components
export function presetToRange(preset: DatePreset): { startDate: string; endDate: string } {
  const now = new Date();
  // Local calendar throughout — using UTC here gave São Paulo users at 23:00
  // tomorrow's date as "today", shifting the entire reporting range by 1 day.
  const today = formatLocalDate(now);
  switch (preset) {
    case 'today':
      return { startDate: today, endDate: today };
    case '7d':
      return { startDate: formatLocalDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)), endDate: today };
    case '30d':
      return { startDate: formatLocalDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29)), endDate: today };
    case '90d':
      return { startDate: formatLocalDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 89)), endDate: today };
    case 'this_month': {
      const y = now.getFullYear(); const m = now.getMonth();
      return { startDate: formatLocalDate(new Date(y, m, 1)), endDate: today };
    }
    case 'last_month': {
      const y2 = now.getFullYear(); const m2 = now.getMonth();
      const first = new Date(y2, m2 - 1, 1);
      const last  = new Date(y2, m2, 0);
      return { startDate: formatLocalDate(first), endDate: formatLocalDate(last) };
    }
    default:
      return { startDate: today, endDate: today };
  }
}

interface Props {
  value: DateRangeValue;
  onChange: (r: DateRangeValue) => void;
}

export default function DateRangePicker({ value, onChange }: Props) {
  const { t, i18n } = useTranslation();
  const handle = (key: DatePreset) =>
    onChange(key === 'custom' ? { ...value, preset: 'custom' } : { preset: key, ...presetToRange(key) });

  const presets: { key: DatePreset; label: string }[] = [
    { key: 'today',      label: t('analytics.presets.today', 'Today') },
    { key: '7d',         label: t('analytics.presets.7d', '7d') },
    { key: '30d',        label: t('analytics.presets.30d', '30d') },
    { key: '90d',        label: t('analytics.presets.90d', '90d') },
    { key: 'this_month', label: t('analytics.presets.thisMonth', 'This month') },
    { key: 'last_month', label: t('analytics.presets.lastMonth', 'Last month') },
    { key: 'custom',     label: t('analytics.presets.custom', 'Custom') },
  ];
  const quickPresets = presets.filter(({ key }) => key === '7d' || key === '30d' || key === '90d');
  const otherPresets = presets.filter(({ key }) => key !== '7d' && key !== '30d' && key !== '90d');
  const otherSelected = otherPresets.some(({ key }) => key === value.preset);
  const fullPeriodLabel = formatPeriodLabel(value.startDate, value.endDate, i18n.language);
  const compactPeriodLabel = formatCompactPeriodLabel(value.startDate, value.endDate, i18n.language);

  return (
    <div className="min-w-0 w-full">
      <div className="relative w-full max-w-[156px] min-w-0 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand-action sm:hidden">
        <div aria-hidden="true" className="flex min-h-[44px] min-w-0 items-center justify-between gap-1 border-b border-brand-action/40 px-0.5 text-brand-ink">
          <span className="truncate font-brand text-[13px] font-medium">{compactPeriodLabel}</span>
          <svg className="shrink-0" width="12" height="12" viewBox="0 0 14 14" fill="none">
            <path d="m3 5 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <select
          aria-label={t('analytics.selectedPeriod')}
          title={fullPeriodLabel}
          value={value.preset}
          onChange={event => handle(event.target.value as DatePreset)}
          className="absolute inset-0 min-h-[44px] w-full cursor-pointer appearance-none opacity-0"
        >
          {presets.map(({ key, label }) => <option className="bg-brand-paper text-brand-ink" key={key} value={key}>{label}</option>)}
        </select>
      </div>
      <div className="hidden overflow-x-auto pb-1 sm:block" role="group" aria-label={t('analytics.selectedPeriod')}>
        <div className="flex w-max min-w-full items-center gap-1">
          {quickPresets.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => handle(key)}
              aria-pressed={value.preset === key}
              className={`shrink-0 px-3.5 py-1.5 min-h-[44px] sm:min-h-[36px] rounded-[100px] font-brand text-[13px] font-medium transition-colors ${
                value.preset === key
                  ? 'bg-brand-action text-brand-paper'
                  : 'text-brand-muted hover:bg-brand-ink/[0.06] hover:text-brand-ink'
              }`}
            >
              {label}
            </button>
          ))}
          <select
            aria-label={t('analytics.otherPeriods', 'Other periods')}
            value={otherSelected ? value.preset : ''}
            onChange={event => handle(event.target.value as DatePreset)}
            className="min-h-[36px] rounded-[100px] border border-brand-line bg-transparent px-3 font-brand text-[13px] text-brand-ink focus-visible:outline-2 focus-visible:outline-brand-action"
          >
            <option value="" disabled>{t('analytics.otherPeriods', 'Other periods')}</option>
            {otherPresets.map(({ key, label }) => <option key={key} value={key}>{label}</option>)}
          </select>
        </div>
      </div>
      {value.preset === 'custom' && (
        <div className="mt-3 flex w-[calc(100vw-32px)] flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <input
            type="date"
            aria-label={t('analytics.customStartDate')}
            value={value.startDate}
            max={value.endDate}
            onChange={e => { if (e.target.value) onChange({ ...value, startDate: e.target.value }); }}
            className="min-w-0 w-full sm:w-auto rounded-lg border border-brand-line bg-transparent px-3 py-1.5 min-h-[44px] font-mono text-[13px] text-brand-ink focus:outline-none focus:ring-2 focus:ring-brand-action"
          />
          <span className="hidden sm:inline text-muted-stone text-sm" aria-hidden="true">&rarr;</span>
          <input
            type="date"
            aria-label={t('analytics.customEndDate')}
            value={value.endDate}
            min={value.startDate}
            onChange={e => { if (e.target.value) onChange({ ...value, endDate: e.target.value }); }}
            className="min-w-0 w-full sm:w-auto rounded-lg border border-brand-line bg-transparent px-3 py-1.5 min-h-[44px] font-mono text-[13px] text-brand-ink focus:outline-none focus:ring-2 focus:ring-brand-action"
          />
        </div>
      )}
    </div>
  );
}

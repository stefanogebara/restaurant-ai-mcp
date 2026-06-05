import { useTranslation } from 'react-i18next';
import { formatLocalDate } from '../../utils/timeFormatting';

export type DatePreset = 'today' | '7d' | '30d' | '90d' | 'this_month' | 'last_month' | 'custom';

export interface DateRangeValue {
  preset: DatePreset;
  startDate: string;
  endDate: string;
}

// eslint-disable-next-line react-refresh/only-export-components
export function presetToRange(preset: DatePreset): { startDate: string; endDate: string } {
  const now = new Date();
  // Local calendar throughout â€” using UTC here gave SÃ£o Paulo users at 23:00
  // tomorrow's date as "today", shifting the entire reporting range by 1 day.
  const today = formatLocalDate(now);
  switch (preset) {
    case 'today':
      return { startDate: today, endDate: today };
    case '7d':
      return { startDate: formatLocalDate(new Date(now.getTime() - 7 * 86400000)), endDate: today };
    case '30d':
      return { startDate: formatLocalDate(new Date(now.getTime() - 30 * 86400000)), endDate: today };
    case '90d':
      return { startDate: formatLocalDate(new Date(now.getTime() - 90 * 86400000)), endDate: today };
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
  const { t } = useTranslation();
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

  return (
    <div className="flex flex-wrap items-center gap-2">
      {presets.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          onClick={() => handle(key)}
          className={`px-3 py-1.5 min-h-[44px] sm:min-h-0 rounded-xl text-[13px] font-medium transition-colors ${
            value.preset === key
              ? 'bg-deep-charcoal text-white border border-deep-charcoal'
              : 'bg-white border border-glass-border-dark text-stone-gray hover:border-muted-stone'
          }`}
        >
          {label}
        </button>
      ))}
      {value.preset === 'custom' && (
        <div className="flex items-center gap-2 ml-1">
          <input
            type="date"
            value={value.startDate}
            max={value.endDate}
            onChange={e => onChange({ ...value, startDate: e.target.value })}
            className="px-3 py-1.5 min-h-[44px] sm:min-h-0 glass-panel rounded-xl text-[13px] text-deep-charcoal focus:outline-none focus:ring-2 focus:ring-burgundy"
          />
          <span className="text-stone-gray text-sm">â†’</span>
          <input
            type="date"
            value={value.endDate}
            min={value.startDate}
            onChange={e => onChange({ ...value, endDate: e.target.value })}
            className="px-3 py-1.5 min-h-[44px] sm:min-h-0 glass-panel rounded-xl text-[13px] text-deep-charcoal focus:outline-none focus:ring-2 focus:ring-burgundy"
          />
        </div>
      )}
    </div>
  );
}

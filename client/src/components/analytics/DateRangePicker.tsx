export type DatePreset = 'today' | '7d' | '30d' | '90d' | 'this_month' | 'last_month' | 'custom';

export interface DateRangeValue {
  preset: DatePreset;
  startDate: string;
  endDate: string;
}

const PRESETS: { key: DatePreset; label: string }[] = [
  { key: 'today',      label: 'Today' },
  { key: '7d',         label: '7d' },
  { key: '30d',        label: '30d' },
  { key: '90d',        label: '90d' },
  { key: 'this_month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: 'custom',     label: 'Custom' },
];

export function presetToRange(preset: DatePreset): { startDate: string; endDate: string } {
  const now = new Date();
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  const today = fmt(now);
  switch (preset) {
    case 'today':
      return { startDate: today, endDate: today };
    case '7d':
      return { startDate: fmt(new Date(now.getTime() - 7 * 86400000)), endDate: today };
    case '30d':
      return { startDate: fmt(new Date(now.getTime() - 30 * 86400000)), endDate: today };
    case '90d':
      return { startDate: fmt(new Date(now.getTime() - 90 * 86400000)), endDate: today };
    case 'this_month':
      const y = now.getUTCFullYear(); const m = now.getUTCMonth(); return { startDate: fmt(new Date(Date.UTC(y, m, 1))), endDate: today };
    case 'last_month': {
      const y2 = now.getUTCFullYear(); const m2 = now.getUTCMonth(); const first = new Date(Date.UTC(y2, m2 - 1, 1));
      const last  = new Date(Date.UTC(y2, m2, 0));
      return { startDate: fmt(first), endDate: fmt(last) };
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
  const handle = (key: DatePreset) =>
    onChange(key === 'custom' ? { ...value, preset: 'custom' } : { preset: key, ...presetToRange(key) });

  return (
    <div className="flex flex-wrap items-center gap-2">
      {PRESETS.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          onClick={() => handle(key)}
          className={`px-3 py-1.5 min-h-[44px] sm:min-h-0 rounded-xl text-[13px] font-medium transition-colors ${
            value.preset === key
              ? 'bg-deep-charcoal text-white border border-deep-charcoal'
              : 'bg-white border border-border-gray text-stone-gray hover:border-muted-stone'
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
            className="px-3 py-1.5 min-h-[44px] sm:min-h-0 bg-white border border-border-gray rounded-xl text-[13px] text-deep-charcoal focus:outline-none focus:ring-2 focus:ring-burgundy"
          />
          <span className="text-stone-gray text-sm">→</span>
          <input
            type="date"
            value={value.endDate}
            min={value.startDate}
            onChange={e => onChange({ ...value, endDate: e.target.value })}
            className="px-3 py-1.5 min-h-[44px] sm:min-h-0 bg-white border border-border-gray rounded-xl text-[13px] text-deep-charcoal focus:outline-none focus:ring-2 focus:ring-burgundy"
          />
        </div>
      )}
    </div>
  );
}

import { useTranslation } from 'react-i18next';
import type { BusinessHours } from '../../../types/onboarding.types';
import { getSheetCopy } from './sheetCopy';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
export function invalidHours(day: BusinessHours): boolean {
  return day.is_open && (!TIME.test(day.open_time) || !TIME.test(day.close_time) ||
    (day.close_time !== '00:00' && day.close_time <= day.open_time));
}
export default function HoursEditor({ value, onChange }: { value: BusinessHours[]; onChange: (value: BusinessHours[]) => void }) {
  const { t, i18n } = useTranslation();
  const copy = getSheetCopy(i18n.language);
  const days = DAYS.map(day => value.find(row => row.day.toLowerCase() === day.toLowerCase()) ??
    { day, is_open: false, open_time: '12:00', close_time: '23:00' });
  const change = (index: number, patch: Partial<BusinessHours>) => {
    onChange(days.map((day, i) => {
      if (i !== index) return day;
      const updated = { ...day, ...patch };
      // A time edit replaces this day's interval explicitly; no stale hidden periods.
      return { ...updated, ...(day.periods ? { periods: [{ open: updated.open_time, close: updated.close_time }] } : {}) };
    }));
  };
  return <div className="space-y-3">
    <p className="text-[14px] leading-relaxed text-muted-stone">{copy.hoursHint}</p>
    {days.map((day, index) => {
      const label = t(`onboarding.day${DAYS[index]}`, DAYS[index]);
      const invalid = invalidHours(day);
      return <div key={day.day} className="space-y-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <label className="flex min-h-11 w-32 items-center gap-2 text-sm text-deep-charcoal">
            <input type="checkbox" checked={day.is_open} onChange={e => change(index, { is_open: e.target.checked })} className="accent-burgundy" />
            {label}
          </label>
          <div className="flex min-w-0 flex-wrap gap-2">
            <input type="time" aria-label={`${label} ${copy.opens}`} aria-invalid={invalid || undefined}
              aria-describedby={invalid ? `hours-error-${index}` : undefined} disabled={!day.is_open}
              value={day.open_time} onChange={e => change(index, { open_time: e.target.value })}
              className="min-h-11 min-w-0 w-28 rounded-xl border border-glass-border-input bg-white px-2 text-sm text-deep-charcoal focus-visible:ring-2 focus-visible:ring-burgundy/60 disabled:opacity-40" />
            <input type="time" aria-label={`${label} ${copy.closes}`} aria-invalid={invalid || undefined}
              aria-describedby={invalid ? `hours-error-${index}` : undefined} disabled={!day.is_open}
              value={day.close_time} onChange={e => change(index, { close_time: e.target.value })}
              className="min-h-11 min-w-0 w-28 rounded-xl border border-glass-border-input bg-white px-2 text-sm text-deep-charcoal focus-visible:ring-2 focus-visible:ring-burgundy/60 disabled:opacity-40" />
          </div>
        </div>
        {invalid && <p id={`hours-error-${index}`} role="alert" className="text-sm text-red-700">{copy.hoursError}</p>}
      </div>;
    })}
  </div>;
}

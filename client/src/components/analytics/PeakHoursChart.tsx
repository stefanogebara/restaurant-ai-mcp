import { useTranslation } from 'react-i18next';
import ChartPanel from './ChartPanel';

interface PeakHoursChartProps {
  reservationsByTimeSlot: Record<string, number>;
}

// The API sends stable English bucket names. Keep the complete time range in
// the visible label so the bars remain readable without angled chart text.
const TIME_SLOT_I18N: Record<string, Record<string, string>> = {
  'pt-BR': {
    'Lunch (11AM-2PM)': 'Almoço · 11–14h',
    'Early Dinner (5PM-7PM)': 'Jantar cedo · 17–19h',
    'Prime Dinner (7PM-10PM)': 'Jantar · 19–22h',
    'Late Night (10PM+)': 'Noite · após 22h',
    Other: 'Outros',
  },
  es: {
    'Lunch (11AM-2PM)': 'Almuerzo · 11–14h',
    'Early Dinner (5PM-7PM)': 'Cena temprana · 17–19h',
    'Prime Dinner (7PM-10PM)': 'Cena · 19–22h',
    'Late Night (10PM+)': 'Noche · después de 22h',
    Other: 'Otros',
  },
  en: {
    'Lunch (11AM-2PM)': 'Lunch · 11am–2pm',
    'Early Dinner (5PM-7PM)': 'Early dinner · 5–7pm',
    'Prime Dinner (7PM-10PM)': 'Dinner · 7–10pm',
    'Late Night (10PM+)': 'Late night · after 10pm',
    Other: 'Other',
  },
};

export default function PeakHoursChart({ reservationsByTimeSlot }: PeakHoursChartProps) {
  const { t, i18n } = useTranslation();
  const labels = TIME_SLOT_I18N[i18n.language] ?? TIME_SLOT_I18N.en;
  const chartData = Object.entries(reservationsByTimeSlot).map(([slot, count]) => ({
    time: labels[slot] ?? slot,
    count: Number.isFinite(count) ? Math.max(0, count) : 0,
  }));
  const maxCount = Math.max(0, ...chartData.map(({ count }) => count));
  const ariaLabel = `${t('analytics.charts.peakHoursAria')}: ${chartData.map(({ time, count }) => `${time}: ${count}`).join(', ')}`;

  return (
    <ChartPanel title={t('analytics.peakHoursLabel')} ariaLabel={ariaLabel}>
      {chartData.length === 0 ? (
        <p className="flex min-h-[190px] items-center justify-center text-[14px] text-muted-stone">
          {t('analytics.noData')}
        </p>
      ) : (
        <div className="space-y-3.5 py-1">
          {chartData.map(({ time, count }) => (
            <div key={time} className="min-w-0">
              <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[13px] leading-snug">
                <span className="min-w-0 text-deep-charcoal">{time}</span>
                <span className="shrink-0 font-medium tabular-nums text-deep-charcoal">{count}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-[100px] bg-deep-charcoal/[0.07]">
                <div
                  className={`h-full rounded-[100px] ${count > 0 && count === maxCount ? 'bg-burgundy' : 'bg-stone-gray'}`}
                  style={{ width: `${maxCount > 0 ? (count / maxCount) * 100 : 0}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </ChartPanel>
  );
}

import { useTranslation } from 'react-i18next';
import { colors } from '../../utils/colors';

interface StatusBreakdownPieProps {
  reservationsByStatus: Record<string, number>;
}

const STATUS_KEYS: Record<string, string> = {
  confirmed: 'reservations.confirmed',
  pending: 'reservations.pending',
  cancelled: 'reservations.cancelled',
  completed: 'reservations.completed',
  'no-show': 'reservations.noShow',
  no_show: 'reservations.noShow',
  seated: 'reservations.seated',
};

const STATUS_COLORS: Record<string, string> = {
  pending: colors.warmStone,
  confirmed: colors.stoneGray,
  seated: colors.emerald,
  completed: colors.emerald,
  cancelled: colors.amber,
  'no-show': colors.red,
  no_show: colors.red,
};

export default function StatusBreakdownPie({ reservationsByStatus }: StatusBreakdownPieProps) {
  const { t } = useTranslation();
  const rows = Object.entries(reservationsByStatus)
    .filter(([, count]) => Number.isFinite(count) && count > 0)
    .map(([status, count]) => ({
      status,
      count,
      name: STATUS_KEYS[status.toLowerCase()] ? t(STATUS_KEYS[status.toLowerCase()]) : status,
      color: STATUS_COLORS[status.toLowerCase()] ?? colors.mutedStone,
    }))
    .sort((a, b) => b.count - a.count);
  const total = rows.reduce((sum, row) => sum + row.count, 0);

  return (
    <section aria-label={t('analytics.charts.statusBreakdownAria')} className="min-w-0">
      <h3 className="font-serif text-[23px] leading-tight text-deep-charcoal">{t('analytics.statusBreakdown')}</h3>
      {total === 0 ? (
        <p className="py-8 text-[14px] text-muted-stone">{t('analytics.noData')}</p>
      ) : (
        <>
          <div
            role="img"
            aria-label={rows.map(row => `${row.name}: ${row.count}`).join(', ')}
            className="mt-5 flex h-3 w-full overflow-hidden rounded-full bg-deep-charcoal/5"
          >
            {rows.map(row => (
              <span key={row.status} style={{ width: `${(row.count / total) * 100}%`, backgroundColor: row.color }} />
            ))}
          </div>
          <dl className="mt-3 grid grid-cols-1 gap-x-6 md:grid-cols-4">
            {rows.map(row => (
              <div key={row.status} className="flex items-baseline justify-between gap-3 border-b hairline py-2.5">
                <dt className="flex min-w-0 items-center gap-2 text-[13px] text-deep-charcoal">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: row.color }} aria-hidden="true" />
                  <span className="truncate">{row.name}</span>
                </dt>
                <dd className="shrink-0 text-[13px] font-medium tabular-nums text-deep-charcoal">
                  {row.count}<span className="ml-2 font-normal text-muted-stone">{Math.round((row.count / total) * 100)}%</span>
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </section>
  );
}

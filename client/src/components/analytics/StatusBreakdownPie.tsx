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
  pending: '#A58A6A',
  confirmed: '#526B58',
  seated: '#819C82',
  completed: '#819C82',
  cancelled: '#A77A37',
  'no-show': '#A6554C',
  no_show: '#A6554C',
};

export default function StatusBreakdownPie({ reservationsByStatus }: StatusBreakdownPieProps) {
  const { t } = useTranslation();
  // The API can emit both spellings for the same status. Merge them before
  // computing shares, otherwise the report prints two "No-show" rows.
  const normalizedCounts = Object.entries(reservationsByStatus).reduce<Record<string, number>>((counts, [rawStatus, count]) => {
    if (!Number.isFinite(count) || count <= 0) return counts;
    const status = rawStatus.toLowerCase() === 'no_show' ? 'no-show' : rawStatus.toLowerCase();
    counts[status] = (counts[status] ?? 0) + count;
    return counts;
  }, {});
  const rows = Object.entries(normalizedCounts)
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
    <section aria-label={t('analytics.charts.statusBreakdownAria')} className="min-w-0 pb-4">
      <h3 className="font-brand text-[20px] leading-tight tracking-tight text-brand-ink sm:text-[23px]">{t('analytics.statusBreakdown')}</h3>
      {total === 0 ? (
        <p className="py-8 text-[14px] text-muted-stone">{t('analytics.noData')}</p>
      ) : (
        <>
          <div
            role="img"
            aria-label={rows.map(row => `${row.name}: ${row.count}`).join(', ')}
            className="mt-2.5 flex h-2 w-full overflow-hidden rounded-full bg-brand-ink/5 sm:mt-5 sm:h-3"
          >
            {rows.map(row => (
              <span key={row.status} style={{ width: `${(row.count / total) * 100}%`, backgroundColor: row.color }} />
            ))}
          </div>
          <dl className="mt-2 grid grid-cols-1 gap-y-1 max-[359px]:gap-y-0 sm:mt-4 sm:grid-cols-4 sm:gap-x-4 md:gap-x-7">
            {rows.map(row => (
              <div key={row.status} className="flex min-w-0 items-baseline justify-between gap-3 py-0.5 max-[359px]:py-0 sm:block sm:border-t sm:border-brand-line sm:pt-2.5">
                <dt className="flex min-w-0 items-center gap-2 text-[13px] text-brand-ink/75 max-[359px]:text-[12px] sm:text-[12px]">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: row.color }} aria-hidden="true" />
                  <span>{row.name}</span>
                </dt>
                <dd className="shrink-0 font-brand text-[19px] leading-none tabular-nums text-brand-ink max-[359px]:text-[18px] sm:mt-1 sm:text-[20px]">
                  {row.count}<span className="ml-1 text-[12px] font-normal text-brand-ink/65 max-[359px]:text-[11px] sm:ml-2">{Math.round((row.count / total) * 100)}%</span>
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </section>
  );
}

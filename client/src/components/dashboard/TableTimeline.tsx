/**
 * TableTimeline — "Essa mesa libera a tempo?"
 *
 * No celular, o próximo movimento em uma frase; no desktop, uma raia por
 * mesa com movimento. Vive direto no canvas, abaixo do salão.
 *
 * A conta — quem ocupa qual mesa até que horas, e onde há conflito — mora em
 * useServiceTimeline, compartilhada com a página inteira (ServiceScore).
 * Aqui fica só o desenho compacto.
 */
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { Table, ActiveParty, UpcomingReservation } from '../../types/host.types';
import { useServiceTimeline, fmtHour } from '../../hooks/useServiceTimeline';

interface TableTimelineProps {
  tables: Table[];
  activeParties: ActiveParty[];
  todayReservations: UpcomingReservation[];
  night?: boolean;
  /** Injetável para testes — default: relógio real. */
  now?: Date;
}

const MAX_ROWS = 10;

export default function TableTimeline({
  tables,
  activeParties,
  todayReservations,
  night = false,
  now = new Date(),
}: TableTimelineProps) {
  const { t } = useTranslation();
  const { rows, windowStart, windowEnd, conflict, nowMin } =
    useServiceTimeline(tables, activeParties, todayReservations, { now });

  if (rows.length === 0) return null;

  const span = windowEnd - windowStart;
  const pct = (min: number) => Math.max(0, Math.min(100, ((min - windowStart) / span) * 100));
  const visibleRows = rows.slice(0, MAX_ROWS);
  const hiddenCount = Math.max(0, rows.length - MAX_ROWS);
  const currentMinute = now.getHours() * 60 + now.getMinutes();
  const nextEvent = rows.flatMap(({ table, bars }) => bars.flatMap(bar => {
    const minute = bar.kind === 'party' ? bar.endMin : bar.startMin;
    return minute >= currentMinute ? [{ table, bar, minute }] : [];
  })).sort((a, b) => a.minute - b.minute)[0];
  const upcomingConflict = conflict && conflict.freeAt >= currentMinute ? conflict : null;

  // Marcas de hora: passo de 1h até 6h de janela, 2h acima disso.
  const step = span > 360 ? 120 : 60;
  const hourMarks: number[] = [];
  for (let m = windowStart; m <= windowEnd; m += step) hourMarks.push(m);

  const mut = night ? 'text-white/55' : 'text-muted-stone';
  const hair = night ? 'border-white/10' : 'hairline';
  const nowColor = night ? '#E7E7DF' : '#293222';
  const reservedStroke = night ? '#FBBF24' : '#D97706';
  const reservedText = night ? 'text-amber-300' : 'text-amber-700';

  return (
    <section aria-label={t('tableTimeline.title', 'Essa mesa libera a tempo?')}>
      <div className="sm:hidden">
        <div className="flex items-start justify-between gap-3">
          <h2 className={`text-[12px] font-semibold uppercase tracking-[0.12em] ${mut}`}>
            {t('tableTimeline.mobileNext', 'Next table movement')}
          </h2>
          <Link
            to="/host-dashboard/service"
            className={`shrink-0 text-[12px] font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-action ${night ? 'text-white' : 'text-brand-action'}`}
          >
            {t('tableTimeline.mobileViewFull', 'Full service timeline')} <span aria-hidden="true">↗</span>
          </Link>
        </div>
        {upcomingConflict ? (
          <div className="mt-2">
            <p className={`font-brand text-[25px] leading-tight min-[380px]:text-[28px] ${night ? 'text-amber-200' : 'text-red-700'}`}>
              {t('tableTimeline.mobileConflict', { table: upcomingConflict.tableNumber })}
            </p>
            <p className={`mt-1 text-[13px] ${mut}`}>
              {t('tableTimeline.conflictNeeds', 'needs to be ready at')} {fmtHour(upcomingConflict.resStart)}
              {' · '}{t('tableTimeline.conflictBlocked', 'occupied until')} {fmtHour(upcomingConflict.freeAt)}
            </p>
          </div>
        ) : nextEvent ? (
          <div className="mt-2">
            <p className={`font-brand text-[25px] leading-tight tabular-nums min-[380px]:text-[28px] ${night ? 'text-white' : 'text-brand-ink'}`}>
              {t(nextEvent.bar.kind === 'party' ? 'tableTimeline.mobileRelease' : 'tableTimeline.mobileArrival', {
                table: nextEvent.table.table_number,
                time: fmtHour(nextEvent.minute),
              })}
            </p>
            <p className={`mt-1 text-[13px] ${mut}`}>
              {nextEvent.bar.guestName !== '—' && <>{nextEvent.bar.guestName} · </>}
              {t('reservations.guestCount', { count: nextEvent.bar.partySize })}
            </p>
          </div>
        ) : (
          <p className={`mt-2 text-[13px] ${mut}`}>{t('tableTimeline.mobileNoUpcoming', 'No more table movements expected today.')}</p>
        )}
      </div>

      <div className="hidden sm:block">
      <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 mb-1">
        <h2 className={`text-[12px] font-semibold uppercase tracking-[0.14em] ${mut}`}>
          {t('tableTimeline.title', 'Essa mesa libera a tempo?')}
        </h2>
        {conflict && (
          <p className={`text-[12px] ${mut}`}>
            {t('tableTimeline.conflictPrefix', 'Mesa')} {conflict.tableNumber}{' '}
            {t('tableTimeline.conflictNeeds', 'precisa estar pronta às')}{' '}
            <strong className={night ? 'text-white font-semibold' : 'text-deep-charcoal font-semibold'}>
              {fmtHour(conflict.resStart)}
            </strong>
            {' — '}
            {t('tableTimeline.conflictBlocked', 'ocupada até')} {fmtHour(conflict.freeAt)} ({conflict.resLabel})
          </p>
        )}
      </div>

      {/* On wider screens the full timeline keeps one lane per table. */}
      <div className="overflow-x-auto">
        <div className="grid grid-cols-[64px_1fr] relative min-w-[560px]" role="list">
          {/* Marcador AGORA — atravessa todas as raias */}
          {nowMin !== null && (
            <div
              aria-hidden="true"
              className="absolute top-0 bottom-6 w-px z-10"
              style={{ left: `calc(64px + (100% - 64px) * ${pct(nowMin) / 100})`, backgroundColor: nowColor, width: '1.5px' }}
            />
          )}

          {visibleRows.map(({ table, bars }, i) => {
            const isLast = i === visibleRows.length - 1;
            return (
              <div key={table.id} role="listitem" className="contents">
                <div
                  className={`sticky left-0 z-20 py-3 pr-2 text-[12px] ${mut} ${
                    night ? 'bg-[#1C1917]' : 'bg-brand-paper'
                  } ${isLast ? '' : `border-b ${hair}`}`}
                >
                  {t('tableLayout.table', 'Mesa')} {table.table_number}
                </div>
                <div className={`relative min-h-[42px] ${isLast ? '' : `border-b ${hair}`}`}>
                  {bars.map((bar) => {
                    const left = pct(bar.startMin);
                    const width = Math.max(6, pct(bar.endMin) - left);
                    const solid = bar.kind === 'party';
                    return (
                      <div
                        key={bar.key}
                        title={`${bar.label} · ${fmtHour(bar.startMin)}–${fmtHour(bar.endMin)}`}
                        className={`absolute top-[9px] h-6 rounded-[46px] flex items-center gap-1 px-2.5 text-[11px] whitespace-nowrap overflow-hidden ${
                          solid
                            ? night ? 'bg-emerald-700 text-white' : 'bg-emerald-800 text-white'
                            : `bg-transparent ${reservedText}`
                        }`}
                        style={{
                          left: `${left}%`,
                          width: `${width}%`,
                          ...(solid ? {} : { border: `1.5px dashed ${reservedStroke}` }),
                        }}
                      >
                        {bar.isVIP && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="flex-shrink-0">
                            <path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.3 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z" />
                          </svg>
                        )}
                        <span className="truncate">{bar.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Eixo de horas */}
          <div className={`sticky left-0 z-20 ${night ? 'bg-[#1C1917]' : 'bg-brand-paper'}`} />
          <div className="relative h-6">
            <div className={`absolute inset-x-0 top-2 h-3.5 font-mono text-[10px] ${mut}`}>
              {hourMarks.map((m, i) => (
                <span
                  key={m}
                  className="absolute"
                  style={
                    i === 0
                      ? { left: 0 }
                      : i === hourMarks.length - 1
                        ? { right: 0 }
                        : { left: `${pct(m)}%`, transform: 'translateX(-50%)' }
                  }
                >
                  {fmtHour(m)}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {hiddenCount > 0 && (
        <p className={`text-[11px] mt-1 ${mut}`}>
          +{hiddenCount} {t('tableTimeline.moreTables', 'mesas com movimento fora da régua')}
        </p>
      )}
      </div>
    </section>
  );
}

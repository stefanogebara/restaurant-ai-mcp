/**
 * TableTimeline — "Essa mesa libera a tempo?"
 *
 * A régua compacta do serviço, no dashboard: uma raia por mesa com
 * movimento, barras sólidas em burgundy para quem está na casa e pílulas
 * tracejadas em âmbar para reservas que ainda chegam. Vive direto no canvas
 * (fios de tinta, sem card), abaixo do salão.
 *
 * A conta — quem ocupa qual mesa até que horas, e onde há conflito — mora em
 * useServiceTimeline, compartilhada com a página inteira (ServiceScore).
 * Aqui fica só o desenho compacto.
 */
import { useTranslation } from 'react-i18next';
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
  const { rows, windowStart, windowEnd, conflict, hiddenCount, nowMin } =
    useServiceTimeline(tables, activeParties, todayReservations, { maxRows: MAX_ROWS, now });

  if (rows.length === 0) return null;

  const span = windowEnd - windowStart;
  const pct = (min: number) => Math.max(0, Math.min(100, ((min - windowStart) / span) * 100));

  // Marcas de hora: passo de 1h até 6h de janela, 2h acima disso.
  const step = span > 360 ? 120 : 60;
  const hourMarks: number[] = [];
  for (let m = windowStart; m <= windowEnd; m += step) hourMarks.push(m);

  const mut = night ? 'text-white/55' : 'text-muted-stone';
  const hair = night ? 'border-white/10' : 'hairline';
  const nowColor = night ? '#FDA4AF' : '#9F1239';
  const reservedStroke = night ? '#FBBF24' : '#D97706';
  const reservedText = night ? 'text-amber-300' : 'text-amber-700';

  return (
    <section aria-label={t('tableTimeline.title', 'Essa mesa libera a tempo?')}>
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

      {/* Mobile: a régua ROLA em vez de comprimir. Abaixo de ~560px as barras
          viravam lascas de 40px com o nome truncado — informação nenhuma. A
          coluna das mesas fica grudada à esquerda para você nunca perder de
          vista de que raia está olhando. */}
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

          {rows.map(({ table, bars }, i) => {
            const isLast = i === rows.length - 1;
            return (
              <div key={table.id} role="listitem" className="contents">
                <div
                  className={`sticky left-0 z-20 py-3 pr-2 text-[12px] backdrop-blur-sm ${mut} ${
                    night ? 'bg-[#1C1917]/85' : 'bg-[#FAFAF9]/85'
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
                            ? 'bg-burgundy text-white'
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
          <div className={`sticky left-0 z-20 backdrop-blur-sm ${night ? 'bg-[#1C1917]/85' : 'bg-[#FAFAF9]/85'}`} />
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
    </section>
  );
}

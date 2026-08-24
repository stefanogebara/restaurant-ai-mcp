/**
 * ServiceScore — "A Partitura": a noite inteira numa página.
 *
 * A régua do dashboard é um resumo; aqui as raias por mesa SÃO a página.
 * Cada linha abre com a mesa ilustrada em miniatura (a "clave"), as mesas
 * são agrupadas por zona do salão, e o marcador AGORA atravessa tudo.
 *
 * Diferente da régua compacta, mostra também as mesas paradas — uma mesa
 * vazia a noite toda é informação, não ausência de informação.
 */
import { useTranslation } from 'react-i18next';
import type { Table, ActiveParty, UpcomingReservation } from '../../types/host.types';
import { useServiceTimeline, fmtHour, type TimelineRow } from '../../hooks/useServiceTimeline';
import TableClef from './TableClef';

interface ServiceScoreProps {
  tables: Table[];
  activeParties: ActiveParty[];
  todayReservations: UpcomingReservation[];
  night?: boolean;
  now?: Date;
}

/** Agrupa as raias por zona preservando a ordem de número de mesa. */
function groupByZone(rows: TimelineRow[]): Array<{ zone: string; rows: TimelineRow[] }> {
  const out: Array<{ zone: string; rows: TimelineRow[] }> = [];
  for (const row of rows) {
    const zone = row.table.location || 'Main';
    const bucket = out.find((g) => g.zone === zone);
    if (bucket) bucket.rows.push(row);
    else out.push({ zone, rows: [row] });
  }
  return out;
}

export default function ServiceScore({
  tables,
  activeParties,
  todayReservations,
  night = false,
  now = new Date(),
}: ServiceScoreProps) {
  const { t } = useTranslation();
  const { rows, windowStart, windowEnd, conflict, nowMin } = useServiceTimeline(
    tables, activeParties, todayReservations, { includeIdleTables: true, now },
  );

  const mut = night ? 'text-white/55' : 'text-muted-stone';
  const hair = night ? 'border-white/10' : 'hairline';
  const nowColor = night ? '#FDA4AF' : '#9F1239';
  const reservedStroke = night ? '#FBBF24' : '#D97706';
  const reservedText = night ? 'text-amber-300' : 'text-amber-700';

  if (rows.length === 0) {
    return (
      <div className="text-center py-20">
        <p className={`font-serif text-[26px] ${night ? 'text-white' : 'text-deep-charcoal'}`}>
          {t('serviceScore.emptyTitle', 'Nenhum movimento no serviço de hoje')}
        </p>
        <p className={`text-[15px] mt-1.5 ${mut}`}>
          {t('serviceScore.emptyHint', 'Assim que houver reservas ou grupos na casa, a noite aparece aqui hora a hora.')}
        </p>
      </div>
    );
  }

  const span = windowEnd - windowStart;
  const pct = (min: number) => Math.max(0, Math.min(100, ((min - windowStart) / span) * 100));
  const step = span > 360 ? 120 : 60;
  const hourMarks: number[] = [];
  for (let m = windowStart; m <= windowEnd; m += step) hourMarks.push(m);

  // A coluna da clave é larga o bastante para mesa + número de lugares.
  const LANE_LABEL = 'grid-cols-[104px_1fr]';
  const stickyBg = night ? 'bg-[#1C1917]/85' : 'bg-[#FAFAF9]/85';

  const hoursAxis = (
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
  );

  return (
    <section aria-label={t('serviceScore.title', 'A noite inteira, numa página')}>
      {conflict && (
        <p className={`text-[15px] mb-6 ${mut}`}>
          {t('tableTimeline.conflictPrefix', 'Mesa')} {conflict.tableNumber}{' '}
          {t('tableTimeline.conflictNeeds', 'precisa estar pronta às')}{' '}
          <strong className={night ? 'text-white font-semibold' : 'text-deep-charcoal font-semibold'}>
            {fmtHour(conflict.resStart)}
          </strong>
          {' — '}
          {t('tableTimeline.conflictBlocked', 'ocupada até')} {fmtHour(conflict.freeAt)} ({conflict.resLabel})
        </p>
      )}

      {/* A pauta rola em bloco: o eixo do topo, as raias e o eixo do rodapé
          precisam compartilhar o MESMO sistema de coordenadas. */}
      <div className="overflow-x-auto">
        <div className="min-w-[680px] relative">
          {/* Marcador AGORA — atravessa a partitura inteira */}
          {nowMin !== null && (
            <>
              <div
                aria-hidden="true"
                className="absolute top-6 bottom-8 w-px z-10"
                style={{ left: `calc(104px + (100% - 104px) * ${pct(nowMin) / 100})`, backgroundColor: nowColor, width: '1.5px' }}
              />
              <div
                className="absolute top-0 z-20 font-mono text-[9px] tracking-[0.1em] px-2 py-0.5 rounded-[100px] text-white"
                style={{
                  left: `calc(104px + (100% - 104px) * ${pct(nowMin) / 100})`,
                  transform: 'translateX(-50%)',
                  backgroundColor: nowColor,
                }}
              >
                {t('serviceScore.nowMarker', 'AGORA')} {fmtHour(nowMin)}
              </div>
            </>
          )}

          {/* Eixo de horas no topo */}
          <div className={`grid ${LANE_LABEL} pt-6`}>
            <div />
            <div className={`relative h-6 border-b ${hair}`}>{hoursAxis}</div>
          </div>

          {groupByZone(rows).map(({ zone, rows: zoneRows }) => (
            <div key={zone}>
              <p className={`text-[10px] font-semibold uppercase tracking-[0.16em] pt-5 pb-2 ${mut}`}>
                {t(`floorPlan.location.${zone.toLowerCase()}`, zone)}
              </p>
              <div className={`grid ${LANE_LABEL}`} role="list">
                {zoneRows.map((row) => {
                  const seated = row.bars.find((b) => b.kind === 'party');
                  return (
                    <div key={row.table.id} role="listitem" className="contents">
                      <div className={`sticky left-0 z-20 flex items-center gap-2.5 py-2 pr-3 backdrop-blur-sm ${stickyBg} border-b ${hair}`}>
                        <TableClef table={row.table} seatedGuests={seated?.partySize ?? 0} night={night} />
                        <span className={`text-[11px] ${mut}`}>
                          {row.table.capacity} {t('floorPlan.seats', 'lug.')}
                        </span>
                      </div>
                      <div className={`relative min-h-[62px] border-b ${hair}`}>
                        {row.bars.map((bar) => {
                          const left = pct(bar.startMin);
                          const width = Math.max(6, pct(bar.endMin) - left);
                          const solid = bar.kind === 'party';
                          return (
                            <div
                              key={bar.key}
                              title={`${bar.label} · ${fmtHour(bar.startMin)}–${fmtHour(bar.endMin)}`}
                              className={`absolute top-[18px] h-7 rounded-[46px] flex items-center gap-1.5 px-3 text-[12px] whitespace-nowrap overflow-hidden ${
                                solid ? 'bg-burgundy text-white' : `bg-transparent ${reservedText}`
                              }`}
                              style={{
                                left: `${left}%`,
                                width: `${width}%`,
                                ...(solid ? {} : { border: `1.5px dashed ${reservedStroke}` }),
                              }}
                            >
                              {bar.isVIP && (
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="flex-shrink-0">
                                  <path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.3 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z" />
                                </svg>
                              )}
                              <span className="truncate">{bar.label}</span>
                            </div>
                          );
                        })}
                        {row.bars.length === 0 && (
                          <span className={`absolute top-[24px] left-2 text-[11px] ${mut}`}>
                            {t('serviceScore.idleTable', 'livre a noite toda')}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Eixo de horas no rodapé — a pauta é alta, o host não deve voltar ao topo */}
          <div className={`grid ${LANE_LABEL}`}>
            <div className={`sticky left-0 z-20 backdrop-blur-sm ${stickyBg}`} />
            <div className="relative h-8">{hoursAxis}</div>
          </div>
        </div>
      </div>
    </section>
  );
}

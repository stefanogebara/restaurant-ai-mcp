/**
 * TableTimeline — "Essa mesa libera a tempo?"
 *
 * A régua do serviço: uma raia por mesa, barras sólidas em burgundy para
 * quem está na casa (seated → estimated_departure) e pílulas tracejadas
 * em âmbar para reservas que ainda chegam. O marcador AGORA atravessa
 * tudo. Vive direto no canvas (fios de tinta, sem card), abaixo do salão.
 *
 * Responde a pergunta que o host faz de relance no rush: a mesa da
 * próxima reserva libera antes do grupo chegar? Quando não libera, o
 * cabeçalho aponta o conflito mais próximo.
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Table, ActiveParty, UpcomingReservation } from '../../types/host.types';

interface TableTimelineProps {
  tables: Table[];
  activeParties: ActiveParty[];
  todayReservations: UpcomingReservation[];
  night?: boolean;
  /** Injetável para testes — default: relógio real. */
  now?: Date;
}

interface Bar {
  key: string;
  startMin: number;
  endMin: number;
  label: string;
  kind: 'party' | 'reservation';
  isVIP?: boolean;
}

const RESERVATION_DEFAULT_MIN = 105; // duração presumida de uma reserva sem serviço aberto
const MAX_ROWS = 10;

const timeToMin = (hhmm: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm || '');
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
};

const isoToMin = (iso: string, ref: Date): number | null => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  // Minutos relativos à meia-noite do dia de referência — uma saída prevista
  // depois da meia-noite continua crescendo (25h) em vez de voltar a 0.
  const midnight = new Date(ref);
  midnight.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - midnight.getTime()) / 60_000);
};

const fmtHour = (min: number) => {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const firstName = (name: string) => (name || '').trim().split(' ')[0] || '—';

export default function TableTimeline({
  tables,
  activeParties,
  todayReservations,
  night = false,
  now = new Date(),
}: TableTimelineProps) {
  const { t } = useTranslation();

  const { rows, windowStart, windowEnd, conflict, hiddenCount } = useMemo(() => {
    const barsByTable = new Map<string, Bar[]>();
    const push = (tableId: string, bar: Bar) => {
      const list = barsByTable.get(tableId) ?? [];
      list.push(bar);
      barsByTable.set(tableId, list);
    };

    activeParties.forEach((p) => {
      const start = isoToMin(p.seated_at, now);
      const end = isoToMin(p.estimated_departure, now);
      if (start === null) return;
      const safeEnd = end !== null && end > start ? end : start + RESERVATION_DEFAULT_MIN;
      (p.tables || []).forEach((tid) =>
        push(tid, {
          key: `party-${p.service_id}-${tid}`,
          startMin: start,
          endMin: safeEnd,
          label: `${firstName(p.customer_name)} · ${p.party_size}p`,
          kind: 'party',
          isVIP: p.is_vip,
        }),
      );
    });

    todayReservations.forEach((r) => {
      if (r.checked_in) return; // já virou parte ativa — a barra sólida cobre
      const start = timeToMin(r.time || r.reservation_time);
      if (start === null) return;
      (r.table_ids || []).forEach((tid) =>
        push(tid, {
          key: `res-${r.reservation_id}-${tid}`,
          startMin: start,
          endMin: start + RESERVATION_DEFAULT_MIN,
          label: `${firstName(r.customer_name)} · ${r.party_size}p`,
          kind: 'reservation',
        }),
      );
    });

    if (barsByTable.size === 0) {
      return { rows: [], windowStart: 0, windowEnd: 0, conflict: null, hiddenCount: 0 };
    }

    let minStart = Infinity;
    let maxEnd = -Infinity;
    barsByTable.forEach((bars) =>
      bars.forEach((b) => {
        minStart = Math.min(minStart, b.startMin);
        maxEnd = Math.max(maxEnd, b.endMin);
      }),
    );
    // Janela em horas cheias, mínimo de 4h — a régua respira em vez de colar
    // as barras nas bordas.
    let ws = Math.floor(minStart / 60) * 60;
    let we = Math.ceil(maxEnd / 60) * 60;
    if (we - ws < 240) {
      const pad = Math.ceil((240 - (we - ws)) / 120) * 60;
      ws -= pad;
      we += pad;
    }

    const allRows = [...barsByTable.entries()]
      .map(([tableId, bars]) => ({
        table: tables.find((tb) => tb.id === tableId),
        bars: bars.sort((a, b) => a.startMin - b.startMin),
      }))
      .filter((r): r is { table: Table; bars: Bar[] } => !!r.table)
      .sort((a, b) => (Number(a.table.table_number) || 0) - (Number(b.table.table_number) || 0));

    // Conflito mais próximo: reserva cuja mesa ainda estará ocupada na hora
    // da chegada (saída prevista do grupo atual > início da reserva).
    let foundConflict: { tableNumber: number; resLabel: string; resStart: number; freeAt: number } | null = null;
    for (const row of allRows) {
      const parties = row.bars.filter((b) => b.kind === 'party');
      const reservations = row.bars.filter((b) => b.kind === 'reservation');
      for (const res of reservations) {
        const blocking = parties.find((p) => p.startMin < res.startMin && p.endMin > res.startMin);
        if (blocking && (!foundConflict || res.startMin < foundConflict.resStart)) {
          foundConflict = {
            tableNumber: row.table.table_number,
            resLabel: res.label,
            resStart: res.startMin,
            freeAt: blocking.endMin,
          };
        }
      }
    }

    return {
      rows: allRows.slice(0, MAX_ROWS),
      windowStart: ws,
      windowEnd: we,
      conflict: foundConflict,
      hiddenCount: Math.max(0, allRows.length - MAX_ROWS),
    };
  }, [tables, activeParties, todayReservations, now]);

  if (rows.length === 0) return null;

  const span = windowEnd - windowStart;
  const pct = (min: number) => Math.max(0, Math.min(100, ((min - windowStart) / span) * 100));
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const nowVisible = nowMin > windowStart && nowMin < windowEnd;

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
          {nowVisible && (
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

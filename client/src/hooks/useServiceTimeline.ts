/**
 * useServiceTimeline — a matemática da noite, num lugar só.
 *
 * Converte grupos na casa + reservas do dia em raias por mesa, calcula a
 * janela de horas e acha o conflito mais próximo (mesa ainda ocupada quando
 * a próxima reserva chega).
 *
 * Consumido por DOIS componentes com densidades diferentes: a régua compacta
 * do dashboard (TableTimeline) e a página inteira (ServiceScore/"A
 * Partitura"). Eles desenham diferente, mas não podem DISCORDAR sobre quem
 * está em qual mesa até que horas — por isso a conta vive aqui.
 */
import { useMemo } from 'react';
import type { Table, ActiveParty, UpcomingReservation } from '../types/host.types';

/** Duração presumida de uma reserva que ainda não virou serviço aberto. */
export const RESERVATION_DEFAULT_MIN = 105;

export interface TimelineBar {
  key: string;
  startMin: number;
  endMin: number;
  label: string;
  guestName: string;
  partySize: number;
  kind: 'party' | 'reservation';
  isVIP?: boolean;
}

export interface TimelineRow {
  table: Table;
  bars: TimelineBar[];
}

export interface TimelineConflict {
  tableNumber: number;
  resLabel: string;
  resStart: number;
  freeAt: number;
}

export interface ServiceTimelineOptions {
  /** Teto de raias; o excedente vira `hiddenCount`. Sem valor = todas. */
  maxRows?: number;
  /** Inclui mesas sem movimento algum — a página inteira quer mostrá-las. */
  includeIdleTables?: boolean;
  /** Injetável para testes. */
  now?: Date;
}

export interface ServiceTimeline {
  rows: TimelineRow[];
  windowStart: number;
  windowEnd: number;
  conflict: TimelineConflict | null;
  hiddenCount: number;
  /** Minutos desde a meia-noite; `null` quando fora da janela desenhada. */
  nowMin: number | null;
}

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

export const fmtHour = (min: number): string => {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

export const firstName = (name: string): string => (name || '').trim().split(' ')[0] || '—';

export function useServiceTimeline(
  tables: Table[],
  activeParties: ActiveParty[],
  todayReservations: UpcomingReservation[],
  options: ServiceTimelineOptions = {},
): ServiceTimeline {
  const { maxRows, includeIdleTables = false, now = new Date() } = options;

  return useMemo(() => {
    const empty: ServiceTimeline = {
      rows: [], windowStart: 0, windowEnd: 0, conflict: null, hiddenCount: 0, nowMin: null,
    };

    const barsByTable = new Map<string, TimelineBar[]>();
    const push = (tableId: string, bar: TimelineBar) => {
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
          guestName: firstName(p.customer_name),
          partySize: p.party_size,
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
          guestName: firstName(r.customer_name),
          partySize: r.party_size,
          kind: 'reservation',
        }),
      );
    });

    if (barsByTable.size === 0) return empty;

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
    let windowStart = Math.floor(minStart / 60) * 60;
    let windowEnd = Math.ceil(maxEnd / 60) * 60;
    if (windowEnd - windowStart < 240) {
      const pad = Math.ceil((240 - (windowEnd - windowStart)) / 120) * 60;
      windowStart -= pad;
      windowEnd += pad;
    }

    const source = includeIdleTables
      ? tables.map((table) => ({ table, bars: barsByTable.get(table.id) ?? [] }))
      : [...barsByTable.entries()].map(([tableId, bars]) => ({
          table: tables.find((tb) => tb.id === tableId),
          bars,
        }));

    const allRows = source
      .filter((r): r is TimelineRow => !!r.table)
      .map((r) => ({ ...r, bars: [...r.bars].sort((a, b) => a.startMin - b.startMin) }))
      .sort((a, b) => (Number(a.table.table_number) || 0) - (Number(b.table.table_number) || 0));

    // Conflito mais próximo: reserva cuja mesa ainda estará ocupada na hora
    // da chegada (saída prevista do grupo atual > início da reserva).
    let conflict: TimelineConflict | null = null;
    for (const row of allRows) {
      const parties = row.bars.filter((b) => b.kind === 'party');
      for (const res of row.bars.filter((b) => b.kind === 'reservation')) {
        const blocking = parties.find((p) => p.startMin < res.startMin && p.endMin > res.startMin);
        if (blocking && (!conflict || res.startMin < conflict.resStart)) {
          conflict = {
            tableNumber: row.table.table_number,
            resLabel: res.label,
            resStart: res.startMin,
            freeAt: blocking.endMin,
          };
        }
      }
    }

    const clockMin = now.getHours() * 60 + now.getMinutes();

    return {
      rows: maxRows ? allRows.slice(0, maxRows) : allRows,
      windowStart,
      windowEnd,
      conflict,
      hiddenCount: maxRows ? Math.max(0, allRows.length - maxRows) : 0,
      nowMin: clockMin > windowStart && clockMin < windowEnd ? clockMin : null,
    };
  }, [tables, activeParties, todayReservations, maxRows, includeIdleTables, now]);
}

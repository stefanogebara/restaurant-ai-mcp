import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../common/ThiingsIcon';
import type { AnalyticsData } from '../../hooks/useAnalytics';
import { toCsv, downloadCsv } from '../../utils/exportCsv';

interface Props {
  data: AnalyticsData;
  dateLabel: string;
  onExportAll: () => void;
  isExporting: boolean;
}

export default function ExportDropdown({ data, dateLabel, onExportAll, isExporting }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const dl = (name: string, rows: Record<string, unknown>[], cols: string[]) => {
    downloadCsv(`${name}-${dateLabel}.csv`, toCsv(rows, cols));
    setOpen(false);
  };

  const hasReservations = !!data.raw_reservations;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        disabled={isExporting}
        className="flex items-center gap-1.5 px-4 py-2 bg-white/60 backdrop-blur-glass-chip border border-glass-border-dark text-stone-gray hover:bg-white/85 hover:border-muted-stone rounded-xl text-[13px] font-medium transition-colors"
      >
        {isExporting
          ? <span className="w-4 h-4 border border-stone-gray border-t-transparent rounded-full animate-spin inline-block" />
          : <ThiingsIcon name="download" pxSize={14} />
        }
        {t('analytics.export.export', 'Export')}
        <ThiingsIcon name="chevron-down" pxSize={12} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 glass-panel rounded-xl shadow-lg min-w-[210px] py-1">
          <button
            type="button"
            disabled={!hasReservations}
            onClick={() => dl('reservations', (data.raw_reservations ?? []).map(r => ({
              date: r.date, time: r.time, name: r.customer_name,
              party_size: r.party_size, status: r.status, id: r.reservation_id,
            })), ['date', 'time', 'name', 'party_size', 'status', 'id'])}
            className={`w-full text-left px-4 py-2.5 text-sm text-stone-gray transition-colors ${hasReservations ? 'hover:bg-soft-gray' : 'opacity-40 cursor-not-allowed'}`}
          >
            {t('analytics.export.reservationsCsv', 'Reservations CSV')}
            {!hasReservations && <span className="ml-1 text-xs text-muted-stone">({t('analytics.export.useAllFirst', 'use All first')})</span>}
          </button>

          <button
            type="button"
            onClick={() => dl('summary', (data.daily_trend ?? []).map(d => ({
              date: d.date, day: d.dayName,
              reservations: d.reservations, completed_services: d.completed_services,
            })), ['date', 'day', 'reservations', 'completed_services'])}
            className="w-full text-left px-4 py-2.5 text-sm text-stone-gray hover:bg-soft-gray transition-colors"
          >
            {t('analytics.export.summaryCsv', 'Summary CSV')}
          </button>

          <button
            type="button"
            onClick={() => dl('tables', (data.table_utilization ?? []).map(t => ({
              table: t.table_number, capacity: t.capacity, location: t.location,
              times_used: t.times_used, utilization_pct: t.utilization_rate,
            })), ['table', 'capacity', 'location', 'times_used', 'utilization_pct'])}
            className="w-full text-left px-4 py-2.5 text-sm text-stone-gray hover:bg-soft-gray transition-colors"
          >
            {t('analytics.export.tablesCsv', 'Tables CSV')}
          </button>

          <div className="border-t border-glass-border-dark my-1" />

          <button
            type="button"
            onClick={() => { onExportAll(); setOpen(false); }}
            className="w-full text-left px-4 py-2.5 text-sm font-semibold text-deep-charcoal hover:bg-soft-gray transition-colors"
          >
            {t('analytics.export.downloadAll', 'Download All')}
          </button>
        </div>
      )}
    </div>
  );
}

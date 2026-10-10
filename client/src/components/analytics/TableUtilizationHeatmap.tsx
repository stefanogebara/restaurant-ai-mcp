import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import ChartPanel from './ChartPanel';

interface TableUtilizationHeatmapProps {
  tableUtilization: Array<{
    table_number: number;
    capacity: number;
    location: string;
    times_used: number;
    utilization_rate: string | number;
  }>;
}

export default function TableUtilizationHeatmap({ tableUtilization }: TableUtilizationHeatmapProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const tables = [...tableUtilization].filter(Boolean).sort((a, b) => b.times_used - a.times_used || a.table_number - b.table_number);
  const visibleTables = expanded ? tables : tables.slice(0, 4);
  const maxUses = Math.max(0, ...tables.map(table => table.times_used));

  // The API's "utilization_rate" is a share of all completed service records,
  // not occupied minutes or available seating time. Show the underlying count
  // so this chart cannot be mistaken for actual table occupancy.
  return (
    <ChartPanel title={t('analytics.tableServiceFrequency', 'Recorded services by table')}>
      <p className="text-[13px] text-muted-stone mb-5">
        {t('analytics.tableServiceFrequencyNote', 'All dates · service frequency, not time occupied.')}
      </p>
      {maxUses === 0 ? (
        <p className="text-sm text-muted-stone py-8 text-center">
          {t('analytics.noTableUtilizationData', 'No table usage data yet')}
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-7 gap-y-4">
          {visibleTables.map(table => (
            <div key={table.table_number} className="grid grid-cols-[5rem_1fr_auto] items-center gap-3 min-w-0">
              <span className="text-[13px] text-deep-charcoal truncate">
                {t('floorPlan.tableLabel')} {table.table_number}
              </span>
              <div className="h-1.5 rounded-full bg-deep-charcoal/[0.07] overflow-hidden" aria-hidden="true">
                <div
                  className="h-full rounded-full bg-warm-stone"
                  style={{ width: `${(table.times_used / maxUses) * 100}%` }}
                />
              </div>
              <span className="font-mono text-[12px] tabular-nums text-deep-charcoal text-right min-w-[3rem]">
                {table.times_used}
              </span>
            </div>
          ))}
        </div>
      )}
      {tables.length > 4 && maxUses > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(value => !value)}
          aria-expanded={expanded}
          className="mt-5 min-h-[44px] text-[13px] font-medium text-burgundy underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-burgundy"
        >
          {expanded ? t('analytics.showFewerTables', 'Show fewer tables') : t('analytics.showAllTables', 'Show all {{count}} tables', { count: tables.length })}
        </button>
      )}
    </ChartPanel>
  );
}

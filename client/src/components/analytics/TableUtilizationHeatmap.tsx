import { useTranslation } from 'react-i18next';

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
  // Get utilization as number for color calculations
  const getUtilizationValue = (percentage: string | number): number => {
    if (typeof percentage === 'number') return percentage;
    return parseFloat(String(percentage).replace('%', '')) || 0;
  };

  // Determine color based on utilization percentage
  const getUtilizationColor = (percentage: string | number): string => {
    const value = getUtilizationValue(percentage);

    if (value >= 75) return 'bg-burgundy/80 border-burgundy'; // High utilization
    if (value >= 50) return 'bg-amber-600/60 border-amber-600'; // Medium-high
    if (value >= 25) return 'bg-warm-stone/40 border-warm-stone'; // Medium-low
    return 'bg-soft-gray border-muted-stone'; // Low utilization
  };

  // Get text color for contrast
  const getTextColor = (percentage: string | number): string => {
    const value = getUtilizationValue(percentage);
    return value >= 50 ? 'text-white' : 'text-deep-charcoal';
  };

  // Sort tables by number
  const sortedTables = [...tableUtilization].sort((a, b) => a.table_number - b.table_number);

  // Find most and least used tables
  const mostUsed = sortedTables.reduce((max, table) =>
    getUtilizationValue(table.utilization_rate) > getUtilizationValue(max.utilization_rate) ? table : max
  , sortedTables[0]);

  const leastUsed = sortedTables.reduce((min, table) =>
    getUtilizationValue(table.utilization_rate) < getUtilizationValue(min.utilization_rate) ? table : min
  , sortedTables[0]);

  return (
    <div className="bg-white border border-border-gray rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-6 py-5 border-b border-soft-gray">
        <span className="text-[15px] font-semibold tracking-tight">{t('analytics.bookingHeatmap')}</span>
        <span className="text-[11px] font-semibold bg-burgundy/[8%] text-burgundy px-2.5 py-0.5 rounded-full">{t('analytics.peakHoursLabel')}</span>
      </div>
      <div className="p-6">

      {/* Heatmap Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-6">
        {sortedTables.map((table) => (
          <div
            key={table.table_number}
            className={`
              ${getUtilizationColor(table.utilization_rate)}
              ${getTextColor(table.utilization_rate)}
              border rounded-xl p-4 transition-colors duration-200
              flex flex-col items-center justify-center text-center
            `}
          >
            <div className="text-2xl font-bold mb-1">
              {table.table_number}
            </div>
            <div className="text-xs font-semibold mb-1">
              {table.utilization_rate}%
            </div>
            <div className="text-[10px] opacity-80">
              {table.times_used} {t('analytics.services')}
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mb-4 text-xs flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-burgundy/80 border-2 border-burgundy"></div>
          <span className="text-warm-stone">{t('analytics.highUtilization')}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-amber-600/60 border-2 border-amber-600"></div>
          <span className="text-warm-stone">{t('analytics.mediumHighUtilization')}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-warm-stone/40 border-2 border-warm-stone"></div>
          <span className="text-warm-stone">{t('analytics.mediumLowUtilization')}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-soft-gray border-2 border-muted-stone"></div>
          <span className="text-warm-stone">{t('analytics.lowUtilization')}</span>
        </div>
      </div>

      {/* Insights */}
      <div className="space-y-2">
        <div className="p-3 bg-burgundy/10 border border-burgundy/20 rounded-xl">
          <p className="text-xs text-warm-stone">
            <span className="font-semibold text-deep-charcoal">{t('analytics.mostUsed')}:</span>{' '}
            Table {mostUsed.table_number} ({mostUsed.utilization_rate}%) - {mostUsed.times_used} {t('analytics.services')}
          </p>
        </div>
        <div className="p-3 bg-soft-gray/50 border border-border-gray/50 rounded-xl">
          <p className="text-xs text-warm-stone">
            <span className="font-semibold text-deep-charcoal">{t('analytics.leastUsed')}:</span>{' '}
            Table {leastUsed.table_number} ({leastUsed.utilization_rate}%) - {leastUsed.times_used} {t('analytics.services')}
          </p>
        </div>
      </div>
      </div>
    </div>
  );
}

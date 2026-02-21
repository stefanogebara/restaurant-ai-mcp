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
  // Get utilization as number for color calculations
  const getUtilizationValue = (percentage: string | number): number => {
    if (typeof percentage === 'number') return percentage;
    return parseFloat(String(percentage).replace('%', '')) || 0;
  };

  // Determine color based on utilization percentage
  const getUtilizationColor = (percentage: string | number): string => {
    const value = getUtilizationValue(percentage);

    if (value >= 75) return 'bg-[#9F1239]/80 border-[#9F1239]'; // High utilization
    if (value >= 50) return 'bg-[#d97706]/60 border-[#d97706]'; // Medium-high
    if (value >= 25) return 'bg-[#78716C]/40 border-[#78716C]'; // Medium-low
    return 'bg-[#F5F5F4] border-[#A8A29E]'; // Low utilization
  };

  // Get text color for contrast
  const getTextColor = (percentage: string | number): string => {
    const value = getUtilizationValue(percentage);
    return value >= 50 ? 'text-white' : 'text-[#1C1917]';
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
    <div className="bg-white border border-[#E7E5E4] rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-6 py-5 border-b border-[#F5F5F4]">
        <span className="text-[15px] font-semibold tracking-tight">Booking Heatmap</span>
        <span className="text-[11px] font-semibold bg-[rgba(159,18,57,0.08)] text-[#9F1239] px-2.5 py-0.5 rounded-full">Peak Hours</span>
      </div>
      <div className="p-6">

      {/* Heatmap Grid */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        {sortedTables.map((table) => (
          <div
            key={table.table_number}
            className={`
              ${getUtilizationColor(table.utilization_rate)}
              ${getTextColor(table.utilization_rate)}
              border rounded-lg p-4 transition-colors duration-200
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
              {table.times_used} services
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mb-4 text-xs flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-[#9F1239]/80 border-2 border-[#9F1239]"></div>
          <span className="text-[#78716C]">High (75%+)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-[#d97706]/60 border-2 border-[#d97706]"></div>
          <span className="text-[#78716C]">Medium-High (50-74%)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-[#78716C]/40 border-2 border-[#78716C]"></div>
          <span className="text-[#78716C]">Medium-Low (25-49%)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-[#F5F5F4] border-2 border-[#A8A29E]"></div>
          <span className="text-[#78716C]">Low (&lt;25%)</span>
        </div>
      </div>

      {/* Insights */}
      <div className="space-y-2">
        <div className="p-3 bg-[#9F1239]/10 border border-[#9F1239]/20 rounded-lg">
          <p className="text-xs text-[#78716C]">
            <span className="font-semibold text-[#1C1917]">Most Used:</span>{' '}
            Table {mostUsed.table_number} ({mostUsed.utilization_rate}%) - {mostUsed.times_used} services
          </p>
        </div>
        <div className="p-3 bg-[#F5F5F4]/50 border border-[#E7E5E4]/50 rounded-lg">
          <p className="text-xs text-[#78716C]">
            <span className="font-semibold text-[#1C1917]">Least Used:</span>{' '}
            Table {leastUsed.table_number} ({leastUsed.utilization_rate}%) - {leastUsed.times_used} services
          </p>
        </div>
      </div>
      </div>
    </div>
  );
}

interface TableUtilizationHeatmapProps {
  tableUtilization: Array<{
    table_number: number;
    capacity: number;
    location: string;
    times_used: number;
    utilization_rate: string;
  }>;
}

export default function TableUtilizationHeatmap({ tableUtilization }: TableUtilizationHeatmapProps) {
  // Get utilization as number for color calculations
  const getUtilizationValue = (percentage: string): number => {
    return parseFloat(percentage.replace('%', ''));
  };

  // Determine color based on utilization percentage
  const getUtilizationColor = (percentage: string): string => {
    const value = getUtilizationValue(percentage);

    if (value >= 75) return 'bg-primary/80 border-primary'; // High utilization
    if (value >= 50) return 'bg-accent/60 border-accent-foreground'; // Medium-high
    if (value >= 25) return 'bg-muted-foreground/40 border-muted-foreground'; // Medium-low
    return 'bg-muted/30 border-muted'; // Low utilization
  };

  // Get text color for contrast
  const getTextColor = (percentage: string): string => {
    const value = getUtilizationValue(percentage);
    return value >= 50 ? 'text-primary-foreground' : 'text-foreground';
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
    <div className="bg-card border border-border rounded-lg p-6 shadow-lg">
      <div className="mb-6">
        <h3 className="text-xl font-bold text-foreground mb-1">🔥 Table Utilization Heatmap</h3>
        <p className="text-sm text-muted-foreground">Which tables are used most frequently</p>
      </div>

      {/* Heatmap Grid */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        {sortedTables.map((table) => (
          <div
            key={table.table_number}
            className={`
              ${getUtilizationColor(table.utilization_rate)}
              ${getTextColor(table.utilization_rate)}
              border-2 rounded-lg p-4 transition-all duration-300 hover:scale-105 hover:shadow-xl
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
          <div className="w-4 h-4 rounded bg-primary/80 border-2 border-primary"></div>
          <span className="text-muted-foreground">High (75%+)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-accent/60 border-2 border-accent-foreground"></div>
          <span className="text-muted-foreground">Medium-High (50-74%)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-muted-foreground/40 border-2 border-muted-foreground"></div>
          <span className="text-muted-foreground">Medium-Low (25-49%)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-muted/30 border-2 border-muted"></div>
          <span className="text-muted-foreground">Low (&lt;25%)</span>
        </div>
      </div>

      {/* Insights */}
      <div className="space-y-2">
        <div className="p-3 bg-primary/10 border border-primary/30 rounded-lg">
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">Most Used:</span>{' '}
            Table {mostUsed.table_number} ({mostUsed.utilization_rate}%) - {mostUsed.times_used} services
          </p>
        </div>
        <div className="p-3 bg-muted/50 border border-border rounded-lg">
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">Least Used:</span>{' '}
            Table {leastUsed.table_number} ({leastUsed.utilization_rate}%) - {leastUsed.times_used} services
          </p>
        </div>
      </div>
    </div>
  );
}

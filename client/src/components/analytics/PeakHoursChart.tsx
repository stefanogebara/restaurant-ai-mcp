import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface PeakHoursChartProps {
  reservationsByTimeSlot: Record<string, number>;
}

export default function PeakHoursChart({ reservationsByTimeSlot }: PeakHoursChartProps) {
  // Transform object data into array for Recharts
  const chartData = Object.entries(reservationsByTimeSlot).map(([time, count]) => ({
    time,
    count,
  }));

  // Find max value to determine color intensity
  const maxCount = Math.max(...chartData.map(d => d.count));

  // Custom tooltip with shadcn/ui styling
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
          <p className="text-sm font-semibold text-foreground mb-1">{payload[0].payload.time}</p>
          <p className="text-sm text-primary">
            Reservations: <span className="font-bold">{payload[0].value}</span>
          </p>
        </div>
      );
    }
    return null;
  };

  // Dynamic color based on count (darker = more reservations)
  const getBarColor = (count: number) => {
    const intensity = count / maxCount;
    if (intensity > 0.7) return 'hsl(var(--primary))';
    if (intensity > 0.4) return 'hsl(var(--accent-foreground))';
    return 'hsl(var(--muted-foreground))';
  };

  return (
    <div className="bg-card border border-border rounded-lg p-6 shadow-lg">
      <div className="mb-6">
        <h3 className="text-xl font-bold text-foreground mb-1">⏰ Peak Hours Analysis</h3>
        <p className="text-sm text-muted-foreground">Reservations by time slot</p>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <BarChart
          data={chartData}
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
          <XAxis
            dataKey="time"
            stroke="hsl(var(--muted-foreground))"
            style={{ fontSize: '12px' }}
            angle={-45}
            textAnchor="end"
            height={80}
          />
          <YAxis
            stroke="hsl(var(--muted-foreground))"
            style={{ fontSize: '12px' }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="count" radius={[8, 8, 0, 0]}>
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={getBarColor(entry.count)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Legend explaining color intensity */}
      <div className="mt-4 flex items-center justify-center gap-6 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded" style={{ backgroundColor: 'hsl(var(--primary))' }}></div>
          <span>High Demand</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded" style={{ backgroundColor: 'hsl(var(--accent-foreground))' }}></div>
          <span>Medium Demand</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded" style={{ backgroundColor: 'hsl(var(--muted-foreground))' }}></div>
          <span>Low Demand</span>
        </div>
      </div>
    </div>
  );
}

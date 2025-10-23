import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface DayOfWeekChartProps {
  reservationsByDay: Record<string, number>;
}

export default function DayOfWeekChart({ reservationsByDay }: DayOfWeekChartProps) {
  // Days of the week in order
  const daysOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  // Transform and sort data by day order
  const chartData = daysOrder.map(day => ({
    day: day.substring(0, 3), // Abbreviate to Mon, Tue, etc.
    count: reservationsByDay[day] || 0,
  }));

  // Custom tooltip with shadcn/ui styling
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const fullDay = daysOrder[chartData.findIndex(d => d.day === payload[0].payload.day)];
      return (
        <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
          <p className="text-sm font-semibold text-foreground mb-1">{fullDay}</p>
          <p className="text-sm text-primary">
            Reservations: <span className="font-bold">{payload[0].value}</span>
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-card border border-border rounded-lg p-6 shadow-lg">
      <div className="mb-6">
        <h3 className="text-xl font-bold text-foreground mb-1">📅 Day of Week Pattern</h3>
        <p className="text-sm text-muted-foreground">Weekly reservation distribution</p>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <BarChart
          data={chartData}
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
          <XAxis
            dataKey="day"
            stroke="hsl(var(--muted-foreground))"
            style={{ fontSize: '12px' }}
          />
          <YAxis
            stroke="hsl(var(--muted-foreground))"
            style={{ fontSize: '12px' }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar
            dataKey="count"
            fill="hsl(var(--accent-foreground))"
            radius={[8, 8, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>

      {/* Insight summary */}
      <div className="mt-4 p-4 bg-muted/50 border border-border rounded-lg">
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">Busiest Day:</span>{' '}
          {daysOrder[chartData.findIndex(d => d.count === Math.max(...chartData.map(c => c.count)))]}
          {' '}with {Math.max(...chartData.map(c => c.count))} reservations
        </p>
      </div>
    </div>
  );
}

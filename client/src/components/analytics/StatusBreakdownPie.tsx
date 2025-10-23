import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

interface StatusBreakdownPieProps {
  reservationsByStatus: Record<string, number>;
}

export default function StatusBreakdownPie({ reservationsByStatus }: StatusBreakdownPieProps) {
  // Transform object data into array for Recharts
  const chartData = Object.entries(reservationsByStatus).map(([status, count]) => ({
    name: status.charAt(0).toUpperCase() + status.slice(1), // Capitalize
    value: count,
  }));

  // Color mapping for each status
  const COLORS: Record<string, string> = {
    Pending: 'hsl(var(--muted-foreground))',
    Confirmed: 'hsl(var(--accent-foreground))',
    Seated: 'hsl(var(--primary))',
    Completed: 'oklch(0.6 0.15 145)', // Green
    Cancelled: 'hsl(var(--destructive))',
  };

  // Custom label to show percentage
  const renderLabel = (entry: any) => {
    const percent = ((entry.value / chartData.reduce((sum, e) => sum + e.value, 0)) * 100).toFixed(0);
    return `${percent}%`;
  };

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const total = chartData.reduce((sum, e) => sum + e.value, 0);
      const percent = ((payload[0].value / total) * 100).toFixed(1);
      return (
        <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
          <p className="text-sm font-semibold text-foreground mb-1">{payload[0].name}</p>
          <p className="text-sm" style={{ color: payload[0].payload.fill }}>
            Count: <span className="font-bold">{payload[0].value}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            {percent}% of total reservations
          </p>
        </div>
      );
    }
    return null;
  };

  // Calculate total
  const totalReservations = chartData.reduce((sum, entry) => sum + entry.value, 0);

  return (
    <div className="bg-card border border-border rounded-lg p-6 shadow-lg">
      <div className="mb-6">
        <h3 className="text-xl font-bold text-foreground mb-1">📊 Status Breakdown</h3>
        <p className="text-sm text-muted-foreground">Reservation distribution by status</p>
      </div>

      <div className="flex items-center justify-center">
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={renderLabel}
              outerRadius={100}
              innerRadius={60} // Makes it a donut chart
              fill="#8884d8"
              dataKey="value"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[entry.name] || 'hsl(var(--muted))'} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend
              verticalAlign="bottom"
              height={36}
              formatter={(value, entry: any) => (
                <span className="text-sm text-foreground">
                  {value} ({entry.payload.value})
                </span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Total count */}
      <div className="mt-4 text-center p-4 bg-muted/50 border border-border rounded-lg">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground text-2xl">{totalReservations}</span>
          <br />
          <span className="text-xs">Total Reservations</span>
        </p>
      </div>
    </div>
  );
}

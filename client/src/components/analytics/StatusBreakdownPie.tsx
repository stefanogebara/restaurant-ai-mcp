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
    Pending: '#78716C',
    Confirmed: '#57534E',
    Seated: '#9F1239',
    Completed: '#22c55e',
    Cancelled: '#ef4444',
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
        <div className="bg-white border border-border-gray/50 rounded-xl p-3 shadow-lg">
          <p className="text-sm font-semibold text-deep-charcoal mb-1">{payload[0].name}</p>
          <p className="text-sm" style={{ color: payload[0].payload.fill }}>
            Count: <span className="font-bold">{payload[0].value}</span>
          </p>
          <p className="text-xs text-warm-stone">
            {percent}% of total reservations
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-white border border-border-gray rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-6 py-5 border-b border-soft-gray">
        <span className="text-[15px] font-semibold tracking-tight">Status Breakdown</span>
      </div>
      <div className="p-6">

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
                <Cell key={`cell-${index}`} fill={COLORS[entry.name] || '#A8A29E'} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend
              verticalAlign="bottom"
              height={36}
              formatter={(value, entry: any) => (
                <span className="text-sm text-deep-charcoal">
                  {value} ({entry.payload.value})
                </span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      </div>
    </div>
  );
}

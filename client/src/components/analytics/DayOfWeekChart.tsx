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
        <div className="bg-white border border-[#E7E5E4]/50 rounded-xl p-3 shadow-lg">
          <p className="text-sm font-semibold text-[#1C1917] mb-1">{fullDay}</p>
          <p className="text-sm text-[#9F1239]">
            Reservations: <span className="font-bold">{payload[0].value}</span>
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-white border border-[#E7E5E4]/50 rounded-xl p-6 shadow-sm">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-[#1C1917] tracking-tight mb-1">Day of Week</h3>
        <p className="text-sm text-[#78716C]">Weekly reservation distribution</p>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <BarChart
          data={chartData}
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" opacity={0.3} />
          <XAxis
            dataKey="day"
            stroke="#78716C"
            style={{ fontSize: '12px' }}
          />
          <YAxis
            stroke="#78716C"
            style={{ fontSize: '12px' }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar
            dataKey="count"
            fill="#57534E"
            radius={[8, 8, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>

      {/* Insight summary */}
      <div className="mt-4 p-4 bg-[#F5F5F4]/50 border border-[#E7E5E4]/50 rounded-lg">
        <p className="text-xs text-[#78716C]">
          <span className="font-semibold text-[#1C1917]">Busiest Day:</span>{' '}
          {daysOrder[chartData.findIndex(d => d.count === Math.max(...chartData.map(c => c.count)))]}
          {' '}with {Math.max(...chartData.map(c => c.count))} reservations
        </p>
      </div>
    </div>
  );
}

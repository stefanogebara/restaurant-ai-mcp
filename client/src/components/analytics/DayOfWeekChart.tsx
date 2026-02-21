import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface DayOfWeekChartProps {
  reservationsByDay: Record<string, number>;
}

export default function DayOfWeekChart({ reservationsByDay }: DayOfWeekChartProps) {
  const daysOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  const chartData = daysOrder.map(day => ({
    day: day.substring(0, 3),
    count: reservationsByDay[day] || 0,
  }));

  const maxCount = Math.max(...chartData.map(c => c.count));

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const fullDay = daysOrder[chartData.findIndex(d => d.day === payload[0].payload.day)];
      return (
        <div className="bg-white border border-[#E7E5E4] rounded-xl p-3 shadow-lg">
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
    <div className="bg-white border border-[#E7E5E4] rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-6 py-5 border-b border-[#F5F5F4]">
        <span className="text-[15px] font-semibold tracking-tight">Reservations by Day</span>
      </div>
      <div className="p-6">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart
            data={chartData}
            margin={{ top: 5, right: 10, left: -10, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" opacity={0.3} />
            <XAxis
              dataKey="day"
              stroke="#A8A29E"
              style={{ fontSize: '11px' }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="#A8A29E"
              style={{ fontSize: '11px' }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="count" radius={[6, 6, 0, 0]}>
              {chartData.map((entry) => (
                <Cell
                  key={entry.day}
                  fill={entry.count >= maxCount * 0.8 ? '#9F1239' : '#E7E5E4'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { colors } from '../../utils/colors';

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

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ value: number; payload: { day: string } }> }) => {
    if (active && payload && payload.length) {
      const fullDay = daysOrder[chartData.findIndex(d => d.day === payload[0].payload.day)];
      return (
        <div className="bg-white border border-border-gray rounded-2xl p-3 shadow-lg">
          <p className="text-sm font-semibold text-deep-charcoal mb-1">{fullDay}</p>
          <p className="text-sm text-burgundy">
            Reservations: <span className="font-bold">{payload[0].value}</span>
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-white border border-border-gray rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-6 py-5 border-b border-soft-gray">
        <span className="text-[15px] font-semibold tracking-tight">Reservations by Day</span>
      </div>
      <div role="img" aria-label="Bar chart showing number of reservations by day of the week" className="p-6">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart
            data={chartData}
            margin={{ top: 5, right: 10, left: -10, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke={colors.borderGray} opacity={0.3} />
            <XAxis
              dataKey="day"
              stroke={colors.mutedStone}
              style={{ fontSize: '11px' }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke={colors.mutedStone}
              style={{ fontSize: '11px' }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="count" radius={[6, 6, 0, 0]}>
              {chartData.map((entry) => (
                <Cell
                  key={entry.day}
                  fill={entry.count >= maxCount * 0.8 ? colors.burgundy : colors.borderGray}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

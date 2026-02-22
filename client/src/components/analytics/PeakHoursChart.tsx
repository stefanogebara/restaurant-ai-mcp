import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { colors } from '../../utils/colors';

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
        <div className="bg-white border border-border-gray/50 rounded-xl p-3 shadow-lg">
          <p className="text-sm font-semibold text-deep-charcoal mb-1">{payload[0].payload.time}</p>
          <p className="text-sm text-burgundy">
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
    if (intensity > 0.7) return colors.burgundy;
    if (intensity > 0.4) return colors.stoneGray;
    return colors.warmStone;
  };

  return (
    <div className="bg-white border border-border-gray rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-6 py-5 border-b border-soft-gray">
        <span className="text-[15px] font-semibold tracking-tight">Peak Hours</span>
      </div>
      <div className="p-6">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart
          data={chartData}
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={colors.borderGray} opacity={0.3} />
          <XAxis
            dataKey="time"
            stroke={colors.warmStone}
            style={{ fontSize: '12px' }}
            angle={-45}
            textAnchor="end"
            height={80}
          />
          <YAxis
            stroke={colors.warmStone}
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

      </div>
    </div>
  );
}

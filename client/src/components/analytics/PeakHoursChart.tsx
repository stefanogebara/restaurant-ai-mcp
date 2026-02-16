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
        <div className="bg-white border border-[#E7E5E4]/50 rounded-xl p-3 shadow-lg">
          <p className="text-sm font-semibold text-[#1C1917] mb-1">{payload[0].payload.time}</p>
          <p className="text-sm text-[#9F1239]">
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
    if (intensity > 0.7) return '#9F1239';
    if (intensity > 0.4) return '#57534E';
    return '#78716C';
  };

  return (
    <div className="bg-white border border-[#E7E5E4]/50 rounded-xl p-6 shadow-sm">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-[#1C1917] tracking-tight mb-1">Peak Hours</h3>
        <p className="text-sm text-[#78716C]">Reservations by time slot</p>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <BarChart
          data={chartData}
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" opacity={0.3} />
          <XAxis
            dataKey="time"
            stroke="#78716C"
            style={{ fontSize: '12px' }}
            angle={-45}
            textAnchor="end"
            height={80}
          />
          <YAxis
            stroke="#78716C"
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
      <div className="mt-4 flex items-center justify-center gap-6 text-xs text-[#78716C]">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded" style={{ backgroundColor: '#9F1239' }}></div>
          <span>High Demand</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded" style={{ backgroundColor: '#57534E' }}></div>
          <span>Medium Demand</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded" style={{ backgroundColor: '#78716C' }}></div>
          <span>Low Demand</span>
        </div>
      </div>
    </div>
  );
}

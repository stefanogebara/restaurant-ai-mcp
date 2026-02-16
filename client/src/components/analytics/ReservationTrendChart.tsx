import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface ReservationTrendChartProps {
  dailyTrend: Array<{
    date: string;
    dayName: string;
    reservations: number;
    completed_services: number;
  }>;
}

export default function ReservationTrendChart({ dailyTrend }: ReservationTrendChartProps) {
  // Custom tooltip with shadcn/ui styling
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white border border-[#E7E5E4]/50 rounded-xl p-3 shadow-lg">
          <p className="text-sm font-semibold text-[#1C1917] mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: <span className="font-bold">{entry.value}</span>
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-white border border-[#E7E5E4]/50 rounded-xl p-6 shadow-sm">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-[#1C1917] tracking-tight mb-1">Reservation Trends</h3>
        <p className="text-sm text-[#78716C]">Last 7 days activity</p>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <LineChart
          data={dailyTrend}
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" opacity={0.3} />
          <XAxis
            dataKey="dayName"
            stroke="#78716C"
            style={{ fontSize: '12px' }}
          />
          <YAxis
            stroke="#78716C"
            style={{ fontSize: '12px' }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{
              paddingTop: '20px',
              fontSize: '14px',
            }}
            iconType="line"
          />
          <Line
            type="monotone"
            dataKey="reservations"
            name="Reservations"
            stroke="#9F1239"
            strokeWidth={3}
            dot={{ fill: '#9F1239', r: 5 }}
            activeDot={{ r: 7 }}
          />
          <Line
            type="monotone"
            dataKey="completed_services"
            name="Completed Services"
            stroke="#57534E"
            strokeWidth={3}
            dot={{ fill: '#57534E', r: 5 }}
            activeDot={{ r: 7 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

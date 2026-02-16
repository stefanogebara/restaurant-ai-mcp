import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';

interface TrendChartProps {
  data: any[];
  type?: 'line' | 'bar';
  dataKeys: {
    key: string;
    label: string;
    color: string;
  }[];
  xAxisKey: string;
  height?: number;
  loading?: boolean;
}

export default function TrendChart({
  data,
  type = 'line',
  dataKeys,
  xAxisKey,
  height = 300,
  loading = false
}: TrendChartProps) {
  if (loading) {
    return (
      <div
        className="bg-white border border-[#E7E5E4] rounded-xl p-6 flex items-center justify-center animate-pulse"
        style={{ height }}
      >
        <div className="text-[#78716C]">Loading chart...</div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div
        className="bg-white border border-[#E7E5E4] rounded-xl p-6 flex items-center justify-center"
        style={{ height }}
      >
        <div className="text-center">
          <p className="text-[#78716C]">No data available</p>
          <p className="text-sm text-[#78716C] mt-1">
            Data will appear here once interventions are tracked
          </p>
        </div>
      </div>
    );
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white border border-[#E7E5E4] rounded-lg p-3 shadow-lg">
          <p className="text-sm font-semibold text-[#1C1917] mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center gap-2 text-sm">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-[#78716C]">{entry.name}:</span>
              <span className="font-semibold text-[#1C1917]">{entry.value}</span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  const chartConfig = {
    margin: { top: 5, right: 30, left: 20, bottom: 5 },
    className: 'bg-white border border-[#E7E5E4] rounded-xl p-6'
  };

  return (
    <div className={chartConfig.className}>
      <ResponsiveContainer width="100%" height={height}>
        {type === 'line' ? (
          <LineChart data={data} margin={chartConfig.margin}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" />
            <XAxis
              dataKey={xAxisKey}
              stroke="#78716C"
              tick={{ fill: '#78716C' }}
            />
            <YAxis
              stroke="#78716C"
              tick={{ fill: '#78716C' }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ color: '#1C1917' }}
              iconType="circle"
            />
            {dataKeys.map((item) => (
              <Line
                key={item.key}
                type="monotone"
                dataKey={item.key}
                name={item.label}
                stroke={item.color}
                strokeWidth={2}
                dot={{ fill: item.color, r: 4 }}
                activeDot={{ r: 6 }}
              />
            ))}
          </LineChart>
        ) : (
          <BarChart data={data} margin={chartConfig.margin}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" />
            <XAxis
              dataKey={xAxisKey}
              stroke="#78716C"
              tick={{ fill: '#78716C' }}
            />
            <YAxis
              stroke="#78716C"
              tick={{ fill: '#78716C' }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ color: '#1C1917' }}
              iconType="square"
            />
            {dataKeys.map((item) => (
              <Bar
                key={item.key}
                dataKey={item.key}
                name={item.label}
                fill={item.color}
                radius={[4, 4, 0, 0]}
              />
            ))}
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

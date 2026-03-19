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
import { useTranslation } from 'react-i18next';
import { colors } from '../../utils/colors';
import ThiingsIcon from './ThiingsIcon';

interface TrendChartProps {
  data: Record<string, unknown>[];
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
  const { t } = useTranslation();

  if (loading) {
    return (
      <div
        className="bg-white border border-border-gray rounded-2xl p-6 flex items-center justify-center gap-3"
        style={{ height }}
      >
        <div aria-hidden="true" className="w-5 h-5 border-2 border-burgundy border-t-transparent rounded-full animate-spin" />
        <div role="status" className="text-warm-stone text-sm">{t('common.loadingChart')}</div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div
        className="bg-white border border-border-gray rounded-2xl p-6 flex items-center justify-center"
        style={{ height }}
      >
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-3 bg-soft-gray rounded-2xl flex items-center justify-center">
            <ThiingsIcon name="bar-chart" pxSize={22} />
          </div>
          <p className="text-sm font-semibold text-deep-charcoal">{t('common.noData', 'No data available')}</p>
          <p className="text-xs text-stone-gray mt-1">
            {t('common.noDataDesc', 'Data will appear here once interventions are tracked')}
          </p>
        </div>
      </div>
    );
  }

  const CustomTooltip = ({ active, payload, label }: { active?: boolean; label?: string; payload?: Array<{ name: string; value: number; color: string }> }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white border border-border-gray rounded-2xl p-3 shadow-lg">
          <p className="text-sm font-semibold text-deep-charcoal mb-2">{label}</p>
          {payload.map((entry, index: number) => (
            <div key={index} className="flex items-center gap-2 text-sm">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-warm-stone">{entry.name}:</span>
              <span className="font-semibold text-deep-charcoal">{entry.value}</span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  const chartConfig = {
    margin: { top: 5, right: 30, left: 20, bottom: 5 },
    className: 'bg-white border border-border-gray rounded-2xl p-6'
  };

  return (
    <div className={chartConfig.className}>
      <ResponsiveContainer width="100%" height={height}>
        {type === 'line' ? (
          <LineChart data={data} margin={chartConfig.margin}>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.borderGray} />
            <XAxis
              dataKey={xAxisKey}
              stroke={colors.warmStone}
              tick={{ fill: colors.warmStone }}
            />
            <YAxis
              stroke={colors.warmStone}
              tick={{ fill: colors.warmStone }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ color: colors.deepCharcoal }}
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
            <CartesianGrid strokeDasharray="3 3" stroke={colors.borderGray} />
            <XAxis
              dataKey={xAxisKey}
              stroke={colors.warmStone}
              tick={{ fill: colors.warmStone }}
            />
            <YAxis
              stroke={colors.warmStone}
              tick={{ fill: colors.warmStone }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ color: colors.deepCharcoal }}
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

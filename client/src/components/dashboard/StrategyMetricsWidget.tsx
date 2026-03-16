/**
 * StrategyMetricsWidget
 *
 * The "val_bpb" scoreboard for the autoresearch loop — shows whether
 * the AI strategy is actually moving the 3 key business metrics:
 *   1. No-show rate (target < 5%)
 *   2. Avg revenue per cover (target R$90+)
 *   3. Reservation conversion rate (target > 90%)
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TrendingDown, TrendingUp, Minus, BarChart3, RefreshCw } from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import { useStrategyMetrics } from '../../hooks/useStrategyMetrics';
import { formatCurrency } from '../../utils/currency';
import Spinner from '../common/Spinner';

const METRICS = [
  {
    key: 'no_show' as const,
    label: 'No-show Rate',
    i18nKey: 'strategy.noShowRate',
    summaryKey: 'no_show_rate' as const,
    targetKey: 'no_show_rate' as const,
    unit: '%',
    format: (v: number) => `${v}%`,
    lowerIsBetter: true,
    color: '#9F1239',
    dateKey: 'date' as const,
    valueKey: 'rate' as const,
    targetLabel: '< 5%',
  },
  {
    key: 'revenue' as const,
    label: 'Avg Revenue / Cover',
    i18nKey: 'strategy.avgRevenue',
    summaryKey: 'avg_revenue_per_cover' as const,
    targetKey: 'avg_revenue_per_cover' as const,
    unit: '',
    format: (v: number) => formatCurrency(v),
    lowerIsBetter: false,
    color: '#57534E',
    dateKey: 'week' as const,
    valueKey: 'avg_per_cover' as const,
    targetLabel: '',
  },
  {
    key: 'conversion' as const,
    label: 'Conversion Rate',
    i18nKey: 'strategy.conversionRate',
    summaryKey: 'conversion_rate' as const,
    targetKey: 'conversion_rate' as const,
    unit: '%',
    format: (v: number) => `${v}%`,
    lowerIsBetter: false,
    color: '#292524',
    dateKey: 'date' as const,
    valueKey: 'rate' as const,
    targetLabel: '> 90%',
  },
] as const;

function TrendIcon({ value, target, lowerIsBetter }: { value: number | null; target: number; lowerIsBetter: boolean }) {
  if (value === null) return <Minus className="w-4 h-4 text-muted-stone" />;
  const good = lowerIsBetter ? value <= target : value >= target;
  if (good) return <TrendingUp className="w-4 h-4 text-green-600" />;
  return <TrendingDown className="w-4 h-4 text-red-500" />;
}

function MetricCard({
  metric,
  value,
  target,
  timeline,
}: {
  metric: typeof METRICS[number];
  value: number | null;
  target: number;
  timeline: { date?: string; week?: string; rate?: number; avg_per_cover?: number | null }[];
}) {
  const { t } = useTranslation();
  const good = value !== null && (metric.lowerIsBetter ? value <= target : value >= target);
  const bad = value !== null && !good;

  const chartData = timeline
    .map(p => ({
      label: (p.date || p.week || '').slice(5), // MM-DD or MM-DD
      value: (p as Record<string, unknown>)[metric.valueKey] as number | null,
    }))
    .filter(p => p.value !== null);

  return (
    <div className="bg-white border border-border-gray rounded-xl p-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-stone-gray uppercase tracking-wide">
          {t(metric.i18nKey, metric.label)}
        </span>
        <TrendIcon value={value} target={target} lowerIsBetter={metric.lowerIsBetter} />
      </div>

      <div className="flex items-baseline gap-2 mb-1">
        <span className={`text-2xl font-semibold font-serif ${bad ? 'text-red-600' : good ? 'text-green-700' : 'text-deep-charcoal'}`}>
          {value !== null ? metric.format(value) : '—'}
        </span>
        <span className="text-xs text-muted-stone">
          {t('strategy.target', 'target')} {metric.key === 'revenue' ? `${formatCurrency(target)}+` : metric.targetLabel}
        </span>
      </div>

      {/* Sparkline */}
      {chartData.length >= 2 ? (
        <div className="h-14 mt-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 2, right: 2, bottom: 0, left: 0 }}>
              <XAxis dataKey="label" hide />
              <YAxis hide domain={['auto', 'auto']} />
              <Tooltip
                contentStyle={{ fontSize: 11, padding: '4px 8px', border: '1px solid #E7E5E4' }}
                formatter={(v: number) => [metric.format(v), metric.label]}
                labelFormatter={(l) => l}
              />
              <ReferenceLine
                y={target}
                stroke={metric.lowerIsBetter ? '#ef4444' : '#22c55e'}
                strokeDasharray="3 3"
                strokeWidth={1}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke={metric.color}
                strokeWidth={1.5}
                dot={false}
                activeDot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-14 mt-2 flex items-center justify-center">
          <span className="text-xs text-muted-stone">{t('strategy.notEnoughData', 'Not enough data yet')}</span>
        </div>
      )}
    </div>
  );
}

export default function StrategyMetricsWidget() {
  const { t } = useTranslation();
  const [range, setRange] = useState(30);
  const { data, isLoading, refetch, isFetching } = useStrategyMetrics(range);

  return (
    <div className="bg-white border border-border-gray rounded-2xl p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-deep-charcoal/8 flex items-center justify-center flex-shrink-0">
            <BarChart3 className="w-4.5 h-4.5 text-deep-charcoal" />
          </div>
          <div>
            <h3 className="font-semibold text-deep-charcoal text-sm">{t('strategy.scorecard', 'Strategy Scorecard')}</h3>
            <p className="text-xs text-muted-stone mt-0.5">{t('strategy.scorecardSub', 'Is the strategy loop working?')}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={range}
            onChange={e => setRange(Number(e.target.value))}
            className="text-xs text-deep-charcoal bg-warm-white border border-border-gray rounded-lg px-2 py-1.5 cursor-pointer focus:outline-none"
          >
            <option value={7}>{t('common.nDays', '{{count}} days', { count: 7 })}</option>
            <option value={30}>{t('common.nDays', '{{count}} days', { count: 30 })}</option>
            <option value={60}>{t('common.nDays', '{{count}} days', { count: 60 })}</option>
            <option value={90}>{t('common.nDays', '{{count}} days', { count: 90 })}</option>
          </select>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-1.5 rounded-lg border border-border-gray hover:bg-warm-white cursor-pointer disabled:opacity-40 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-muted-stone ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-32">
          <Spinner />
        </div>
      ) : !data ? (
        <p className="text-sm text-muted-stone text-center py-8">{t('strategy.loadFailed', 'Failed to load metrics')}</p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {METRICS.map(metric => (
              <MetricCard
                key={metric.key}
                metric={metric}
                value={data.summary[metric.summaryKey]}
                target={data.targets[metric.targetKey]}
                timeline={data.timelines[metric.key] as Parameters<typeof MetricCard>[0]['timeline']}
              />
            ))}
          </div>

          {data.summary.total_reservations === 0 ? (
            <p className="text-xs text-muted-stone text-center mt-4">
              {t('strategy.noReservations', 'No reservations in this period yet — metrics will appear as data comes in')}
            </p>
          ) : (
            <p className="text-xs text-muted-stone mt-4">
              {t('strategy.basedOn', 'Based on {{count}} reservations', { count: data.summary.total_reservations })}
              {data.summary.data_points > 0 ? ` · ${t('strategy.completedServices', '{{count}} completed services', { count: data.summary.data_points })}` : ''}
              {' '}{t('strategy.since', 'since {{date}}', { date: data.since })}
              {' · '}{t('strategy.dashedLine', 'Dashed line = target')}
            </p>
          )}
        </>
      )}
    </div>
  );
}

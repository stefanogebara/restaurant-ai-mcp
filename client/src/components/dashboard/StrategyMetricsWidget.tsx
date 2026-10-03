/** Evidence-first strategy metrics: one chosen time series, three honest summaries. */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ReferenceDot } from 'recharts';
import { useStrategyMetrics } from '../../hooks/useStrategyMetrics';
import { formatCurrency } from '../../utils/currency';
import { colors } from '../../utils/colors';
import Spinner from '../common/Spinner';

const METRICS = [
  {
    key: 'no_show' as const,
    i18nKey: 'strategy.noShowRate',
    shortI18nKey: 'strategy.noShowShort',
    summaryKey: 'no_show_rate' as const,
    targetKey: 'no_show_rate' as const,
    valueKey: 'rate' as const,
    format: (value: number) => `${value}%`,
    lowerIsBetter: true,
  },
  {
    key: 'revenue' as const,
    i18nKey: 'strategy.avgRevenue',
    shortI18nKey: 'strategy.avgRevenueShort',
    summaryKey: 'avg_revenue_per_cover' as const,
    targetKey: 'avg_revenue_per_cover' as const,
    valueKey: 'avg_per_cover' as const,
    format: (value: number) => formatCurrency(value),
    lowerIsBetter: false,
  },
  {
    key: 'conversion' as const,
    i18nKey: 'strategy.confirmedShare',
    shortI18nKey: 'strategy.confirmedShort',
    summaryKey: 'conversion_rate' as const,
    targetKey: 'conversion_rate' as const,
    valueKey: 'rate' as const,
    format: (value: number) => `${value}%`,
    lowerIsBetter: false,
  },
] as const;

type MetricKey = typeof METRICS[number]['key'];
type TimelinePoint = { date?: string; week?: string; rate?: number; avg_per_cover?: number | null };

function readableDate(date: string, locale: string) {
  const parsed = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', timeZone: 'UTC' }).format(parsed);
}

export default function StrategyMetricsWidget({ appearance = 'default' }: { appearance?: 'default' | 'hero' }) {
  const { t, i18n } = useTranslation();
  const hero = appearance === 'hero';
  const chartInk = hero ? '#293222' : colors.deepCharcoal;
  const chartMuted = hero ? '#586254' : colors.stoneGray;
  const chartAction = hero ? '#3F4E32' : colors.burgundy;
  const chartLine = hero ? '#CDD0C7' : colors.warmStone;
  const chartPaper = hero ? '#F3F0E9' : colors.warmWhite;
  const [range, setRange] = useState(30);
  const [activeKey, setActiveKey] = useState<MetricKey>('no_show');
  const { data, isLoading, isError, refetch, isFetching } = useStrategyMetrics(range);
  const activeMetric = METRICS.find(metric => metric.key === activeKey) ?? METRICS[0];
  const activeValue = data?.summary[activeMetric.summaryKey] ?? null;
  const activeTarget = data?.targets[activeMetric.targetKey] ?? 0;
  const meetsTarget = activeValue !== null && (
    activeMetric.lowerIsBetter ? activeValue <= activeTarget : activeValue >= activeTarget
  );
  const chartData = ((data?.timelines[activeMetric.key] ?? []) as TimelinePoint[])
    .map(point => ({ date: point.date || point.week || '', value: point[activeMetric.valueKey] ?? null }))
    .filter((point): point is { date: string; value: number } => typeof point.value === 'number' && Number.isFinite(point.value));
  const observed = chartData.map(point => point.value);
  const rawMin = Math.min(activeTarget, ...observed);
  const rawMax = Math.max(activeTarget, ...observed);
  const idealStep = (rawMax - rawMin) / 3 || (activeMetric.key === 'revenue' ? 10 : 1);
  const magnitude = 10 ** Math.floor(Math.log10(idealStep));
  const axisStep = ([1, 2, 5, 10].find(factor => factor * magnitude >= idealStep) ?? 10) * magnitude;
  const axisMin = Math.max(0, Math.floor(rawMin / axisStep) * axisStep - (rawMin === rawMax ? axisStep : 0));
  const axisMax = Math.ceil(rawMax / axisStep) * axisStep + (rawMin === rawMax ? axisStep : 0);
  const axisTicks = Array.from(
    { length: Math.round((axisMax - axisMin) / axisStep) + 1 },
    (_, index) => Number((axisMin + index * axisStep).toFixed(6)),
  );
  const sampleCount = activeMetric.key === 'no_show'
    ? (data?.summary.no_show_sample_size ?? 0)
    : activeMetric.key === 'revenue'
      ? (data?.summary.data_points ?? 0)
      : (data?.summary.total_reservations ?? 0);
  const sampleKind = activeMetric.key === 'revenue' ? 'strategy.sampleServices' : 'strategy.sampleReservations';
  const metricNote = activeMetric.key === 'no_show'
    ? 'strategy.metricNoteNoShow'
    : activeMetric.key === 'revenue'
      ? 'strategy.metricNoteRevenue'
      : 'strategy.metricNoteConfirmed';

  return (
    <section aria-labelledby="strategy-scorecard-heading" className={hero ? 'text-brand-ink' : 'py-3 sm:py-5'}>
      <div className="flex items-end justify-between gap-2">
        <div>
          <h2 id="strategy-scorecard-heading" className={hero ? 'font-brand text-[26px] leading-tight tracking-[-0.03em] text-brand-ink sm:text-[30px]' : 'font-serif text-[26px] font-normal text-deep-charcoal sm:text-[29px]'}>
            {t('strategy.scorecard')}
          </h2>
        </div>
        <div className={hero ? 'flex items-center gap-1 rounded-full border border-brand-line p-1' : 'flex items-center gap-1 rounded-full border hairline bg-white/65 p-1'}>
          <select
            aria-label={t('strategy.period')}
            value={range}
            onChange={event => setRange(Number(event.target.value))}
            className={hero ? 'cursor-pointer rounded-full border-0 bg-transparent px-3 py-1.5 font-brand text-[13px] text-brand-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-action' : 'cursor-pointer rounded-full border-0 bg-transparent px-3 py-1.5 text-[13px] text-deep-charcoal focus-visible:outline focus-visible:outline-2 focus-visible:outline-burgundy'}
          >
            {[7, 30, 60, 90].map(days => (
              <option key={days} value={days}>{t('common.nDays', { count: days })}</option>
            ))}
          </select>
          <button
            type="button"
            aria-label={t('common.refresh')}
            onClick={() => refetch()}
            disabled={isFetching}
            className={hero ? 'inline-flex h-8 w-8 items-center justify-center rounded-full text-brand-muted hover:bg-brand-action/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-action disabled:cursor-not-allowed disabled:opacity-40' : 'inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-stone hover:bg-soft-gray focus-visible:outline focus-visible:outline-2 focus-visible:outline-burgundy disabled:cursor-not-allowed disabled:opacity-40'}
          >
            <RefreshCw aria-hidden="true" className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div role="status" aria-label={t('common.loading')} className="flex h-36 items-center justify-center">
          <Spinner />
        </div>
      ) : isError || !data ? (
        <div className={hero ? 'mt-8 border-y border-brand-line py-8' : 'mt-8 border-y hairline py-8'}>
          <p className={hero ? 'text-[15px] text-brand-muted' : 'text-[15px] text-muted-stone'}>{t('strategy.loadFailed')}</p>
          <button type="button" onClick={() => refetch()} className={hero ? 'mt-3 text-sm font-medium text-brand-action underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-action' : 'mt-3 text-sm font-semibold text-burgundy underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-burgundy'}>
            {t('common.retry')}
          </button>
        </div>
      ) : (
        <>
          <div className={hero ? 'mt-6 grid border-y border-brand-line sm:grid-cols-3' : 'mt-6 grid border-y hairline sm:grid-cols-3'} role="group" aria-label={t('strategy.scorecard')}>
            {METRICS.map((metric, index) => {
              const value = data.summary[metric.summaryKey];
              const target = data.targets[metric.targetKey];
              return (
                <button
                  key={metric.key}
                  type="button"
                  aria-pressed={activeKey === metric.key}
                  aria-label={`${t(metric.i18nKey)}: ${value === null ? '—' : metric.format(value)}; ${t('strategy.target')} ${metric.format(target)}`}
                  onClick={() => setActiveKey(metric.key)}
                  className={hero
                    ? `relative flex min-w-0 items-center justify-between gap-4 border-b border-brand-line px-3 py-3 text-left font-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-action last:border-b-0 sm:block sm:border-b-0 sm:px-0 sm:py-6 ${activeKey === metric.key ? 'bg-brand-action/5 sm:bg-transparent' : 'hover:bg-brand-action/5 sm:hover:bg-transparent'} ${index > 0 ? 'sm:border-l sm:pl-6' : 'sm:pr-2'}`
                    : `relative flex min-w-0 items-center justify-between gap-4 border-b hairline px-3 py-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-burgundy last:border-b-0 sm:block sm:border-b-0 sm:px-0 sm:py-6 ${activeKey === metric.key ? 'bg-[#F0ECE4] sm:bg-transparent' : 'hover:bg-white/65 sm:hover:bg-transparent'} ${index > 0 ? 'sm:border-l sm:pl-6' : 'sm:pr-2'}`}
                >
                  <span className={hero ? 'block text-[14px] font-medium leading-tight text-brand-ink sm:text-[12px] sm:uppercase sm:tracking-[0.1em] sm:text-brand-muted' : 'block text-[14px] font-medium leading-tight text-deep-charcoal sm:text-[12px] sm:font-semibold sm:uppercase sm:tracking-[0.06em] sm:text-muted-stone'}>
                    <span className="sm:hidden">{t(metric.shortI18nKey)}</span>
                    <span className="hidden sm:inline">{t(metric.i18nKey)}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1 sm:mt-2 sm:items-start">
                    <span className={hero ? 'font-brand text-[24px] font-medium leading-none tabular-nums tracking-tight text-brand-ink sm:text-[31px]' : 'font-sans text-[24px] font-medium leading-none tabular-nums tracking-tight text-deep-charcoal sm:text-[31px]'}>
                      {value === null ? '—' : metric.format(value)}
                    </span>
                  </span>
                  <span className={hero ? 'hidden text-[12px] text-brand-muted sm:mt-2 sm:block' : 'hidden text-[12px] text-muted-stone sm:mt-2 sm:block'}>
                    {t('strategy.target')} {metric.format(target)}
                  </span>
                  {activeKey === metric.key && <span className={hero ? 'absolute inset-x-0 bottom-0 h-px bg-brand-action' : 'absolute inset-x-0 bottom-0 h-px bg-deep-charcoal'} aria-hidden="true" />}
                </button>
              );
            })}
          </div>

          <div className="mt-6 grid gap-5 pt-1 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)] lg:gap-8">
            <div className="min-w-0">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className={hero ? 'text-[12px] text-brand-muted' : 'text-[12px] text-muted-stone'}>{t(activeMetric.i18nKey)}</p>
                  <p className={hero ? 'mt-1 font-brand text-[17px] font-medium text-brand-ink' : 'mt-1 text-[17px] font-medium text-deep-charcoal'}>
                    {activeValue === null ? t('strategy.notEnoughData') : t(meetsTarget ? 'strategy.onTarget' : 'strategy.offTarget')}
                  </p>
                </div>
              </div>
              {chartData.length >= 2 ? (
                <div className="mt-4 h-[165px] sm:h-[205px]" role="img" aria-label={t('strategy.chartAria', { metric: t(activeMetric.i18nKey), target: activeMetric.format(activeTarget) })}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 8, right: hero ? 18 : 58, bottom: 2, left: 2 }}>
                      <XAxis
                        dataKey="date"
                        tickFormatter={date => readableDate(String(date), i18n.language)}
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: chartMuted, fontSize: hero ? 12 : 11 }}
                        tickMargin={9}
                        height={28}
                        interval={chartData.length <= 6 ? 0 : 'preserveStartEnd'}
                        minTickGap={14}
                      />
                      <YAxis
                        width={48}
                        ticks={axisTicks}
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: chartMuted, fontSize: hero ? 12 : 11 }}
                        tickFormatter={value => activeMetric.key === 'revenue' ? String(Math.round(Number(value))) : `${Number(value).toFixed(1).replace(/\.0$/, '')}%`}
                        domain={[axisMin, axisMax]}
                      />
                      <Tooltip
                        contentStyle={{ backgroundColor: chartPaper, border: `1px solid ${hero ? chartLine : colors.borderGray}`, borderRadius: 10, color: chartInk, fontSize: 12, boxShadow: 'none' }}
                        formatter={raw => [activeMetric.format(Number(raw ?? 0)), t(activeMetric.i18nKey)]}
                        labelFormatter={label => readableDate(String(label), i18n.language)}
                      />
                      <ReferenceLine
                        y={activeTarget}
                        stroke={hero ? '#9BA494' : chartLine}
                        strokeDasharray="4 5"
                        strokeWidth={hero ? 1.5 : 1}
                        label={hero ? undefined : { value: `${t('strategy.target')} ${activeMetric.format(activeTarget)}`, position: 'insideTopRight', fill: colors.mutedStone, fontSize: 11 }}
                      />
                      <Line type="linear" dataKey="value" stroke={chartAction} strokeWidth={hero ? 2.5 : 1.75} dot={{ r: hero ? 2.5 : 2, fill: chartAction, strokeWidth: 0 }} activeDot={{ r: 4, fill: chartAction }} isAnimationActive={false} />
                      <ReferenceDot
                        x={chartData[chartData.length - 1].date}
                        y={chartData[chartData.length - 1].value}
                        r={hero ? 5 : 4.5}
                        fill={chartAction}
                        stroke={chartPaper}
                        strokeWidth={2}
                        label={hero ? undefined : { value: activeMetric.format(chartData[chartData.length - 1].value), position: 'right', fill: chartInk, fontSize: 12, fontWeight: 600 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className={hero ? 'flex min-h-[130px] items-center justify-center text-[13px] text-brand-muted' : 'flex min-h-[130px] items-center justify-center text-[13px] text-muted-stone'}>{t('strategy.notEnoughData')}</p>
              )}
            </div>
            <aside className={hero ? 'border-t border-brand-line pt-4 lg:border-l lg:border-t-0 lg:pl-7 lg:pt-1' : 'hairline border-t pt-4 lg:border-l lg:border-t-0 lg:pl-7 lg:pt-1'}>
              <p className={hero ? 'text-[12px] text-brand-muted' : 'text-[12px] text-muted-stone'}>
                <strong className={hero ? 'mr-1 font-brand text-[20px] font-medium tabular-nums text-brand-ink' : 'mr-1 font-sans text-[20px] font-medium tabular-nums text-deep-charcoal'}>{sampleCount}</strong>
                {t(sampleKind)}
              </p>
              <p className={hero ? 'mt-3 max-w-[26ch] text-[14px] leading-relaxed text-brand-muted' : 'mt-3 max-w-[26ch] text-[14px] leading-relaxed text-deep-charcoal/70'}>{t(metricNote)}</p>
              {hero && (
                <div className="mt-5 grid grid-cols-2 gap-4 border-t border-brand-line pt-4">
                  <div>
                    <p className="font-brand text-[11px] uppercase tracking-[0.1em] text-brand-muted">{t('strategy.latestReading')}</p>
                    <p className="mt-1 font-brand text-[21px] leading-none tabular-nums text-brand-ink">
                      {chartData.length > 0 ? activeMetric.format(chartData[chartData.length - 1].value) : '—'}
                    </p>
                    {chartData.length > 0 && <p className="mt-2 text-[12px] text-brand-muted">{readableDate(chartData[chartData.length - 1].date, i18n.language)}</p>}
                  </div>
                  <div>
                    <p className="font-brand text-[11px] uppercase tracking-[0.1em] text-brand-muted">{t('strategy.target')}</p>
                    <p className="mt-1 font-brand text-[21px] leading-none tabular-nums text-brand-ink">{activeMetric.format(activeTarget)}</p>
                    <p className="mt-2 text-[12px] text-brand-muted">{t('strategy.dashedLine')}</p>
                  </div>
                </div>
              )}
            </aside>
          </div>

          <details className={hero ? 'mt-4 text-[12px] leading-relaxed text-brand-muted' : 'mt-4 text-[12px] leading-relaxed text-muted-stone'}>
            <summary className="cursor-pointer font-medium">{t('strategy.methodology')}</summary>
            <p className="mt-2">
              {data.summary.total_reservations === 0
                ? t('strategy.noReservations')
                : <>
                  {t('strategy.basedOn', { count: data.summary.total_reservations })}
                  {data.summary.no_show_sample_size !== undefined && <> · {t('strategy.noShowBasedOn', { count: data.summary.no_show_sample_size })}</>}
                  {data.summary.data_points > 0 && <> · {t('strategy.completedServices', { count: data.summary.data_points })}</>}
                  {' · '}{t('strategy.sinceRange', { count: range })}
                  {' · '}{t('strategy.dashedLine')}
                </>}
            </p>
          </details>
        </>
      )}
    </section>
  );
}

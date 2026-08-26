import type { ReactNode } from 'react';
import ThiingsIcon from './ThiingsIcon';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: ReactNode;
  trend?: {
    value: number;
    isPositive: boolean;
    label?: string;
  };
  color?: 'emerald' | 'amber' | 'red' | 'blue';
  loading?: boolean;
}

export default function MetricCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  color = 'emerald',
  loading = false
}: MetricCardProps) {
  const colorClasses = {
    emerald: 'bg-rose-500/10 text-rose-600 border-rose-500/20',
    amber: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
    red: 'bg-red-500/10 text-red-600 border-red-500/20',
    blue: 'bg-stone-500/10 text-stone-600 border-stone-500/20'
  };

  const trendColorClasses = {
    emerald: 'text-rose-600 bg-rose-500/10',
    amber: 'text-amber-600 bg-amber-500/10',
    red: 'text-red-600 bg-red-500/10',
    blue: 'text-stone-600 bg-stone-500/10'
  };

  if (loading) {
    return (
      <div role="status" aria-label={`Loading ${title}`} className="bg-white border border-border-gray rounded-2xl p-6 animate-pulse">
        <div className="h-4 bg-soft-gray rounded w-1/2 mb-4"></div>
        <div className="h-8 bg-soft-gray rounded w-3/4 mb-2"></div>
        <div className="h-3 bg-soft-gray rounded w-1/3"></div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-border-gray rounded-2xl p-6 hover:border-burgundy/30 transition-all duration-200">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <p className="text-sm font-medium text-warm-stone mb-1">{title}</p>
          <div className="flex items-baseline gap-2">
            <h3 className="text-3xl font-bold text-deep-charcoal">{value}</h3>
            {trend && (
              <div
                className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${
                  trend.isPositive ? trendColorClasses.emerald : trendColorClasses.red
                }`}
              >
                {trend.isPositive ? (
                  <ThiingsIcon name="trending-up" pxSize={12} />
                ) : (
                  <ThiingsIcon name="trending-down" pxSize={12} />
                )}
                {Math.abs(trend.value)}%
              </div>
            )}
          </div>
          {subtitle && (
            <p className="text-sm text-warm-stone mt-1">{subtitle}</p>
          )}
          {trend?.label && (
            <p className="text-xs text-warm-stone mt-1">{trend.label}</p>
          )}
        </div>

        {/* Icon */}
        {icon && (
          <div className={`p-3 rounded-xl border ${colorClasses[color]}`}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}

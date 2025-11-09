import type { ReactNode } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

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
    emerald: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
    amber: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
    red: 'bg-red-500/10 text-red-600 border-red-500/20',
    blue: 'bg-blue-500/10 text-blue-600 border-blue-500/20'
  };

  const trendColorClasses = {
    emerald: 'text-emerald-600 bg-emerald-500/10',
    amber: 'text-amber-600 bg-amber-500/10',
    red: 'text-red-600 bg-red-500/10',
    blue: 'text-blue-600 bg-blue-500/10'
  };

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl p-6 animate-pulse">
        <div className="h-4 bg-muted rounded w-1/2 mb-4"></div>
        <div className="h-8 bg-muted rounded w-3/4 mb-2"></div>
        <div className="h-3 bg-muted rounded w-1/3"></div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl p-6 hover:shadow-lg transition-all duration-200">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <p className="text-sm font-medium text-muted-foreground mb-1">{title}</p>
          <div className="flex items-baseline gap-2">
            <h3 className="text-3xl font-bold text-foreground">{value}</h3>
            {trend && (
              <div
                className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${
                  trend.isPositive ? trendColorClasses.emerald : trendColorClasses.red
                }`}
              >
                {trend.isPositive ? (
                  <TrendingUp className="w-3 h-3" />
                ) : (
                  <TrendingDown className="w-3 h-3" />
                )}
                {Math.abs(trend.value)}%
              </div>
            )}
          </div>
          {subtitle && (
            <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
          )}
          {trend?.label && (
            <p className="text-xs text-muted-foreground mt-1">{trend.label}</p>
          )}
        </div>

        {/* Icon */}
        {icon && (
          <div className={`p-3 rounded-lg border ${colorClasses[color]}`}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}

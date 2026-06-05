import { useLTVStats } from '../../hooks/useLTVData';
import { formatCurrency } from '../../utils/currency';
import type { LTVStats } from '../host/ltvDashboard.types';

interface CustomerStatsWidgetProps {
  isDemo?: boolean;
}

const DEMO_STATS: LTVStats = {
  total_customers: 150,
  total_ltv: 45000,
  avg_ltv: 300,
  tiers: { vip: 12, regular: 45, occasional: 60, new: 30, at_risk: 3 },
  high_risk_customers: 3,
};

export default function CustomerStatsWidget({ isDemo }: CustomerStatsWidgetProps) {
  const { data, isLoading } = useLTVStats();
  const stats: LTVStats | null = isDemo ? DEMO_STATS : (data ?? null);

  if (!isDemo && isLoading) {
    return (
      <div className="glass-card p-5">
        <div className="h-3 w-40 bg-border-gray rounded-full animate-pulse mb-5" />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-glass-border-dark/60 p-4">
              <div className="h-2.5 w-16 bg-border-gray rounded-full animate-pulse mb-3" />
              <div className="h-7 w-12 bg-border-gray rounded-lg animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="glass-card p-5">
      <div className="text-[11px] font-bold text-stone-500 uppercase tracking-widest mb-5">
        InteligÃªncia de Clientes
      </div>
      <div className="grid grid-cols-2 gap-3">
        <MetricBox
          label="Total Clientes"
          value={String(stats.total_customers)}
        />
        <MetricBox
          label="Clientes VIP"
          value={String(stats.tiers.vip)}
          valueColor="text-amber-600"
        />
        <MetricBox
          label="Em Risco"
          value={String(stats.high_risk_customers)}
          valueColor="text-red-600"
        />
        <MetricBox
          label="LTV MÃ©dio"
          value={formatCurrency(stats.avg_ltv)}
        />
      </div>
    </div>
  );
}

interface MetricBoxProps {
  label: string;
  value: string;
  valueColor?: string;
}

function MetricBox({ label, value, valueColor }: MetricBoxProps) {
  return (
    <div className="rounded-lg border border-glass-border-dark/60 p-4">
      <div className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-2">
        {label}
      </div>
      <div className={`font-serif text-2xl font-extrabold tracking-tight leading-none ${valueColor ?? 'text-stone-900'}`}>
        {value}
      </div>
    </div>
  );
}

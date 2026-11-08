import { useState, useEffect, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../common/ThiingsIcon';
import { colors } from '../../utils/colors';
import { formatCurrency } from '../../utils/currency';

interface StatsBarProps {
  occupiedTables: number;
  totalTables: number;
  reservationsToday: number;
  seatedReservations: number;
  waitlistCount: number;
  estimatedWaitTime?: number;
  activeParties: number;
  totalGuests: number;
  predictedRevenue?: number;
  isLoading?: boolean;
}

export default function StatsBar({
  occupiedTables,
  totalTables,
  reservationsToday,
  seatedReservations,
  waitlistCount,
  estimatedWaitTime,
  activeParties,
  totalGuests,
  predictedRevenue,
  isLoading,
}: StatsBarProps) {
  const { t } = useTranslation();
  const availableTables = Math.max(0, totalTables - occupiedTables);
  const occupancyPercent = totalTables > 0 ? Math.min(100, Math.max(0, Math.round((occupiedTables / totalTables) * 100))) : 0;
  const seatedPercent = reservationsToday > 0 ? Math.round((seatedReservations / reservationsToday) * 100) : 0;
  const availabilityValueColor = totalTables > 0 && availableTables === 0
    ? 'text-red-700' : totalTables > 0 && availableTables <= 2 ? 'text-amber-700' : 'text-deep-charcoal';
  const availabilityDetailColor = availabilityValueColor === 'text-deep-charcoal'
    ? 'text-stone-gray' : availabilityValueColor;
  const seatedLabel = (count: number) => t(count === 1 ? 'dashboard.stats.seatedSingle' : 'dashboard.stats.seated');

  if (isLoading) {
    return (
      <div role="status" aria-label={t('common.loading')} className="border-y hairline py-6 sm:py-8 grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-10">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i}>
            <div className="h-3 w-20 bg-border-gray rounded-full animate-pulse mb-3" />
            <div className="h-9 w-16 bg-border-gray rounded-lg animate-pulse mb-2" />
            <div className="h-3 w-24 bg-soft-gray rounded animate-pulse mb-3" />
            <div className="h-1 w-full bg-soft-gray rounded-full animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  return (
    // Liquid Glass v2: métricas SEM card — faixa no canvas entre fios de tinta.
    <div className="border-y hairline py-6 sm:py-8 grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-10">
      {/* Today's Reservations */}
      <StatCard
        label={t('dashboard.stats.reservations')}
        value={String(reservationsToday)}
        change={reservationsToday > 0 ? `${seatedReservations} ${seatedLabel(seatedReservations)}` : ''}
        changeColor="text-stone-gray"
        barPercent={seatedPercent}
        barColor={colors.emerald}
        icon={<ThiingsIcon name="calendar-days" pxSize={16} className="text-muted-stone" />}
      />

      {/* Tables Available */}
      <StatCard
        label={t('dashboard.stats.tables')}
        value={String(availableTables)}
        valueSuffix={` / ${totalTables}`}
        valueColor={availabilityValueColor}
        change={`${occupancyPercent}% ${t('dashboard.stats.capacity')}`}
        changeColor={availabilityDetailColor}
        barPercent={occupancyPercent}
        barColor={availabilityValueColor === 'text-red-700' ? colors.red : availabilityValueColor === 'text-amber-700' ? colors.amber : colors.emerald}
        icon={<ThiingsIcon name="layout-grid" pxSize={16} className="text-muted-stone" />}
      />

      {/* Guests Expected */}
      <StatCard
        label={t('dashboard.stats.guests')}
        value={String(totalGuests)}
        change={waitlistCount > 0
          ? `${waitlistCount} ${t('dashboard.stats.waiting')}${estimatedWaitTime ? ` · ${t('dashboard.stats.minAvg', { count: estimatedWaitTime })}` : ''}`
          : estimatedWaitTime ? t('dashboard.stats.minAvg', { count: estimatedWaitTime }) : ''}
        changeColor="text-amber-600"
        barPercent={totalGuests > 0 ? Math.min(Math.round((totalGuests / (reservationsToday * 3 || 1)) * 100), 100) : 0}
        barColor={colors.stoneGray}
        icon={<ThiingsIcon name="users" pxSize={16} className="text-muted-stone" />}
      />

      {/* Predicted Revenue / Active Parties */}
      {predictedRevenue !== undefined && predictedRevenue > 0 ? (
        <StatCard
          label={t('dashboard.stats.predictedRevenue', 'Predicted Revenue')}
          value={formatCurrency(predictedRevenue)}
          change={`${activeParties} ${t('dashboard.stats.activeParties', 'active')} · ${totalGuests} ${seatedLabel(totalGuests)}`}
          changeColor="text-stone-gray"
          // Previously: barPercent={Math.round((predictedRevenue / Math.max(predictedRevenue * 1.3, 1)) * 100)}
          //   — a self-referential fraction that ALWAYS resolved to ~77%.
          // Carla (and her boss) read "this bar is 3/4 full" as a real
          // signal, which it wasn't. Until we have a meaningful denominator
          // (yesterday's actual revenue or a target), skip the bar entirely.
          barColor={colors.emerald}
          icon={<ThiingsIcon name="trending-up" pxSize={16} className="text-muted-stone" />}
        />
      ) : (
        <StatCard
          label={t('dashboard.stats.activeParties', 'Active Parties')}
          value={String(activeParties)}
          change={totalGuests > 0 ? `${totalGuests} ${seatedLabel(totalGuests)}` : ''}
          changeColor="text-stone-gray"
          barPercent={totalTables > 0 ? Math.round((activeParties / totalTables) * 100) : 0}
          barColor={colors.stoneGray}
          icon={<ThiingsIcon name="utensils-crossed" pxSize={16} className="text-muted-stone" />}
        />
      )}
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  valueSuffix?: string;
  valueColor?: string;
  change: string;
  changeColor: string;
  /**
   * Progress bar fill in percent. Pass `undefined` to skip the bar entirely —
   * preferable to passing a meaningless gauge (the predicted-revenue card
   * previously rendered a constant ~77% bar that eroded trust in every other
   * stat on the page).
   */
  barPercent?: number;
  barColor: string;
  icon?: ReactElement;
}

function StatCard({ label, value, valueSuffix, valueColor, change, changeColor, barPercent, barColor, icon }: StatCardProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { const t = setTimeout(() => setMounted(true), 50); return () => clearTimeout(t); }, []);

  return (
    // Liquid Glass v2: tile sem caixa — rótulo uppercase, número em serif 400,
    // tokens em vez de stone-* cru. A faixa externa dá a moldura de tinta.
    <div className="flex flex-col transition-all duration-300 opacity-0 translate-y-2 animate-[fadeInUp_0.4s_ease-out_forwards]">
      {icon && (
        <div className="mb-2.5">
          {icon}
        </div>
      )}
      <div className="text-[11px] font-medium text-muted-stone uppercase tracking-[0.14em] mb-3">
        {label}
      </div>
      <div className={`font-serif text-[30px] sm:text-[36px] tracking-tight leading-none mb-2 tabular-nums ${valueColor || 'text-deep-charcoal'}`}>
        {value}
        {valueSuffix && (
          <span className="text-base text-muted-stone font-sans">{valueSuffix}</span>
        )}
      </div>
      {change && (
        <div className={`flex items-center gap-1.5 text-[11px] font-medium mb-3 ${changeColor}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
          {change}
        </div>
      )}
      {/* mt-auto keeps the tile content bottom-aligned even when the bar
          isn't rendered, so the row stays the same height. */}
      {barPercent !== undefined ? (
        <div className="w-full bg-[rgba(28,25,23,0.06)] h-1 rounded-full overflow-hidden mt-auto">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{ width: mounted ? `${barPercent}%` : '0%', backgroundColor: barColor }}
          />
        </div>
      ) : (
        <div className="mt-auto" />
      )}
    </div>
  );
}

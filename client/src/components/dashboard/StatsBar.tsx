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
  const availableTables = totalTables - occupiedTables;
  const occupancyPercent = totalTables > 0 ? Math.round((occupiedTables / totalTables) * 100) : 0;
  const seatedPercent = reservationsToday > 0 ? Math.round((seatedReservations / reservationsToday) * 100) : 0;

  if (isLoading) {
    return (
      <div role="status" aria-label="Loading stats" className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg p-5 border border-border-gray">
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
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
      {/* Today's Reservations */}
      <StatCard
        label={t('dashboard.stats.reservations')}
        value={String(reservationsToday)}
        change={reservationsToday > 0 ? `${seatedReservations} ${t('dashboard.stats.seated')}` : ''}
        changeColor="text-rose-600"
        barPercent={seatedPercent}
        barColor="#9F1239"
        icon={<ThiingsIcon name="calendar-days" pxSize={16} className="text-muted-stone" />}
      />

      {/* Tables Available */}
      <StatCard
        label={t('dashboard.stats.tables')}
        value={String(availableTables)}
        valueSuffix={` / ${totalTables}`}
        valueColor="text-[#9F1239]"
        change={`${occupancyPercent}% ${t('dashboard.stats.capacity')}`}
        changeColor={occupancyPercent >= 80 ? 'text-red-600' : occupancyPercent >= 50 ? 'text-amber-600' : 'text-rose-600'}
        barPercent={occupancyPercent}
        barColor={occupancyPercent >= 80 ? '#ef4444' : occupancyPercent >= 50 ? '#d97706' : '#16a34a'}
        icon={<ThiingsIcon name="layout-grid" pxSize={16} className="text-muted-stone" />}
      />

      {/* Guests Expected */}
      <StatCard
        label={t('dashboard.stats.guests')}
        value={String(totalGuests)}
        change={waitlistCount > 0
          ? `${waitlistCount} ${t('dashboard.stats.waiting')}${estimatedWaitTime ? ` · ~${estimatedWaitTime} min avg` : ''}`
          : estimatedWaitTime ? `~${estimatedWaitTime} min avg` : ''}
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
          change={`${activeParties} ${t('dashboard.stats.activeParties', 'active')} · ${totalGuests} ${t('dashboard.stats.seated', 'seated')}`}
          changeColor="text-rose-600"
          barPercent={Math.min(100, Math.round((predictedRevenue / Math.max(predictedRevenue * 1.3, 1)) * 100))}
          barColor="#10b981"
          icon={<ThiingsIcon name="trending-up" pxSize={16} className="text-muted-stone" />}
        />
      ) : (
        <StatCard
          label={t('dashboard.stats.activeParties', 'Active Parties')}
          value={String(activeParties)}
          change={totalGuests > 0 ? `${totalGuests} ${t('dashboard.stats.seated', 'seated')}` : ''}
          changeColor="text-stone-gray"
          barPercent={totalTables > 0 ? Math.round((activeParties / totalTables) * 100) : 0}
          barColor="#d97706"
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
  barPercent: number;
  barColor: string;
  icon?: ReactElement;
}

function StatCard({ label, value, valueSuffix, valueColor, change, changeColor, barPercent, barColor, icon }: StatCardProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { const t = setTimeout(() => setMounted(true), 50); return () => clearTimeout(t); }, []);

  return (
    <div className="rounded-lg p-5 border border-border-gray transition-all duration-300 opacity-0 translate-y-2 animate-[fadeInUp_0.4s_ease-out_forwards]">
      {icon && (
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-lg bg-soft-gray flex items-center justify-center flex-shrink-0">
            {icon}
          </div>
        </div>
      )}
      <div className="text-xs font-medium text-muted-stone tracking-wide mb-2">
        {label}
      </div>
      <div className={`text-[32px] font-bold tracking-tight leading-none ${valueColor || 'text-deep-charcoal'}`}>
        {value}
        {valueSuffix && (
          <span className="text-base text-muted-stone font-normal">{valueSuffix}</span>
        )}
      </div>
      {change && (
        <div className={`text-xs font-medium mt-1.5 ${changeColor}`}>
          {change}
        </div>
      )}
      <div className="h-2 bg-soft-gray rounded-full mt-3 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{ width: mounted ? `${barPercent}%` : '0%', backgroundColor: barColor }}
        />
      </div>
    </div>
  );
}

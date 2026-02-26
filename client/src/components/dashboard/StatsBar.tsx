import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../common/ThiingsIcon';
import { colors } from '../../utils/colors';

interface StatsBarProps {
  occupiedTables: number;
  totalTables: number;
  reservationsToday: number;
  seatedReservations: number;
  waitlistCount: number;
  estimatedWaitTime?: number;
  activeParties: number;
  totalGuests: number;
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
          <div key={i} className="bg-white rounded-2xl p-5 border border-border-gray">
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
        changeColor="text-green-600"
        barPercent={seatedPercent}
        barColor={colors.burgundy}
        icon={<ThiingsIcon name="calendar-days" pxSize={16} className="text-muted-stone" />}
      />

      {/* Tables Available */}
      <StatCard
        label={t('dashboard.stats.tables')}
        value={String(availableTables)}
        valueSuffix={` / ${totalTables}`}
        valueColor="text-burgundy"
        change={`${occupancyPercent}% ${t('dashboard.stats.capacity')}`}
        changeColor={occupancyPercent >= 80 ? 'text-red-600' : occupancyPercent >= 50 ? 'text-amber-600' : 'text-green-600'}
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

      {/* Active Parties */}
      <StatCard
        label={t('dashboard.stats.aiCalls')}
        value={String(activeParties)}
        change={totalGuests > 0 ? `${totalGuests} ${t('dashboard.stats.seated')}` : ''}
        changeColor="text-stone-gray"
        barPercent={totalTables > 0 ? Math.round((activeParties / totalTables) * 100) : 0}
        barColor="#d97706"
        icon={<ThiingsIcon name="utensils-crossed" pxSize={16} className="text-muted-stone" />}
      />
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
  return (
    <div className="bg-white rounded-2xl p-5 border border-border-gray hover:shadow-sm transition-shadow duration-200">
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
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${barPercent}%`, backgroundColor: barColor }}
        />
      </div>
    </div>
  );
}

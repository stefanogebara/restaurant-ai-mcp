import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { useTranslation } from 'react-i18next';
import type { Table } from '../../types/host.types';
import TableActionMenu from './TableActionMenu';
import ThiingsIcon, { type IconName } from '../common/ThiingsIcon';

interface TableCardProps {
  table: Table;
  onClick?: () => void;
}

// Maps the DB status enum (canonical English values stored in `tables.status`)
// to its i18n key. The DB value never changes; only the display does.
// Note: the i18n keys live under settings.tableStatus.* (verified across pt-BR,
// en, es). My first attempt used a top-level `tableStatus.X` path which doesn't
// exist — the t() call silently fell back to the English fallback string.
const STATUS_I18N_KEY: Record<string, string> = {
  Available: 'settings.tableStatus.available',
  Occupied: 'settings.tableStatus.occupied',
  'Being Cleaned': 'settings.tableStatus.cleaning',
  Reserved: 'settings.tableStatus.reserved',
};

export default function TableCard({ table, onClick }: TableCardProps) {
  const { t } = useTranslation();
  const [showMenu, setShowMenu] = useState(false);
  const localizedStatus = t(STATUS_I18N_KEY[table.status] || '', table.status);

  // Make table droppable for drag-and-drop
  const { setNodeRef, isOver } = useDroppable({
    id: table.id,
    data: {
      type: 'table',
      table
    },
    disabled: table.status !== 'Available'
  });

  // Mirrors the illustrated tables (floorPlanHelpers palette): free is quiet
  // stone, occupied is burgundy, held/transitioning are amber — reserved
  // carries the same dashed outline the drawn table does, so the grid view
  // and the floor plan never disagree. (Available used to be rose-600, which
  // made an empty table look like an alarm.)
  const getStatusConfig = (): { iconBg: string; iconName: IconName; statusPill: string } => {
    switch (table.status) {
      case 'Available':
        return {
          iconBg: 'bg-stone-gray',
          iconName: 'check',
          statusPill: 'text-stone-gray bg-stone-gray/10',
        };
      case 'Occupied':
        return {
          iconBg: 'bg-burgundy',
          iconName: 'user',
          statusPill: 'text-burgundy bg-burgundy/10',
        };
      case 'Being Cleaned':
        return {
          iconBg: 'bg-amber-600',
          iconName: 'sparkles',
          statusPill: 'text-amber-600 bg-amber-600/10',
        };
      case 'Reserved':
        return {
          iconBg: 'bg-amber-600',
          iconName: 'clock',
          statusPill: 'text-amber-700 bg-transparent border border-dashed border-amber-600',
        };
      default:
        return {
          iconBg: 'bg-stone-gray',
          iconName: 'check',
          statusPill: 'text-stone-gray bg-stone-gray/10',
        };
    }
  };

  const config = getStatusConfig();

  return (
    <>
      <div ref={setNodeRef} className="relative">
        <button
          onClick={() => {
            if (onClick) {
              onClick();
            } else {
              setShowMenu(true);
            }
          }}
          aria-label={`${t('tableLayout.table', 'Table')} ${table.table_number} — ${localizedStatus}`}
          className={`
            w-full p-4 rounded-2xl transition-all duration-200
            bg-white border border-border-gray
            hover:border-burgundy/30 hover:bg-soft-gray
            cursor-pointer group
            ${isOver && table.status === 'Available' ? 'ring-2 ring-burgundy scale-[1.02] bg-soft-gray' : ''}
          `}
        >
          {/* Status Icon Badge & Actions */}
          <div className="flex items-center justify-between mb-3">
            <div className={`w-10 h-10 rounded-lg ${config.iconBg} flex items-center justify-center`}>
              <ThiingsIcon name={config.iconName} size="sm" />
            </div>
            <span className="text-xs text-muted-stone group-hover:text-stone-gray transition-colors">
              Tap to manage
            </span>
          </div>

          {/* Table Number */}
          <div className="text-2xl font-bold text-deep-charcoal mb-2 text-left">
            {table.table_number}
          </div>

          {/* Capacity */}
          <div className="flex items-center gap-1.5 text-stone-gray text-sm mb-2">
            <ThiingsIcon name="users" size="xs" />
            <span className="font-medium">{table.capacity} {t('tableLayout.seats', 'seats')}</span>
          </div>

          {/* Location */}
          <div className="text-xs text-muted-stone mb-3 text-left truncate">
            {table.location}
          </div>

          {/* Status Pill */}
          <div className="flex items-center justify-between">
            <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.statusPill}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              {localizedStatus}
            </div>
          </div>
        </button>

        {/* Drop Zone Indicator */}
        {isOver && table.status === 'Available' && (
          <div className="absolute inset-0 bg-burgundy/20 backdrop-blur-sm rounded-2xl flex flex-col items-center justify-center gap-2 pointer-events-none ring-2 ring-burgundy ring-dashed">
            <ThiingsIcon name="arrow-down" size="md" />
            <div className="text-deep-charcoal font-semibold">{t('tableLayout.dropToAssign', 'Drop to Assign')}</div>
            <div className="text-burgundy text-sm">{t('tableLayout.table', 'Table')} {table.table_number}</div>
          </div>
        )}
      </div>

      {showMenu && (
        <TableActionMenu
          table={table}
          onClose={() => setShowMenu(false)}
        />
      )}
    </>
  );
}

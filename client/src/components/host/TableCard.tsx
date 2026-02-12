import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import type { Table } from '../../types/host.types';
import TableActionMenu from './TableActionMenu';
import ThiingsIcon, { type IconName } from '../common/ThiingsIcon';

interface TableCardProps {
  table: Table;
  onClick?: () => void;
}

export default function TableCard({ table, onClick }: TableCardProps) {
  const [showMenu, setShowMenu] = useState(false);

  // Make table droppable for drag-and-drop
  const { setNodeRef, isOver } = useDroppable({
    id: table.id,
    data: {
      type: 'table',
      table
    },
    disabled: table.status !== 'Available'
  });

  const getStatusConfig = (): { iconBg: string; iconName: IconName; statusPill: string } => {
    switch (table.status) {
      case 'Available':
        return {
          iconBg: 'bg-[#16a34a]',
          iconName: 'check',
          statusPill: 'text-[#16a34a] bg-[#16a34a]/10',
        };
      case 'Occupied':
        return {
          iconBg: 'bg-[#9F1239]',
          iconName: 'user',
          statusPill: 'text-[#9F1239] bg-[#9F1239]/10',
        };
      case 'Being Cleaned':
        return {
          iconBg: 'bg-[#d97706]',
          iconName: 'sparkles',
          statusPill: 'text-[#d97706] bg-[#d97706]/10',
        };
      case 'Reserved':
        return {
          iconBg: 'bg-[#7c3aed]',
          iconName: 'clock',
          statusPill: 'text-[#7c3aed] bg-[#7c3aed]/10',
        };
      default:
        return {
          iconBg: 'bg-[#57534E]',
          iconName: 'check',
          statusPill: 'text-[#57534E] bg-[#57534E]/10',
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
          className={`
            w-full p-4 rounded-xl transition-all duration-200
            bg-white border border-[#E7E5E4] shadow-md
            hover:shadow-lg hover:bg-[#F5F5F4]
            cursor-pointer group
            ${isOver && table.status === 'Available' ? 'ring-2 ring-[#9F1239] scale-[1.02] bg-[#F5F5F4]' : ''}
          `}
        >
          {/* Status Icon Badge & Actions */}
          <div className="flex items-center justify-between mb-3">
            <div className={`w-10 h-10 rounded-lg ${config.iconBg} flex items-center justify-center`}>
              <ThiingsIcon name={config.iconName} size="sm" />
            </div>
            <span className="text-xs text-[#A8A29E] group-hover:text-[#57534E] transition-colors">
              Tap to manage
            </span>
          </div>

          {/* Table Number */}
          <div className="text-2xl font-bold text-[#1C1917] mb-2 text-left">
            {table.table_number}
          </div>

          {/* Capacity */}
          <div className="flex items-center gap-1.5 text-[#57534E] text-sm mb-2">
            <ThiingsIcon name="users" size="xs" />
            <span className="font-medium">{table.capacity} seats</span>
          </div>

          {/* Location */}
          <div className="text-xs text-[#A8A29E] mb-3 text-left">
            {table.location}
          </div>

          {/* Status Pill */}
          <div className="flex items-center justify-between">
            <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.statusPill}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              {table.status}
            </div>
          </div>
        </button>

        {/* Drop Zone Indicator */}
        {isOver && table.status === 'Available' && (
          <div className="absolute inset-0 bg-[#9F1239]/20 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center gap-2 pointer-events-none ring-2 ring-[#9F1239] ring-dashed">
            <ThiingsIcon name="arrow-down" size="md" />
            <div className="text-[#1C1917] font-semibold">Drop to Assign</div>
            <div className="text-[#9F1239] text-sm">Table {table.table_number}</div>
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

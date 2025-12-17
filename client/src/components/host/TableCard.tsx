import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import type { Table } from '../../types/host.types';
import TableActionMenu from './TableActionMenu';

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
    disabled: table.status !== 'Available' // Only allow drops on available tables
  });

  const getStatusConfig = () => {
    switch (table.status) {
      case 'Available':
        return {
          bg: 'bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/30',
          icon: '✅',
          iconBg: 'bg-emerald-500/20',
          iconText: 'text-emerald-400',
          statusText: 'text-emerald-400',
          glow: 'shadow-emerald-500/20',
        };
      case 'Occupied':
        return {
          bg: 'bg-red-500/10 hover:bg-red-500/20 border-red-500/30',
          icon: '🔴',
          iconBg: 'bg-red-500/20',
          iconText: 'text-red-400',
          statusText: 'text-red-400',
          glow: 'shadow-red-500/20',
        };
      case 'Being Cleaned':
        return {
          bg: 'bg-yellow-500/10 hover:bg-yellow-500/20 border-yellow-500/30',
          icon: '🧹',
          iconBg: 'bg-yellow-500/20',
          iconText: 'text-yellow-400',
          statusText: 'text-yellow-400',
          glow: 'shadow-yellow-500/20',
        };
      case 'Reserved':
        return {
          bg: 'bg-blue-500/10 hover:bg-blue-500/20 border-blue-500/30',
          icon: '📅',
          iconBg: 'bg-blue-500/20',
          iconText: 'text-blue-400',
          statusText: 'text-blue-400',
          glow: 'shadow-blue-500/20',
        };
      default:
        return {
          bg: 'bg-gray-500/10 hover:bg-gray-500/20 border-gray-500/30',
          icon: '❓',
          iconBg: 'bg-gray-500/20',
          iconText: 'text-gray-400',
          statusText: 'text-gray-400',
          glow: 'shadow-gray-500/20',
        };
    }
  };

  const config = getStatusConfig();

  return (
    <>
      <div
        ref={setNodeRef}
        className="relative"
      >
        <button
          onClick={() => {
            if (onClick) {
              onClick();
            } else {
              setShowMenu(true);
            }
          }}
          className={`
            w-full p-4 rounded-xl border-2 transition-all duration-300
            ${config.bg} ${config.glow}
            shadow-lg hover:shadow-xl hover:-translate-y-1 active:scale-95
            cursor-pointer group
            ${isOver && table.status === 'Available' ? 'ring-4 ring-purple-500 ring-opacity-50 scale-105 border-purple-400' : ''}
          `}
        >
          {/* Table Number */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className={`w-10 h-10 rounded-lg ${config.iconBg} flex items-center justify-center text-xl`}>
                {config.icon}
              </div>
              <div className="text-left">
                <div className="text-2xl font-bold text-white">
                  {table.table_number}
                </div>
              </div>
            </div>

            {/* Tap to manage hint - always visible */}
            <div className="flex items-center gap-1 text-gray-400 group-hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
              </svg>
            </div>
          </div>

          {/* Capacity */}
          <div className="flex items-center gap-1.5 text-gray-300 text-sm mb-2">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
            </svg>
            <span className="font-medium">{table.capacity} seats</span>
          </div>

          {/* Location */}
          <div className="text-xs text-gray-400 mb-3">
            {table.location}
          </div>

          {/* Status Badge with tap hint */}
          <div className="flex items-center justify-between">
            <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${config.statusText}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
              {table.status}
            </div>
            <span className="text-[10px] text-gray-500 group-hover:text-gray-300 transition-colors">
              Tap to manage
            </span>
          </div>
        </button>

        {/* Drop Zone Indicator (drag overlay) */}
        {isOver && table.status === 'Available' && (
          <div className="absolute inset-0 bg-purple-600/30 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center gap-3 pointer-events-none border-4 border-purple-400 border-dashed">
            <div className="text-5xl">⬇️</div>
            <div className="text-white font-bold text-lg">Drop to Assign</div>
            <div className="text-purple-200 text-sm">Table {table.table_number}</div>
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

import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import type { Table } from '../../types/host.types';
import TableActionMenu from './TableActionMenu';

interface TableCardProps {
  table: Table;
  onClick?: () => void;
}

// SVG Icon Components
const CheckIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
  </svg>
);

const PersonIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
  </svg>
);

const SparklesIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 20 20" fill="currentColor">
    <path d="M5 2a1 1 0 011 1v1h1a1 1 0 010 2H6v1a1 1 0 01-2 0V6H3a1 1 0 010-2h1V3a1 1 0 011-1zm0 10a1 1 0 011 1v1h1a1 1 0 110 2H6v1a1 1 0 11-2 0v-1H3a1 1 0 110-2h1v-1a1 1 0 011-1zM12 2a1 1 0 01.967.744L14.146 7.2 17.5 9.134a1 1 0 010 1.732l-3.354 1.935-1.18 4.455a1 1 0 01-1.933 0L9.854 12.8 6.5 10.866a1 1 0 010-1.732l3.354-1.935 1.18-4.455A1 1 0 0112 2z" />
  </svg>
);

const ClockIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
  </svg>
);

const UsersIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 20 20">
    <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
  </svg>
);

const ArrowDownIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
  </svg>
);

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

  const getStatusConfig = () => {
    switch (table.status) {
      case 'Available':
        return {
          iconBg: 'bg-[#16a34a]',
          Icon: CheckIcon,
          statusPill: 'text-[#16a34a] bg-[#16a34a]/10',
        };
      case 'Occupied':
        return {
          iconBg: 'bg-[#9F1239]',
          Icon: PersonIcon,
          statusPill: 'text-[#9F1239] bg-[#9F1239]/10',
        };
      case 'Being Cleaned':
        return {
          iconBg: 'bg-[#d97706]',
          Icon: SparklesIcon,
          statusPill: 'text-[#d97706] bg-[#d97706]/10',
        };
      case 'Reserved':
        return {
          iconBg: 'bg-[#7c3aed]',
          Icon: ClockIcon,
          statusPill: 'text-[#7c3aed] bg-[#7c3aed]/10',
        };
      default:
        return {
          iconBg: 'bg-[#57534E]',
          Icon: CheckIcon,
          statusPill: 'text-[#57534E] bg-[#57534E]/10',
        };
    }
  };

  const config = getStatusConfig();
  const StatusIcon = config.Icon;

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
              <StatusIcon className="w-5 h-5 text-white" />
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
            <UsersIcon className="w-4 h-4" />
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
            <ArrowDownIcon className="w-8 h-8 text-[#9F1239]" />
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

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Table } from '../../types/host.types';
import { hostAPI } from '../../services/api';

interface TableActionMenuProps {
  table: Table;
  onClose: () => void;
}

export default function TableActionMenu({ table, onClose }: TableActionMenuProps) {
  const queryClient = useQueryClient();

  const updateTableMutation = useMutation({
    mutationFn: () => {
      // For now, we'll use the mark clean endpoint as a template
      // You can create a new endpoint for generic status updates
      return hostAPI.markTableClean(table.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hostDashboard'] });
      onClose();
    },
  });

  const actions = [
    {
      label: 'Mark as Available',
      icon: '✅',
      color: 'text-emerald-400',
      show: table.status !== 'Available',
      onClick: () => updateTableMutation.mutate(),
    },
    {
      label: 'Mark as Occupied',
      icon: '🔴',
      color: 'text-red-400',
      show: table.status !== 'Occupied',
      onClick: () => console.log('Mark as Occupied - requires new endpoint'),
    },
    {
      label: 'Mark as Being Cleaned',
      icon: '🧹',
      color: 'text-yellow-400',
      show: table.status !== 'Being Cleaned',
      onClick: () => console.log('Mark as Being Cleaned - requires new endpoint'),
    },
    {
      label: 'View History',
      icon: '📊',
      color: 'text-blue-400',
      show: true,
      onClick: () => console.log('View table history'),
    },
    {
      label: 'Edit Details',
      icon: '✏️',
      color: 'text-purple-400',
      show: true,
      onClick: () => console.log('Edit table details'),
    },
  ];

  const visibleActions = actions.filter((action) => action.show);

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#1E1E1E] rounded-2xl shadow-2xl max-w-sm w-full border border-gray-800"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-800">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-bold text-white">Table {table.table_number}</h3>
              <p className="text-sm text-gray-400 mt-1">
                {table.capacity} seats • {table.location}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Current Status Badge */}
          <div className="mt-4">
            <span
              className={`
                inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold
                ${
                  table.status === 'Available'
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : table.status === 'Occupied'
                    ? 'bg-red-500/20 text-red-400'
                    : table.status === 'Being Cleaned'
                    ? 'bg-yellow-500/20 text-yellow-400'
                    : 'bg-gray-500/20 text-gray-400'
                }
              `}
            >
              <span className="w-2 h-2 rounded-full bg-current"></span>
              {table.status}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="p-3">
          <div className="space-y-1">
            {visibleActions.map((action, index) => (
              <button
                key={index}
                onClick={action.onClick}
                disabled={updateTableMutation.isPending}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-[#252525] hover:bg-[#2A2A2A] transition-colors text-left group"
              >
                <span className="text-2xl">{action.icon}</span>
                <span className={`font-medium ${action.color} group-hover:text-white transition-colors`}>
                  {action.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-800">
          <button
            onClick={onClose}
            className="w-full px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-white font-medium rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

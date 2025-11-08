import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../../contexts/ToastContext';
import type { Table } from '../../types/host.types';
import { hostAPI } from '../../services/api';

interface TableActionMenuProps {
  table: Table;
  onClose: () => void;
}

export default function TableActionMenu({ table, onClose }: TableActionMenuProps) {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();

  const updateTableMutation = useMutation({
    mutationFn: ({ status }: { status: 'Available' | 'Occupied' | 'Being Cleaned' | 'Reserved' }) => {
      return hostAPI.updateTableStatus(table.id, status);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['hostDashboard'] });
      const statusText = variables.status === 'Available' ? 'free' : variables.status.toLowerCase();
      success(`Table ${table.table_number} marked as ${statusText}`);
      onClose();
    },
    onError: () => {
      showError(`Failed to update table ${table.table_number}`);
    },
  });

  const actions = [
    {
      label: 'Mark as Free',
      icon: '✅',
      color: 'text-emerald-400',
      show: table.status !== 'Available',
      onClick: () => updateTableMutation.mutate({ status: 'Available' }),
    },
    {
      label: 'Mark as Occupied',
      icon: '🔴',
      color: 'text-red-400',
      show: table.status !== 'Occupied',
      onClick: () => updateTableMutation.mutate({ status: 'Occupied' }),
    },
    {
      label: 'Mark as Reserved',
      icon: '🔵',
      color: 'text-blue-400',
      show: table.status !== 'Reserved',
      onClick: () => updateTableMutation.mutate({ status: 'Reserved' }),
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
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-[#252525] hover:bg-[#2A2A2A] transition-colors text-left group disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {updateTableMutation.isPending ? (
                  <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <span className="text-2xl">{action.icon}</span>
                )}
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

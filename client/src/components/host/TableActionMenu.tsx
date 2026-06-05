import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../../contexts/ToastContext';
import type { Table } from '../../types/host.types';
import { hostAPI } from '../../services/api';
import ThiingsIcon, { type IconName } from '../common/ThiingsIcon';

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

  const actions: { label: string; iconName: IconName; color: string; show: boolean; onClick: () => void }[] = [
    {
      label: 'Mark as Free',
      iconName: 'green-check',
      color: 'text-rose-600',
      show: table.status !== 'Available',
      onClick: () => updateTableMutation.mutate({ status: 'Available' }),
    },
    {
      label: 'Mark as Occupied',
      iconName: 'red-x',
      color: 'text-burgundy',
      show: table.status !== 'Occupied',
      onClick: () => updateTableMutation.mutate({ status: 'Occupied' }),
    },
    {
      label: 'Mark as Reserved',
      iconName: 'clock',
      color: 'text-violet-600',
      show: table.status !== 'Reserved',
      onClick: () => updateTableMutation.mutate({ status: 'Reserved' }),
    },
  ];

  const visibleActions = actions.filter((action) => action.show);

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-sm w-full border border-glass-border-dark"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-glass-border-dark">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-bold text-deep-charcoal">Table {table.table_number}</h3>
              <p className="text-sm text-stone-gray mt-1">
                {table.capacity} seats â€¢ {table.location}
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="text-stone-gray hover:text-deep-charcoal transition-colors"
            >
              <ThiingsIcon name="close" size="sm" />
            </button>
          </div>

          {/* Current Status Badge */}
          <div className="mt-4">
            <span
              className={`
                inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold
                ${
                  table.status === 'Available'
                    ? 'bg-rose-600/10 text-rose-600'
                    : table.status === 'Occupied'
                    ? 'bg-burgundy/10 text-burgundy'
                    : table.status === 'Being Cleaned'
                    ? 'bg-amber-600/10 text-amber-600'
                    : 'bg-stone-gray/10 text-stone-gray'
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
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-soft-gray hover:bg-border-gray transition-colors text-left group disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {updateTableMutation.isPending ? (
                  <div aria-hidden="true" className="w-5 h-5 border-2 border-burgundy border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <ThiingsIcon name={action.iconName} size="sm" />
                )}
                <span className={`font-medium ${action.color} group-hover:text-deep-charcoal transition-colors`}>
                  {action.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-glass-border-dark">
          <button
            onClick={onClose}
            className="w-full px-4 py-2.5 bg-deep-charcoal hover:bg-burgundy text-white font-medium rounded-xl transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

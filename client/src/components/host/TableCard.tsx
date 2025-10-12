import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Table } from '../../types/host.types';
import { hostAPI } from '../../services/api';

interface TableCardProps {
  table: Table;
}

export default function TableCard({ table }: TableCardProps) {
  const queryClient = useQueryClient();
  const [showConfirm, setShowConfirm] = useState(false);

  const markCleanMutation = useMutation({
    mutationFn: () => hostAPI.markTableClean(table.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hostDashboard'] });
      setShowConfirm(false);
    },
  });

  const getStatusColor = () => {
    switch (table.status) {
      case 'Available':
        return 'bg-green-100 border-green-500 text-green-900';
      case 'Occupied':
        return 'bg-red-100 border-red-500 text-red-900';
      case 'Being Cleaned':
        return 'bg-yellow-100 border-yellow-500 text-yellow-900';
      case 'Reserved':
        return 'bg-blue-100 border-blue-500 text-blue-900';
      default:
        return 'bg-gray-100 border-gray-500 text-gray-900';
    }
  };

  const getStatusIcon = () => {
    switch (table.status) {
      case 'Available':
        return '✅';
      case 'Occupied':
        return '🔴';
      case 'Being Cleaned':
        return '🧹';
      case 'Reserved':
        return '📅';
      default:
        return '❓';
    }
  };

  const handleClick = () => {
    if (table.status === 'Being Cleaned') {
      setShowConfirm(true);
    }
  };

  const handleMarkClean = () => {
    markCleanMutation.mutate();
  };

  return (
    <>
      <div
        onClick={handleClick}
        className={`
          ${getStatusColor()}
          border-2 rounded-lg p-3
          ${table.status === 'Being Cleaned' ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}
          transition-all
        `}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="font-bold text-lg">{table.table_number}</span>
          <span className="text-sm">👥 {table.capacity}</span>
        </div>
        <div className="text-xs opacity-75 mb-2">{table.location}</div>
        <div className="flex items-center text-sm font-semibold">
          <span className="mr-1">{getStatusIcon()}</span>
          <span>{table.status}</span>
        </div>
      </div>

      {/* Confirmation Dialog */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm mx-4">
            <h3 className="text-lg font-semibold mb-2">Mark Table Clean?</h3>
            <p className="text-gray-600 mb-4">
              Mark table {table.table_number} as clean and ready for seating?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
                disabled={markCleanMutation.isPending}
              >
                Cancel
              </button>
              <button
                onClick={handleMarkClean}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                disabled={markCleanMutation.isPending}
              >
                {markCleanMutation.isPending ? 'Marking...' : 'Mark Clean'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

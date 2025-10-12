import { useState } from 'react';
import type { ActiveParty } from '../../types/host.types';
import { useCompleteService } from '../../hooks/useCompleteService';

interface ActivePartiesListProps {
  parties: ActiveParty[];
}

export default function ActivePartiesList({ parties }: ActivePartiesListProps) {
  const [confirmingServiceId, setConfirmingServiceId] = useState<string | null>(null);
  const completeServiceMutation = useCompleteService();

  if (parties.length === 0) {
    return <div className="text-sm text-gray-500 text-center py-4">No active parties</div>;
  }

  const handleCompleteService = (serviceId: string) => {
    completeServiceMutation.mutate(serviceId, {
      onSuccess: () => {
        setConfirmingServiceId(null);
      },
    });
  };

  return (
    <div className="space-y-3">
      {parties.map((party) => (
        <div key={party.service_id} className="border rounded-lg p-3 hover:shadow-md transition">
          <div className="flex justify-between items-start mb-2">
            <div>
              <div className="font-semibold text-gray-900">{party.customer_name}</div>
              <div className="text-sm text-gray-600">Party of {party.party_size}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-500">Tables:</div>
              <div className="text-sm font-medium">{party.tables.join(', ')}</div>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-gray-600 mb-2">
            <span>Seated: {party.time_elapsed_minutes} min ago</span>
            <span className={party.is_overdue ? 'text-red-600 font-semibold' : ''}>
              {party.is_overdue ? 'OVERDUE' : `${party.time_remaining_minutes} min left`}
            </span>
          </div>

          {confirmingServiceId === party.service_id ? (
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmingServiceId(null)}
                className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50"
                disabled={completeServiceMutation.isPending}
              >
                Cancel
              </button>
              <button
                onClick={() => handleCompleteService(party.service_id)}
                className="flex-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                disabled={completeServiceMutation.isPending}
              >
                {completeServiceMutation.isPending ? 'Completing...' : 'Confirm'}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmingServiceId(party.service_id)}
              className="w-full px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded transition"
            >
              Complete Service
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

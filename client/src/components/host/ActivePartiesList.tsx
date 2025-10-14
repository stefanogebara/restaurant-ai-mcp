import { useState } from 'react';
import { useToast } from '../../contexts/ToastContext';
import type { ActiveParty } from '../../types/host.types';
import { useCompleteService } from '../../hooks/useCompleteService';

interface ActivePartiesListProps {
  parties: ActiveParty[];
}

export default function ActivePartiesList({ parties }: ActivePartiesListProps) {
  const [confirmingServiceId, setConfirmingServiceId] = useState<string | null>(null);
  const completeServiceMutation = useCompleteService();
  const { success, error: showError } = useToast();

  if (parties.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-4xl mb-3">🍽️</div>
        <div className="text-sm text-gray-400">No active parties</div>
      </div>
    );
  }

  const handleCompleteService = (serviceId: string, partyName: string) => {
    completeServiceMutation.mutate(serviceId, {
      onSuccess: () => {
        setConfirmingServiceId(null);
        success(`Service completed for ${partyName}`);
      },
      onError: () => {
        showError('Failed to complete service');
      },
    });
  };

  return (
    <div className="space-y-3">
      {parties.map((party) => (
        <div
          key={party.service_id}
          className="bg-[#252525] border border-gray-800 rounded-xl p-4 hover:bg-[#2A2A2A] transition-all"
        >
          <div className="flex justify-between items-start mb-3">
            <div>
              <div className="font-semibold text-white text-lg">{party.customer_name}</div>
              <div className="text-sm text-gray-400 mt-0.5">Party of {party.party_size}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-500 mb-1">Tables</div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-purple-500/20 text-purple-400 rounded-lg text-sm font-semibold">
                {party.tables.join(', ')}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs mb-3 pb-3 border-b border-gray-800">
            <div className="flex items-center gap-1.5 text-gray-400">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
              </svg>
              <span>Seated {party.time_elapsed_minutes} min ago</span>
            </div>
            <span
              className={`font-semibold ${
                party.is_overdue ? 'text-red-400' : 'text-emerald-400'
              }`}
            >
              {party.is_overdue ? '⚠️ OVERDUE' : `${party.time_remaining_minutes} min left`}
            </span>
          </div>

          {confirmingServiceId === party.service_id ? (
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmingServiceId(null)}
                className="flex-1 px-3 py-2 text-sm border border-gray-700 text-gray-300 rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={completeServiceMutation.isPending}
              >
                Cancel
              </button>
              <button
                onClick={() => handleCompleteService(party.service_id, party.customer_name)}
                className="flex-1 px-3 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition-colors shadow-lg shadow-emerald-500/30 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={completeServiceMutation.isPending}
              >
                {completeServiceMutation.isPending && (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                )}
                {completeServiceMutation.isPending ? 'Completing...' : 'Confirm'}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmingServiceId(party.service_id)}
              className="w-full px-3 py-2 text-sm bg-gray-800 hover:bg-gray-700 text-white font-medium rounded-lg transition-all"
            >
              Complete Service
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

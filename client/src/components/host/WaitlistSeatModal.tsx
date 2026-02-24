import { useMutation } from '@tanstack/react-query';
import { authFetch } from '../../services/api';
import type { TableRecommendation } from '../../types/host.types';
import { useState } from 'react';

interface WaitlistEntry {
  id: string;
  waitlist_id: string;
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  party_size: number;
  special_requests?: string;
  status: string;
}

interface WaitlistSeatModalProps {
  isOpen: boolean;
  entry: WaitlistEntry | null;
  onClose: () => void;
  onSuccess: (data: any) => void;
}

export default function WaitlistSeatModal({ isOpen, entry, onClose, onSuccess }: WaitlistSeatModalProps) {
  const [recommendations, setRecommendations] = useState<TableRecommendation[] | null>(null);
  const [selectedTables, setSelectedTables] = useState<string[]>([]);

  const findTablesMutation = useMutation({
    mutationFn: async (partySize: number) => {
      const response = await authFetch('/api/host-dashboard?action=check-walk-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          party_size: partySize,
        }),
      });
      if (!response.ok) throw new Error('Failed to find tables');
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success && data.can_accommodate) {
        setRecommendations([data.recommendation, ...data.all_options]);
        if (data.recommendation?.tables) {
          setSelectedTables(data.recommendation.tables);
        }
      }
    },
  });

  const handleFindTables = () => {
    if (entry) {
      findTablesMutation.mutate(entry.party_size);
    }
  };

  const handleSelectOption = (option: TableRecommendation) => {
    setSelectedTables(option.tables);
  };

  const handleProceedToSeat = () => {
    if (entry) {
      onSuccess({
        type: 'waitlist',
        waitlist_id: entry.id,
        customer_name: entry.customer_name,
        customer_phone: entry.customer_phone,
        party_size: entry.party_size,
        special_requests: entry.special_requests,
        table_ids: selectedTables,
      });
    }
  };

  if (!isOpen || !entry) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-border-gray max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-deep-charcoal">Seat Waitlist Customer</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-soft-gray text-muted-stone hover:text-deep-charcoal transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Customer Details */}
          <div className="bg-soft-gray rounded-xl p-5 mb-6 border border-border-gray">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-muted-stone mb-1">Customer</div>
                <div className="font-semibold text-deep-charcoal">{entry.customer_name}</div>
              </div>
              <div>
                <div className="text-sm text-muted-stone mb-1">Party Size</div>
                <div className="font-semibold text-deep-charcoal">{entry.party_size} guests</div>
              </div>
              <div>
                <div className="text-sm text-muted-stone mb-1">Phone</div>
                <div className="font-semibold text-deep-charcoal">{entry.customer_phone}</div>
              </div>
              <div>
                <div className="text-sm text-muted-stone mb-1">Status</div>
                <div className="font-semibold text-amber-600">{entry.status}</div>
              </div>
            </div>
            {entry.special_requests && (
              <div className="mt-4 pt-4 border-t border-border-gray">
                <div className="text-sm text-muted-stone mb-1">Special Requests</div>
                <div className="text-sm text-stone-gray italic">"{entry.special_requests}"</div>
              </div>
            )}
          </div>

          {/* Step 1: Find Tables */}
          {!recommendations && (
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-3 border border-border-gray text-stone-gray rounded-xl hover:bg-soft-gray transition-colors font-medium"
                disabled={findTablesMutation.isPending}
              >
                Cancel
              </button>
              <button
                onClick={handleFindTables}
                className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl transition-colors disabled:bg-muted-stone"
                disabled={findTablesMutation.isPending}
              >
                {findTablesMutation.isPending ? 'Finding Tables...' : 'Find Available Tables'}
              </button>
            </div>
          )}

          {/* Step 2: Table Recommendations */}
          {recommendations && (
            <>
              <h3 className="font-semibold text-deep-charcoal mb-4">Available Table Options</h3>
              <div className="space-y-3 mb-6">
                {recommendations.map((option, index) => (
                  <div
                    key={index}
                    onClick={() => handleSelectOption(option)}
                    className={`
                      border-2 rounded-2xl p-4 cursor-pointer transition-all
                      ${
                        selectedTables.join(',') === option.tables.join(',')
                          ? 'border-green-600 bg-green-600/10'
                          : 'border-border-gray hover:border-green-600/50 bg-white'
                      }
                    `}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <div className="font-semibold text-lg text-deep-charcoal">
                          Tables: {option.tables.join(', ')}
                        </div>
                        <div className="text-sm text-stone-gray">
                          Total Capacity: {option.total_capacity} seats
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium text-green-600">
                          Score: {option.score}
                        </div>
                        <div className="text-xs text-muted-stone capitalize">
                          {option.match_quality}
                        </div>
                      </div>
                    </div>
                    <div className="text-sm text-stone-gray">{option.reason}</div>
                  </div>
                ))}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-3 border border-border-gray text-stone-gray rounded-xl hover:bg-soft-gray transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleProceedToSeat}
                  className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl transition-colors disabled:bg-muted-stone"
                  disabled={selectedTables.length === 0}
                >
                  Proceed to Seat
                </button>
              </div>
            </>
          )}

          {findTablesMutation.isError && (
            <div className="text-sm text-burgundy bg-burgundy/5 border border-burgundy/20 p-4 rounded-xl mt-4">
              Error finding tables. Please try again.
            </div>
          )}

          {findTablesMutation.data && !findTablesMutation.data.can_accommodate && (
            <div className="text-sm text-amber-600 bg-amber-600/10 border border-amber-600/20 p-4 rounded-xl mt-4">
              No suitable tables currently available. Estimated wait: {findTablesMutation.data.estimated_wait_time}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

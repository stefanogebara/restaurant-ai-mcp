import { useSeatParty } from '../../hooks/useSeatParty';

interface SeatPartyModalProps {
  isOpen: boolean;
  data: any;
  onClose: () => void;
  onRetryTableSelection?: () => void;
}

export default function SeatPartyModal({ isOpen, data, onClose, onRetryTableSelection }: SeatPartyModalProps) {
  const seatPartyMutation = useSeatParty();

  if (!isOpen || !data) return null;

  const handleConfirm = () => {
    const request = {
      type: data.type,
      reservation_id: data.reservation_id,
      customer_name: data.customer_name,
      customer_phone: data.customer_phone,
      party_size: data.party_size,
      table_ids: data.table_ids,
      special_requests: data.special_requests,
    };

    seatPartyMutation.mutate(request, {
      onSuccess: () => {
        setTimeout(() => {
          onClose();
        }, 2000);
      },
    });
  };

  const handleRetry = () => {
    seatPartyMutation.reset();
    if (onRetryTableSelection) {
      onRetryTableSelection();
    } else {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div role="dialog" aria-modal="true" aria-label="Confirm Seating" className="bg-white rounded-2xl shadow-2xl border border-[#E7E5E4] p-6 max-w-md w-full mx-4">
        <h2 className="text-xl font-bold text-[#1C1917] mb-4">Confirm Seating</h2>

        {seatPartyMutation.isSuccess ? (
          <div className="text-center py-8">
            <div className="text-6xl mb-4">✅</div>
            <div className="text-lg font-semibold text-[#16a34a] mb-2">
              Party Seated Successfully!
            </div>
            <div className="text-sm text-[#57534E]">
              {data.customer_name} has been seated at Table {(data.table_numbers || data.table_ids).join(', ')}
            </div>
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="bg-[#F5F5F4] rounded-xl p-4 mb-4 space-y-2 border border-[#E7E5E4]">
              <div className="flex justify-between">
                <span className="text-[#57534E]">Customer:</span>
                <span className="font-semibold text-[#1C1917]">{data.customer_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#57534E]">Party Size:</span>
                <span className="font-semibold text-[#1C1917]">{data.party_size} guests</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#57534E]">Tables:</span>
                <span className="font-semibold text-[#1C1917]">Table {(data.table_numbers || data.table_ids)?.join(', ')}</span>
              </div>
              {data.recommendations && (
                <div className="flex justify-between">
                  <span className="text-[#57534E]">Total Capacity:</span>
                  <span className="font-semibold text-[#1C1917]">
                    {data.recommendations.recommendation?.total_capacity} seats
                  </span>
                </div>
              )}
              {data.special_requests && (
                <div className="pt-2 border-t border-[#E7E5E4]">
                  <div className="text-[#57534E] text-sm">Special Requests:</div>
                  <div className="text-sm italic text-[#1C1917]">{data.special_requests}</div>
                </div>
              )}
            </div>

            {seatPartyMutation.isError && (
              <div className="bg-[#9F1239]/5 border border-[#9F1239]/20 rounded-xl p-4 mb-4">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">⚠️</span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-[#9F1239] mb-1">
                      Unable to seat party
                    </p>
                    <p className="text-sm text-[#9F1239]/80 mb-3">
                      The selected tables may no longer be available. Please choose different tables.
                    </p>
                    <button
                      onClick={handleRetry}
                      className="text-sm font-medium text-[#9F1239] hover:text-[#881337] underline focus:outline-none focus:ring-2 focus:ring-[#9F1239] rounded"
                    >
                      ← Select Different Tables
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-3 border border-[#E7E5E4] text-[#57534E] rounded-xl hover:bg-[#F5F5F4] font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[#9F1239]"
                disabled={seatPartyMutation.isPending}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                className="flex-1 px-4 py-3 bg-[#16a34a] text-white rounded-xl hover:bg-[#15803d] font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[#16a34a] disabled:bg-[#A8A29E] disabled:cursor-not-allowed"
                disabled={seatPartyMutation.isPending}
              >
                {seatPartyMutation.isPending ? 'Seating...' : 'Confirm Seating'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

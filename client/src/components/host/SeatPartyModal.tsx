import { useSeatParty } from '../../hooks/useSeatParty';
import ThiingsIcon from '../common/ThiingsIcon';

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
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !seatPartyMutation.isPending) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-border-gray p-6 max-w-md w-full mx-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-deep-charcoal">Confirm Seating</h2>
          {!seatPartyMutation.isPending && (
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
          )}
        </div>

        {seatPartyMutation.isSuccess ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="text-lg font-semibold text-green-600 mb-2">
              Party Seated Successfully!
            </div>
            <div className="text-sm text-stone-gray mb-6">
              {data.customer_name} has been seated at Table {(data.table_numbers || data.table_ids).join(', ')}
            </div>
            <button
              onClick={onClose}
              className="px-6 py-2.5 bg-deep-charcoal text-white font-medium rounded-xl hover:bg-charcoal-dark transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="bg-soft-gray rounded-xl p-4 mb-4 space-y-2 border border-border-gray">
              <div className="flex justify-between">
                <span className="text-stone-gray">Customer:</span>
                <span className="font-semibold text-deep-charcoal">{data.customer_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-gray">Party Size:</span>
                <span className="font-semibold text-deep-charcoal">{data.party_size} guests</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-gray">Tables:</span>
                <span className="font-semibold text-deep-charcoal">Table {(data.table_numbers || data.table_ids)?.join(', ')}</span>
              </div>
              {data.recommendations && (
                <div className="flex justify-between">
                  <span className="text-stone-gray">Total Capacity:</span>
                  <span className="font-semibold text-deep-charcoal">
                    {data.recommendations.recommendation?.total_capacity} seats
                  </span>
                </div>
              )}
              {data.special_requests && (
                <div className="pt-2 border-t border-border-gray">
                  <div className="text-stone-gray text-sm">Special Requests:</div>
                  <div className="text-sm italic text-deep-charcoal">{data.special_requests}</div>
                </div>
              )}
            </div>

            {seatPartyMutation.isError && (
              <div className="bg-burgundy/5 border border-burgundy/20 rounded-xl p-4 mb-4">
                <div className="flex items-start gap-3">
                  <ThiingsIcon name="alert-triangle" pxSize={24} />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-burgundy mb-1">
                      Unable to seat party
                    </p>
                    <p className="text-sm text-burgundy/80 mb-3">
                      The selected tables may no longer be available. Please choose different tables.
                    </p>
                    <button
                      onClick={handleRetry}
                      className="text-sm font-medium text-burgundy hover:text-burgundy-dark underline focus:outline-none focus:ring-2 focus:ring-burgundy rounded"
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
                className="flex-1 px-4 py-3 border border-border-gray text-stone-gray rounded-xl hover:bg-soft-gray font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-burgundy"
                disabled={seatPartyMutation.isPending}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                className="flex-1 px-4 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-green-600 disabled:bg-muted-stone disabled:cursor-not-allowed"
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

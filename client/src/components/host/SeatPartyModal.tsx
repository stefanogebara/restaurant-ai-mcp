import { useSeatParty } from '../../hooks/useSeatParty';

interface SeatPartyModalProps {
  isOpen: boolean;
  data: any;
  onClose: () => void;
}

export default function SeatPartyModal({ isOpen, data, onClose }: SeatPartyModalProps) {
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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h2 className="text-xl font-bold mb-4">Confirm Seating</h2>

        {seatPartyMutation.isSuccess ? (
          <div className="text-center py-8">
            <div className="text-6xl mb-4">✅</div>
            <div className="text-lg font-semibold text-green-600 mb-2">
              Party Seated Successfully!
            </div>
            <div className="text-sm text-gray-600">
              {data.customer_name} has been seated at tables {data.table_ids.join(', ')}
            </div>
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="bg-gray-50 rounded-lg p-4 mb-4 space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Customer:</span>
                <span className="font-semibold">{data.customer_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Party Size:</span>
                <span className="font-semibold">{data.party_size} guests</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Tables:</span>
                <span className="font-semibold">{data.table_ids?.join(', ')}</span>
              </div>
              {data.recommendations && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Capacity:</span>
                  <span className="font-semibold">
                    {data.recommendations.recommendation?.total_capacity} seats
                  </span>
                </div>
              )}
              {data.special_requests && (
                <div className="pt-2 border-t">
                  <div className="text-gray-600 text-sm">Special Requests:</div>
                  <div className="text-sm italic">{data.special_requests}</div>
                </div>
              )}
            </div>

            {seatPartyMutation.isError && (
              <div className="text-sm text-red-600 bg-red-50 p-3 rounded mb-4">
                Error seating party. The tables may no longer be available. Please try again.
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                disabled={seatPartyMutation.isPending}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
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

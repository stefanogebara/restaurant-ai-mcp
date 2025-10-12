import { useMutation } from '@tanstack/react-query';
import type { UpcomingReservation, TableRecommendation } from '../../types/host.types';
import { hostAPI } from '../../services/api';
import { useState } from 'react';

interface CheckInModalProps {
  isOpen: boolean;
  reservation: UpcomingReservation | null;
  onClose: () => void;
  onSuccess: (data: any) => void;
}

export default function CheckInModal({ isOpen, reservation, onClose, onSuccess }: CheckInModalProps) {
  const [recommendations, setRecommendations] = useState<TableRecommendation[] | null>(null);
  const [selectedTables, setSelectedTables] = useState<string[]>([]);

  const checkInMutation = useMutation({
    mutationFn: (reservationId: string) => hostAPI.checkIn(reservationId),
    onSuccess: (response) => {
      const data = response.data;
      setRecommendations([data.recommendation, ...data.all_options]);
      if (data.recommendation?.tables) {
        setSelectedTables(data.recommendation.tables);
      }
    },
  });

  const handleCheckIn = () => {
    if (reservation) {
      checkInMutation.mutate(reservation.reservation_id);
    }
  };

  const handleSelectOption = (option: TableRecommendation) => {
    setSelectedTables(option.tables);
  };

  const handleProceedToSeat = () => {
    if (reservation) {
      onSuccess({
        type: 'reservation',
        reservation_id: reservation.reservation_id,
        customer_name: reservation.customer_name,
        customer_phone: reservation.customer_phone,
        party_size: reservation.party_size,
        special_requests: reservation.special_requests,
        table_ids: selectedTables,
      });
    }
  };

  if (!isOpen || !reservation) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-4">Check In Reservation</h2>

        {/* Reservation Details */}
        <div className="bg-gray-50 rounded-lg p-4 mb-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-gray-600">Customer</div>
              <div className="font-semibold">{reservation.customer_name}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Party Size</div>
              <div className="font-semibold">{reservation.party_size} guests</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Time</div>
              <div className="font-semibold">{reservation.reservation_time}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Phone</div>
              <div className="font-semibold">{reservation.customer_phone}</div>
            </div>
          </div>
          {reservation.special_requests && (
            <div className="mt-3 pt-3 border-t">
              <div className="text-sm text-gray-600">Special Requests</div>
              <div className="text-sm italic">{reservation.special_requests}</div>
            </div>
          )}
        </div>

        {/* Step 1: Check In */}
        {!recommendations && (
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              disabled={checkInMutation.isPending}
            >
              Cancel
            </button>
            <button
              onClick={handleCheckIn}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              disabled={checkInMutation.isPending}
            >
              {checkInMutation.isPending ? 'Checking...' : 'Check In & Find Tables'}
            </button>
          </div>
        )}

        {/* Step 2: Table Recommendations */}
        {recommendations && (
          <>
            <h3 className="font-semibold mb-3">Available Table Options</h3>
            <div className="space-y-3 mb-4">
              {recommendations.map((option, index) => (
                <div
                  key={index}
                  onClick={() => handleSelectOption(option)}
                  className={`
                    border-2 rounded-lg p-4 cursor-pointer transition
                    ${
                      selectedTables.join(',') === option.tables.join(',')
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }
                  `}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="font-semibold text-lg">
                        Tables: {option.tables.join(', ')}
                      </div>
                      <div className="text-sm text-gray-600">
                        Total Capacity: {option.total_capacity} seats
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium text-blue-600">
                        Score: {option.score}
                      </div>
                      <div className="text-xs text-gray-600 capitalize">
                        {option.match_quality}
                      </div>
                    </div>
                  </div>
                  <div className="text-sm text-gray-700">{option.reason}</div>
                </div>
              ))}
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleProceedToSeat}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                disabled={selectedTables.length === 0}
              >
                Proceed to Seat
              </button>
            </div>
          </>
        )}

        {checkInMutation.isError && (
          <div className="text-sm text-red-600 bg-red-50 p-3 rounded mt-3">
            Error checking in reservation. Please try again.
          </div>
        )}
      </div>
    </div>
  );
}

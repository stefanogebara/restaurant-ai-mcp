import { useState } from 'react';
import type { UpcomingReservation, Table } from '../../types/host.types';
import TableCombinationSelector from './TableCombinationSelector';

interface CheckInModalProps {
  isOpen: boolean;
  reservation: UpcomingReservation | null;
  onClose: () => void;
  onSuccess: (data: any) => void;
  availableTables: Table[];
}

export default function CheckInModal({ isOpen, reservation, onClose, onSuccess, availableTables }: CheckInModalProps) {
  const [showTableSelection, setShowTableSelection] = useState(false);
  const [selectedTableIds, setSelectedTableIds] = useState<string[]>([]);

  const handleCheckIn = () => {
    setShowTableSelection(true);
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
        table_ids: selectedTableIds,
      });
    }
  };

  const handleClose = () => {
    setShowTableSelection(false);
    setSelectedTableIds([]);
    onClose();
  };

  const handleBack = () => {
    setShowTableSelection(false);
    setSelectedTableIds([]);
  };

  if (!isOpen || !reservation) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Check In Reservation</h2>

        {/* Reservation Details */}
        <div className="bg-gray-50 rounded-lg p-4 mb-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-gray-600">Customer</div>
              <div className="font-semibold text-gray-900 text-lg">{reservation.customer_name}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Party Size</div>
              <div className="font-semibold text-gray-900 text-lg">{reservation.party_size} guests</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Time</div>
              <div className="font-semibold text-gray-900 text-lg">{reservation.reservation_time}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Phone</div>
              <div className="font-semibold text-gray-900 text-lg">{reservation.customer_phone}</div>
            </div>
          </div>
          {reservation.special_requests && (
            <div className="mt-3 pt-3 border-t border-gray-200">
              <div className="text-sm text-gray-600 font-medium">Special Requests</div>
              <div className="text-sm text-gray-800 italic mt-1">{reservation.special_requests}</div>
            </div>
          )}
        </div>

        {/* Step 1: Check In */}
        {!showTableSelection && (
          <div className="flex gap-3">
            <button
              onClick={handleClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleCheckIn}
              className="flex-1 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700"
            >
              Check In & Find Tables
            </button>
          </div>
        )}

        {/* Step 2: Table Selection */}
        {showTableSelection && (
          <>
            {/* Table Combination Selector */}
            <TableCombinationSelector
              availableTables={availableTables}
              partySize={reservation.party_size}
              onSelect={setSelectedTableIds}
              selectedTableIds={selectedTableIds}
            />

            <div className="flex gap-3 pt-4">
              <button
                onClick={handleBack}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50"
              >
                Back
              </button>
              <button
                onClick={handleProceedToSeat}
                className="flex-1 px-4 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                disabled={selectedTableIds.length === 0}
              >
                Proceed to Seat
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

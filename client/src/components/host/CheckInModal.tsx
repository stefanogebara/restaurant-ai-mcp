import { useState } from 'react';
import type { UpcomingReservation, Table, SeatModalData } from '../../types/host.types';
import TableCombinationSelector from './TableCombinationSelector';
import ThiingsIcon from '../common/ThiingsIcon';

interface CheckInModalProps {
  isOpen: boolean;
  reservation: UpcomingReservation | null;
  onClose: () => void;
  onSuccess: (data: SeatModalData) => void;
  availableTables: Table[];
}

export default function CheckInModal({ isOpen, reservation, onClose, onSuccess, availableTables }: CheckInModalProps) {
  const [showTableSelection, setShowTableSelection] = useState(false);
  const [selectedTableIds, setSelectedTableIds] = useState<string[]>([]);
  const [selectedTableNumbers, setSelectedTableNumbers] = useState<string[]>([]);

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
        table_numbers: selectedTableNumbers,
      });
    }
  };

  const handleClose = () => {
    setShowTableSelection(false);
    setSelectedTableIds([]);
    setSelectedTableNumbers([]);
    onClose();
  };

  const handleBack = () => {
    setShowTableSelection(false);
    setSelectedTableIds([]);
    setSelectedTableNumbers([]);
  };

  const handleTableSelect = (tableIds: string[], tableNumbers: string[]) => {
    setSelectedTableIds(tableIds);
    setSelectedTableNumbers(tableNumbers);
  };

  if (!isOpen || !reservation) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div role="dialog" aria-modal="true" aria-label="Check In Reservation" className="bg-white rounded-2xl shadow-2xl border border-border-gray p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-deep-charcoal">Check In Reservation</h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-soft-gray text-muted-stone hover:text-deep-charcoal transition-colors"
          >
            <ThiingsIcon name="close" pxSize={16} />
          </button>
        </div>

        {/* Reservation Details */}
        <div className="bg-soft-gray rounded-xl p-4 mb-4 border border-border-gray">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-stone-gray">Customer</div>
              <div className="font-semibold text-deep-charcoal text-lg">{reservation.customer_name}</div>
            </div>
            <div>
              <div className="text-sm text-stone-gray">Party Size</div>
              <div className="font-semibold text-deep-charcoal text-lg">{reservation.party_size} guests</div>
            </div>
            <div>
              <div className="text-sm text-stone-gray">Time</div>
              <div className="font-semibold text-deep-charcoal text-lg">{reservation.reservation_time}</div>
            </div>
            <div>
              <div className="text-sm text-stone-gray">Phone</div>
              <div className="font-semibold text-deep-charcoal text-lg">{reservation.customer_phone}</div>
            </div>
          </div>
          {reservation.special_requests && (
            <div className="mt-3 pt-3 border-t border-border-gray">
              <div className="text-sm text-stone-gray font-medium">Special Requests</div>
              <div className="text-sm text-deep-charcoal italic mt-1">{reservation.special_requests}</div>
            </div>
          )}
        </div>

        {/* Step 1: Check In */}
        {!showTableSelection && (
          <div className="flex gap-3">
            <button
              onClick={handleClose}
              className="flex-1 px-4 py-3 border border-border-gray text-stone-gray font-medium rounded-xl hover:bg-soft-gray transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCheckIn}
              className="flex-1 px-4 py-3 bg-burgundy text-white font-medium rounded-xl hover:bg-burgundy-dark transition-colors"
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
              onSelect={handleTableSelect}
              selectedTableIds={selectedTableIds}
            />

            <div className="flex gap-3 pt-4">
              <button
                onClick={handleBack}
                className="flex-1 px-4 py-3 border border-border-gray text-stone-gray font-medium rounded-xl hover:bg-soft-gray transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleProceedToSeat}
                className="flex-1 px-4 py-3 bg-green-600 text-white font-medium rounded-xl hover:bg-green-700 disabled:bg-muted-stone disabled:cursor-not-allowed transition-colors"
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

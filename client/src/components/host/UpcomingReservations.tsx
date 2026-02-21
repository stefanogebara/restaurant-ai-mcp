import type { UpcomingReservation } from '../../types/host.types';

interface UpcomingReservationsProps {
  reservations: UpcomingReservation[];
  onCheckIn: (reservation: UpcomingReservation) => void;
}

export default function UpcomingReservations({ reservations, onCheckIn }: UpcomingReservationsProps) {
  if (reservations.length === 0) {
    return <div className="text-sm text-[#57534E] text-center py-4">No upcoming reservations</div>;
  }

  return (
    <div className="space-y-3">
      {reservations.map((reservation) => (
        <div key={reservation.reservation_id} className="border border-[#E7E5E4] rounded-xl p-3 hover:shadow-md transition bg-white">
          <div className="flex justify-between items-start mb-2">
            <div>
              <div className="font-semibold text-[#1C1917]">{reservation.customer_name}</div>
              <div className="text-sm text-[#57534E]">Party of {reservation.party_size}</div>
            </div>
            <div className="text-right">
              <div className="text-sm font-medium text-[#9F1239]">{reservation.reservation_time}</div>
              {reservation.checked_in && (
                <div className="text-xs text-[#16a34a]">✓ Checked In</div>
              )}
            </div>
          </div>

          {reservation.special_requests && (
            <div className="text-xs text-[#57534E] mb-2 italic bg-[#F5F5F4] p-2 rounded-lg">
              Note: {reservation.special_requests}
            </div>
          )}

          {!reservation.checked_in && (
            <button
              onClick={() => onCheckIn(reservation)}
              className="w-full px-3 py-2 text-sm bg-[#9F1239] text-white rounded-lg hover:bg-[#881337] transition font-medium"
            >
              Check In
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

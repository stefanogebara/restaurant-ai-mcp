import type { UpcomingReservation } from '../../types/host.types';

interface UpcomingReservationsProps {
  reservations: UpcomingReservation[];
  onCheckIn: (reservation: UpcomingReservation) => void;
}

export default function UpcomingReservations({ reservations, onCheckIn }: UpcomingReservationsProps) {
  if (reservations.length === 0) {
    return <div className="text-sm text-gray-500 text-center py-4">No upcoming reservations</div>;
  }

  return (
    <div className="space-y-3">
      {reservations.map((reservation) => (
        <div key={reservation.reservation_id} className="border rounded-lg p-3 hover:shadow-md transition">
          <div className="flex justify-between items-start mb-2">
            <div>
              <div className="font-semibold text-gray-900">{reservation.customer_name}</div>
              <div className="text-sm text-gray-600">Party of {reservation.party_size}</div>
            </div>
            <div className="text-right">
              <div className="text-sm font-medium text-blue-600">{reservation.reservation_time}</div>
              {reservation.checked_in && (
                <div className="text-xs text-green-600">✓ Checked In</div>
              )}
            </div>
          </div>

          {reservation.special_requests && (
            <div className="text-xs text-gray-600 mb-2 italic">
              Note: {reservation.special_requests}
            </div>
          )}

          {!reservation.checked_in && (
            <button
              onClick={() => onCheckIn(reservation)}
              className="w-full px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition"
            >
              Check In
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

import type { UpcomingReservation } from '../../types/host.types';
import ThiingsIcon from '../common/ThiingsIcon';

interface UpcomingReservationsProps {
  reservations: UpcomingReservation[];
  onCheckIn: (reservation: UpcomingReservation) => void;
}

export default function UpcomingReservations({ reservations, onCheckIn }: UpcomingReservationsProps) {
  if (reservations.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="w-12 h-12 mx-auto mb-3 bg-soft-gray rounded-2xl flex items-center justify-center">
          <ThiingsIcon name="calendar" pxSize={22} />
        </div>
        <p className="text-sm font-semibold text-deep-charcoal">No upcoming reservations</p>
        <p className="text-xs text-stone-gray mt-1">Reservations will appear here once booked</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {reservations.map((reservation) => (
        <div key={reservation.reservation_id} className="border border-border-gray rounded-2xl p-3 hover:shadow-md transition bg-white">
          <div className="flex justify-between items-start mb-2">
            <div>
              <div className="font-semibold text-deep-charcoal">{reservation.customer_name}</div>
              <div className="text-sm text-stone-gray">Party of {reservation.party_size}</div>
            </div>
            <div className="text-right">
              <div className="text-sm font-medium text-burgundy">{reservation.reservation_time}</div>
              {reservation.checked_in && (
                <div className="text-xs text-green-600">✓ Checked In</div>
              )}
            </div>
          </div>

          {reservation.special_requests && (
            <div className="text-xs text-stone-gray mb-2 italic bg-soft-gray p-2 rounded-xl">
              Note: {reservation.special_requests}
            </div>
          )}

          {!reservation.checked_in && (
            <button
              onClick={() => onCheckIn(reservation)}
              className="w-full px-3 py-2 text-sm bg-burgundy text-white rounded-lg hover:bg-burgundy-dark transition font-medium"
            >
              Check In
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

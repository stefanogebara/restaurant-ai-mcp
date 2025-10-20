import type { UpcomingReservation } from '../../types/host.types';

interface ReservationDetailsModalProps {
  isOpen: boolean;
  reservation: UpcomingReservation | null;
  onClose: () => void;
}

export default function ReservationDetailsModal({ isOpen, reservation, onClose }: ReservationDetailsModalProps) {
  if (!isOpen || !reservation) return null;

  // Format time for display
  const formatTime = (timeStr: string) => {
    if (!timeStr) return '';
    const [hours, minutes] = timeStr.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  // Format date for display
  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr + 'T00:00:00');
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    };
    return date.toLocaleDateString('en-US', options);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-[#1E1E1E] rounded-xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto border border-gray-700"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-2xl font-bold text-white mb-1">Reservation Details</h2>
            <p className="text-gray-400 text-sm">ID: {reservation.reservation_id}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-700 rounded-lg transition"
          >
            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Status Badge */}
        {reservation.checked_in && (
          <div className="mb-4">
            <span className="px-3 py-1.5 bg-green-500/20 text-green-400 text-sm rounded-lg inline-flex items-center gap-2">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              Checked In
              {reservation.checked_in_at && (
                <span className="text-xs">· {new Date(reservation.checked_in_at).toLocaleTimeString()}</span>
              )}
            </span>
          </div>
        )}

        {/* Main Details Grid */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          {/* Customer Name */}
          <div className="bg-[#0A0A0A] rounded-lg p-4 border border-gray-800">
            <div className="text-xs text-gray-500 mb-1">Customer Name</div>
            <div className="text-white font-semibold text-lg">{reservation.customer_name}</div>
          </div>

          {/* Party Size */}
          <div className="bg-[#0A0A0A] rounded-lg p-4 border border-gray-800">
            <div className="text-xs text-gray-500 mb-1">Party Size</div>
            <div className="text-white font-semibold text-lg flex items-center gap-2">
              <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              {reservation.party_size} guests
            </div>
          </div>

          {/* Date */}
          <div className="bg-[#0A0A0A] rounded-lg p-4 border border-gray-800">
            <div className="text-xs text-gray-500 mb-1">Date</div>
            <div className="text-white font-semibold">{formatDate(reservation.date)}</div>
          </div>

          {/* Time */}
          <div className="bg-[#0A0A0A] rounded-lg p-4 border border-gray-800">
            <div className="text-xs text-gray-500 mb-1">Time</div>
            <div className="text-white font-semibold text-lg flex items-center gap-2">
              <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {formatTime(reservation.time || '')}
            </div>
          </div>

          {/* Phone */}
          {reservation.customer_phone && (
            <div className="bg-[#0A0A0A] rounded-lg p-4 border border-gray-800">
              <div className="text-xs text-gray-500 mb-1">Phone Number</div>
              <div className="text-white font-semibold flex items-center gap-2">
                <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                {reservation.customer_phone}
              </div>
            </div>
          )}

          {/* Status */}
          {reservation.status && (
            <div className="bg-[#0A0A0A] rounded-lg p-4 border border-gray-800">
              <div className="text-xs text-gray-500 mb-1">Status</div>
              <div className="text-white font-semibold capitalize">{reservation.status}</div>
            </div>
          )}
        </div>

        {/* Special Requests */}
        {reservation.special_requests && (
          <div className="mb-6">
            <div className="bg-[#0A0A0A] rounded-lg p-4 border border-gray-800">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                </svg>
                <div className="flex-1">
                  <div className="text-xs text-gray-500 mb-1">Special Requests</div>
                  <div className="text-white">{reservation.special_requests}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

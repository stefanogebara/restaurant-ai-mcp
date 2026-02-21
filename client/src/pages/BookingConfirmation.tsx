import { useLocation, useNavigate, useParams } from 'react-router-dom';

interface ReservationData {
  id: string;
  name: string;
  party_size: number;
  date: string;
  time: string;
  status: string;
  restaurant_name: string;
}

export default function BookingConfirmation() {
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as { reservation?: ReservationData; restaurant_name?: string } | null;

  const reservation = state?.reservation;

  // Format time for display (24h -> 12h)
  const formatTime = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${hour}:${String(m).padStart(2, '0')} ${period}`;
  };

  // If no reservation data (direct navigation), show generic message
  if (!reservation) {
    return (
      <div className="min-h-screen bg-[#FAFAF9] flex flex-col items-center justify-center p-6">
        <div className="bg-white border border-[#E7E5E4] rounded-2xl p-8 max-w-md text-center shadow-sm">
          <h1 className="text-xl font-bold text-[#1C1917] mb-2">Reservation</h1>
          <p className="text-sm text-[#57534E] mb-6">No reservation details found.</p>
          {slug && (
            <button
              onClick={() => navigate(`/book/${slug}`)}
              className="px-6 py-3 bg-[#9F1239] hover:bg-[#881337] text-white font-semibold rounded-full transition-colors"
            >
              Make a Reservation
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAF9] flex flex-col">
      {/* Top Bar */}
      <header className="flex justify-between items-center px-6 sm:px-10 py-4 border-b border-[#E7E5E4] bg-white">
        <div className="font-serif text-lg font-semibold text-[#1C1917]">
          seatable<span className="text-[#9F1239]">.</span>
        </div>
        <span className="text-[13px] text-[#78716C]">Need help? Contact the restaurant</span>
      </header>

      {/* Confirmation */}
      <main className="flex-1 flex items-center justify-center p-6 sm:p-12">
        <div className="max-w-[480px] w-full text-center">
          {/* Burgundy Checkmark */}
          <div className="w-20 h-20 rounded-full bg-[rgba(159,18,57,0.08)] flex items-center justify-center mx-auto mb-7">
            <svg className="w-9 h-9" viewBox="0 0 24 24" fill="none" stroke="#9F1239" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>

          {/* Status Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-[rgba(22,163,74,0.06)] rounded-full mb-5">
            <div className="w-2 h-2 rounded-full bg-[#16a34a]" />
            <span className="text-[13px] font-semibold text-[#16a34a]">Confirmed</span>
          </div>

          <h1 className="font-serif text-4xl font-medium text-[#1C1917] tracking-tight mb-2">Reservation Confirmed</h1>
          <p className="text-[15px] text-[#78716C] font-light mb-10">
            We've sent a confirmation to your email and phone.
          </p>

          {/* Details Card */}
          <div className="bg-white border border-[#E7E5E4] rounded-2xl p-8 text-left mb-6">
            {/* Restaurant Row */}
            <div className="flex items-center gap-4 pb-5 mb-5 border-b border-[#F5F5F4]">
              <div className="w-14 h-14 rounded-[14px] bg-gradient-to-br from-[#292524] to-[#44403C] flex-shrink-0" />
              <div>
                <h3 className="text-lg font-semibold text-[#1C1917] tracking-tight">{reservation.restaurant_name}</h3>
                <p className="text-[13px] text-[#78716C] font-light">Reservation details</p>
              </div>
            </div>

            {/* Detail Rows */}
            <div className="space-y-0">
              <div className="flex justify-between items-center py-2.5 border-b border-[#F5F5F4]">
                <span className="text-[13px] text-[#78716C]">Date</span>
                <span className="text-sm font-medium text-[#1C1917]">
                  {new Date(reservation.date + 'T12:00:00').toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric'
                  })}
                </span>
              </div>
              <div className="flex justify-between items-center py-2.5 border-b border-[#F5F5F4]">
                <span className="text-[13px] text-[#78716C]">Time</span>
                <span className="text-sm font-medium text-[#1C1917]">{formatTime(reservation.time)}</span>
              </div>
              <div className="flex justify-between items-center py-2.5 border-b border-[#F5F5F4]">
                <span className="text-[13px] text-[#78716C]">Party size</span>
                <span className="text-sm font-medium text-[#1C1917]">{reservation.party_size} guest{reservation.party_size !== 1 ? 's' : ''}</span>
              </div>
              <div className="flex justify-between items-center py-2.5">
                <span className="text-[13px] text-[#78716C]">Guest</span>
                <span className="text-sm font-medium text-[#1C1917]">{reservation.name}</span>
              </div>
            </div>

            <hr className="border-0 border-t border-dashed border-[#E7E5E4] my-3" />

            <div className="flex justify-between items-center py-2.5">
              <span className="text-[13px] text-[#78716C]">Confirmation ID</span>
              <span className="text-[13px] font-mono font-medium text-[#9F1239] bg-[rgba(159,18,57,0.06)] px-2.5 py-0.5 rounded-md">{reservation.id}</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={() => navigate('/customer')}
              className="flex-1 py-3.5 border border-[#D6D3D1] bg-white text-[#57534E] font-medium rounded-full text-sm hover:border-[#A8A29E] transition-colors"
            >
              Manage Reservation
            </button>
            {slug && (
              <button
                onClick={() => navigate(`/book/${slug}`)}
                className="flex-1 py-3.5 bg-[#9F1239] text-white font-semibold rounded-full text-sm hover:bg-[#881337] transition-colors"
              >
                New Reservation
              </button>
            )}
          </div>

          <p className="text-xs text-[#A8A29E] mt-5">
            Free cancellation up to 2 hours before your reservation.
          </p>
        </div>
      </main>
    </div>
  );
}

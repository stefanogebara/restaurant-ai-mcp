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
              className="px-6 py-3 bg-[#9F1239] hover:bg-[#881337] text-white font-semibold rounded-xl transition-colors"
            >
              Make a Reservation
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAF9]">
      {/* Header */}
      <header className="bg-white border-b border-[#E7E5E4] px-4 py-4">
        <div className="max-w-lg mx-auto">
          <h1 className="text-xl font-serif font-bold text-[#1C1917]">{reservation.restaurant_name}</h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-8 pb-24">
        {/* Success Icon */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-20 h-20 bg-green-50 border-2 border-green-200 rounded-full flex items-center justify-center mb-4">
            <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-[#1C1917] mb-1">Reservation Confirmed</h2>
          <p className="text-sm text-[#57534E]">We look forward to seeing you!</p>
        </div>

        {/* Reservation Card */}
        <div className="bg-white border border-[#E7E5E4] rounded-2xl shadow-sm overflow-hidden">
          {/* Top accent */}
          <div className="h-1.5 bg-gradient-to-r from-[#9F1239] to-[#be185d]" />

          <div className="p-6 space-y-5">
            {/* Confirmation ID */}
            <div className="bg-[#F5F5F4] rounded-xl p-3 text-center">
              <p className="text-[10px] text-[#A8A29E] uppercase tracking-wider font-medium mb-0.5">Confirmation ID</p>
              <p className="text-sm font-mono font-bold text-[#1C1917] tracking-wide">{reservation.id}</p>
            </div>

            {/* Details Grid */}
            <div className="grid grid-cols-2 gap-y-4 gap-x-6">
              <div>
                <p className="text-xs text-[#A8A29E] uppercase tracking-wider font-medium mb-0.5">Date</p>
                <p className="text-sm font-semibold text-[#1C1917]">
                  {new Date(reservation.date + 'T12:00:00').toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric'
                  })}
                </p>
              </div>
              <div>
                <p className="text-xs text-[#A8A29E] uppercase tracking-wider font-medium mb-0.5">Time</p>
                <p className="text-sm font-semibold text-[#1C1917]">{formatTime(reservation.time)}</p>
              </div>
              <div>
                <p className="text-xs text-[#A8A29E] uppercase tracking-wider font-medium mb-0.5">Guests</p>
                <p className="text-sm font-semibold text-[#1C1917]">{reservation.party_size}</p>
              </div>
              <div>
                <p className="text-xs text-[#A8A29E] uppercase tracking-wider font-medium mb-0.5">Name</p>
                <p className="text-sm font-semibold text-[#1C1917]">{reservation.name}</p>
              </div>
            </div>

            <div className="h-px bg-[#E7E5E4]" />

            {/* Status */}
            <div className="flex items-center justify-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full" />
              <span className="text-sm font-medium text-green-700 capitalize">{reservation.status}</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 space-y-3">
          <p className="text-xs text-[#57534E] text-center">
            Save your confirmation ID: <span className="font-mono font-bold">{reservation.id}</span>
          </p>
          <p className="text-xs text-[#A8A29E] text-center">
            You can use this ID to look up or modify your reservation.
          </p>

          {slug && (
            <button
              onClick={() => navigate(`/book/${slug}`)}
              className="w-full py-3 bg-white border border-[#E7E5E4] hover:bg-[#F5F5F4] text-[#57534E] font-semibold rounded-xl transition-colors text-sm"
            >
              Make Another Reservation
            </button>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-sm border-t border-[#E7E5E4] py-3 text-center">
        <p className="text-xs text-[#A8A29E]">
          Powered by <span className="font-serif font-semibold text-[#57534E]">Seatable<span className="text-[#9F1239]">.</span></span>
        </p>
      </footer>
    </div>
  );
}

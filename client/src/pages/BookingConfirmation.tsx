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
  const state = location.state as { reservation?: ReservationData; restaurant_name?: string; wa_me_link?: string | null } | null;

  const reservation = state?.reservation;
  const waMeLink = state?.wa_me_link;

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
      <div className="min-h-screen bg-warm-white flex flex-col items-center justify-center p-6">
        <div className="bg-white border border-border-gray rounded-2xl p-8 max-w-md text-center shadow-sm">
          <h1 className="text-xl font-bold text-deep-charcoal mb-2">Reservation</h1>
          <p className="text-sm text-stone-gray mb-6">No reservation details found.</p>
          {slug && (
            <button
              onClick={() => navigate(`/book/${slug}`)}
              className="px-6 py-3 bg-burgundy hover:bg-burgundy-dark text-white font-semibold rounded-full transition-colors"
            >
              Make a Reservation
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-warm-white flex flex-col">
      {/* Top Bar */}
      <header className="flex justify-between items-center px-6 sm:px-10 py-4 border-b border-border-gray bg-white">
        <div className="font-serif text-lg font-semibold text-deep-charcoal">
          seatable<span className="text-burgundy">.</span>
        </div>
        <span className="text-[13px] text-warm-stone">Need help? Contact the restaurant</span>
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

          <h1 className="font-serif text-4xl font-medium text-deep-charcoal tracking-tight mb-2">Reservation Confirmed</h1>
          <p className="text-[15px] text-warm-stone font-light mb-10">
            We've sent a confirmation to your email and phone.
          </p>

          {/* Details Card */}
          <div className="bg-white border border-border-gray rounded-2xl p-8 text-left mb-6">
            {/* Restaurant Row */}
            <div className="flex items-center gap-4 pb-5 mb-5 border-b border-soft-gray">
              <div className="w-14 h-14 rounded-[14px] bg-gradient-to-br from-charcoal-dark to-[#44403C] flex-shrink-0" />
              <div>
                <h3 className="text-lg font-semibold text-deep-charcoal tracking-tight">{reservation.restaurant_name}</h3>
                <p className="text-[13px] text-warm-stone font-light">Reservation details</p>
              </div>
            </div>

            {/* Detail Rows */}
            <div className="space-y-0">
              <div className="flex justify-between items-center py-2.5 border-b border-soft-gray">
                <span className="text-[13px] text-warm-stone">Date</span>
                <span className="text-sm font-medium text-deep-charcoal">
                  {new Date(reservation.date + 'T12:00:00').toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric'
                  })}
                </span>
              </div>
              <div className="flex justify-between items-center py-2.5 border-b border-soft-gray">
                <span className="text-[13px] text-warm-stone">Time</span>
                <span className="text-sm font-medium text-deep-charcoal">{formatTime(reservation.time)}</span>
              </div>
              <div className="flex justify-between items-center py-2.5 border-b border-soft-gray">
                <span className="text-[13px] text-warm-stone">Party size</span>
                <span className="text-sm font-medium text-deep-charcoal">{reservation.party_size} guest{reservation.party_size !== 1 ? 's' : ''}</span>
              </div>
              <div className="flex justify-between items-center py-2.5">
                <span className="text-[13px] text-warm-stone">Guest</span>
                <span className="text-sm font-medium text-deep-charcoal">{reservation.name}</span>
              </div>
            </div>

            <hr className="border-0 border-t border-dashed border-border-gray my-3" />

            <div className="flex justify-between items-center py-2.5">
              <span className="text-[13px] text-warm-stone">Confirmation ID</span>
              <span className="text-[13px] font-mono font-medium text-burgundy bg-[rgba(159,18,57,0.06)] px-2.5 py-0.5 rounded-md">{reservation.id}</span>
            </div>
          </div>

          {/* WhatsApp CTA */}
          {waMeLink && (
            <a
              href={waMeLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-3.5 bg-[#25D366] hover:bg-[#20b858] text-white font-semibold rounded-full text-sm transition-colors mb-3"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white flex-shrink-0" aria-hidden="true">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              Chat with us on WhatsApp
            </a>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={() => navigate('/customer')}
              className="flex-1 py-3.5 border border-[#D6D3D1] bg-white text-stone-gray font-medium rounded-full text-sm hover:border-muted-stone transition-colors"
            >
              Manage Reservation
            </button>
            {slug && (
              <button
                onClick={() => navigate(`/book/${slug}`)}
                className="flex-1 py-3.5 bg-burgundy text-white font-semibold rounded-full text-sm hover:bg-burgundy-dark transition-colors"
              >
                New Reservation
              </button>
            )}
          </div>

          <p className="text-xs text-muted-stone mt-5">
            Free cancellation up to 2 hours before your reservation.
          </p>
        </div>
      </main>
    </div>
  );
}

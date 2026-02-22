import { useEffect, useState, useRef } from 'react';
import { authFetch } from '../services/api';
import { motion, AnimatePresence } from 'framer-motion';
import ThiingsIcon from './common/ThiingsIcon';

interface Reservation {
  reservation_id: string;
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  party_size: number;
  date: string;
  time: string;
  special_requests?: string;
  status: string;
  created_at: string;
}

export default function RecentReservations() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [latestId, setLatestId] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const sessionStartTime = useRef<number>(Date.now());
  const autoHideTimer = useRef<number | null>(null);

  useEffect(() => {
    // Initialize session start time in sessionStorage
    const storedSessionStart = sessionStorage.getItem('reservationSessionStart');
    if (!storedSessionStart) {
      sessionStorage.setItem('reservationSessionStart', sessionStartTime.current.toString());
    } else {
      sessionStartTime.current = parseInt(storedSessionStart);
    }

    // Clear reservations on page unload
    const handleUnload = () => {
      sessionStorage.removeItem('reservationSessionStart');
      setReservations([]);
    };

    window.addEventListener('beforeunload', handleUnload);

    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      if (autoHideTimer.current) {
        clearTimeout(autoHideTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    // Poll for new reservations every 5 seconds
    const pollInterval = setInterval(async () => {
      try {
        const response = await authFetch(
          `/api/reservations?action=list&limit=5&sort=created_at_desc`
        );

        if (response.ok) {
          const data = await response.json();

          if (data.reservations && data.reservations.length > 0) {
            // Filter reservations to only show those created during current session
            const sessionReservations = data.reservations.filter((res: Reservation) => {
              const resCreatedTime = new Date(res.created_at).getTime();
              return resCreatedTime >= sessionStartTime.current;
            });

            if (sessionReservations.length > 0) {
              const newest = sessionReservations[0];

              // Check if there's a new reservation
              if (newest.reservation_id !== latestId) {
                setReservations(sessionReservations);
                setLatestId(newest.reservation_id);
                setShowSuccess(true);

                // Hide success message after 5 seconds
                setTimeout(() => setShowSuccess(false), 5000);

                // Auto-hide reservation details after 5 minutes
                if (autoHideTimer.current) {
                  clearTimeout(autoHideTimer.current);
                }
                autoHideTimer.current = setTimeout(() => {
                  setReservations([]);
                  setLatestId(null);
                  sessionStorage.removeItem('reservationSessionStart');
                }, 5 * 60 * 1000); // 5 minutes
              }
            }
          }
        }
      } catch (error) {
        console.error('Error fetching reservations:', error);
      }
    }, 5000);

    // Initial fetch
    authFetch(`/api/reservations?action=list&limit=5&sort=created_at_desc`)
      .then(res => res.json())
      .then(data => {
        if (data.reservations && data.reservations.length > 0) {
          // Filter to only show reservations from current session
          const sessionReservations = data.reservations.filter((res: Reservation) => {
            const resCreatedTime = new Date(res.created_at).getTime();
            return resCreatedTime >= sessionStartTime.current;
          });

          if (sessionReservations.length > 0) {
            setReservations(sessionReservations);
            setLatestId(sessionReservations[0].reservation_id);
          }
        }
      })
      .catch(console.error);

    return () => clearInterval(pollInterval);
  }, [latestId]);

  if (reservations.length === 0) {
    return null;
  }

  const latestReservation = reservations[0];

  return (
    <div className="space-y-4">
      {/* Success Toast Notification */}
      <AnimatePresence>
        {showSuccess && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-white p-4 rounded-xl border-2 border-emerald-500/50 shadow-md"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
                <ThiingsIcon name="check" pxSize={24} />
              </div>
              <div className="flex-1">
                <h3 className="text-deep-charcoal font-semibold text-lg">
                  Reservation Confirmed!
                </h3>
                <p className="text-muted-stone text-sm">
                  Your reservation has been successfully created
                </p>
              </div>
              <ThiingsIcon name="sparkles" pxSize={20} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Latest Reservation Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white p-6 rounded-[2rem] border border-border-gray shadow-md"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl bg-burgundy flex items-center justify-center">
            <ThiingsIcon name="check" pxSize={24} />
          </div>
          <div>
            <h3 className="text-xl font-bold text-deep-charcoal">Latest Reservation</h3>
            <p className="text-muted-stone text-sm">Confirmed and ready</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Reservation ID */}
          <div className="bg-soft-gray p-4 rounded-xl">
            <div className="text-sm text-muted-stone mb-1">Confirmation Number</div>
            <div className="text-lg font-mono font-bold text-burgundy">
              {latestReservation.reservation_id}
            </div>
          </div>

          {/* Customer Info */}
          <div className="grid grid-cols-1 gap-3">
            <div className="flex items-center gap-3 text-stone-gray">
              <ThiingsIcon name="users" pxSize={20} />
              <div>
                <div className="text-sm text-muted-stone">Customer</div>
                <div className="font-semibold text-deep-charcoal">{latestReservation.customer_name}</div>
              </div>
            </div>

            <div className="flex items-center gap-3 text-stone-gray">
              <ThiingsIcon name="phone" pxSize={20} />
              <div>
                <div className="text-sm text-muted-stone">Phone</div>
                <div className="font-semibold text-deep-charcoal">{latestReservation.customer_phone}</div>
              </div>
            </div>

            {latestReservation.customer_email && (
              <div className="flex items-center gap-3 text-stone-gray">
                <ThiingsIcon name="mail" pxSize={20} />
                <div>
                  <div className="text-sm text-muted-stone">Email</div>
                  <div className="font-semibold text-deep-charcoal">{latestReservation.customer_email}</div>
                </div>
              </div>
            )}
          </div>

          {/* Reservation Details */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-soft-gray p-3 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <ThiingsIcon name="calendar" pxSize={16} />
                <span className="text-xs text-muted-stone">Date</span>
              </div>
              <div className="font-semibold text-deep-charcoal">{latestReservation.date}</div>
            </div>

            <div className="bg-soft-gray p-3 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <ThiingsIcon name="clock" pxSize={16} />
                <span className="text-xs text-muted-stone">Time</span>
              </div>
              <div className="font-semibold text-deep-charcoal">{latestReservation.time}</div>
            </div>
          </div>

          <div className="bg-soft-gray p-3 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <ThiingsIcon name="users" pxSize={16} />
              <span className="text-xs text-muted-stone">Party Size</span>
            </div>
            <div className="font-semibold text-deep-charcoal">
              {latestReservation.party_size} {latestReservation.party_size === 1 ? 'Guest' : 'Guests'}
            </div>
          </div>

          {/* Special Requests */}
          {latestReservation.special_requests && (
            <div className="bg-soft-gray p-4 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <ThiingsIcon name="chat" pxSize={16} />
                <span className="text-sm text-muted-stone">Special Requests</span>
              </div>
              <p className="text-deep-charcoal italic">"{latestReservation.special_requests}"</p>
            </div>
          )}

          {/* Status Badge */}
          <div className="flex items-center justify-center gap-2 bg-emerald-500/10 p-3 rounded-lg border border-emerald-500/20">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-emerald-800 font-semibold">
              {latestReservation.status || 'Confirmed'}
            </span>
          </div>
        </div>

        {/* Call to Action */}
        <div className="mt-6 p-4 bg-warm-white rounded-xl border border-border-gray text-center">
          <p className="text-stone-gray text-sm mb-2">
            We look forward to seeing you!
          </p>
          <p className="text-muted-stone text-xs">
            A confirmation has been sent to your contact information
          </p>
        </div>
      </motion.div>

      {/* Show additional recent reservations if available */}
      {reservations.length > 1 && (
        <div className="bg-white p-4 rounded-xl border border-border-gray shadow-sm">
          <h4 className="text-deep-charcoal font-semibold mb-3">Recent Activity</h4>
          <div className="space-y-2">
            {reservations.slice(1, 4).map((res) => (
              <div
                key={res.reservation_id}
                className="flex items-center justify-between p-3 bg-soft-gray rounded-lg"
              >
                <div>
                  <div className="text-deep-charcoal font-medium">{res.customer_name}</div>
                  <div className="text-muted-stone text-xs">
                    {res.date} at {res.time} • Party of {res.party_size}
                  </div>
                </div>
                <div className="text-xs text-warm-stone font-mono">
                  {res.reservation_id.slice(-6)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

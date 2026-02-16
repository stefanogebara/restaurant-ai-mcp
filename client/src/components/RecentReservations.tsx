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
            className="bg-white p-4 rounded-xl border-2 border-[#10b981]/50 shadow-md"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#10b981] to-[#14b8a6] flex items-center justify-center">
                <ThiingsIcon name="check" pxSize={24} />
              </div>
              <div className="flex-1">
                <h3 className="text-[#1C1917] font-semibold text-lg">
                  Reservation Confirmed!
                </h3>
                <p className="text-[#A8A29E] text-sm">
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
        className="bg-white p-6 rounded-[2rem] border border-[#E7E5E4] shadow-md"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl bg-[#9F1239] flex items-center justify-center">
            <ThiingsIcon name="check" pxSize={24} />
          </div>
          <div>
            <h3 className="text-xl font-bold text-[#1C1917]">Latest Reservation</h3>
            <p className="text-[#A8A29E] text-sm">Confirmed and ready</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Reservation ID */}
          <div className="bg-[#F5F5F4] p-4 rounded-xl">
            <div className="text-sm text-[#A8A29E] mb-1">Confirmation Number</div>
            <div className="text-lg font-mono font-bold text-[#9F1239]">
              {latestReservation.reservation_id}
            </div>
          </div>

          {/* Customer Info */}
          <div className="grid grid-cols-1 gap-3">
            <div className="flex items-center gap-3 text-[#57534E]">
              <ThiingsIcon name="users" pxSize={20} />
              <div>
                <div className="text-sm text-[#A8A29E]">Customer</div>
                <div className="font-semibold text-[#1C1917]">{latestReservation.customer_name}</div>
              </div>
            </div>

            <div className="flex items-center gap-3 text-[#57534E]">
              <ThiingsIcon name="phone" pxSize={20} />
              <div>
                <div className="text-sm text-[#A8A29E]">Phone</div>
                <div className="font-semibold text-[#1C1917]">{latestReservation.customer_phone}</div>
              </div>
            </div>

            {latestReservation.customer_email && (
              <div className="flex items-center gap-3 text-[#57534E]">
                <ThiingsIcon name="mail" pxSize={20} />
                <div>
                  <div className="text-sm text-[#A8A29E]">Email</div>
                  <div className="font-semibold text-[#1C1917]">{latestReservation.customer_email}</div>
                </div>
              </div>
            )}
          </div>

          {/* Reservation Details */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[#F5F5F4] p-3 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <ThiingsIcon name="calendar" pxSize={16} />
                <span className="text-xs text-[#A8A29E]">Date</span>
              </div>
              <div className="font-semibold text-[#1C1917]">{latestReservation.date}</div>
            </div>

            <div className="bg-[#F5F5F4] p-3 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <ThiingsIcon name="clock" pxSize={16} />
                <span className="text-xs text-[#A8A29E]">Time</span>
              </div>
              <div className="font-semibold text-[#1C1917]">{latestReservation.time}</div>
            </div>
          </div>

          <div className="bg-[#F5F5F4] p-3 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <ThiingsIcon name="users" pxSize={16} />
              <span className="text-xs text-[#A8A29E]">Party Size</span>
            </div>
            <div className="font-semibold text-[#1C1917]">
              {latestReservation.party_size} {latestReservation.party_size === 1 ? 'Guest' : 'Guests'}
            </div>
          </div>

          {/* Special Requests */}
          {latestReservation.special_requests && (
            <div className="bg-[#F5F5F4] p-4 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <ThiingsIcon name="chat" pxSize={16} />
                <span className="text-sm text-[#A8A29E]">Special Requests</span>
              </div>
              <p className="text-[#1C1917] italic">"{latestReservation.special_requests}"</p>
            </div>
          )}

          {/* Status Badge */}
          <div className="flex items-center justify-center gap-2 bg-[#10b981]/10 p-3 rounded-lg border border-[#10b981]/20">
            <div className="w-2 h-2 bg-[#10b981] rounded-full animate-pulse" />
            <span className="text-[#065f46] font-semibold">
              {latestReservation.status || 'Confirmed'}
            </span>
          </div>
        </div>

        {/* Call to Action */}
        <div className="mt-6 p-4 bg-[#FAFAF9] rounded-xl border border-[#E7E5E4] text-center">
          <p className="text-[#57534E] text-sm mb-2">
            We look forward to seeing you at La Bella Vista!
          </p>
          <p className="text-[#A8A29E] text-xs">
            A confirmation has been sent to your contact information
          </p>
        </div>
      </motion.div>

      {/* Show additional recent reservations if available */}
      {reservations.length > 1 && (
        <div className="bg-white p-4 rounded-xl border border-[#E7E5E4] shadow-sm">
          <h4 className="text-[#1C1917] font-semibold mb-3">Recent Activity</h4>
          <div className="space-y-2">
            {reservations.slice(1, 4).map((res) => (
              <div
                key={res.reservation_id}
                className="flex items-center justify-between p-3 bg-[#F5F5F4] rounded-lg"
              >
                <div>
                  <div className="text-[#1C1917] font-medium">{res.customer_name}</div>
                  <div className="text-[#A8A29E] text-xs">
                    {res.date} at {res.time} • Party of {res.party_size}
                  </div>
                </div>
                <div className="text-xs text-[#78716C] font-mono">
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

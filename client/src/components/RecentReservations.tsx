import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Calendar, Clock, Users, Phone, Mail, MessageSquare, Sparkles } from 'lucide-react';

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

  useEffect(() => {
    // Poll for new reservations every 5 seconds
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(
          `/api/reservations?action=list&limit=5&sort=created_at_desc`
        );

        if (response.ok) {
          const data = await response.json();

          if (data.reservations && data.reservations.length > 0) {
            const newest = data.reservations[0];

            // Check if there's a new reservation
            if (newest.reservation_id !== latestId) {
              setReservations(data.reservations);
              setLatestId(newest.reservation_id);
              setShowSuccess(true);

              // Hide success message after 5 seconds
              setTimeout(() => setShowSuccess(false), 5000);
            }
          }
        }
      } catch (error) {
        console.error('Error fetching reservations:', error);
      }
    }, 5000);

    // Initial fetch
    fetch(`/api/reservations?action=list&limit=5&sort=created_at_desc`)
      .then(res => res.json())
      .then(data => {
        if (data.reservations && data.reservations.length > 0) {
          setReservations(data.reservations);
          setLatestId(data.reservations[0].reservation_id);
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
            className="glass-card p-4 border-2 border-emerald-500/50"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
                <Check className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="text-white font-semibold text-lg">
                  Reservation Confirmed! 🎉
                </h3>
                <p className="text-gray-400 text-sm">
                  Your reservation has been successfully created
                </p>
              </div>
              <Sparkles className="w-5 h-5 text-emerald-400 animate-pulse" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Latest Reservation Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass-card p-6"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
            <Check className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-white">Latest Reservation</h3>
            <p className="text-gray-400 text-sm">Confirmed and ready</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Reservation ID */}
          <div className="glass-subtle p-4 rounded-xl">
            <div className="text-sm text-gray-400 mb-1">Confirmation Number</div>
            <div className="text-lg font-mono font-bold gradient-text">
              {latestReservation.reservation_id}
            </div>
          </div>

          {/* Customer Info */}
          <div className="grid grid-cols-1 gap-3">
            <div className="flex items-center gap-3 text-gray-300">
              <Users className="w-5 h-5 text-indigo-400" />
              <div>
                <div className="text-sm text-gray-400">Customer</div>
                <div className="font-semibold text-white">{latestReservation.customer_name}</div>
              </div>
            </div>

            <div className="flex items-center gap-3 text-gray-300">
              <Phone className="w-5 h-5 text-emerald-400" />
              <div>
                <div className="text-sm text-gray-400">Phone</div>
                <div className="font-semibold text-white">{latestReservation.customer_phone}</div>
              </div>
            </div>

            {latestReservation.customer_email && (
              <div className="flex items-center gap-3 text-gray-300">
                <Mail className="w-5 h-5 text-purple-400" />
                <div>
                  <div className="text-sm text-gray-400">Email</div>
                  <div className="font-semibold text-white">{latestReservation.customer_email}</div>
                </div>
              </div>
            )}
          </div>

          {/* Reservation Details */}
          <div className="grid grid-cols-2 gap-3">
            <div className="glass-subtle p-3 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="w-4 h-4 text-indigo-400" />
                <span className="text-xs text-gray-400">Date</span>
              </div>
              <div className="font-semibold text-white">{latestReservation.date}</div>
            </div>

            <div className="glass-subtle p-3 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-purple-400" />
                <span className="text-xs text-gray-400">Time</span>
              </div>
              <div className="font-semibold text-white">{latestReservation.time}</div>
            </div>
          </div>

          <div className="glass-subtle p-3 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-emerald-400" />
              <span className="text-xs text-gray-400">Party Size</span>
            </div>
            <div className="font-semibold text-white">
              {latestReservation.party_size} {latestReservation.party_size === 1 ? 'Guest' : 'Guests'}
            </div>
          </div>

          {/* Special Requests */}
          {latestReservation.special_requests && (
            <div className="glass-subtle p-4 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare className="w-4 h-4 text-amber-400" />
                <span className="text-sm text-gray-400">Special Requests</span>
              </div>
              <p className="text-white italic">"{latestReservation.special_requests}"</p>
            </div>
          )}

          {/* Status Badge */}
          <div className="flex items-center justify-center gap-2 glass-subtle p-3 rounded-lg">
            <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
            <span className="text-emerald-400 font-semibold">
              {latestReservation.status || 'Confirmed'}
            </span>
          </div>
        </div>

        {/* Call to Action */}
        <div className="mt-6 p-4 glass-strong rounded-xl text-center">
          <p className="text-gray-300 text-sm mb-2">
            We look forward to seeing you at La Bella Vista!
          </p>
          <p className="text-gray-400 text-xs">
            A confirmation has been sent to your contact information
          </p>
        </div>
      </motion.div>

      {/* Show additional recent reservations if available */}
      {reservations.length > 1 && (
        <div className="glass-subtle p-4 rounded-xl">
          <h4 className="text-white font-semibold mb-3">Recent Activity</h4>
          <div className="space-y-2">
            {reservations.slice(1, 4).map((res) => (
              <div
                key={res.reservation_id}
                className="flex items-center justify-between p-3 glass-card rounded-lg"
              >
                <div>
                  <div className="text-white font-medium">{res.customer_name}</div>
                  <div className="text-gray-400 text-xs">
                    {res.date} at {res.time} • Party of {res.party_size}
                  </div>
                </div>
                <div className="text-xs text-gray-500 font-mono">
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

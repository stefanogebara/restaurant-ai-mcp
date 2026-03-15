import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';

export interface MockReservation {
  id: string;
  name: string;
  time: string;
  size: number;
  status: 'confirmed' | 'cancelled';
  isNew?: boolean;
}

interface VoiceDemoDashboardProps {
  reservations: MockReservation[];
  className?: string;
}

const BASE_RESERVATIONS: MockReservation[] = [
  { id: 'base-1', name: 'Giovanni B.', time: '12:00', size: 4, status: 'confirmed' },
  { id: 'base-2', name: 'Sophia M.', time: '13:00', size: 2, status: 'confirmed' },
  { id: 'base-3', name: 'Alessandro R.', time: '19:30', size: 6, status: 'confirmed' },
  { id: 'base-4', name: 'Luca T.', time: '20:00', size: 3, status: 'confirmed' },
];

export default function VoiceDemoDashboard({
  reservations,
  className = '',
}: VoiceDemoDashboardProps) {
  const { t } = useTranslation();

  const allReservations = [...reservations, ...BASE_RESERVATIONS];
  const confirmedCount = allReservations.filter((r) => r.status === 'confirmed').length;
  const totalGuests = allReservations
    .filter((r) => r.status === 'confirmed')
    .reduce((sum, r) => sum + r.size, 0);

  const stats = [
    { label: t('landing.voiceDemo.tables', 'Tables'), value: `${Math.min(confirmedCount, 8)}/8` },
    { label: t('landing.voiceDemo.today', 'Today'), value: String(confirmedCount) },
    { label: t('landing.voiceDemo.waitlist', 'Waitlist'), value: '1' },
    { label: t('landing.voiceDemo.guests', 'Guests'), value: String(totalGuests) },
  ];

  return (
    <div
      className={`w-full max-w-[420px] select-none ${className}`}
      aria-hidden="true"
    >
      {/* Browser chrome */}
      <div className="bg-[#1e1e1e] rounded-t-xl px-4 py-2.5 flex items-center gap-2">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
        </div>
        <div className="flex-1 mx-3 bg-[#0d0d0d] rounded-md px-3 py-1 text-[10px] text-white/25 text-center truncate font-mono">
          seatable.one/dashboard
        </div>
      </div>

      {/* Dashboard body */}
      <div className="bg-[#111118] border border-white/[6%] border-t-0 rounded-b-xl overflow-hidden">
        {/* Header */}
        <div className="px-4 pt-3 pb-2 flex items-center justify-between border-b border-white/[6%]">
          <div>
            <div className="text-[13px] font-semibold text-white/90 font-sans">
              {t('landing.voiceDemo.dashboard', 'Dashboard')}
            </div>
            <div className="text-[10px] text-white/30">
              {t('landing.voiceDemo.todayDate', 'Today \u00b7 March 15')}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500" />
            </span>
            <span className="text-[10px] text-green-400/70">
              {t('landing.voiceDemo.aiActive', 'AI Active')}
            </span>
          </div>
        </div>

        {/* Stats row */}
        <div className="px-3 py-3 grid grid-cols-4 gap-2">
          {stats.map((s) => (
            <div
              key={s.label}
              className="bg-white/[4%] border border-white/[6%] rounded-lg px-2.5 py-2"
            >
              <div className="text-[9px] text-white/30 uppercase tracking-wider">{s.label}</div>
              <AnimatePresence mode="wait">
                <motion.div
                  key={s.value}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.3 }}
                  className="text-[16px] font-bold text-white/90 mt-0.5"
                >
                  {s.value}
                </motion.div>
              </AnimatePresence>
            </div>
          ))}
        </div>

        {/* Reservations list */}
        <div className="px-3 pb-3">
          <div className="bg-white/[3%] border border-white/[6%] rounded-lg p-3">
            <div className="text-[10px] font-semibold text-white/50 uppercase tracking-wider mb-2">
              {t('landing.voiceDemo.todaysReservations', "Today's Reservations")}
            </div>

            <div className="space-y-0 max-h-[240px] overflow-hidden">
              {/* New reservations from voice agent — slide in from top */}
              <AnimatePresence>
                {reservations.map((r) => (
                  <motion.div
                    key={r.id}
                    initial={{ opacity: 0, height: 0, y: -10 }}
                    animate={{ opacity: 1, height: 'auto', y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                    className="overflow-hidden"
                  >
                    <motion.div
                      initial={{ backgroundColor: r.status === 'cancelled' ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)' }}
                      animate={{ backgroundColor: 'rgba(255,255,255,0.02)' }}
                      transition={{ duration: 2, delay: 0.5 }}
                      className="flex items-center justify-between py-2 border-b border-white/[5%]"
                    >
                      <div>
                        <div className="text-[11px] font-medium text-white/80">
                          {r.name}
                        </div>
                        <div className="text-[9px] text-white/30">
                          {r.time} · {r.size}p
                        </div>
                      </div>
                      <div
                        className={`px-1.5 py-0.5 rounded-full text-[8px] font-medium ${
                          r.status === 'confirmed'
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-red-500/20 text-red-400'
                        }`}
                      >
                        {r.status}
                      </div>
                    </motion.div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {/* Base reservations */}
              {BASE_RESERVATIONS.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between py-2 border-b border-white/[5%] last:border-0"
                >
                  <div>
                    <div className="text-[11px] font-medium text-white/80">
                      {r.name}
                    </div>
                    <div className="text-[9px] text-white/30">
                      {r.time} · {r.size}p
                    </div>
                  </div>
                  <div className="px-1.5 py-0.5 rounded-full text-[8px] font-medium bg-green-500/20 text-green-400">
                    confirmed
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

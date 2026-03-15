import { motion, AnimatePresence } from 'framer-motion';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

interface DashboardSyncAnimationProps {
  currentStep: number;
  className?: string;
}

const BASE_RESERVATIONS = [
  { name: 'Giovanni B.', time: '12:00', size: 4, status: 'confirmed' as const },
  { name: 'Sophia M.', time: '13:00', size: 2, status: 'confirmed' as const },
  { name: 'Alessandro R.', time: '19:30', size: 6, status: 'pending' as const },
];

const NEW_RESERVATION = {
  name: 'Maria Santos', time: '20:00', size: 4, status: 'confirmed' as const,
};

const prefersReducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const transition = prefersReducedMotion ? { duration: 0 } : { duration: 0.4 };

export default function DashboardSyncAnimation({
  currentStep,
  className = '',
}: DashboardSyncAnimationProps) {
  const { t } = useTranslation();
  const showNew = currentStep >= 3;

  const stats = useMemo(
    () => [
      { label: t('landing.dashboardAnim.tables', 'Tables'), value: '5/8' },
      { label: t('landing.dashboardAnim.today', 'Today'), value: showNew ? '12' : '11' },
      { label: t('landing.dashboardAnim.waitlist', 'Waitlist'), value: '2' },
      { label: t('landing.dashboardAnim.guests', 'Guests'), value: showNew ? '28' : '24' },
    ],
    [showNew, t],
  );

  const statusBadge = (s: 'confirmed' | 'pending') =>
    s === 'confirmed'
      ? 'bg-green-100 text-green-700'
      : 'bg-amber-100 text-amber-700';

  return (
    <div
      className={`relative w-[400px] select-none pointer-events-none ${className}`}
      aria-hidden="true"
    >
      {/* Browser chrome */}
      <div className="bg-[#2a2a2a] rounded-t-2xl px-4 py-3 flex items-center gap-2">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
        </div>
        <div className="flex-1 mx-3 bg-[#1a1a1a] rounded-md px-3 py-1 text-[10px] text-white/30 text-center truncate">
          seatable.one/dashboard
        </div>
      </div>

      {/* Dashboard body */}
      <div className="bg-[#FAFAF9] border border-[#E7E5E4] border-t-0 rounded-b-2xl shadow-2xl overflow-hidden h-[480px] flex flex-col">
        {/* Header */}
        <div className="px-4 pt-3 pb-2 flex items-center justify-between">
          <div>
            <div className="text-[13px] font-bold text-[#1C1917] font-sans">
              {t('landing.dashboardAnim.dashboard', 'Dashboard')}
            </div>
            <div className="text-[10px] text-[#A8A29E]">{t('landing.dashboardAnim.todayDate', 'Today · March 14')}</div>
          </div>
          <div className="px-3 py-1 bg-[#9F1239] text-white text-[10px] font-semibold rounded-lg">
            + {t('landing.dashboardAnim.walkIn', 'Walk-in')}
          </div>
        </div>

        {/* Stats row */}
        <div className="px-4 grid grid-cols-4 gap-2">
          {stats.map((s) => (
            <div
              key={s.label}
              className="bg-white border border-[#E7E5E4] rounded-xl px-2.5 py-2"
            >
              <div className="text-[10px] text-[#A8A29E]">{s.label}</div>
              <AnimatePresence mode="wait">
                <motion.div
                  key={s.value}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={transition}
                  className="text-[15px] font-bold text-[#1C1917]"
                >
                  {s.value}
                </motion.div>
              </AnimatePresence>
            </div>
          ))}
        </div>

        {/* Reservations list */}
        <div className="px-4 mt-3 flex-1 min-h-0">
          <div className="bg-white border border-[#E7E5E4] rounded-xl p-3 h-full flex flex-col">
            <div className="text-[10px] font-semibold text-[#1C1917] mb-2">
              {t('landing.dashboardAnim.todaysReservations', "Today's Reservations")}
            </div>

            <div className="space-y-0 flex-1">
              {/* New reservation (slides in at top) */}
              <AnimatePresence>
                {showNew && (
                  <motion.div
                    initial={
                      prefersReducedMotion
                        ? { opacity: 1 }
                        : { opacity: 0, height: 0, y: -10 }
                    }
                    animate={{ opacity: 1, height: 'auto', y: 0 }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                    className="overflow-hidden"
                  >
                    <motion.div
                      initial={{ backgroundColor: 'rgb(240 253 244)' }}
                      animate={{ backgroundColor: 'rgb(255 255 255)' }}
                      transition={{ duration: 2, delay: 0.5 }}
                      className="flex items-center justify-between py-2 border-b border-[#E7E5E4] rounded-sm"
                    >
                      <div>
                        <div className="text-[11px] font-medium text-[#1C1917]">
                          {NEW_RESERVATION.name}
                        </div>
                        <div className="text-[9px] text-[#A8A29E]">
                          {NEW_RESERVATION.time} · {NEW_RESERVATION.size}p
                        </div>
                      </div>
                      <div
                        className={`px-1.5 py-0.5 rounded-full text-[8px] font-medium ${statusBadge(NEW_RESERVATION.status)}`}
                      >
                        {t('landing.dashboardAnim.confirmed', 'confirmed')}
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Existing reservations */}
              {BASE_RESERVATIONS.map((r) => (
                <div
                  key={r.name}
                  className="flex items-center justify-between py-2 border-b border-[#E7E5E4] last:border-0"
                >
                  <div>
                    <div className="text-[11px] font-medium text-[#1C1917]">
                      {r.name}
                    </div>
                    <div className="text-[9px] text-[#A8A29E]">
                      {r.time} · {r.size}p
                    </div>
                  </div>
                  <div
                    className={`px-1.5 py-0.5 rounded-full text-[8px] font-medium ${statusBadge(r.status)}`}
                  >
                    {r.status === 'confirmed'
                      ? t('landing.dashboardAnim.confirmed', 'confirmed')
                      : t('landing.dashboardAnim.pending', 'pending')}
                  </div>
                </div>
              ))}
            </div>

            {/* AI status indicator */}
            <div className="mt-auto pt-2 border-t border-[#E7E5E4] flex items-center gap-1.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#10b981] opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#10b981]" />
              </span>
              <span className="text-[9px] text-[#A8A29E]">
                {t('landing.dashboardAnim.aiHandlingCalls', 'AI agent handling calls')}
              </span>
            </div>
          </div>
        </div>

        <div className="h-3" />
      </div>

      {/* Glow effect */}
      <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-3/4 h-8 bg-[#9F1239]/20 blur-2xl rounded-full" />
    </div>
  );
}

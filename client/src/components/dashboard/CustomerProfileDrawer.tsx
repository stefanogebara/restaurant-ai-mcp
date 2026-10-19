import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import CustomerTierBadge from './CustomerTierBadge';
import { formatCurrency } from '../../utils/currency';
import { authFetch } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import type { UpcomingReservation } from '../../types/host.types';
import { parseLocalDate } from '../../utils/timeFormatting';

interface CustomerProfileDrawerProps {
  reservation: UpcomingReservation | null;
  onClose: () => void;
}

interface GuestContext {
  success: boolean;
  guest_phone: string;
  has_memories: boolean;
  memories: Array<{
    id: string;
    type: string;
    content: string;
    importance: number;
    created_at: string;
  }>;
  total: number;
}

interface LtvData {
  customer_tier: string;
  total_visits: number;
  avg_revenue_per_visit: number;
  total_revenue: number;
  avg_party_size: number;
  churn_risk_score: number;
  first_visit_date: string;
  last_visit_date: string;
  favorite_time_slot: string;
  favorite_day: string;
  avg_days_between_visits: number;
}


export default function CustomerProfileDrawer({ reservation, onClose }: CustomerProfileDrawerProps) {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language.startsWith('pt') ? 'pt-BR' : i18n.language.startsWith('es') ? 'es-ES' : 'en-US';
  const isOpen = !!reservation;
  const phone = reservation?.customer_phone;

  // Source the auth gate from the Supabase session — the previous code read
  // 'auth_token' from localStorage, but that key is NEVER written anywhere in
  // the codebase. Every getItem returned null, hasAuth was always false, both
  // queries below were permanently disabled, and the drawer rendered with
  // reservation-only data — guest memories, preferences, notes, occasions,
  // and the real churn_risk_score were ALL silently missing in production.
  // Same root cause as the LS_RESTAURANT_ID purge (commit 26231a8d).
  // authFetch reads from supabase.auth.getSession() so we don't need to thread
  // the token explicitly anywhere here.
  const { user } = useAuth();
  const hasAuth = !!user;

  // Fetch guest context (memories) — only when authenticated
  const { data: guestCtx } = useQuery<GuestContext>({
    queryKey: ['guest-context', phone],
    queryFn: async () => {
      const res = await authFetch(`/api/guest-context?phone=${encodeURIComponent(phone!)}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!phone && isOpen && hasAuth,
    staleTime: 60_000,
  });

  // Fetch LTV data — only when authenticated
  const { data: ltvData } = useQuery<LtvData>({
    queryKey: ['customer-ltv', phone],
    queryFn: async () => {
      const res = await authFetch(`/api/ltv?action=get&customer_id=${encodeURIComponent(phone!)}`);
      if (!res.ok) return null;
      const data = await res.json();
      return data.customer || data;
    },
    enabled: !!phone && isOpen && hasAuth,
    staleTime: 60_000,
  });

  if (!reservation) return null;

  // Use reservation-level data (works in demo), fall back to API data (works in production)
  const tier = reservation.customer_tier || ltvData?.customer_tier || 'new';
  const visits = reservation.visit_count ?? ltvData?.total_visits ?? 0;
  const avgSpend = reservation.avg_spend ?? ltvData?.avg_revenue_per_visit;
  // The LTV endpoint estimates spending and supplies a heuristic score, not a
  // measured total or a calibrated probability. Never synthesize either from tier.
  const totalRevenue = ltvData?.total_revenue;
  const churnRisk = ltvData?.churn_risk_score;
  const firstVisit = ltvData?.first_visit_date;
  const favTime = ltvData?.favorite_time_slot;
  const favDay = ltvData?.favorite_day;

  const memories = guestCtx?.memories || [];
  const preferences = memories.filter(m => m.type === 'preference' || m.type === 'observation');
  const notes = memories.filter(m => m.type === 'manager_note');
  const occasions = memories.filter(m => m.type === 'occasion');

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={t('guestProfile.title')}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed right-0 top-0 h-full w-full sm:w-[400px] sm:max-w-[90vw] bg-glass-modal backdrop-blur-glass-modal shadow-glass-modal z-50 overflow-y-auto border-l border-glass-border-dark"
          >
            {/* Header */}
            <div className="sticky top-0 bg-glass-panel backdrop-blur-glass-nav border-b border-glass-border-dark px-6 py-4 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-serif text-2xl text-deep-charcoal">{reservation.customer_name}</h2>
                  <CustomerTierBadge tier={tier as 'vip' | 'regular' | 'occasional' | 'new' | 'at_risk'} visitCount={visits} />
                </div>
                {firstVisit && (
                  <p className="text-xs text-muted-stone mt-0.5">
                    {t('guestProfile.memberSince')} {parseLocalDate(firstVisit).toLocaleDateString(dateLocale, { month: 'short', year: 'numeric' })}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-2 hover:bg-deep-charcoal/[0.05] rounded-full transition-colors"
                aria-label={t('common.close')}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="px-6 py-5 space-y-6">
              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-3">
                <StatBox label={t('crm.totalVisits')} value={String(visits)} />
                <StatBox label={t('crm.avgSpend')} value={avgSpend != null ? formatCurrency(Math.round(avgSpend)) : '—'} />
                <StatBox label={t('crm.totalRevenue')} value={totalRevenue != null ? formatCurrency(Math.round(totalRevenue)) : '—'} />
                <StatBox label={t('crm.churnRisk')} value={churnRisk != null ? `${Math.round(churnRisk)}/100` : '—'} valueColor={churnRisk != null && churnRisk > 50 ? 'text-red-600' : undefined} />
              </div>

              {/* Behavior */}
              {(favTime || favDay) && (
                <Section title={t('guestProfile.behavior')}>
                  <div className="space-y-1.5">
                    {favDay && <InfoRow label={t('guestProfile.favoriteDay')} value={favDay} />}
                    {favTime && <InfoRow label={t('guestProfile.favoriteTime')} value={favTime} />}
                    {ltvData?.avg_party_size && <InfoRow label={t('guestProfile.avgPartySize')} value={t('guestProfile.people', { count: Math.round(ltvData.avg_party_size) })} />}
                    {ltvData?.avg_days_between_visits && <InfoRow label={t('guestProfile.frequency')} value={t('guestProfile.everyDays', { count: Math.round(ltvData.avg_days_between_visits) })} />}
                  </div>
                </Section>
              )}

              {/* Dietary Preferences */}
              {reservation.dietary_restrictions && reservation.dietary_restrictions.length > 0 && (
                <Section title={t('guestProfile.dietary')}>
                  <div className="flex flex-wrap gap-1.5">
                    {reservation.dietary_restrictions.map((d) => (
                      <span key={d} className="text-xs bg-amber-50 text-amber-800 px-2 py-0.5 rounded-full font-medium">{d}</span>
                    ))}
                  </div>
                </Section>
              )}

              {/* Preferences from memories */}
              {preferences.length > 0 && (
                <Section title={t('guestProfile.preferences')}>
                  <div className="space-y-2">
                    {preferences.slice(0, 5).map((m) => (
                      <p key={m.id} className="text-sm text-deep-charcoal">{m.content}</p>
                    ))}
                  </div>
                </Section>
              )}

              {/* Special Occasions */}
              {occasions.length > 0 && (
                <Section title={t('guestProfile.occasions')}>
                  <div className="space-y-2">
                    {occasions.map((m) => (
                      <p key={m.id} className="text-sm text-deep-charcoal">{m.content}</p>
                    ))}
                  </div>
                </Section>
              )}

              {/* Manager Notes */}
              <Section title={t('guestProfile.notes')}>
                {notes.length > 0 ? (
                  <div className="space-y-2">
                    {notes.map((m) => (
                      <div key={m.id} className="text-sm text-deep-charcoal border-b border-glass-border-dark py-2 last:border-0">
                        {m.content}
                        <span className="text-[10px] text-muted-stone ml-2">
                          {new Date(m.created_at).toLocaleDateString(dateLocale)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-stone">{t('crm.noNotes')}</p>
                )}
              </Section>

              {/* Current Reservation */}
              <Section title={t('guestProfile.currentReservation')}>
                <div className="space-y-1.5">
                  <InfoRow label={t('guestProfile.date')} value={parseLocalDate(reservation.date).toLocaleDateString(dateLocale, { month: 'short', day: 'numeric', year: 'numeric' })} />
                  <InfoRow label={t('guestProfile.time')} value={reservation.time} />
                  <InfoRow label={t('guestProfile.partySize')} value={String(reservation.party_size)} />
                  {reservation.special_requests && (
                    <InfoRow label={t('guestProfile.requests')} value={reservation.special_requests} />
                  )}
                </div>
              </Section>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── Sub-components ─────────────────────────────────────────

function StatBox({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="py-2 border-b border-glass-border-dark">
      <p className="text-[11px] text-muted-stone uppercase tracking-[0.14em] mb-1">{label}</p>
      <p className={`text-lg font-medium ${valueColor || 'text-deep-charcoal'}`}>{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[11px] text-muted-stone uppercase tracking-[0.14em] mb-2">{title}</h3>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-stone">{label}</span>
      <span className="text-deep-charcoal font-medium text-right">{value}</span>
    </div>
  );
}

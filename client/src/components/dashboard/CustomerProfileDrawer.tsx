import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import CustomerTierBadge from './CustomerTierBadge';
import type { UpcomingReservation } from '../../types/host.types';

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
  const { t } = useTranslation();
  const isOpen = !!reservation;
  const phone = reservation?.customer_phone;

  // Fetch guest context (memories)
  const authToken = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
  const hasAuth = !!authToken;

  // Fetch guest context (memories) — only when authenticated
  const { data: guestCtx } = useQuery<GuestContext>({
    queryKey: ['guest-context', phone],
    queryFn: async () => {
      const apiBase = import.meta.env.VITE_API_BASE_URL || '/api';
      const res = await fetch(`${apiBase}/guest-context?phone=${encodeURIComponent(phone!)}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
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
      const apiBase = import.meta.env.VITE_API_BASE_URL || '/api';
      const res = await fetch(`${apiBase}/ltv?action=get&customer_id=${encodeURIComponent(phone!)}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
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
  const visits = reservation.visit_count || ltvData?.total_visits || 0;
  const avgSpend = reservation.avg_spend || ltvData?.avg_revenue_per_visit;
  const totalRevenue = ltvData?.total_revenue || (avgSpend && visits ? Math.round(avgSpend * visits) : undefined);
  const churnRisk = ltvData?.churn_risk_score ?? (tier === 'vip' ? 5 : tier === 'regular' ? 15 : tier === 'occasional' ? 40 : undefined);
  const firstVisit = ltvData?.first_visit_date;
  const favTime = ltvData?.favorite_time_slot || (reservation.time ? reservation.time.split(':')[0] + ':00' : undefined);
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
            className="fixed right-0 top-0 h-full w-[400px] max-w-[90vw] bg-white z-50 overflow-y-auto border-l border-[#E5E7EB]"
          >
            {/* Header */}
            <div className="sticky top-0 bg-white border-b border-[#E5E7EB] px-6 py-4 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-stone-900">{reservation.customer_name}</h2>
                  <CustomerTierBadge tier={tier as 'vip' | 'regular' | 'occasional' | 'new' | 'at_risk'} visitCount={visits} />
                </div>
                {firstVisit && (
                  <p className="text-xs text-stone-500 mt-0.5">
                    {t('customer.memberSince', 'Cliente desde')} {new Date(firstVisit).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-2 hover:bg-stone-100 rounded-lg transition-colors"
                aria-label={t('common.close', 'Fechar')}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="px-6 py-5 space-y-6">
              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-3">
                <StatBox label={t('customer.totalVisits', 'Visitas')} value={String(visits)} />
                <StatBox label={t('customer.avgSpend', 'Ticket Medio')} value={avgSpend ? `R$ ${Math.round(avgSpend)}` : '—'} />
                <StatBox label={t('customer.totalRevenue', 'Receita Total')} value={totalRevenue ? `R$ ${Math.round(totalRevenue)}` : '—'} />
                <StatBox label={t('customer.churnRisk', 'Risco de Churn')} value={churnRisk != null ? `${churnRisk}%` : '—'} valueColor={churnRisk != null && churnRisk > 50 ? 'text-red-600' : undefined} />
              </div>

              {/* Behavior */}
              {(favTime || favDay) && (
                <Section title={t('customer.behavior', 'Comportamento')}>
                  <div className="space-y-1.5">
                    {favDay && <InfoRow label={t('customer.favoriteDay', 'Dia favorito')} value={favDay} />}
                    {favTime && <InfoRow label={t('customer.favoriteTime', 'Horario favorito')} value={favTime} />}
                    {ltvData?.avg_party_size && <InfoRow label={t('customer.avgPartySize', 'Grupo medio')} value={`${Math.round(ltvData.avg_party_size)} pessoas`} />}
                    {ltvData?.avg_days_between_visits && <InfoRow label={t('customer.frequency', 'Frequencia')} value={`A cada ${Math.round(ltvData.avg_days_between_visits)} dias`} />}
                  </div>
                </Section>
              )}

              {/* Dietary Preferences */}
              {reservation.dietary_restrictions && reservation.dietary_restrictions.length > 0 && (
                <Section title={t('customer.dietary', 'Restricoes Alimentares')}>
                  <div className="flex flex-wrap gap-1.5">
                    {reservation.dietary_restrictions.map((d) => (
                      <span key={d} className="text-xs bg-amber-50 text-amber-800 px-2 py-0.5 rounded-full font-medium">{d}</span>
                    ))}
                  </div>
                </Section>
              )}

              {/* Preferences from memories */}
              {preferences.length > 0 && (
                <Section title={t('customer.preferences', 'Preferencias')}>
                  <div className="space-y-2">
                    {preferences.slice(0, 5).map((m) => (
                      <p key={m.id} className="text-sm text-stone-700">{m.content}</p>
                    ))}
                  </div>
                </Section>
              )}

              {/* Special Occasions */}
              {occasions.length > 0 && (
                <Section title={t('customer.occasions', 'Datas Especiais')}>
                  <div className="space-y-2">
                    {occasions.map((m) => (
                      <p key={m.id} className="text-sm text-stone-700">{m.content}</p>
                    ))}
                  </div>
                </Section>
              )}

              {/* Manager Notes */}
              <Section title={t('customer.notes', 'Notas do Gerente')}>
                {notes.length > 0 ? (
                  <div className="space-y-2">
                    {notes.map((m) => (
                      <div key={m.id} className="text-sm text-stone-700 bg-stone-50 px-3 py-2 rounded-lg">
                        {m.content}
                        <span className="text-[10px] text-stone-400 ml-2">
                          {new Date(m.created_at).toLocaleDateString('pt-BR')}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-stone-400 italic">{t('customer.noNotes', 'Nenhuma nota adicionada')}</p>
                )}
              </Section>

              {/* Current Reservation */}
              <Section title={t('customer.currentReservation', 'Reserva Atual')}>
                <div className="space-y-1.5">
                  <InfoRow label={t('customer.date', 'Data')} value={reservation.date} />
                  <InfoRow label={t('customer.time', 'Horario')} value={reservation.time} />
                  <InfoRow label={t('customer.partySize', 'Pessoas')} value={String(reservation.party_size)} />
                  {reservation.special_requests && (
                    <InfoRow label={t('customer.requests', 'Pedidos')} value={reservation.special_requests} />
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
    <div className="bg-stone-50 rounded-lg p-3">
      <p className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-1">{label}</p>
      <p className={`text-lg font-bold ${valueColor || 'text-stone-900'}`}>{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[11px] font-bold text-stone-500 uppercase tracking-widest mb-2">{title}</h3>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-stone-500">{label}</span>
      <span className="text-stone-900 font-medium">{value}</span>
    </div>
  );
}

/**
 * ServiceScorePage — "A Partitura" (/host-dashboard/service).
 *
 * A direção que ficou de fora do redesign do dashboard: em vez das raias
 * como régua de rodapé, elas ocupam a página inteira. Serve o momento em
 * que o host quer PLANEJAR a noite, não reagir a ela — por isso mora numa
 * rota própria, e não como um segundo dashboard concorrente.
 *
 * Herda o Modo Serviço: depois das 18h a página escurece junto com o resto.
 */
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { hostAPI } from '../services/api';
import { useRealtimeDashboard } from '../hooks/useRealtimeSubscription';
import { useServiceMode } from '../hooks/useServiceMode';
import DashboardLayout from '../components/layout/DashboardLayout';
import ServiceScore from '../components/dashboard/ServiceScore';
import type { UpcomingReservation, ActiveParty } from '../types/host.types';
import { todayLocalISO } from '../utils/timeFormatting';

export default function ServiceScorePage() {
  const { t, i18n } = useTranslation();
  useDocumentTitle(t('serviceScore.pageTitle', 'A Partitura'));
  const { isNight, toggle: toggleServiceMode } = useServiceMode();

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: hostAPI.getDashboard,
    refetchInterval: 5 * 60 * 1000,
  });

  const tables = data?.data?.tables || [];
  const activeParties: ActiveParty[] = data?.data?.active_parties || [];
  const reservations: UpcomingReservation[] = data?.data?.upcoming_reservations || [];
  const restaurantId: string | undefined = data?.data?.restaurant_id;

  // Mesma assinatura em tempo real do dashboard: sentar um grupo redesenha
  // a pauta sem refresh.
  useRealtimeDashboard(restaurantId);

  const today = todayLocalISO();
  const todayReservations = reservations.filter((r) => r.date === today);

  const dateLocale = i18n.language === 'pt-BR' ? 'pt-BR' : i18n.language === 'es' ? 'es-ES' : 'en-US';
  const fullDateStr = new Date().toLocaleDateString(dateLocale, { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <DashboardLayout>
      <div className={`dashboard min-h-screen px-4 sm:px-6 lg:px-10 pt-6 sm:pt-10 pb-24 sm:pb-20${isNight ? ' service-mode' : ''}`}>
        <div className="max-w-[1240px]">
          <header className="flex flex-col sm:flex-row sm:justify-between sm:items-start mb-8 sm:mb-12 mt-14 sm:mt-0 gap-3">
            <div className="pl-12 lg:pl-0">
              <h1 className="font-serif text-3xl sm:text-4xl tracking-tight text-deep-charcoal">
                {t('serviceScore.heading', 'A noite inteira, numa página')}
              </h1>
              <p className="text-[12px] sm:text-[13px] text-muted-stone font-mono uppercase tracking-widest mt-1.5">
                {fullDateStr}
              </p>
            </div>
            <button
              type="button"
              onClick={toggleServiceMode}
              aria-pressed={isNight}
              aria-label={t('dashboard.serviceMode', 'Modo Serviço')}
              className={`inline-flex items-center gap-2 min-h-[36px] px-3 py-2 rounded-[100px] border text-[11px] font-mono uppercase tracking-[0.12em] transition-colors pl-12 lg:pl-3 ${
                isNight
                  ? 'border-white/20 text-white/70 hover:text-white'
                  : 'border-border-gray text-muted-stone hover:text-deep-charcoal hover:bg-soft-gray'
              }`}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <path d="M21 13.2A8.5 8.5 0 0 1 10.8 3a8.5 8.5 0 1 0 10.2 10.2z" />
              </svg>
              {isNight && <span>{t('dashboard.serviceMode', 'Modo Serviço')}</span>}
            </button>
          </header>

          {isLoading ? (
            <div role="status" aria-label={t('common.loading', 'Loading')} className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-16 bg-border-gray/60 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : (
            <ServiceScore
              tables={tables}
              activeParties={activeParties}
              todayReservations={todayReservations}
              night={isNight}
            />
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

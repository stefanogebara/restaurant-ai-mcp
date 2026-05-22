/**
 * Dashboard V2 — implementation of the Claude Design "Visão geral" mockup.
 *
 * Mounted at /host-dashboard/v2 alongside the existing /host-dashboard/simple.
 * Reuses the same hostAPI.getDashboard + useRealtimeDashboard + useActivityFeed
 * hooks as Dashboard.tsx, so behavior is identical — only the visual layer
 * changes. Existing route + components are untouched.
 *
 * Sections (top → bottom):
 *   1. Dark sidebar with section nav + manager card
 *   2. Greeting header ("Boa tarde, Marina." + dinner-service countdown)
 *   3. 4 KPI cards (reservations today, occupancy, ticket, dwell)
 *   4. "Salão agora" — table grid with status filter pills
 *   5. Próximas reservas + Atividade do agente (2-col bottom)
 */

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { hostAPI } from '../services/api';
import { useRealtimeDashboard } from '../hooks/useRealtimeSubscription';
import { useActivityFeed } from '../hooks/useActivityFeed';
import { useAuth } from '../contexts/AuthContext';
import { useRestaurantSettings } from '../hooks/useRestaurantSettings';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import type { UpcomingReservation } from '../types/host.types';
import { todayLocalISO } from '../utils/timeFormatting';
import SidebarV2, { getManagerName } from '../components/v2/SidebarV2';

// ─── Greeting ───────────────────────────────────────────────────────────────

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Boa madrugada';
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

function getDateLabel(): string {
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
}

function getNextServiceLabel(openTime: string | null | undefined): string {
  if (!openTime) return 'Serviço em andamento';
  const [h, m] = openTime.split(':').map(Number);
  if (Number.isNaN(h)) return 'Serviço em andamento';
  const now = new Date();
  const open = new Date(now);
  open.setHours(h, m || 0, 0, 0);
  const diffMs = open.getTime() - now.getTime();
  if (diffMs < 0) return 'Serviço em andamento';
  const hours = Math.floor(diffMs / 3600000);
  const mins = Math.floor((diffMs % 3600000) / 60000);
  if (hours === 0) return `Serviço começa em ${mins}min`;
  return `Serviço começa em ${hours}h ${String(mins).padStart(2, '0')}min`;
}

// ─── KPI card ────────────────────────────────────────────────────────────────

function KpiCard({ value, label, hint }: { value: string; label: string; hint?: string }) {
  return (
    <div className="bg-white border border-[#E5E7EB] rounded-xl p-5">
      <div className="text-[28px] font-semibold text-[#1C1917] tracking-tight leading-none">{value}</div>
      <div className="text-[13px] text-[#1C1917] mt-2 font-medium">{label}</div>
      {hint && <div className="text-[11px] text-[#706A65] mt-0.5">{hint}</div>}
    </div>
  );
}

// ─── Salon grid (table layout with status pills) ─────────────────────────────

type TableStatus = 'available' | 'occupied' | 'reserved' | 'being_cleaned';

const STATUS_FILTER: { key: 'all' | TableStatus; label: string; color: string }[] = [
  { key: 'all',          label: 'Tudo',       color: '#1C1917' },
  { key: 'available',    label: 'Disponível', color: '#16A34A' },
  { key: 'occupied',     label: 'Ocupada',    color: '#DC2626' },
  { key: 'reserved',     label: 'Reservada',  color: '#9F1239' },
  { key: 'being_cleaned',label: 'Limpeza',    color: '#D97706' },
];

interface SalonTable {
  id: string;
  table_number: number | string;
  capacity: number;
  location: string;
  status: string;
}

function normalizeStatus(s?: string): TableStatus {
  const v = (s || '').toLowerCase().replace(/ /g, '_');
  if (v === 'occupied') return 'occupied';
  if (v === 'reserved') return 'reserved';
  if (v === 'being_cleaned' || v === 'cleaning') return 'being_cleaned';
  return 'available';
}

function SalonGrid({ tables }: { tables: SalonTable[] }) {
  const [filter, setFilter] = useState<'all' | TableStatus>('all');

  const byLocation = useMemo(() => {
    const map = new Map<string, SalonTable[]>();
    for (const t of tables) {
      const loc = t.location || 'Salão principal';
      if (!map.has(loc)) map.set(loc, []);
      map.get(loc)!.push(t);
    }
    return Array.from(map.entries()).map(([loc, list]) => [loc, list.sort((a, b) => Number(a.table_number) - Number(b.table_number))] as const);
  }, [tables]);

  const filtered = (list: SalonTable[]) => list.filter(t => filter === 'all' || normalizeStatus(t.status) === filter);

  return (
    <section className="mt-8" aria-labelledby="salon-now">
      <div className="flex items-center justify-between mb-3">
        <h2 id="salon-now" className="text-[15px] font-semibold text-[#1C1917]">Salão agora</h2>
        <div className="flex gap-1.5" role="tablist">
          {STATUS_FILTER.map(s => {
            const active = filter === s.key;
            return (
              <button
                key={s.key}
                role="tab"
                aria-selected={active}
                type="button"
                onClick={() => setFilter(s.key)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium transition-colors ${
                  active
                    ? 'bg-[#1C1917] text-white border-[#1C1917]'
                    : 'bg-white text-[#1C1917] border-[#E5E7EB] hover:border-[#706A65]'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />
                {s.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="bg-white border border-[#E5E7EB] rounded-xl p-5">
        {byLocation.length === 0 ? (
          <p className="text-sm text-[#706A65] py-8 text-center">Nenhuma mesa configurada. Crie suas mesas em Configurações.</p>
        ) : (
          <div className="space-y-5">
            {byLocation.map(([loc, list]) => {
              const display = filtered(list);
              return (
                <div key={loc}>
                  <div className="text-[11px] uppercase tracking-wider text-[#706A65] mb-2 font-medium">{loc}</div>
                  <div className="grid grid-cols-6 gap-2">
                    {display.map(t => {
                      const status = normalizeStatus(t.status);
                      const meta = STATUS_FILTER.find(s => s.key === status);
                      return (
                        <div
                          key={t.id}
                          className="aspect-square rounded-md border bg-white p-2 flex flex-col justify-between"
                          style={{ borderColor: meta?.color ?? '#E5E7EB' }}
                          title={`Mesa ${t.table_number} · ${meta?.label}`}
                        >
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="font-semibold text-[#1C1917]">{t.table_number}</span>
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: meta?.color }} />
                          </div>
                          <div className="text-[10px] text-[#706A65]">{t.capacity}p</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

// ─── Próximas reservas (bottom-left) ────────────────────────────────────────

function NextReservationsPanel({ reservations }: { reservations: UpcomingReservation[] }) {
  const today = todayLocalISO();
  const upcoming = reservations.filter(r => r.date >= today).slice(0, 6);
  return (
    <section className="bg-white border border-[#E5E7EB] rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[14px] font-semibold text-[#1C1917]">Próximas reservas</h3>
        <Link to="/host-dashboard/simple" className="text-[12px] text-[#9F1239] hover:underline">Ver todas</Link>
      </div>
      {upcoming.length === 0 ? (
        <p className="text-sm text-[#706A65] py-6 text-center">Nada agendado por enquanto.</p>
      ) : (
        <ul className="space-y-2">
          {upcoming.map(r => (
            <li key={r.reservation_id} className="flex items-center justify-between py-2 border-b border-[#F5F0EB] last:border-0">
              <div>
                <div className="text-[13px] font-medium text-[#1C1917]">{r.customer_name}</div>
                <div className="text-[11px] text-[#706A65]">{r.party_size}p · {r.time?.slice(0, 5)}</div>
              </div>
              <div className="text-[11px] text-[#706A65]">{new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: 'numeric' }).format(new Date(r.date))}</div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ─── Atividade do agente (bottom-right) ─────────────────────────────────────

function AgentActivityPanel() {
  // useActivityFeed wraps useQuery — the events live on `data`, not `events`.
  // Activity row fields are `message`/`detail`/`timestamp` (see ActivityEvent).
  const { data: events, isLoading } = useActivityFeed();
  return (
    <section className="bg-white border border-[#E5E7EB] rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[14px] font-semibold text-[#1C1917]">Atividade do agente</h3>
        <span className="text-[11px] text-[#706A65] flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A] animate-pulse" />
          ao vivo
        </span>
      </div>
      {isLoading ? (
        <p className="text-sm text-[#706A65] py-6 text-center">Carregando…</p>
      ) : !events || events.length === 0 ? (
        <p className="text-sm text-[#706A65] py-6 text-center">Sem atividade recente.</p>
      ) : (
        <ul className="space-y-3">
          {events.slice(0, 8).map(e => (
            <li key={e.id} className="flex items-start gap-3 text-[12px]">
              <span className="w-7 h-7 rounded-full bg-[#F5F0EB] text-[#9F1239] flex items-center justify-center text-[11px] shrink-0 mt-0.5">✦</span>
              <div className="min-w-0 flex-1">
                <div className="text-[#1C1917]">{e.message}</div>
                <div className="text-[11px] text-[#706A65]">
                  {e.detail ? `${e.detail} · ` : ''}
                  {new Date(e.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function DashboardV2() {
  const { t } = useTranslation();
  useDocumentTitle('Visão geral · seatable');
  const { user } = useAuth();
  // useRestaurantSettings wraps useQuery — restaurant settings live on `data`.
  const { data: settings } = useRestaurantSettings();

  const { data: dashboardData } = useQuery({
    queryKey: ['dashboard'],
    queryFn: hostAPI.getDashboard,
    refetchInterval: 5 * 60 * 1000,
  });

  const summary = dashboardData?.data?.summary || {};
  const tables: SalonTable[] = dashboardData?.data?.tables || [];
  const reservations: UpcomingReservation[] = dashboardData?.data?.upcoming_reservations || [];
  const restaurantId: string | undefined = dashboardData?.data?.restaurant_id;
  useRealtimeDashboard(restaurantId);

  // Today's KPI numbers
  const today = todayLocalISO();
  const todayCount = reservations.filter(r => r.date === today).length;
  const totalTables = tables.length;
  const occupied = tables.filter(t => normalizeStatus(t.status) === 'occupied').length;
  const occupancyPct = totalTables ? Math.round((occupied / totalTables) * 100) : 0;
  const avgTicket = (summary as { avg_ticket?: number }).avg_ticket;
  const avgDwell = (summary as { avg_dwell_minutes?: number }).avg_dwell_minutes;

  // Friendly greeting name — prefer user's display name, fall back to "Gerente"
  const managerName = getManagerName(user?.email);

  const openToday = (() => {
    // business_hours is a Record<dayName, { is_open, open_time, close_time }>
    // — keyed by lowercase day name, not an array of rows.
    const hours = settings?.business_hours;
    if (!hours) return null;
    const dayKey = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const today = hours[dayKey];
    return today?.is_open ? today.open_time : null;
  })();

  return (
    <div className="min-h-screen bg-[#FAFAF9] flex">
      <SidebarV2 managerName={managerName} />

      <main className="flex-1 min-w-0">
        {/* Top bar */}
        <div className="h-14 border-b border-[#E5E7EB] bg-white px-8 flex items-center justify-between">
          <nav aria-label="Breadcrumb" className="text-[12px] text-[#706A65]">
            <span>Visão geral</span>
          </nav>
          <div className="flex-1 max-w-md mx-8">
            <input
              type="search"
              placeholder="Buscar reservas, cliente, mesa…"
              aria-label={t('common.search', 'Buscar')}
              className="w-full h-9 px-3 rounded-md border border-[#E5E7EB] bg-[#FAFAF9] text-[13px] focus:outline-none focus:border-[#9F1239] focus:bg-white transition-colors"
            />
          </div>
          <div className="text-[12px] text-[#706A65]">
            {new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date())}
          </div>
        </div>

        {/* Content */}
        <div className="max-w-[1200px] mx-auto px-8 py-8">
          {/* Greeting */}
          <header className="flex items-end justify-between mb-7">
            <div>
              <h1 className="text-[28px] font-semibold tracking-tight text-[#1C1917]" style={{ fontFamily: '"Playfair Display", Inter, serif' }}>
                {getGreeting()}, {managerName}.
              </h1>
              <p className="text-[14px] text-[#706A65] mt-1">
                {getDateLabel()} · {getNextServiceLabel(openToday)}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="h-9 px-4 rounded-md border border-[#E5E7EB] bg-white text-[13px] text-[#1C1917] hover:border-[#706A65] transition-colors"
              >
                Exportar
              </button>
              <Link
                to="/host-dashboard/simple"
                className="h-9 px-4 rounded-md bg-[#9F1239] text-white text-[13px] font-medium hover:bg-[#7F0F2D] transition-colors flex items-center"
              >
                + Nova reserva
              </Link>
            </div>
          </header>

          {/* KPI row */}
          <section className="grid grid-cols-4 gap-3" aria-label="Indicadores principais">
            <KpiCard value={String(todayCount)} label="Reservas hoje" hint="Confirmadas + pendentes" />
            <KpiCard value={`${occupancyPct}%`} label="Ocupação atual" hint={`${occupied} de ${totalTables} mesas`} />
            <KpiCard value={avgTicket ? `R$ ${Math.round(avgTicket)}` : '—'} label="Ticket médio" hint="Últimos 30 dias" />
            <KpiCard value={avgDwell ? `${Math.floor(avgDwell / 60)}h ${avgDwell % 60}` : '—'} label="Tempo médio" hint="Por mesa" />
          </section>

          <SalonGrid tables={tables} />

          {/* Bottom: 2 columns */}
          <div className="grid grid-cols-2 gap-4 mt-8">
            <NextReservationsPanel reservations={reservations} />
            <AgentActivityPanel />
          </div>
        </div>
      </main>
    </div>
  );
}

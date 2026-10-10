// Visual review only. Synthetic guests, no authentication or real API mutations.
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '../../index.css';
import i18n from '../../i18n/config';
import { CustomersWorkspace } from '../../pages/CustomersPage';
import type { CrmCustomer } from '../../hooks/useCustomers';

type PreviewGuest = CrmCustomer & {
  allergies: string[];
  dietary_restrictions: string[];
  seating_preferences: string[];
  special_occasions: Record<string, string>;
};

const guests: PreviewGuest[] = [
  { customer_id: 'guest-1', customer_phone: '+55 11 98877-2244', customer_name: 'Marina Duarte', customer_email: null, total_visits: 11, first_visit_date: '2025-11-09', last_visit_date: '2026-08-18', customer_tier: 'at_risk', total_revenue: 3640, avg_revenue_per_visit: 331, lifetime_value: 3640, churn_risk_score: 82, avg_party_size: 2, tags: ['terraço', 'vinho'], allergies: [], dietary_restrictions: [], seating_preferences: ['terraço'], special_occasions: {} },
  { customer_id: 'guest-2', customer_phone: '+55 11 98877-2255', customer_name: 'João Lima', customer_email: null, total_visits: 6, first_visit_date: '2026-01-22', last_visit_date: '2026-09-02', customer_tier: 'at_risk', total_revenue: 1980, avg_revenue_per_visit: 330, lifetime_value: 1980, churn_risk_score: 68, avg_party_size: 2, tags: ['vegetariano'], allergies: [], dietary_restrictions: ['Vegetarian'], seating_preferences: [], special_occasions: {} },
  { customer_id: 'guest-3', customer_phone: '+55 11 98877-2266', customer_name: 'Bianca Rocha', customer_email: null, total_visits: 4, first_visit_date: '2026-04-18', last_visit_date: '2026-09-21', customer_tier: 'regular', total_revenue: 1240, avg_revenue_per_visit: 310, lifetime_value: 1240, churn_risk_score: 34, avg_party_size: 2, tags: ['janela'], allergies: ['Gluten'], dietary_restrictions: [], seating_preferences: ['janela'], special_occasions: {} },
  { customer_id: 'guest-4', customer_phone: '+55 11 98877-2277', customer_name: 'Pedro Nunes', customer_email: null, total_visits: 2, first_visit_date: '2026-08-12', last_visit_date: '2026-09-29', customer_tier: 'occasional', total_revenue: 620, avg_revenue_per_visit: 310, lifetime_value: 620, churn_risk_score: 19, avg_party_size: 2, tags: [], allergies: [], dietary_restrictions: [], seating_preferences: [], special_occasions: {} },
  { customer_id: 'guest-5', customer_phone: '+55 11 98877-2288', customer_name: 'Alice Prado', customer_email: null, total_visits: 1, first_visit_date: '2026-10-07', last_visit_date: '2026-10-07', customer_tier: 'new', total_revenue: 310, avg_revenue_per_visit: 310, lifetime_value: 310, churn_risk_score: 4, avg_party_size: 2, tags: [], allergies: [], dietary_restrictions: [], seating_preferences: [], special_occasions: {} },
  { customer_id: 'guest-6', customer_phone: '+55 11 98877-2299', customer_name: 'Lia Azevedo', customer_email: null, total_visits: 18, first_visit_date: '2024-12-14', last_visit_date: '2026-10-02', customer_tier: 'vip', total_revenue: 8100, avg_revenue_per_visit: 450, lifetime_value: 8100, churn_risk_score: 8, avg_party_size: 3, tags: ['aniversário', 'mesa 4'], allergies: ['Nuts'], dietary_restrictions: ['Vegan'], seating_preferences: ['mesa 4'], special_occasions: { birthday: '2026-11-12' } },
  { customer_id: 'guest-7', customer_phone: '+55 11 98877-2300', customer_name: 'Caio Menezes', customer_email: null, total_visits: 8, first_visit_date: '2025-10-04', last_visit_date: '2026-09-14', customer_tier: 'regular', total_revenue: 2640, avg_revenue_per_visit: 330, lifetime_value: 2640, churn_risk_score: 28, avg_party_size: 2, tags: ['almoço'], allergies: ['Seafood'], dietary_restrictions: ['Pescatarian'], seating_preferences: [], special_occasions: {} },
  { customer_id: 'guest-8', customer_phone: '+55 11 98877-2244', customer_name: 'Marina D.', customer_email: null, total_visits: 2, first_visit_date: '2025-10-12', last_visit_date: '2026-03-15', customer_tier: 'occasional', total_revenue: 580, avg_revenue_per_visit: 290, lifetime_value: 580, churn_risk_score: 24, avg_party_size: 2, tags: [], allergies: [], dietary_restrictions: [], seating_preferences: [], special_occasions: {} },
  { customer_id: 'guest-9', customer_phone: '+55 11 98877-2244', customer_name: 'M. Duarte', customer_email: null, total_visits: 1, first_visit_date: '2026-01-09', last_visit_date: '2026-01-09', customer_tier: 'new', total_revenue: 260, avg_revenue_per_visit: 260, lifetime_value: 260, churn_risk_score: 12, avg_party_size: 2, tags: [], allergies: [], dietary_restrictions: [], seating_preferences: [], special_occasions: {} },
];
const nextReservationDate = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
const previewState = new URLSearchParams(location.search).get('state');
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

function listGuests(params: URLSearchParams): Response {
  if (previewState === 'error') return json({ success: false, error: 'Falha simulada.' }, 503);
  if (previewState === 'empty') return json({ success: true, data: { customers: [], total: 0 } });

  const search = params.get('search');
  const tier = params.get('tier');
  const risk = params.get('min_risk_score');
  if (tier && !['vip', 'regular', 'occasional', 'new', 'at_risk'].includes(tier)) {
    return json({ success: false, error: 'Invalid tier' }, 400);
  }
  if (risk !== null && (risk.trim() === '' || !Number.isFinite(Number(risk)) || Number(risk) < 0 || Number(risk) > 100)) {
    return json({ success: false, error: 'Invalid min_risk_score' }, 400);
  }
  const sanitizedSearch = search?.trim().replace(/[%_\\]/g, '');
  if (search && (!sanitizedSearch || sanitizedSearch.length < 2)) {
    return json({ success: false, error: 'Search too short' }, 400);
  }

  let matches = guests.filter((guest) => {
    if (sanitizedSearch && !guest.customer_name?.toLocaleLowerCase('pt-BR').includes(sanitizedSearch.toLocaleLowerCase('pt-BR')) && guest.customer_phone !== sanitizedSearch) return false;
    if (tier && guest.customer_tier !== tier) return false;
    if (risk !== null && guest.churn_risk_score <= Number(risk)) return false;
    if (params.has('tag') && !guest.tags.includes(params.get('tag')!.trim().toLowerCase())) return false;
    if (params.has('allergy') && !guest.allergies.includes(params.get('allergy')!.trim())) return false;
    if (params.has('dietary') && !guest.dietary_restrictions.includes(params.get('dietary')!.trim())) return false;
    return true;
  });
  const total = matches.length;
  const requestedSort = params.get('sort') || 'last_visit_date';
  const sort = (['last_visit_date', 'total_visits', 'total_revenue', 'lifetime_value', 'churn_risk_score', 'customer_name'] as const)
    .find((field) => field === requestedSort) || 'last_visit_date';
  const direction = params.get('order') === 'asc' ? 1 : -1;
  matches = matches.sort((a, b) => {
    const left = a[sort];
    const right = b[sort];
    const comparison = typeof left === 'number' && typeof right === 'number'
      ? left - right
      : String(left ?? '').localeCompare(String(right ?? ''), 'pt-BR');
    return comparison * direction || a.customer_id.localeCompare(b.customer_id);
  });
  const limit = Math.min(Math.max(1, parseInt(params.get('limit') || '25', 10) || 25), 100);
  const offset = Math.max(0, parseInt(params.get('offset') || '0', 10) || 0);
  return json({ success: true, data: { customers: matches.slice(offset, offset + limit), total } });
}

if (import.meta.env.DEV) {
  void i18n.changeLanguage('pt-BR');
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = String(input);
    if (!url.startsWith('/api/')) return originalFetch(input, init);
    if (url.startsWith('/api/customers?') && (!init?.method || init.method === 'GET')) {
      const params = new URL(url, location.origin).searchParams;
      if (params.get('action') === 'detail') {
        const guest = guests.find(g => g.customer_id === params.get('customer_id'));
        if (!guest) return json({ success: false, error: 'Cliente simulado não encontrado.' }, 404);
        return json({ success: true, data: {
          customer: guest,
          reservations: guest.customer_id === 'guest-1' ? [
            { id: 'reservation-synthetic-next', date: nextReservationDate, time: '20:00', party_size: 2, status: 'confirmed' },
            { id: 'reservation-synthetic-1', date: guest.last_visit_date, time: '20:00', party_size: 2, status: 'completed' },
          ] : [{ id: `reservation-synthetic-${guest.customer_id}`, date: guest.last_visit_date, time: '19:30', party_size: guest.avg_party_size, status: 'completed' }],
          notes: guest.customer_id === 'guest-1'
            ? [{ id: 'note-synthetic-1', content: 'Prefere sombra no horário do almoço.', created_by: null, created_at: '2026-08-18T12:00:00Z' }]
            : [],
        } });
      }
      if (params.get('action') === 'find_duplicates') {
        const duplicates = [{
          match_field: 'phone',
          match_value: '+55 11 98877-2244',
          customers: guests.filter((guest) => guest.customer_phone === '+55 11 98877-2244'),
        }];
        return json({ success: true, data: { duplicates, total_groups: duplicates.length } });
      }
      if (params.get('action') === 'list') return listGuests(params);
    }
    return json({ success: false, error: 'Prévia local: alterações desativadas.' }, 503);
  };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
  createRoot(document.getElementById('root')!).render(
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-brand-paper">
        <div className="border-b border-brand-line"><p className="mx-auto max-w-[1240px] px-4 py-2 text-[11px] text-brand-muted sm:px-6 lg:px-10">Prévia local · dados sintéticos · sem envios</p></div>
        <CustomersWorkspace />
      </div>
    </QueryClientProvider>
  );
}

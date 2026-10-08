// Visual review only. Synthetic guests, no authentication or real API mutations.
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '../../index.css';
import i18n from '../../i18n/config';
import { CustomersWorkspace } from '../../pages/CustomersPage';

const guests = [
  { customer_id: 'guest-1', customer_phone: '+55 11 98877-2244', customer_name: 'Marina Duarte', total_visits: 11, last_visit_date: '2026-08-18', customer_tier: 'at_risk', lifetime_value: 3640, churn_risk_score: 82, tags: ['terraço', 'vinho'] },
  { customer_id: 'guest-2', customer_phone: '+55 11 98877-2255', customer_name: 'João Lima', total_visits: 6, last_visit_date: '2026-09-02', customer_tier: 'at_risk', lifetime_value: 1980, churn_risk_score: 68, tags: ['vegetariano'] },
  { customer_id: 'guest-3', customer_phone: '+55 11 98877-2266', customer_name: 'Bianca Rocha', total_visits: 4, last_visit_date: '2026-09-21', customer_tier: 'regular', lifetime_value: 1240, churn_risk_score: 34, tags: ['janela'] },
  { customer_id: 'guest-4', customer_phone: '+55 11 98877-2277', customer_name: 'Pedro Nunes', total_visits: 2, last_visit_date: '2026-09-29', customer_tier: 'occasional', lifetime_value: 620, churn_risk_score: 19, tags: [] },
  { customer_id: 'guest-5', customer_phone: '+55 11 98877-2288', customer_name: 'Alice Prado', total_visits: 1, last_visit_date: '2026-10-07', customer_tier: 'new', lifetime_value: 310, churn_risk_score: 4, tags: [] },
];
const nextReservationDate = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);

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
        if (!guest) return new Response(JSON.stringify({ success: false, error: 'Cliente simulado não encontrado.' }), { status: 404 });
        return new Response(JSON.stringify({ success: true, data: {
          customer: { ...guest, customer_email: null, first_visit_date: '2025-11-09', avg_revenue_per_visit: 130, total_revenue: 1430, churn_risk_score: guest.churn_risk_score, allergies: [], dietary_restrictions: [], seating_preferences: ['terraço'], special_occasions: {} },
          reservations: [
            { id: 'reservation-synthetic-next', date: nextReservationDate, time: '20:00', party_size: 2, status: 'confirmed' },
            { id: 'reservation-synthetic-1', date: '2026-08-18', time: '20:00', party_size: 2, status: 'completed' },
            { id: 'reservation-synthetic-2', date: '2026-07-29', time: '12:30', party_size: 3, status: 'completed' },
            { id: 'reservation-synthetic-3', date: '2026-06-12', time: '19:30', party_size: 2, status: 'completed' },
          ],
          notes: [{ id: 'note-synthetic-1', content: 'Prefere sombra no horário do almoço.', created_by: null, created_at: '2026-08-18T12:00:00Z' }],
        } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      const list = params.get('tier') === 'at_risk' ? guests.filter(g => g.customer_tier === 'at_risk') : guests;
      return new Response(JSON.stringify({ success: true, data: { customers: list, total: list.length } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ success: false, error: 'Prévia local: alterações desativadas.' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
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

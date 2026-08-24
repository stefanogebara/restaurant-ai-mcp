import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import type { CrmCustomer } from '../../hooks/useCustomers';

vi.mock('../../components/layout/DashboardLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dashboard-layout">{children}</div>
  ),
}));

// O drawer e o painel de duplicados fazem suas próprias buscas; aqui só
// interessa que a página os abra com o cliente certo.
vi.mock('../../components/dashboard/CrmCustomerDrawer', () => ({
  default: ({ customerId }: { customerId: string | null }) =>
    customerId ? <div data-testid="drawer">{customerId}</div> : null,
}));
vi.mock('../../components/dashboard/DuplicateCustomersPanel', () => ({
  default: () => <div data-testid="duplicates" />,
}));

const authFetch = vi.fn();
vi.mock('../../services/api', () => ({
  authFetch: (...args: unknown[]) => authFetch(...args),
}));

import CustomersPage from '../CustomersPage';

// ---- Dados ----

const mkCustomer = (over: Partial<CrmCustomer> = {}): CrmCustomer => ({
  customer_id: 'c1',
  customer_phone: '+5511999990001',
  customer_name: 'Beatriz Costa',
  customer_email: null,
  total_visits: 6,
  last_visit_date: new Date().toISOString(),
  first_visit_date: null,
  customer_tier: 'vip',
  lifetime_value: 1840,
  avg_revenue_per_visit: 0,
  total_revenue: 0,
  churn_risk_score: 0,
  avg_party_size: 4,
  tags: ['terraço', 'vinho', 'aniversário', 'extra'],
  ...over,
});

function respondWith(customers: CrmCustomer[], total = customers.length) {
  authFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ success: true, data: { customers, total } }),
  });
}

/** Última URL pedida ao backend — é onde os filtros viram query string. */
const lastUrl = () => String(authFetch.mock.calls.at(-1)?.[0] ?? '');

describe('CustomersPage', () => {
  beforeEach(() => {
    authFetch.mockReset();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('lista os clientes vindos da API', async () => {
    respondWith([mkCustomer()]);
    renderWithProviders(<CustomersPage />);

    expect(await screen.findByText('Beatriz Costa')).toBeInTheDocument();
    expect(screen.getByText('+5511999990001')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
  });

  it('mostra no máximo 3 tags e resume o resto', async () => {
    respondWith([mkCustomer()]);
    renderWithProviders(<CustomersPage />);

    await screen.findByText('Beatriz Costa');
    expect(screen.getByText('terraço')).toBeInTheDocument();
    expect(screen.getByText('vinho')).toBeInTheDocument();
    expect(screen.getByText('aniversário')).toBeInTheDocument();
    // A quarta tag não é impressa — vira "+1".
    expect(screen.queryByText('extra')).not.toBeInTheDocument();
    expect(screen.getByText('+1')).toBeInTheDocument();
  });

  it('busca é debounced: só consulta o backend depois da pausa de digitação', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    respondWith([mkCustomer()]);
    renderWithProviders(<CustomersPage />);
    await screen.findByText('Beatriz Costa');

    const callsBefore = authFetch.mock.calls.length;
    await user.type(screen.getByRole('textbox', { name: /search customers/i }), 'bea');

    // Antes do debounce vencer, nenhuma requisição nova saiu.
    expect(authFetch.mock.calls.length).toBe(callsBefore);

    await waitFor(() => expect(lastUrl()).toContain('search=bea'));
  });

  it('trocar de filtro volta para a primeira página', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    // 60 clientes = 3 páginas de 25.
    respondWith([mkCustomer()], 60);
    renderWithProviders(<CustomersPage />);
    await screen.findByText('Beatriz Costa');

    await user.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => expect(lastUrl()).toContain('offset=25'));

    // Filtrar por tier tem de zerar o offset — senão o host filtra e cai
    // numa página vazia do resultado novo.
    await user.selectOptions(screen.getByRole('combobox', { name: /filter by tier/i }), 'vip');
    await waitFor(() => expect(lastUrl()).toContain('tier=vip'));
    expect(lastUrl()).toContain('offset=0');
  });

  it('desabilita a paginação nos extremos', async () => {
    respondWith([mkCustomer()], 60);
    renderWithProviders(<CustomersPage />);
    await screen.findByText('Beatriz Costa');

    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /next/i })).toBeEnabled();
  });

  it('abre o drawer do cliente clicado', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    respondWith([mkCustomer({ customer_id: 'abc-123' })]);
    renderWithProviders(<CustomersPage />);

    await user.click(await screen.findByText('Beatriz Costa'));
    expect(within(screen.getByTestId('drawer')).getByText('abc-123')).toBeInTheDocument();
  });

  it('CRM vazio explica como os clientes chegam, em vez de só dizer "nada aqui"', async () => {
    respondWith([]);
    renderWithProviders(<CustomersPage />);

    expect(await screen.findByText(/CRM está esperando/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /primeira reserva/i })).toBeInTheDocument();
    // Sem clientes, procurar duplicados não faz sentido e não deve aparecer.
    expect(screen.queryByRole('button', { name: /duplicate/i })).not.toBeInTheDocument();
  });

  it('busca sem resultado oferece limpar os filtros, e limpar refaz a consulta', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    respondWith([]);
    renderWithProviders(<CustomersPage />);

    await user.type(screen.getByRole('textbox', { name: /search customers/i }), 'zzz');
    await waitFor(() => expect(lastUrl()).toContain('search=zzz'));

    const clear = await screen.findByRole('button', { name: /clear filters/i });
    await user.click(clear);
    await waitFor(() => expect(lastUrl()).not.toContain('search='));
  });

  it('mostra o erro quando a busca falha', async () => {
    authFetch.mockResolvedValue({ ok: false, json: async () => ({ success: false }) });
    renderWithProviders(<CustomersPage />);

    expect(await screen.findByText(/failed to load customers/i)).toBeInTheDocument();
  });
});

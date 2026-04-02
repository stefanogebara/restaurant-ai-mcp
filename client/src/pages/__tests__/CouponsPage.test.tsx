import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CouponsPage from '../CouponsPage';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string) => fallback,
    i18n: { language: 'pt-BR' },
  }),
}));

vi.mock('../../components/common/ThiingsIcon', () => ({
  default: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

vi.mock('../../services/api', () => ({
  api: {
    get: vi.fn().mockResolvedValue({ data: { success: true, data: { coupons: [] } } }),
    post: vi.fn().mockResolvedValue({ data: { success: true } }),
  },
}));

vi.mock('../../components/layout/DashboardLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dashboard-layout">{children}</div>
  ),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: undefined, isLoading: true, error: null }),
  useMutation: () => ({ mutateAsync: vi.fn(), mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <CouponsPage />
    </MemoryRouter>,
  );
}

describe('CouponsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the page title', () => {
    renderPage();
    expect(screen.getByText('Cupons e Promocoes')).toBeInTheDocument();
  });

  it('renders stats bar', () => {
    renderPage();
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('Ativos')).toBeInTheDocument();
    expect(screen.getByText('Resgates')).toBeInTheDocument();
  });

  it('renders new coupon button', () => {
    renderPage();
    expect(screen.getByText('Novo Cupom')).toBeInTheDocument();
  });

  it('shows loading spinner while fetching', () => {
    renderPage();
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });
});

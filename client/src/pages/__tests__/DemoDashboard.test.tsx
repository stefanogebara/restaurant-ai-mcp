import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock child components to keep tests focused on DemoDashboard logic
vi.mock('../../components/dashboard/StatsBar', () => ({
  default: (props: Record<string, unknown>) => (
    <div data-testid="stats-bar" data-occupied={props.occupiedTables} data-total={props.totalTables} />
  ),
}));

vi.mock('../../components/dashboard/ReservationsList', () => ({
  default: () => <div data-testid="reservations-list" />,
}));

vi.mock('../../components/dashboard/ActivePartiesPanel', () => ({
  default: (props: { parties: unknown[] }) => (
    <div data-testid="active-parties">{props.parties.length} parties</div>
  ),
}));

vi.mock('../../components/demo/DemoWaitlistPanel', () => ({
  default: (props: { entries: unknown[] }) => (
    <div data-testid="waitlist-panel">{props.entries.length} waiting</div>
  ),
}));

vi.mock('../../components/demo/DemoAIInsightsBar', () => ({
  default: () => <div data-testid="ai-insights-bar" />,
}));

function renderDemoDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/demo']}>
        <Routes>
          <Route path="/demo" element={<DemoDashboard />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// Import the page after mocks are in place
import DemoDashboard from '../DemoDashboard';

// Mock i18n to avoid async locale loading in tests
vi.mock('../../i18n/config', () => ({
  default: {
    language: 'pt-BR',
    changeLanguage: vi.fn(),
    hasResourceBundle: vi.fn(() => true),
    addResourceBundle: vi.fn(),
    on: vi.fn(),
    use: vi.fn(() => ({ use: vi.fn(() => ({ init: vi.fn() })) })),
  },
}));

describe('DemoDashboard', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem('seatable-demo-lang');
  });

  it('renders the demo banner, restaurant name, and all panels', () => {
    renderDemoDashboard();

    // Demo banner (PT-BR default)
    expect(screen.getByText(/demo interativa/i)).toBeInTheDocument();

    // Restaurant name (PT-BR default)
    expect(screen.getByText('Cantina da Praça')).toBeInTheDocument();

    // All panels present
    expect(screen.getByTestId('stats-bar')).toBeInTheDocument();
    expect(screen.getByTestId('reservations-list')).toBeInTheDocument();
    expect(screen.getByTestId('active-parties')).toBeInTheDocument();
    expect(screen.getByTestId('waitlist-panel')).toBeInTheDocument();
  });

  it('has 2 active parties and 2 waitlist entries from seed data', () => {
    renderDemoDashboard();

    expect(screen.getByText('2 parties')).toBeInTheDocument();
    expect(screen.getByText('2 waiting')).toBeInTheDocument();
  });

  it('shows stats bar with correct seed table counts', () => {
    renderDemoDashboard();

    const statsBar = screen.getByTestId('stats-bar');
    // 2 occupied (t2, t5), 9 total tables
    expect(statsBar.getAttribute('data-occupied')).toBe('2');
    expect(statsBar.getAttribute('data-total')).toBe('9');
  });

  it('opens walk-in modal on button click', () => {
    renderDemoDashboard();

    // PT-BR default label
    const addButton = screen.getByText('Adicionar Walk-In');
    fireEvent.click(addButton);

    expect(screen.getByRole('dialog', { name: /adicionar walk-in/i })).toBeInTheDocument();
  });

  it('renders AI Insights Bar inline', () => {
    renderDemoDashboard();

    expect(screen.getByTestId('ai-insights-bar')).toBeInTheDocument();
  });
});

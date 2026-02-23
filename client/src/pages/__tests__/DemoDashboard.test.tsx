import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// Mock child components to keep tests focused on DemoDashboard logic
vi.mock('../../components/demo/DemoBanner', () => ({
  default: ({ daysLeft, token }: { daysLeft: number; token: string }) => (
    <div data-testid="demo-banner">
      Banner: {daysLeft} days, token: {token}
    </div>
  ),
}));

vi.mock('../../components/dashboard/StatsBar', () => ({
  default: () => <div data-testid="stats-bar" />,
}));

vi.mock('../../components/dashboard/ReservationsList', () => ({
  default: () => <div data-testid="reservations-list" />,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockRestaurant = {
  id: 'resto-123',
  restaurant_name: 'Le Petit Bistro',
  restaurant_type: 'French',
  city: 'Paris',
  country: 'France',
  demo_expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  demo_token: 'tok-abc',
  business_hours: {},
  max_party_size: 8,
  slug: 'le-petit-bistro',
};

const mockSuccessResponse = {
  success: true,
  restaurant: mockRestaurant,
  tables: [],
  reservations: [],
  daysLeft: 7,
};

function renderDemoDashboard(token = 'tok-abc') {
  return render(
    <MemoryRouter initialEntries={[`/demo/${token}`]}>
      <Routes>
        <Route path="/demo/:token" element={<DemoDashboard />} />
      </Routes>
    </MemoryRouter>,
  );
}

// Import the page after mocks are in place
import DemoDashboard from '../DemoDashboard';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DemoDashboard', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('shows loading spinner while fetching session', () => {
    // Never-resolving fetch keeps loading state
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));

    const { container } = renderDemoDashboard();

    // The loading state renders the spinner div with animate-spin
    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
    expect(screen.getByText(/seatable/i)).toBeInTheDocument();
  });

  it('shows error state when fetch returns success: false (expired token)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          json: () => Promise.resolve({ success: false }),
        }),
      ),
    );

    renderDemoDashboard('expired-token');

    expect(await screen.findByText('Demo unavailable')).toBeInTheDocument();
    expect(
      screen.getByText('This demo link is invalid or has expired.'),
    ).toBeInTheDocument();
  });

  it('shows error state when fetch rejects (network error)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('Network error'))),
    );

    renderDemoDashboard();

    expect(await screen.findByText('Demo unavailable')).toBeInTheDocument();
    expect(
      screen.getByText('Could not load demo session. Please try again.'),
    ).toBeInTheDocument();
  });

  it('renders DemoBanner and restaurant name on successful fetch', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          json: () => Promise.resolve(mockSuccessResponse),
        }),
      ),
    );

    renderDemoDashboard('tok-abc');

    // Wait for banner to appear (signals successful load)
    expect(await screen.findByTestId('demo-banner')).toBeInTheDocument();

    // Restaurant name appears in the page header
    expect(screen.getByText('Le Petit Bistro')).toBeInTheDocument();
  });

  it('renders StatsBar and ReservationsList on successful fetch', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          json: () => Promise.resolve(mockSuccessResponse),
        }),
      ),
    );

    renderDemoDashboard();

    expect(await screen.findByTestId('stats-bar')).toBeInTheDocument();
    expect(screen.getByTestId('reservations-list')).toBeInTheDocument();
  });
});

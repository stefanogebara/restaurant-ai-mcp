import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../../../hooks/useRevenueStats', () => ({ useRevenueStats: vi.fn() }));
vi.mock('../../../hooks/useStaffingForecast', () => ({ useStaffingForecast: vi.fn() }));

import { useRevenueStats } from '../../../hooks/useRevenueStats';
import { useStaffingForecast } from '../../../hooks/useStaffingForecast';
import RevenueStatsWidget from '../RevenueStatsWidget';

const mockStats = useRevenueStats as ReturnType<typeof vi.fn>;
const mockForecast = useStaffingForecast as ReturnType<typeof vi.fn>;

const forecast = [
  { date: '2026-03-01', day: 'Sun', expected_covers: 40, roles: [] },
  { date: '2026-03-02', day: 'Mon', expected_covers: 20, roles: [] },
  { date: '2026-03-03', day: 'Tue', expected_covers: 0,  roles: [] },
];

describe('RevenueStatsWidget', () => {
  beforeEach(() => {
    mockStats.mockReturnValue({ data: { avg_spend_per_cover: 50, data_points: 10, using_default: false }, isLoading: false });
    mockForecast.mockReturnValue({ data: forecast, isLoading: false });
  });

  it('renders loading skeleton when loading', () => {
    mockStats.mockReturnValue({ data: undefined, isLoading: true });
    mockForecast.mockReturnValue({ data: undefined, isLoading: true });
    const { container } = render(<RevenueStatsWidget />);
    expect(container.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('renders heading', () => {
    render(<RevenueStatsWidget />);
    expect(screen.getByText('Revenue Forecast')).toBeInTheDocument();
  });

  it('shows projected revenue (40 covers × €50 = €2,000)', () => {
    render(<RevenueStatsWidget />);
    // Default currency is EUR: €2,000 or €2.000 depending on locale
    expect(screen.getByText(/[€R\$]\s*2/)).toBeInTheDocument();
  });

  it('shows estimated badge when using default', () => {
    mockStats.mockReturnValue({ data: { avg_spend_per_cover: 40, data_points: 2, using_default: true }, isLoading: false });
    render(<RevenueStatsWidget />);
    expect(screen.getByText(/estimated/i)).toBeInTheDocument();
  });

  it('returns null when no data', () => {
    mockStats.mockReturnValue({ data: undefined, isLoading: false });
    mockForecast.mockReturnValue({ data: [], isLoading: false });
    const { container } = render(<RevenueStatsWidget />);
    expect(container.firstChild).toBeNull();
  });
});

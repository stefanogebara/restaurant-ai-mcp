import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useLTVStats } from '../../../hooks/useLTVData';
import { usePlanFeature } from '../../../hooks/usePlanFeature';
import type { LTVStats } from '../../host/ltvDashboard.types';
import WeeklyForecastCard from '../WeeklyForecastCard';

vi.mock('../../../hooks/useLTVData', () => ({ useLTVStats: vi.fn() }));
vi.mock('../../../hooks/usePlanFeature', () => ({ usePlanFeature: vi.fn() }));

function setStats(data: LTVStats | null, isLoading = false) {
  vi.mocked(useLTVStats).mockReturnValue({ data, isLoading } as ReturnType<typeof useLTVStats>);
}

describe('WeeklyForecastCard customer health', () => {
  beforeEach(() => {
    setStats(null);
    vi.mocked(usePlanFeature).mockReturnValue({ hasAccess: true, isLoading: false, plan: 'growth' } as ReturnType<typeof usePlanFeature>);
  });

  it('keeps the heading visible while customer data loads', () => {
    setStats(null, true);
    render(<WeeklyForecastCard />);

    expect(screen.getByRole('heading', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('No customer data yet.')).not.toBeInTheDocument();
  });

  it('shows the empty state on the canvas', () => {
    render(<WeeklyForecastCard />);

    expect(screen.getByText('No customer data yet.')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('separates customer tiers from predicted risk and guards partial currency data', () => {
    setStats({
      total_customers: 24,
      tiers: { vip: 4, regular: 9, occasional: 0, new: 0, at_risk: 3 },
      high_risk_customers: 3,
    } as LTVStats);
    render(<WeeklyForecastCard />);

    const proportion = screen.getByRole('img', { name: /3 \/ 24 show signs of not returning/ });
    expect(proportion.firstElementChild).toHaveStyle({ width: '12.5%' });
    expect(screen.getByText(/4 VIPs/)).toBeInTheDocument();
    expect(screen.getByText(/9 regulars/)).toBeInTheDocument();
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
  });

  it('labels a plan-gated overview instead of implying the restaurant has no customers', () => {
    vi.mocked(usePlanFeature).mockReturnValue({ hasAccess: false, isLoading: false, plan: 'free' } as ReturnType<typeof usePlanFeature>);
    render(<WeeklyForecastCard appearance="hero" />);

    expect(screen.getByText('Customer intelligence is not included in your plan.')).toBeInTheDocument();
    expect(screen.queryByText('No customer data yet.')).not.toBeInTheDocument();
  });
});

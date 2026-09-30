import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders as render } from '../../../test/renderWithProviders';

vi.mock('../../../hooks/useStrategyMetrics', () => ({ useStrategyMetrics: vi.fn() }));

import { useStrategyMetrics } from '../../../hooks/useStrategyMetrics';
import StrategyMetricsWidget from '../StrategyMetricsWidget';

const mockUseStrategyMetrics = vi.mocked(useStrategyMetrics);
const refetch = vi.fn();
const data = {
  range_days: 30,
  since: '2026-09-01',
  summary: {
    no_show_rate: 4,
    avg_revenue_per_cover: 80,
    conversion_rate: 92,
    total_reservations: 18,
    data_points: 4,
  },
  targets: { no_show_rate: 5, avg_revenue_per_cover: 90, conversion_rate: 90 },
  timelines: { no_show: [], revenue: [], conversion: [] },
};

describe('StrategyMetricsWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseStrategyMetrics.mockReturnValue({ data, isLoading: false, isError: false, isFetching: false, refetch } as unknown as ReturnType<typeof useStrategyMetrics>);
  });

  it('keeps the scorecard visible when a request fails and lets the user retry', () => {
    mockUseStrategyMetrics.mockReturnValue({ data: undefined, isLoading: false, isError: true, isFetching: false, refetch } as unknown as ReturnType<typeof useStrategyMetrics>);
    render(<StrategyMetricsWidget />);
    expect(screen.getByRole('heading', { name: 'Trends' })).toBeInTheDocument();
    expect(screen.getByText('Failed to load metrics')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('explains an empty restaurant instead of silently disappearing', () => {
    mockUseStrategyMetrics.mockReturnValue({
      data: { ...data, summary: { ...data.summary, total_reservations: 0, data_points: 0, no_show_rate: null, avg_revenue_per_cover: null, conversion_rate: null } },
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch,
    } as unknown as ReturnType<typeof useStrategyMetrics>);
    render(<StrategyMetricsWidget />);
    expect(screen.getByText(/No reservations in this period yet/)).toBeInTheDocument();
    expect(screen.getAllByText('Not enough data yet')).toHaveLength(2);
  });

  it('preserves period selection and explains target status in words', () => {
    render(<StrategyMetricsWidget />);
    const noShow = screen.getByRole('button', { name: /No-show Rate/i });
    const revenue = screen.getByRole('button', { name: /Avg Revenue/i });
    expect(noShow).toHaveAttribute('aria-pressed', 'true');
    expect(noShow).toHaveTextContent('4%');
    expect(revenue).toHaveTextContent('80');
    fireEvent.click(revenue);
    expect(revenue).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Off target for this period')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Metrics period' }), { target: { value: '7' } });
    expect(mockUseStrategyMetrics).toHaveBeenLastCalledWith(7);
  });
});

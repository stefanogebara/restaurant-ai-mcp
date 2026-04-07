import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const mockForecastData = [
  { date: '2026-03-01', day: 'Sun', expected_covers: 40, roles: [{ name: 'FOH', recommended: 3 }, { name: 'BOH', recommended: 2 }] },
  { date: '2026-03-02', day: 'Mon', expected_covers: 0, roles: [{ name: 'FOH', recommended: 1 }, { name: 'BOH', recommended: 1 }] },
  { date: '2026-03-03', day: 'Tue', expected_covers: 20, roles: [{ name: 'FOH', recommended: 2 }, { name: 'BOH', recommended: 1 }] },
];

vi.mock('../../../hooks/useStaffingForecast', () => ({
  useStaffingForecast: vi.fn(),
}));

import { useStaffingForecast } from '../../../hooks/useStaffingForecast';
import StaffingForecastWidget from '../StaffingForecastWidget';

const mockUse = useStaffingForecast as ReturnType<typeof vi.fn>;

describe('StaffingForecastWidget', () => {
  it('renders loading skeleton when loading', () => {
    mockUse.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    const { container } = render(<StaffingForecastWidget />);
    expect(container.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('renders heading', () => {
    mockUse.mockReturnValue({ data: mockForecastData, isLoading: false, isError: false });
    render(<StaffingForecastWidget />);
    expect(screen.getByText('Staffing Forecast')).toBeInTheDocument();
  });

  it('renders a row for each forecast day', () => {
    mockUse.mockReturnValue({ data: mockForecastData, isLoading: false, isError: false });
    render(<StaffingForecastWidget />);
    expect(screen.getByText('Sun')).toBeInTheDocument();
    expect(screen.getByText('Mon')).toBeInTheDocument();
    expect(screen.getByText('Tue')).toBeInTheDocument();
  });

  it('shows expected covers', () => {
    mockUse.mockReturnValue({ data: mockForecastData, isLoading: false, isError: false });
    render(<StaffingForecastWidget />);
    expect(screen.getByText('40 covers')).toBeInTheDocument();
  });

  it('shows role recommendations', () => {
    mockUse.mockReturnValue({ data: mockForecastData, isLoading: false, isError: false });
    render(<StaffingForecastWidget />);
    // FOH: 3 for Sun
    expect(screen.getAllByText('FOH').length).toBeGreaterThan(0);
  });

  it('renders nothing when no forecast data', () => {
    mockUse.mockReturnValue({ data: [], isLoading: false, isError: false });
    const { container } = render(<StaffingForecastWidget />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing on error state', () => {
    mockUse.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    const { container } = render(<StaffingForecastWidget />);
    expect(container.innerHTML).toBe('');
  });
});

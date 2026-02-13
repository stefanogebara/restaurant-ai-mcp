import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatsBar from '../StatsBar';

const defaultProps = {
  occupiedTables: 6,
  totalTables: 10,
  reservationsToday: 12,
  seatedReservations: 8,
  waitlistCount: 3,
  estimatedWaitTime: 15,
  activeParties: 6,
  totalGuests: 18,
  avgDuration: '1h 15m',
  peakHours: '7-9 PM',
  revenueToday: '1,250',
};

describe('StatsBar', () => {
  it('renders loading skeleton when isLoading is true', () => {
    const { container } = render(<StatsBar {...defaultProps} isLoading />);
    const pulseElements = container.querySelectorAll('.animate-pulse');
    expect(pulseElements.length).toBeGreaterThan(0);
  });

  it('displays occupied tables count', () => {
    render(<StatsBar {...defaultProps} />);
    // '6' appears in both occupied tables and active parties, so use getAllByText
    expect(screen.getAllByText('6').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('/10')).toBeInTheDocument();
  });

  it('displays occupancy percentage', () => {
    render(<StatsBar {...defaultProps} />);
    expect(screen.getByText('60% occupancy')).toBeInTheDocument();
  });

  it('displays reservations today', () => {
    render(<StatsBar {...defaultProps} />);
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('Reservations Today')).toBeInTheDocument();
  });

  it('displays waitlist count and estimated wait time', () => {
    render(<StatsBar {...defaultProps} />);
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Waiting')).toBeInTheDocument();
    expect(screen.getByText('~15 min')).toBeInTheDocument();
  });

  it('displays dash for wait time when not provided', () => {
    render(<StatsBar {...defaultProps} estimatedWaitTime={undefined} />);
    expect(screen.getByText('-')).toBeInTheDocument();
  });

  it('displays active parties and total guests', () => {
    render(<StatsBar {...defaultProps} />);
    expect(screen.getByText('Active Parties')).toBeInTheDocument();
    expect(screen.getByText('18 people')).toBeInTheDocument();
  });

  it('displays secondary stats (duration, peak, revenue)', () => {
    render(<StatsBar {...defaultProps} />);
    expect(screen.getByText('Avg Duration')).toBeInTheDocument();
    expect(screen.getByText('1h 15m')).toBeInTheDocument();
    expect(screen.getByText('Peak Hours')).toBeInTheDocument();
    expect(screen.getByText('7-9 PM')).toBeInTheDocument();
    expect(screen.getByText('Revenue Today')).toBeInTheDocument();
    expect(screen.getByText('€1,250')).toBeInTheDocument();
  });

  it('shows empty hints when secondary stats are missing', () => {
    render(
      <StatsBar
        {...defaultProps}
        avgDuration={undefined}
        peakHours={undefined}
        revenueToday={undefined}
      />
    );
    expect(screen.getAllByText('Updates when guests are seated')).toHaveLength(3);
  });

  it('handles zero occupancy without division errors', () => {
    render(<StatsBar {...defaultProps} occupiedTables={0} totalTables={0} />);
    expect(screen.getByText('0% occupancy')).toBeInTheDocument();
  });

  it('renders in Spanish when language is "es"', () => {
    render(<StatsBar {...defaultProps} language="es" />);
    expect(screen.getByText('Mesas Ocupadas')).toBeInTheDocument();
    expect(screen.getByText('Reservas Hoy')).toBeInTheDocument();
    expect(screen.getByText('Sin mesa (espera)')).toBeInTheDocument();
    expect(screen.getByText('Mesas Activas')).toBeInTheDocument();
    expect(screen.getByText('Duración Media')).toBeInTheDocument();
    expect(screen.getByText('Horas Pico')).toBeInTheDocument();
    expect(screen.getByText('Ingresos Hoy')).toBeInTheDocument();
  });
});

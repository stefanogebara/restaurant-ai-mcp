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
    expect(screen.getByText('60% occupied')).toBeInTheDocument();
  });

  it('displays reservations', () => {
    render(<StatsBar {...defaultProps} />);
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('Reservations')).toBeInTheDocument();
  });

  it('displays waitlist count and estimated wait time', () => {
    render(<StatsBar {...defaultProps} />);
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Waiting')).toBeInTheDocument();
    expect(screen.getByText('~15 min avg')).toBeInTheDocument();
  });

  it('displays "No wait" when estimatedWaitTime is not provided', () => {
    render(<StatsBar {...defaultProps} estimatedWaitTime={undefined} />);
    expect(screen.getByText('No wait')).toBeInTheDocument();
  });

  it('displays active parties and total guests', () => {
    render(<StatsBar {...defaultProps} />);
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('18 guests')).toBeInTheDocument();
  });

  it('handles zero occupancy without division errors', () => {
    render(<StatsBar {...defaultProps} occupiedTables={0} totalTables={0} />);
    expect(screen.getByText('0% occupied')).toBeInTheDocument();
  });

  it('renders in Spanish when language is "es"', () => {
    render(<StatsBar {...defaultProps} language="es" />);
    expect(screen.getByText('Mesas')).toBeInTheDocument();
    expect(screen.getByText('Reservas')).toBeInTheDocument();
    expect(screen.getByText('En Espera')).toBeInTheDocument();
    expect(screen.getByText('Activas')).toBeInTheDocument();
  });
});

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

  it('displays tables available with total', () => {
    render(<StatsBar {...defaultProps} />);
    // Available tables = totalTables - occupiedTables = 4
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('Tables Available')).toBeInTheDocument();
  });

  it('displays occupancy percentage as capacity', () => {
    render(<StatsBar {...defaultProps} />);
    expect(screen.getByText('60% capacity')).toBeInTheDocument();
  });

  it('displays reservations count with seated', () => {
    render(<StatsBar {...defaultProps} />);
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText("Today's Reservations")).toBeInTheDocument();
    expect(screen.getByText('8 seated')).toBeInTheDocument();
  });

  it('displays waitlist count and estimated wait time', () => {
    render(<StatsBar {...defaultProps} />);
    expect(screen.getByText('3 on waitlist · ~15 min avg')).toBeInTheDocument();
  });

  it('displays estimated wait time alone when no waitlist', () => {
    render(<StatsBar {...defaultProps} waitlistCount={0} />);
    expect(screen.getByText('~15 min avg')).toBeInTheDocument();
  });

  it('displays no change text when no waitlist and no wait time', () => {
    render(<StatsBar {...defaultProps} waitlistCount={0} estimatedWaitTime={undefined} />);
    // The Guests Expected card should not show any change text
    const guestsCard = screen.getByText('Guests Expected').closest('div');
    expect(guestsCard).toBeInTheDocument();
  });

  it('displays active parties and guests seated', () => {
    render(<StatsBar {...defaultProps} />);
    expect(screen.getByText('Active Parties')).toBeInTheDocument();
    expect(screen.getByText('18 guests seated')).toBeInTheDocument();
  });

  it('handles zero occupancy without division errors', () => {
    render(<StatsBar {...defaultProps} occupiedTables={0} totalTables={0} />);
    expect(screen.getByText('0% capacity')).toBeInTheDocument();
  });

  it('renders in Spanish when language is "es"', () => {
    render(<StatsBar {...defaultProps} language="es" />);
    expect(screen.getByText('Mesas Disponibles')).toBeInTheDocument();
    expect(screen.getByText('Reservas de Hoy')).toBeInTheDocument();
    expect(screen.getByText('Comensales Esperados')).toBeInTheDocument();
    expect(screen.getByText('Mesas Activas')).toBeInTheDocument();
  });
});

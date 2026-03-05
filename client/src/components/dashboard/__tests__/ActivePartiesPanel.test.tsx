import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ActivePartiesPanel from '../ActivePartiesPanel';
import type { ActiveParty } from '../../../types/host.types';

// ---- Test data ----

const parties: ActiveParty[] = [
  {
    service_id: 's1',
    customer_name: 'Alice Smith',
    customer_phone: '+1 555-0001',
    party_size: 4,
    tables: ['T1', 'T2'],
    seated_at: '2026-01-15T18:30:00Z',
    estimated_departure: '2026-01-15T20:00:00Z',
    time_elapsed_minutes: 45,
    time_remaining_minutes: 45,
    is_overdue: false,
  },
  {
    service_id: 's2',
    customer_name: 'Bob Johnson',
    customer_phone: '+1 555-0002',
    party_size: 2,
    tables: ['T3'],
    seated_at: '2026-01-15T17:00:00Z',
    estimated_departure: '2026-01-15T18:30:00Z',
    time_elapsed_minutes: 120,
    time_remaining_minutes: -30,
    is_overdue: true,
  },
];

const defaultProps = {
  parties,
  onCompleteService: vi.fn(),
};

describe('ActivePartiesPanel', () => {
  it('renders loading skeleton when isLoading is true', () => {
    const { container } = render(
      <ActivePartiesPanel {...defaultProps} isLoading />
    );
    const pulseElements = container.querySelectorAll('.animate-pulse');
    expect(pulseElements.length).toBeGreaterThan(0);
  });

  it('displays header with party count', () => {
    render(<ActivePartiesPanel {...defaultProps} />);
    expect(screen.getByText('Active Parties')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('displays customer names', () => {
    render(<ActivePartiesPanel {...defaultProps} />);
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getByText('Bob Johnson')).toBeInTheDocument();
  });

  it('displays party size and table assignments', () => {
    render(<ActivePartiesPanel {...defaultProps} />);
    expect(screen.getByText('4 guests')).toBeInTheDocument();
    expect(screen.getByText('Table T1, T2')).toBeInTheDocument();
    expect(screen.getByText('2 guests')).toBeInTheDocument();
    expect(screen.getByText('Table T3')).toBeInTheDocument();
  });

  it('shows overdue indicator for overdue parties', () => {
    render(<ActivePartiesPanel {...defaultProps} />);
    // Bob is overdue - should show "Overdue" text (at least once)
    const overdueTexts = screen.getAllByText('Overdue');
    expect(overdueTexts.length).toBeGreaterThanOrEqual(1);
  });

  it('displays time progress bars', () => {
    render(<ActivePartiesPanel {...defaultProps} />);
    expect(screen.getByText('45m elapsed')).toBeInTheDocument();
    expect(screen.getByText('45m left')).toBeInTheDocument();
    expect(screen.getByText('120m elapsed')).toBeInTheDocument();
  });

  it('renders Complete Service button for each party', () => {
    render(<ActivePartiesPanel {...defaultProps} />);
    const buttons = screen.getAllByRole('button', { name: /complete service/i });
    expect(buttons).toHaveLength(2);
  });

  it('calls onCompleteService with the correct party when clicked', async () => {
    const user = userEvent.setup();
    const onCompleteService = vi.fn();
    render(<ActivePartiesPanel {...defaultProps} onCompleteService={onCompleteService} />);

    const buttons = screen.getAllByRole('button', { name: /complete service/i });
    await user.click(buttons[0]);

    expect(onCompleteService).toHaveBeenCalledTimes(1);
    expect(onCompleteService).toHaveBeenCalledWith(parties[0], undefined);
  });

  it('shows empty state when no parties', () => {
    render(<ActivePartiesPanel {...defaultProps} parties={[]} />);
    expect(screen.getByText('No active parties yet')).toBeInTheDocument();
    expect(
      screen.getByText('Add a walk-in or check in a reservation to get started')
    ).toBeInTheDocument();
  });

  it('renders with i18n translations when language prop is set', () => {
    // After migration to react-i18next, translations come from locale files
    // The language prop is no longer used internally
    render(<ActivePartiesPanel {...defaultProps} language="es" />);
    // Should still render with English fallback (i18n default in tests)
    expect(screen.getByText('Active Parties')).toBeInTheDocument();
    expect(screen.getByText('4 guests')).toBeInTheDocument();
    expect(screen.getAllByText('Complete Service').length).toBe(2);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

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

vi.mock('../../components/demo/DemoManagerChat', () => ({
  default: () => <div data-testid="manager-chat" />,
}));

function renderDemoDashboard() {
  return render(
    <MemoryRouter initialEntries={['/demo']}>
      <Routes>
        <Route path="/demo" element={<DemoDashboard />} />
      </Routes>
    </MemoryRouter>,
  );
}

// Import the page after mocks are in place
import DemoDashboard from '../DemoDashboard';

describe('DemoDashboard', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the demo banner, restaurant name, and all panels', () => {
    renderDemoDashboard();

    // Demo banner
    expect(screen.getByText(/interactive demo/i)).toBeInTheDocument();

    // Restaurant name
    expect(screen.getByText('La Bella Vista')).toBeInTheDocument();

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

    const addButton = screen.getByText('Add Walk-In');
    fireEvent.click(addButton);

    expect(screen.getByRole('dialog', { name: /add walk-in guest/i })).toBeInTheDocument();
  });

  it('opens manager chat on FAB click', () => {
    renderDemoDashboard();

    const chatFab = screen.getByLabelText('Open AI Manager Assistant');
    fireEvent.click(chatFab);

    expect(screen.getByTestId('manager-chat')).toBeInTheDocument();
  });
});

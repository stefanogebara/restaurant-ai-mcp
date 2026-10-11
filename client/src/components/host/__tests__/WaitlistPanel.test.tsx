import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../../test/renderWithProviders';
import WaitlistPanel from '../WaitlistPanel';

// Mock authFetch used by react-query mutations and queries
const mockAuthFetch = vi.fn();
vi.mock('../../../services/api', () => ({
  authFetch: (...args: unknown[]) => mockAuthFetch(...args),
}));

// Mock child components that are not under test
vi.mock('../WaitlistTimeDisplay', () => ({
  default: ({ addedAt, estimatedWait }: { addedAt: string; estimatedWait: number }) => (
    <div data-testid="waitlist-time-display">
      {estimatedWait}m wait (added {addedAt})
    </div>
  ),
}));

// Mock timeFormatting utility
vi.mock('../../../utils/timeFormatting', () => ({
  formatTimeAgo: (date: string) => `${date} ago`,
}));

// ------------------------------------------------------------------
// Helpers — renderWithProviders comes from src/test/renderWithProviders
// (wraps ToastProvider + QueryClientProvider with retry-disabled client).
// ------------------------------------------------------------------

const makeEntry = (overrides: Record<string, unknown> = {}) => ({
  id: 'entry-1',
  waitlist_id: 'wl-1',
  customer_name: 'Alice Johnson',
  customer_phone: '+1 555-1234',
  customer_email: 'alice@example.com',
  party_size: 4,
  added_at: '2025-12-20T18:00:00Z',
  estimated_wait: 20,
  status: 'waiting' as const,
  priority: 1,
  special_requests: 'High Chair, Outdoor',
  ...overrides,
});

// ------------------------------------------------------------------
// Tests
// ------------------------------------------------------------------

describe('WaitlistPanel', () => {
  const onSeatNow = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a loading indicator while fetching', () => {
    // authFetch returns a promise that never resolves, keeping state as loading
    mockAuthFetch.mockReturnValue(new Promise(() => {}));

    renderWithProviders(<WaitlistPanel onSeatNow={onSeatNow} />);

    expect(screen.getByText('Loading waitlist...')).toBeInTheDocument();
  });

  it('shows an error message when the fetch fails', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: false,
    });

    renderWithProviders(<WaitlistPanel onSeatNow={onSeatNow} />);

    expect(
      await screen.findByText(/Could not load waitlist/i),
    ).toBeInTheDocument();
  });

  it('renders the empty state when there are no active entries', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, count: 0, waitlist: [] }),
    });

    renderWithProviders(<WaitlistPanel onSeatNow={onSeatNow} />);

    expect(
      await screen.findByText('No one on the waitlist'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Tap "\+ Add Guest" above to add a walk-in/i),
    ).toBeInTheDocument();
  });

  it('shows a plan gate rather than an empty queue when waitlist is unavailable', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, plan_gated: true, items: [] }),
    });
    renderWithProviders(<WaitlistPanel onSeatNow={onSeatNow} />);
    expect(await screen.findByText('Waitlist is not in your plan')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View plans' })).toHaveAttribute('href', '/precos');
    expect(screen.queryByText('No one on the waitlist')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add Guest/ })).not.toBeInTheDocument();
  });

  it('renders waitlist entries with name, party size, status, and tags', async () => {
    const entries = [
      makeEntry(),
      makeEntry({
        id: 'entry-2',
        customer_name: 'Bob Smith',
        customer_phone: '+1 555-5678',
        party_size: 2,
        status: 'notified',
        special_requests: 'Birthday',
        notified_at: '2025-12-20T18:10:00Z',
      }),
    ];

    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, count: 2, waitlist: entries }),
    });

    renderWithProviders(<WaitlistPanel onSeatNow={onSeatNow} />);

    // Wait for data
    expect(await screen.findByText('Alice Johnson')).toBeInTheDocument();
    expect(screen.getByText('Bob Smith')).toBeInTheDocument();

    // Party size badges
    expect(screen.getByText('4p')).toBeInTheDocument();
    expect(screen.getByText('2p')).toBeInTheDocument();

    // Status badges
    expect(screen.getByText('Waiting')).toBeInTheDocument();
    expect(screen.getByText('Notified')).toBeInTheDocument();

    // Tags from special_requests
    expect(screen.getByText('High Chair')).toBeInTheDocument();
    expect(screen.getByText('Outdoor')).toBeInTheDocument();
    expect(screen.getByText('Birthday')).toBeInTheDocument();
  });

  it('filters entries by search query on name', async () => {
    const user = userEvent.setup();

    const entries = [
      makeEntry(),
      makeEntry({
        id: 'entry-2',
        customer_name: 'Charlie Brown',
        customer_phone: '+1 555-9999',
        party_size: 3,
        special_requests: '',
      }),
    ];

    mockAuthFetch.mockImplementation(async (url: string) => ({
      ok: true,
      json: async () => ({ success: true, count: 2, waitlist: url.includes('search=charlie') ? [entries[1]] : entries }),
    }));

    renderWithProviders(<WaitlistPanel onSeatNow={onSeatNow} />);

    // Wait for entries
    expect(await screen.findByText('Alice Johnson')).toBeInTheDocument();
    expect(screen.getByText('Charlie Brown')).toBeInTheDocument();

    // Type in search box
    const searchInput = screen.getByLabelText('Search waitlist');
    await user.type(searchInput, 'charlie');

    // Only Charlie should remain
    await waitFor(() => expect(mockAuthFetch).toHaveBeenCalledWith(expect.stringContaining('search=charlie')));
    await waitFor(() => expect(screen.queryByText('Alice Johnson')).not.toBeInTheDocument());
    expect(screen.getByText('Charlie Brown')).toBeInTheDocument();
    expect(mockAuthFetch).toHaveBeenCalledWith(expect.stringContaining('search=charlie'));
  });

  it('requests seated history separately and can page past the first 50 entries', async () => {
    const user = userEvent.setup();
    mockAuthFetch.mockImplementation(async (url: string) => ({
      ok: true,
      json: async () => url.includes('view=seated')
        ? { success: true, count: 1, total: 101, has_more: !url.includes('offset=50'), counts: { active: 1, seated: 101, removed: 0 }, waitlist: [makeEntry({ id: url.includes('offset=50') ? 'page-two' : 'page-one', customer_name: url.includes('offset=50') ? 'Later Guest' : 'Recent Guest', status: 'seated' })] }
        : { success: true, count: 1, total: 1, has_more: false, counts: { active: 1, seated: 101, removed: 0 }, waitlist: [makeEntry()] },
    }));
    renderWithProviders(<WaitlistPanel onSeatNow={onSeatNow} />);
    expect(await screen.findByText('Alice Johnson')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /Seated101/i }));
    expect(await screen.findByText('Recent Guest')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Later Guest')).toBeInTheDocument();
    expect(mockAuthFetch).toHaveBeenCalledWith(expect.stringContaining('view=seated&source=all&limit=50&offset=50'));
  });

  it('opens the remove confirmation dialog and triggers removal', async () => {
    const user = userEvent.setup();

    const entries = [makeEntry()];

    mockAuthFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, count: 1, waitlist: entries }),
      })
      // For the DELETE call
      .mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

    renderWithProviders(<WaitlistPanel onSeatNow={onSeatNow} />);

    // Wait for entry to appear
    expect(await screen.findByText('Alice Johnson')).toBeInTheDocument();

    // Click the Remove button on the entry card
    const removeButton = screen.getByRole('button', { name: 'Remove' });
    await user.click(removeButton);

    // Confirmation modal appears
    expect(
      screen.getByText('Remove from Waitlist'),
    ).toBeInTheDocument();
    // The name appears in both the card and the modal, verify modal text exists
    const aliceElements = screen.getAllByText('Alice Johnson');
    expect(aliceElements.length).toBe(2); // one in card, one in modal
    expect(
      screen.getByText(/from the waitlist/i),
    ).toBeInTheDocument();

    // Confirm removal - get buttons inside the modal (the last "Remove" button is the confirm)
    const allRemoveButtons = screen.getAllByRole('button', { name: 'Remove' });
    const confirmButton = allRemoveButtons[allRemoveButtons.length - 1];
    await user.click(confirmButton);

    // Verify the DELETE call was made with the correct entry id
    expect(mockAuthFetch).toHaveBeenCalledWith(
      '/api/waitlist?id=entry-1',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('calls onSeatNow when "Seat" button is clicked on a Waiting entry', async () => {
    const user = userEvent.setup();

    const entry = makeEntry();
    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, count: 1, waitlist: [entry] }),
    });

    renderWithProviders(<WaitlistPanel onSeatNow={onSeatNow} />);

    expect(await screen.findByText('Alice Johnson')).toBeInTheDocument();

    const seatButton = screen.getByRole('button', { name: 'Seat' });
    await user.click(seatButton);

    expect(onSeatNow).toHaveBeenCalledTimes(1);
    expect(onSeatNow).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'entry-1', customer_name: 'Alice Johnson' }),
    );
  });
});

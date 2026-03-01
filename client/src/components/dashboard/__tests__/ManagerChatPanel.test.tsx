import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ManagerChatPanel } from '../ManagerChatPanel';

// jsdom does not implement scrollIntoView — mock it globally
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

// ------------------------------------------------------------------
// Mock the api module
// ------------------------------------------------------------------

const mockGet = vi.fn();
const mockPost = vi.fn();

vi.mock('../../../services/api', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
}));

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = createQueryClient();
  return {
    ...render(
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
    ),
    queryClient,
  };
}

// ------------------------------------------------------------------
// Tests
// ------------------------------------------------------------------

describe('ManagerChatPanel', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: GET returns empty history (prevents unresolved promises showing "Loading")
    mockGet.mockResolvedValue({ data: { history: [] } });
  });

  it('renders the "AI Manager Assistant" header', async () => {
    renderWithProviders(<ManagerChatPanel onClose={onClose} />);
    expect(screen.getByText('AI Manager Assistant')).toBeInTheDocument();
  });

  it('shows empty state hint when no messages', async () => {
    renderWithProviders(<ManagerChatPanel onClose={onClose} />);

    expect(
      await screen.findByText(
        'Ask anything about your restaurant - reservations, staff, trends.',
      ),
    ).toBeInTheDocument();
  });

  it('renders manager and assistant messages from history', async () => {
    mockGet.mockResolvedValue({
      data: {
        history: [
          { role: 'manager', content: 'How many covers today?' },
          { role: 'assistant', content: 'You have 42 covers booked.' },
        ],
      },
    });

    renderWithProviders(<ManagerChatPanel onClose={onClose} />);

    expect(await screen.findByText('How many covers today?')).toBeInTheDocument();
    expect(screen.getByText('You have 42 covers booked.')).toBeInTheDocument();
  });

  it('close button calls onClose', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ManagerChatPanel onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('send button triggers the mutation with input text', async () => {
    const user = userEvent.setup();

    // POST resolves with a reply
    mockPost.mockResolvedValue({ data: { reply: 'Great question!' } });

    renderWithProviders(<ManagerChatPanel onClose={onClose} />);

    // Wait for the initial loading to settle
    await screen.findByText(
      'Ask anything about your restaurant - reservations, staff, trends.',
    );

    const input = screen.getByPlaceholderText('Ask your AI assistant...');
    await user.type(input, 'What are the busiest tables?');
    await user.click(screen.getByRole('button', { name: /send/i }));

    expect(mockPost).toHaveBeenCalledWith('/manager-chat', {
      message: 'What are the busiest tables?',
    });
  });

  it('shows error message when the mutation fails', async () => {
    const user = userEvent.setup();

    // POST rejects
    mockPost.mockRejectedValue(new Error('Network Error'));

    renderWithProviders(<ManagerChatPanel onClose={onClose} />);

    // Wait for the initial query to settle
    await screen.findByText(
      'Ask anything about your restaurant - reservations, staff, trends.',
    );

    const input = screen.getByPlaceholderText('Ask your AI assistant...');
    await user.type(input, 'Hello');
    await user.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => {
      expect(
        screen.getByText('Failed to send. Please try again.'),
      ).toBeInTheDocument();
    });
  });
});

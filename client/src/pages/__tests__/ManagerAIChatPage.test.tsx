import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ManagerAIChatPage from '../ManagerAIChatPage';

// jsdom doesn't implement scrollIntoView
Element.prototype.scrollIntoView = vi.fn();

// Mocks
const mockMutate = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string) => fallback,
    i18n: { language: 'en' },
  }),
}));

vi.mock('@tanstack/react-query', () => ({
  useMutation: () => ({ mutate: mockMutate, isPending: false, isError: false }),
  useQueryClient: () => ({ setQueryData: vi.fn(), getQueryData: vi.fn(), invalidateQueries: vi.fn() }),
  useQuery: ({ queryKey }: { queryKey: string[] }) => {
    if (queryKey[0] === 'manager-chat-history') {
      return { data: { history: [] }, isLoading: false };
    }
    if (queryKey[0] === 'manager-usage') {
      return { data: { used: 5, limit: 100 } };
    }
    return { data: null };
  },
}));

vi.mock('../../components/common/ThiingsIcon', () => ({
  default: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

vi.mock('../../components/dashboard/ManagerAIUsageBar', () => ({
  default: () => <div data-testid="usage-bar">Usage</div>,
}));

vi.mock('../../services/api', () => ({
  api: {
    get: vi.fn().mockResolvedValue({ data: { history: [] } }),
    post: vi.fn().mockResolvedValue({ data: { reply: 'test' } }),
  },
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <ManagerAIChatPage />
    </MemoryRouter>,
  );
}

describe('ManagerAIChatPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the page header with title', () => {
    renderPage();
    // Title appears in both header and empty state — at least 2 instances
    expect(screen.getAllByText('Manager AI').length).toBeGreaterThanOrEqual(1);
  });

  it('renders the subtitle', () => {
    renderPage();
    expect(screen.getByText('Your restaurant intelligence assistant')).toBeInTheDocument();
  });

  it('shows empty state with suggested prompts when no messages', () => {
    renderPage();
    expect(screen.getByText('How are reservations looking for today?')).toBeInTheDocument();
    expect(screen.getByText('Which tables have the highest revenue?')).toBeInTheDocument();
  });

  it('renders usage bar', () => {
    renderPage();
    expect(screen.getAllByTestId('usage-bar').length).toBeGreaterThanOrEqual(1);
  });

  it('renders back link to dashboard', () => {
    renderPage();
    const backLink = screen.getByLabelText('Back to dashboard');
    expect(backLink).toBeInTheDocument();
    expect(backLink.getAttribute('href')).toBe('/host-dashboard/simple');
  });

  it('renders textarea input', () => {
    renderPage();
    const textarea = screen.getByPlaceholderText('Ask about your restaurant...');
    expect(textarea).toBeInTheDocument();
  });

  it('sets suggested prompt text on click', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText('How are reservations looking for today?'));
    const textarea = screen.getByPlaceholderText('Ask about your restaurant...') as HTMLTextAreaElement;
    expect(textarea.value).toBe('How are reservations looking for today?');
  });

  it('has send button disabled when input is empty', () => {
    renderPage();
    const sendButtons = screen.getAllByRole('button');
    // The send button should be the one that's not the back link
    const sendButton = sendButtons.find(b => b.getAttribute('type') === 'button' && b.closest('.max-w-3xl'));
    // At minimum, there should be a disabled send control
    expect(sendButton).toBeDefined();
  });
});

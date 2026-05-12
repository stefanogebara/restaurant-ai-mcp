import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Step6TeachAI from '../Step6TeachAI';

// Mock scrollIntoView (not available in jsdom)
Element.prototype.scrollIntoView = vi.fn();

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
  },
}));

// Mock ThiingsIcon to keep tests simple
vi.mock('../../common/ThiingsIcon', () => ({
  default: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

// Mock the api service
const mockPost = vi.fn();
vi.mock('../../../services/api', () => ({
  api: {
    post: (...args: unknown[]) => mockPost(...args),
  },
}));

describe('Step6TeachAI (Chat Interview)', () => {
  const defaultProps = {
    restaurantId: 'restaurant-123',
    restaurantName: 'Test Bistro',
    city: 'London',
    country: 'UK',
    onNext: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the heading and description in idle state', () => {
    render(<Step6TeachAI {...defaultProps} />);
    expect(screen.getByText('Teach Your AI')).toBeInTheDocument();
    expect(screen.getByText(/quick conversation/)).toBeInTheDocument();
  });

  it('renders Start Interview and Skip buttons', () => {
    render(<Step6TeachAI {...defaultProps} />);
    expect(screen.getByRole('button', { name: /start interview/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /skip for now/i })).toBeInTheDocument();
  });

  it('clicking skip calls onNext without API call', async () => {
    const user = userEvent.setup();
    render(<Step6TeachAI {...defaultProps} />);

    await user.click(screen.getByRole('button', { name: /skip for now/i }));

    expect(defaultProps.onNext).toHaveBeenCalledTimes(1);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('shows researching state when Start Interview is clicked', async () => {
    // Make the research call hang
    mockPost.mockReturnValue(new Promise(() => {}));

    const user = userEvent.setup();
    render(<Step6TeachAI {...defaultProps} />);

    await user.click(screen.getByRole('button', { name: /start interview/i }));

    expect(screen.getByText(/researching your restaurant/i)).toBeInTheDocument();
  });

  it('shows chat UI after research completes', async () => {
    mockPost.mockResolvedValueOnce({
      data: {
        success: true,
        session_id: 'sess-123',
        initial_ai_message: 'Tell me about your cuisine!',
      },
    });

    const user = userEvent.setup();
    render(<Step6TeachAI {...defaultProps} />);

    await user.click(screen.getByRole('button', { name: /start interview/i }));

    await waitFor(() => {
      expect(screen.getByText('Tell me about your cuisine!')).toBeInTheDocument();
    });

    // Chat input should be visible
    expect(screen.getByPlaceholderText(/type your answer/i)).toBeInTheDocument();
  });

  it('calls research endpoint with restaurant data', async () => {
    mockPost.mockResolvedValueOnce({
      data: { success: true, session_id: 'sess-1', initial_ai_message: 'Hi!' },
    });

    const user = userEvent.setup();
    render(<Step6TeachAI {...defaultProps} />);

    await user.click(screen.getByRole('button', { name: /start interview/i }));

    await waitFor(() => expect(mockPost).toHaveBeenCalledWith(
      '/restaurant-learning/research',
      expect.objectContaining({
        restaurant_name: 'Test Bistro',
        city: 'London',
        country: 'UK',
      }),
    ));
  });

  it('sends user message and shows AI response', async () => {
    // Research call
    mockPost.mockResolvedValueOnce({
      data: { success: true, session_id: 'sess-1', initial_ai_message: 'Hello!' },
    });
    // Chat call
    mockPost.mockResolvedValueOnce({
      data: {
        success: true,
        ai_message: 'Great answer! Tell me more.',
        completion_percentage: 10,
        is_complete: false,
      },
    });

    const user = userEvent.setup();
    render(<Step6TeachAI {...defaultProps} />);

    await user.click(screen.getByRole('button', { name: /start interview/i }));
    await waitFor(() => screen.getByText('Hello!'));

    const input = screen.getByPlaceholderText(/type your answer/i);
    await user.type(input, 'We serve Italian food');
    await user.keyboard('{Enter}');

    // User message should appear
    expect(screen.getByText('We serve Italian food')).toBeInTheDocument();

    // AI response should appear
    await waitFor(() => {
      expect(screen.getByText('Great answer! Tell me more.')).toBeInTheDocument();
    });
  });

  it('shows error when research fails and returns to idle', async () => {
    mockPost.mockRejectedValueOnce(new Error('Network error'));

    const user = userEvent.setup();
    render(<Step6TeachAI {...defaultProps} />);

    await user.click(screen.getByRole('button', { name: /start interview/i }));

    await waitFor(() => {
      expect(screen.getByText(/failed to start interview/i)).toBeInTheDocument();
    });
    // Should return to idle — start button visible again
    expect(screen.getByRole('button', { name: /start interview/i })).toBeInTheDocument();
  });

  it('shows completion state when interview is done', async () => {
    // Research call
    mockPost.mockResolvedValueOnce({
      data: { success: true, session_id: 'sess-1', initial_ai_message: 'Hello!' },
    });
    // Chat call — complete
    mockPost.mockResolvedValueOnce({
      data: {
        success: true,
        ai_message: 'All done!',
        completion_percentage: 100,
        is_complete: true,
      },
    });
    // Persona generation
    mockPost.mockResolvedValueOnce({ data: { success: true } });

    const user = userEvent.setup();
    render(<Step6TeachAI {...defaultProps} />);

    await user.click(screen.getByRole('button', { name: /start interview/i }));
    await waitFor(() => screen.getByText('Hello!'));

    const input = screen.getByPlaceholderText(/type your answer/i);
    await user.type(input, 'Final answer');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getByText(/your ai knows your restaurant/i)).toBeInTheDocument();
    });
  });
});

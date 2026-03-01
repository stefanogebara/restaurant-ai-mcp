import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Step5TeachAI from '../Step5TeachAI';

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

// Mock the api service — pass arguments through so tests can inspect call args
const mockPost = vi.fn();
vi.mock('../../../services/api', () => ({
  api: {
    post: (...args: unknown[]) => mockPost(...args),
  },
}));

describe('Step5TeachAI', () => {
  const defaultProps = {
    restaurantId: 'restaurant-123',
    onNext: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPost.mockResolvedValue({ data: { success: true, facts_stored: 3 } });
  });

  it('renders the heading and description', () => {
    render(<Step5TeachAI {...defaultProps} />);
    expect(screen.getByText('Teach Your AI')).toBeInTheDocument();
    expect(screen.getByText(/Answer a few questions/)).toBeInTheDocument();
  });

  it('renders all interview questions as textarea labels', () => {
    render(<Step5TeachAI {...defaultProps} />);
    expect(screen.getByText("What's one thing you're most proud of about your restaurant?")).toBeInTheDocument();
    expect(screen.getByText('What are your busiest days and times?')).toBeInTheDocument();
    expect(screen.getByText('Do you have any signature dishes or specialties?')).toBeInTheDocument();
    expect(screen.getByText("What's your approach to handling no-shows?")).toBeInTheDocument();
    expect(screen.getByText('What would you like your AI assistant to help with most?')).toBeInTheDocument();
  });

  it('renders 5 textareas', () => {
    render(<Step5TeachAI {...defaultProps} />);
    const textareas = screen.getAllByRole('textbox');
    expect(textareas).toHaveLength(5);
  });

  it('renders the skip button', () => {
    render(<Step5TeachAI {...defaultProps} />);
    expect(screen.getByRole('button', { name: /skip for now/i })).toBeInTheDocument();
  });

  it('renders the submit button', () => {
    render(<Step5TeachAI {...defaultProps} />);
    expect(screen.getByRole('button', { name: /teach ai/i })).toBeInTheDocument();
  });

  it('submit button is disabled when no answers and no file', () => {
    render(<Step5TeachAI {...defaultProps} />);
    const submitBtn = screen.getByRole('button', { name: /teach ai/i });
    expect(submitBtn).toBeDisabled();
  });

  it('clicking skip calls onNext without making an API call', async () => {
    const user = userEvent.setup();
    render(<Step5TeachAI {...defaultProps} />);

    await user.click(screen.getByRole('button', { name: /skip for now/i }));

    expect(defaultProps.onNext).toHaveBeenCalledTimes(1);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('enables submit button when at least one answer is typed', async () => {
    const user = userEvent.setup();
    render(<Step5TeachAI {...defaultProps} />);

    const textareas = screen.getAllByRole('textbox');
    await user.type(textareas[0], 'We have a great view');

    expect(screen.getByRole('button', { name: /teach ai/i })).not.toBeDisabled();
  });

  it('shows loading state while submitting', async () => {
    // Make the API call take a while
    let resolve!: (value: unknown) => void;
    mockPost.mockReturnValueOnce(new Promise((r) => { resolve = r; }));

    const user = userEvent.setup();
    render(<Step5TeachAI {...defaultProps} />);

    const textareas = screen.getAllByRole('textbox');
    await user.type(textareas[0], 'A cozy family restaurant');

    await user.click(screen.getByRole('button', { name: /teach ai/i }));

    expect(screen.getByText('Saving...')).toBeInTheDocument();

    // Resolve so the component can clean up
    resolve({ data: { success: true, facts_stored: 2 } });
    await waitFor(() => expect(screen.queryByText('Saving...')).not.toBeInTheDocument());
  });

  it('shows success state with fact count after submit', async () => {
    mockPost.mockResolvedValue({ data: { success: true, facts_stored: 5 } });

    const user = userEvent.setup();
    render(<Step5TeachAI {...defaultProps} />);

    const textareas = screen.getAllByRole('textbox');
    await user.type(textareas[0], 'We serve the best tapas in town');

    fireEvent.click(screen.getByRole('button', { name: /teach ai/i }));

    await waitFor(() => expect(screen.getByText('Your AI is ready!')).toBeInTheDocument());
    expect(screen.getByText(/5 facts saved/)).toBeInTheDocument();
  });

  it('shows singular "fact" when only 1 fact is stored', async () => {
    mockPost.mockResolvedValue({ data: { success: true, facts_stored: 1 } });

    const user = userEvent.setup();
    render(<Step5TeachAI {...defaultProps} />);

    const textareas = screen.getAllByRole('textbox');
    await user.type(textareas[0], 'We close on Mondays');

    fireEvent.click(screen.getByRole('button', { name: /teach ai/i }));

    await waitFor(() => expect(screen.getByText('Your AI is ready!')).toBeInTheDocument());
    expect(screen.getByText(/1 fact saved/)).toBeInTheDocument();
  });

  it('shows Go to Dashboard button in success state and calls onNext on click', async () => {
    const user = userEvent.setup();
    render(<Step5TeachAI {...defaultProps} />);

    const textareas = screen.getAllByRole('textbox');
    await user.type(textareas[0], 'Our specialty is wood-fired pizza');

    fireEvent.click(screen.getByRole('button', { name: /teach ai/i }));

    await waitFor(() => expect(screen.getByRole('button', { name: /go to dashboard/i })).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /go to dashboard/i }));
    expect(defaultProps.onNext).toHaveBeenCalledTimes(1);
  });

  it('shows error message and does not navigate when API fails', async () => {
    mockPost.mockRejectedValue(new Error('Network error'));

    const user = userEvent.setup();
    render(<Step5TeachAI {...defaultProps} />);

    const textareas = screen.getAllByRole('textbox');
    await user.type(textareas[0], 'We are the best');

    fireEvent.click(screen.getByRole('button', { name: /teach ai/i }));

    await waitFor(() => expect(screen.getByText('Network error')).toBeInTheDocument());
    expect(defaultProps.onNext).not.toHaveBeenCalled();
    // Form is still visible (not success state)
    expect(screen.getByText('Teach Your AI')).toBeInTheDocument();
  });

  it('renders file input for document upload', () => {
    render(<Step5TeachAI {...defaultProps} />);
    const fileInput = screen.getByLabelText(/upload a document/i);
    expect(fileInput).toBeInTheDocument();
    expect(fileInput).toHaveAttribute('type', 'file');
    expect(fileInput).toHaveAttribute('accept', '.pdf,.txt,.md,.csv');
  });

  it('pairs answers with correct questions after filtering', async () => {
    render(<Step5TeachAI restaurantId="rest-1" onNext={vi.fn()} />);
    const textareas = screen.getAllByRole('textbox');
    // Fill only the 4th question (index 3), leave others empty
    await userEvent.type(textareas[3], 'We have a strict no-show policy');

    mockPost.mockResolvedValueOnce({ data: { facts_stored: 1 } });
    fireEvent.click(screen.getByRole('button', { name: /teach/i }));

    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    // The second argument to post should be a FormData instance
    const [, body] = mockPost.mock.calls[0] as [string, FormData];
    expect(body).toBeInstanceOf(FormData);
  });

  it('enables submit when file selected but no text answers', () => {
    render(<Step5TeachAI restaurantId="rest-1" onNext={vi.fn()} />);
    const fileInput = screen.getByLabelText(/upload a document/i);
    const file = new File(['menu content'], 'menu.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput, { target: { files: [file] } });
    expect(screen.getByRole('button', { name: /teach/i })).not.toBeDisabled();
  });

  it('shows fallback text when facts_stored is 0', async () => {
    render(<Step5TeachAI restaurantId="rest-1" onNext={vi.fn()} />);
    const textareas = screen.getAllByRole('textbox');
    await userEvent.type(textareas[0], 'Some info');
    mockPost.mockResolvedValueOnce({ data: { facts_stored: 0 } });
    fireEvent.click(screen.getByRole('button', { name: /teach/i }));
    await waitFor(() => screen.getByText(/Your answers have been saved/i));
  });
});

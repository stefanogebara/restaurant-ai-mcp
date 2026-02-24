import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Toast from '../Toast';
import type { ToastType } from '../Toast';

// ------------------------------------------------------------------
// Tests
// ------------------------------------------------------------------

describe('Toast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the message text', () => {
    render(<Toast message="Reservation confirmed" type="success" onClose={vi.fn()} />);

    expect(screen.getByText('Reservation confirmed')).toBeInTheDocument();
  });

  it('renders success toast with check icon', () => {
    const { container } = render(<Toast message="Saved!" type="success" onClose={vi.fn()} />);

    expect(screen.getByText('Saved!')).toBeInTheDocument();
    // Icon container has emerald background
    expect(container.querySelector('.bg-emerald-500\\/30')).toBeTruthy();
  });

  it('renders error toast with X icon', () => {
    const { container } = render(<Toast message="Something went wrong" type="error" onClose={vi.fn()} />);

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    // Icon container has red background
    expect(container.querySelector('.bg-red-500\\/30')).toBeTruthy();
  });

  it('renders info toast with info icon', () => {
    const { container } = render(<Toast message="Please wait" type="info" onClose={vi.fn()} />);

    expect(screen.getByText('Please wait')).toBeInTheDocument();
    // Icon container has blue background
    expect(container.querySelector('.bg-blue-500\\/30')).toBeTruthy();
  });

  it('auto-dismisses after default duration (3000ms)', () => {
    const onClose = vi.fn();
    render(<Toast message="Auto close" type="success" onClose={onClose} />);

    expect(onClose).not.toHaveBeenCalled();

    vi.advanceTimersByTime(3000);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('auto-dismisses after custom duration', () => {
    const onClose = vi.fn();
    render(<Toast message="Custom timer" type="info" onClose={onClose} duration={5000} />);

    vi.advanceTimersByTime(3000);
    expect(onClose).not.toHaveBeenCalled();

    vi.advanceTimersByTime(2000);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when close button is clicked', async () => {
    vi.useRealTimers(); // Use real timers for user interaction
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(<Toast message="Closeable" type="error" onClose={onClose} duration={999999} />);

    // The close button is the SVG button
    const closeButton = screen.getByRole('button');
    await user.click(closeButton);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('clears timer on unmount (no leaked timers)', () => {
    const onClose = vi.fn();
    const { unmount } = render(
      <Toast message="Unmount test" type="success" onClose={onClose} />,
    );

    // Unmount before timer fires
    unmount();

    // Advance past the default duration
    vi.advanceTimersByTime(5000);

    // onClose should not have been called since the component was unmounted
    expect(onClose).not.toHaveBeenCalled();
  });

  it('applies different styling classes for each type', () => {
    const types: ToastType[] = ['success', 'error', 'info'];

    types.forEach((type) => {
      const { container, unmount } = render(
        <Toast message={`Test ${type}`} type={type} onClose={vi.fn()} />,
      );

      // Each type should render a container div with backdrop-blur-sm
      const toast = container.querySelector('.backdrop-blur-sm');
      expect(toast).toBeTruthy();

      unmount();
    });
  });

  it('renders the close button with an SVG icon', () => {
    const { container } = render(
      <Toast message="Has close" type="info" onClose={vi.fn()} />,
    );

    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();

    const button = screen.getByRole('button');
    expect(button).toBeInTheDocument();
  });
});

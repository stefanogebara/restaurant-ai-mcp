import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../lib/analytics', () => ({
  trackDemoSlideInAction: vi.fn(),
}));

import DemoSlideIn from '../components/DemoSlideIn';

function renderSlideIn() {
  return render(
    <MemoryRouter>
      <DemoSlideIn />
    </MemoryRouter>,
  );
}

describe('DemoSlideIn', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not appear initially', () => {
    renderSlideIn();
    expect(screen.queryByText(/sample data/i)).not.toBeInTheDocument();
  });

  it('appears after 60 seconds', () => {
    renderSlideIn();
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByText(/sample data/i)).toBeInTheDocument();
  });

  it('does not appear if previously dismissed', () => {
    sessionStorage.setItem('seatable-demo-slidein-dismissed', '1');
    renderSlideIn();
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.queryByText(/sample data/i)).not.toBeInTheDocument();
  });

  it('renders CTA and dismiss buttons when visible', () => {
    renderSlideIn();
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByText(/set up my restaurant/i)).toBeInTheDocument();
    expect(screen.getByText(/maybe later/i)).toBeInTheDocument();
  });
});

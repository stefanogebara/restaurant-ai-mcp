import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Mock HeroSplitScreen to avoid animation complexity in unit tests
vi.mock('../components/HeroSplitScreen', () => ({
  default: () => <div data-testid="hero-split-screen" />,
}));

// Mock analytics
vi.mock('../../lib/analytics', () => ({
  trackCtaClicked: vi.fn(),
  trackHeadlineVariantViewed: vi.fn(),
}));

import HeroSection from '../components/HeroSection';

function renderHero(search = '') {
  return render(
    <MemoryRouter initialEntries={[`/${search}`]}>
      <HeroSection />
    </MemoryRouter>,
  );
}

describe('HeroSection', () => {
  it('renders headline variant A by default', () => {
    renderHero();
    expect(screen.getByText(/Last night at 2 AM/)).toBeInTheDocument();
    expect(screen.getByText(/Your AI answered/)).toBeInTheDocument();
  });

  it('renders headline variant B when ?headline=b', () => {
    renderHero('?headline=b');
    expect(screen.getByText(/never calls in sick/)).toBeInTheDocument();
    // Variant B should NOT show the "Your AI answered" line
    expect(screen.queryByText(/Your AI answered/)).not.toBeInTheDocument();
  });

  it('renders headline variant C when ?headline=c', () => {
    renderHero('?headline=c');
    expect(screen.getByText(/never sleeps/)).toBeInTheDocument();
  });

  it('falls back to variant A for invalid headline param', () => {
    renderHero('?headline=z');
    expect(screen.getByText(/Last night at 2 AM/)).toBeInTheDocument();
  });

  it('renders the CTA button', () => {
    renderHero();
    expect(screen.getByRole('button', { name: /see it live/i })).toBeInTheDocument();
  });

  it('renders the split screen animation', () => {
    renderHero();
    expect(screen.getByTestId('hero-split-screen')).toBeInTheDocument();
  });
});

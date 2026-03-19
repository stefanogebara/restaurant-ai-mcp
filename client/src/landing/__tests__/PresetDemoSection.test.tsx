import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Framer Motion's whileInView uses IntersectionObserver (needs class-based mock)
beforeAll(() => {
  (globalThis as unknown as Record<string, unknown>).IntersectionObserver = class MockIntersectionObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
    constructor() { /* mock */ }
  } as unknown;
});

vi.mock('../../lib/analytics', () => ({
  trackPresetDemoClicked: vi.fn(),
}));

import PresetDemoSection from '../components/PresetDemoSection';

function renderSection() {
  return render(
    <MemoryRouter>
      <PresetDemoSection />
    </MemoryRouter>,
  );
}

describe('PresetDemoSection', () => {
  it('renders all 3 preset restaurant cards', () => {
    renderSection();
    expect(screen.getByText('Trattoria da Marco')).toBeInTheDocument();
    expect(screen.getByText('Sakura Izakaya')).toBeInTheDocument();
    expect(screen.getByText('Casa Oaxaca')).toBeInTheDocument();
  });

  it('renders correct demo links for each preset', () => {
    renderSection();
    const links = screen.getAllByRole('link');
    const presetLinks = links.filter((l) => l.getAttribute('href')?.startsWith('/demo?preset='));
    expect(presetLinks).toHaveLength(3);
    expect(presetLinks[0]).toHaveAttribute('href', '/demo?preset=italian');
    expect(presetLinks[1]).toHaveAttribute('href', '/demo?preset=japanese');
    expect(presetLinks[2]).toHaveAttribute('href', '/demo?preset=mexican');
  });

  it('renders cuisine badges', () => {
    renderSection();
    expect(screen.getByText('Italian')).toBeInTheDocument();
    expect(screen.getByText('Japanese')).toBeInTheDocument();
    expect(screen.getByText('Mexican')).toBeInTheDocument();
  });

  it('renders the CTA link to demo setup', () => {
    renderSection();
    const setupLink = screen.getByRole('link', { name: /set it up here/i });
    expect(setupLink).toHaveAttribute('href', '/demo/setup');
  });
});

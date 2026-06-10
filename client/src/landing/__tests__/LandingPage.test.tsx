import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Stub IntersectionObserver for jsdom (framer-motion viewport animations need it)
beforeAll(() => {
  globalThis.IntersectionObserver = class IntersectionObserver {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    constructor(_cb: IntersectionObserverCallback) {}
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof globalThis.IntersectionObserver;
});

// Mock heavy components to keep smoke test fast
vi.mock('../components/HeroSection', () => ({
  default: () => <div data-testid="hero-section">Hero</div>,
}));
vi.mock('../components/PresetDemoSection', () => ({
  default: () => <div data-testid="preset-demo-section">PresetDemo</div>,
}));
vi.mock('../components/WhatsAppWidgetSection', () => ({
  default: () => <div data-testid="whatsapp-widget-section">WhatsApp</div>,
}));
vi.mock('../components/BeforeAfterSection', () => ({
  default: () => <div data-testid="before-after-section">BeforeAfter</div>,
}));
vi.mock('../components/Footer', () => ({
  default: () => <div data-testid="footer">Footer</div>,
}));
vi.mock('../components/LandingNav', () => ({
  default: () => <div data-testid="landing-nav">Nav</div>,
}));
vi.mock('../components/DashboardWalkthroughSection', () => ({
  default: () => <div data-testid="walkthrough-section">Walkthrough</div>,
}));
vi.mock('../../lib/analytics', () => ({
  trackLandingPageViewed: vi.fn(),
}));

import LandingPage from '../pages/LandingPage';

function renderPage() {
  return render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>,
  );
}

describe('LandingPage', () => {
  it('renders all main sections without crashing', () => {
    renderPage();
    expect(screen.getByTestId('landing-nav')).toBeInTheDocument();
    expect(screen.getByTestId('hero-section')).toBeInTheDocument();
    expect(screen.getByTestId('preset-demo-section')).toBeInTheDocument();
    expect(screen.getByTestId('whatsapp-widget-section')).toBeInTheDocument();
    expect(screen.getByTestId('walkthrough-section')).toBeInTheDocument();
    expect(screen.getByTestId('before-after-section')).toBeInTheDocument();
    expect(screen.getByTestId('footer')).toBeInTheDocument();
  });

  // 7d3ea560: voice-agent test removed from the landing page; the full
  // pricing grid moved to /precos — the landing now shows a teaser linking
  // there instead of rendering PricingSection inline.
  it('links to the dedicated pricing page instead of an inline pricing grid', () => {
    renderPage();
    expect(screen.queryByTestId('voice-widget-section')).not.toBeInTheDocument();
    expect(screen.queryByTestId('pricing-section')).not.toBeInTheDocument();
    const pricingLinks = document.querySelectorAll('a[href="/precos"]');
    expect(pricingLinks.length).toBeGreaterThanOrEqual(1);
  });

  it('renders the final CTA section', () => {
    renderPage();
    expect(screen.getByText(/Ready to reimagine/)).toBeInTheDocument();
  });

  it('renders the scroll-to-top button conditionally', () => {
    renderPage();
    // Button is hidden by default (scrollY < 600)
    expect(screen.queryByLabelText(/scroll to top/i)).not.toBeInTheDocument();
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Mock heavy components to keep smoke test fast
vi.mock('../components/HeroSection', () => ({
  default: () => <div data-testid="hero-section">Hero</div>,
}));
vi.mock('../components/PresetDemoSection', () => ({
  default: () => <div data-testid="preset-demo-section">PresetDemo</div>,
}));
vi.mock('../components/VoiceWidgetSection', () => ({
  default: () => <div data-testid="voice-widget-section">Voice</div>,
}));
vi.mock('../components/WhatsAppWidgetSection', () => ({
  default: () => <div data-testid="whatsapp-widget-section">WhatsApp</div>,
}));
vi.mock('../components/VideoShowcaseSection', () => ({
  default: () => <div data-testid="video-showcase-section">Video</div>,
}));
vi.mock('../components/PricingSection', () => ({
  default: () => <div data-testid="pricing-section">Pricing</div>,
}));
vi.mock('../components/Footer', () => ({
  default: () => <div data-testid="footer">Footer</div>,
}));
vi.mock('../components/LandingNav', () => ({
  default: () => <div data-testid="landing-nav">Nav</div>,
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
  it('renders all 8 sections without crashing', () => {
    renderPage();
    expect(screen.getByTestId('landing-nav')).toBeInTheDocument();
    expect(screen.getByTestId('hero-section')).toBeInTheDocument();
    expect(screen.getByTestId('preset-demo-section')).toBeInTheDocument();
    expect(screen.getByTestId('voice-widget-section')).toBeInTheDocument();
    expect(screen.getByTestId('whatsapp-widget-section')).toBeInTheDocument();
    expect(screen.getByTestId('video-showcase-section')).toBeInTheDocument();
    expect(screen.getByTestId('pricing-section')).toBeInTheDocument();
    expect(screen.getByTestId('footer')).toBeInTheDocument();
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

import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

beforeAll(() => {
  globalThis.IntersectionObserver = class IntersectionObserver {
    constructor(_callback: IntersectionObserverCallback) {}
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof globalThis.IntersectionObserver;
});

vi.mock('../components/LaunchNav', () => ({ default: () => <div data-testid="launch-nav">Nav</div> }));
vi.mock('../components/PhotographicHero', () => ({ default: () => <div data-testid="photographic-hero">Hero</div> }));
vi.mock('../components/LaunchProductSection', () => ({ default: () => <div data-testid="product-section">Product</div> }));
vi.mock('../components/CinematicServiceStory', () => ({ default: () => <div data-testid="service-story">Story</div> }));
vi.mock('../components/LaunchClosingSection', () => ({
  default: () => (
    <div data-testid="closing-section">
      <a href="/precos">Pricing</a>
      <a href="/demo/setup">Create my restaurant preview</a>
    </div>
  ),
}));
vi.mock('../components/LaunchFooter', () => ({ default: () => <div data-testid="launch-footer">Footer</div> }));
vi.mock('../../lib/analytics', () => ({ trackLandingPageViewed: vi.fn() }));

import LandingPage from '../pages/LandingPage';

function renderPage() {
  return render(<MemoryRouter><LandingPage /></MemoryRouter>);
}

describe('LandingPage — photographic launch rebuild', () => {
  it('renders the launch narrative in order', () => {
    renderPage();
    const ids = ['launch-nav', 'photographic-hero', 'product-section', 'service-story', 'closing-section', 'launch-footer'];
    ids.forEach((id) => expect(screen.getByTestId(id)).toBeInTheDocument());

    const renderedOrder = ids.map((id) => screen.getByTestId(id));
    renderedOrder.slice(1).forEach((element, index) => {
      expect(renderedOrder[index].compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
  });

  it('does not restore the old demo-widget stack', () => {
    renderPage();
    expect(screen.queryByTestId('preset-demo-section')).not.toBeInTheDocument();
    expect(screen.queryByTestId('whatsapp-widget-section')).not.toBeInTheDocument();
    expect(screen.queryByTestId('before-after-section')).not.toBeInTheDocument();
    expect(screen.queryByTestId('walkthrough-section')).not.toBeInTheDocument();
  });

  it('preserves pricing and personalized preview conversion routes', () => {
    renderPage();
    expect(screen.getByRole('link', { name: /pricing/i })).toHaveAttribute('href', '/precos');
    expect(screen.getByRole('link', { name: /create my restaurant preview/i })).toHaveAttribute('href', '/demo/setup');
  });

  it('does not add a floating scroll-to-top control', () => {
    const { container } = renderPage();
    expect(container.querySelector('main#main-content')).toBeInTheDocument();
    expect(screen.queryByLabelText(/scroll to top/i)).not.toBeInTheDocument();
  });
});

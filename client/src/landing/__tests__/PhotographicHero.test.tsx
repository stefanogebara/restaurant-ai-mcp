import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../lib/analytics', () => ({
  trackCtaClicked: vi.fn(),
  trackHeadlineVariantViewed: vi.fn(),
}));

import PhotographicHero from '../components/PhotographicHero';

function renderHero() {
  return render(
    <MemoryRouter>
      <PhotographicHero />
    </MemoryRouter>,
  );
}

describe('PhotographicHero', () => {
  it('renders one stable service promise', () => {
    const { container } = renderHero();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/service, orchestrated|serviço, em sintonia|servicio, en sintonía/i);
    expect(container.querySelector('[data-headline-variant="service_orchestrated"]')).toBeInTheDocument();
  });

  it('serves art-directed desktop and mobile photography', () => {
    const { container } = renderHero();
    const picture = container.querySelector('picture');
    expect(picture).toBeInTheDocument();
    expect(picture?.querySelector('source')).toHaveAttribute('srcset', '/images/landing/hero-service-mobile.webp');
    expect(picture?.querySelector('img')).toHaveAttribute('src', '/images/landing/hero-service-desktop.webp');
  });

  it('keeps the personalized preview as the primary conversion path', () => {
    renderHero();
    expect(screen.getByRole('link', { name: /see it with your restaurant|veja com o seu restaurante|velo con tu restaurante/i })).toHaveAttribute('href', '/demo/setup');
  });

  it('offers an in-page product action', () => {
    const target = document.createElement('div');
    target.id = 'experience';
    target.scrollIntoView = vi.fn();
    document.body.appendChild(target);

    renderHero();
    fireEvent.click(screen.getByRole('button', { name: /see the product|ver o produto|ver el producto/i }));
    expect(target.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth' });
    target.remove();
  });

  it('does not render fake live proof or the retired split-screen demo', () => {
    renderHero();
    expect(screen.queryByText(/your ai answered/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^live$/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('hero-split-screen')).not.toBeInTheDocument();
  });
});

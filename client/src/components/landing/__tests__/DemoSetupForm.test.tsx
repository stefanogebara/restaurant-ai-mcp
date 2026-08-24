/**
 * DemoSetupForm — gate-free entry contract (plano Demo em Conversa, F1)
 *
 * Locks three behaviors of the redesigned funnel entry:
 *
 *   1. NO EMAIL GATE — onSubmit fires with only {restaurant_name, city,
 *      scraped_data}; there is no email input anywhere in the form.
 *   2. NO AUTO-SELECT — a single Google result is never assumed to be the
 *      owner's restaurant (Text Search fuzzy-matched a real, different
 *      restaurant for a nonexistent query in production). Selection is an
 *      explicit tap, and creation requires the "É este o seu restaurante?"
 *      confirmation.
 *   3. MANUAL ESCAPE — search error and zero-results states both surface a
 *      working "create anyway" path with scraped_data: null, so a new
 *      restaurant that isn't on Google can't dead-end the funnel.
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import i18n from '../../../i18n/config';
import DemoSetupForm from '../DemoSetupForm';

// Force EN for the whole file so placeholder/regex matchers stay locale-stable.
// Without this we inherit whatever the test setup picked (PT in CI today).
beforeAll(async () => {
  await i18n.changeLanguage('en');
});

// Silence the analytics module — it ships its own side effects on import.
vi.mock('../../../lib/analytics', () => ({
  trackDemoStarted: vi.fn(),
  trackDemoFunnel: vi.fn(),
}));

const RESULT = {
  name: 'Empório Quintal da Vovó',
  address: 'R. Caramuru, 208 - Vila Maristela',
  phone: '+55 18 99744-0280',
  rating: 4.7,
  review_count: 461,
  cuisine_type: 'Brazilian',
  website: null,
  google_maps_url: null,
  editorial_summary: null,
  business_hours: null,
  hours_text: null,
  top_reviews: [],
};

function fillSearch(name: string, city: string) {
  fireEvent.change(screen.getByPlaceholderText(/restaurant name/i), {
    target: { value: name },
  });
  fireEvent.change(screen.getByPlaceholderText(/city/i), {
    target: { value: city },
  });
  fireEvent.click(screen.getByRole('button', { name: /find it/i }));
}

describe('DemoSetupForm — gate-free entry', () => {
  const onSubmit = vi.fn();

  beforeEach(() => {
    onSubmit.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders no email input at any point in the flow', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, results: [RESULT] }),
    });

    render(<DemoSetupForm onSubmit={onSubmit} isSubmitting={false} submitError={null} />);
    fillSearch('Quintal', 'Pres. Prudente');
    await screen.findByText(RESULT.name);

    expect(document.querySelector('input[type="email"]')).toBeNull();
  });

  it('does NOT auto-select a single result; confirmation requires an explicit tap', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, results: [RESULT] }),
    });

    render(<DemoSetupForm onSubmit={onSubmit} isSubmitting={false} submitError={null} />);
    // The production incident: a NONEXISTENT restaurant fuzzy-matched a real
    // one as the single result. The form must show it as a choice, not as
    // "your restaurant".
    fillSearch('Cantinho da Vó Zilda', 'Pres. Prudente');

    await screen.findByText(RESULT.name);
    expect(screen.queryByText(/is this your restaurant/i)).toBeNull();

    fireEvent.click(screen.getByText(RESULT.name));
    await screen.findByText(/is this your restaurant/i);

    fireEvent.click(screen.getByRole('button', { name: /yes, that's it/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      restaurant_name: RESULT.name,
      city: 'Pres. Prudente',
      scraped_data: RESULT,
    });
  });

  it('lets the user create with scraped_data:null after a search ERROR', async () => {
    // Backend returns an error — production sees this when Google Places
    // is rate-limited or down. Form must NOT trap the user on the search step.
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ success: false, error: 'Search failed' }),
    });

    render(<DemoSetupForm onSubmit={onSubmit} isSubmitting={false} submitError={null} />);
    fillSearch('Obscure Diner', 'Nowhere');

    const continueBtn = await screen.findByRole('button', { name: /continue without search/i });
    fireEvent.click(continueBtn);

    fireEvent.click(await screen.findByRole('button', { name: /create my demo anyway/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      restaurant_name: 'Obscure Diner',
      city: 'Nowhere',
      scraped_data: null,
    });
  });

  it('lets the user create with scraped_data:null after ZERO RESULTS', async () => {
    // Common for new places not yet on Google Maps — the exact audience the
    // "restaurante novo" path serves.
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, results: [] }),
    });

    render(<DemoSetupForm onSubmit={onSubmit} isSubmitting={false} submitError={null} />);
    fillSearch('Brand New Place', 'Anytown');

    await screen.findByText(/no exact match/i);
    fireEvent.click(screen.getByRole('button', { name: /create my demo anyway/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      restaurant_name: 'Brand New Place',
      city: 'Anytown',
      scraped_data: null,
    });
  });
});

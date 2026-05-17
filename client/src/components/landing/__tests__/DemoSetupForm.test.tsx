/**
 * DemoSetupForm — restaurant-not-found fallback path
 *
 * Locks the contract that the form must remain submittable when Google
 * Places returns zero matches. Without this safety net, a typo or an
 * obscure restaurant would dead-end the conversion funnel ("Search
 * failed — please try again") even though manual demo creation is
 * fully supported by the backend.
 *
 * The form exposes the fallback via three affordances; this suite covers
 * the first two (the third — empty-results "Not listed? Continue manually"
 * — is observably the same path):
 *
 *   1. Search returns a non-OK / error → amber banner with
 *      "Continue without search" → onSubmit fires with scraped_data: null.
 *   2. Search returns 200 + zero results → "No exact match" message +
 *      Step 2 unlocks → email + submit → onSubmit fires with
 *      scraped_data: null.
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
}));

describe('DemoSetupForm — restaurant-not-found fallback', () => {
  const onSubmit = vi.fn();

  beforeEach(() => {
    onSubmit.mockClear();
    // Default to a happy fetch so individual tests can override.
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lets the user submit with scraped_data:null after a search ERROR', async () => {
    // Backend returns an error — production sees this when Google Places
    // is rate-limited or down. Form must NOT trap the user on the search
    // step; the "Continue without search" affordance has to escape it.
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ success: false, error: 'Search failed' }),
    });

    render(
      <DemoSetupForm onSubmit={onSubmit} isSubmitting={false} submitError={null} />
    );

    fireEvent.change(screen.getByPlaceholderText(/restaurant name/i), {
      target: { value: 'Obscure Diner' },
    });
    fireEvent.change(screen.getByPlaceholderText(/city/i), {
      target: { value: 'Nowhere' },
    });
    fireEvent.click(screen.getByRole('button', { name: /find it/i }));

    // Banner must surface a CTA out of the dead-end. Without it, the user
    // is locked on the search step because the email step never reveals.
    const continueBtn = await screen.findByRole('button', { name: /continue without search/i });
    fireEvent.click(continueBtn);

    // After the fallback click, the email step must appear.
    const emailInput = await screen.findByPlaceholderText(/work email/i);
    fireEvent.change(emailInput, { target: { value: 'owner@diner.test' } });
    fireEvent.click(screen.getByRole('button', { name: /launch my demo/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      restaurant_name: 'Obscure Diner',
      city: 'Nowhere',
      contact_email: 'owner@diner.test',
      scraped_data: null,
    });
  });

  it('lets the user submit with scraped_data:null after ZERO RESULTS', async () => {
    // Backend returns success but no matches — common for new places
    // not yet on Google Maps. Empty results should still unlock the
    // email step and surface a manual-continue affordance.
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, results: [] }),
    });

    render(
      <DemoSetupForm onSubmit={onSubmit} isSubmitting={false} submitError={null} />
    );

    fireEvent.change(screen.getByPlaceholderText(/restaurant name/i), {
      target: { value: 'Brand New Place' },
    });
    fireEvent.change(screen.getByPlaceholderText(/city/i), {
      target: { value: 'Anytown' },
    });
    fireEvent.click(screen.getByRole('button', { name: /find it/i }));

    // "No exact match" copy proves we reached the empty-state branch
    // rather than the error branch.
    await screen.findByText(/no exact match/i);

    const emailInput = await screen.findByPlaceholderText(/work email/i);
    fireEvent.change(emailInput, { target: { value: 'owner@brand.new' } });
    fireEvent.click(screen.getByRole('button', { name: /launch my demo/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      restaurant_name: 'Brand New Place',
      city: 'Anytown',
      contact_email: 'owner@brand.new',
      scraped_data: null,
    });
  });
});

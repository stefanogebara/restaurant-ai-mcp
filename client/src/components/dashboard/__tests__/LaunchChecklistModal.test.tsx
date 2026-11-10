import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import i18n from 'i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LaunchChecklistModal from '../LaunchChecklistModal';
import { LS_LAUNCH_CHECKLIST_DONE } from '../../../config/localStorageKeys';

const bookingUrl = 'https://seatable.one/book/cantina-sao-paulo';
const onDismiss = vi.fn();
const checklist = (slug = 'cantina-sao-paulo') => (
  <MemoryRouter>
    <LaunchChecklistModal bookingSlug={slug} onDismiss={onDismiss} />
  </MemoryRouter>
);

beforeEach(() => {
  onDismiss.mockClear();
  localStorage.removeItem(LS_LAUNCH_CHECKLIST_DONE);
});
afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  await i18n.changeLanguage('en');
});

describe('LaunchChecklistModal booking-first action', () => {
  it.each([
    ['en', 'Try your booking page', 'Open booking page'],
    ['pt-BR', 'Teste sua página de reservas', 'Abrir página de reservas'],
    ['es', 'Prueba tu página de reservas', 'Abrir página de reservas'],
  ])('offers the actual booking page first in %s without promising voice', async (language, title, action) => {
    await i18n.changeLanguage(language);
    const { container } = render(checklist());

    expect(screen.getByText(title)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: action });
    expect(screen.getAllByRole('link')[0]).toBe(link);
    expect(link).toHaveAttribute('href', bookingUrl);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(container.textContent).not.toMatch(/voice|voz|call your agent|ligue/i);
    expect(container.querySelector('[href*="voice-settings"]')).toBeNull();
    // Opening a page must not claim the owner has completed a reservation.
    expect(localStorage.getItem(LS_LAUNCH_CHECKLIST_DONE)).toBeNull();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it.each(['', '   '])('does not offer a broken action while slug %j is loading', (slug) => {
    const { rerender } = render(checklist(slug));
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /voice settings/i })).not.toBeInTheDocument();
    expect(screen.getAllByText('Loading your booking link…').length).toBeGreaterThan(0);

    rerender(checklist());
    expect(screen.getByRole('link', { name: 'Open booking page' })).toHaveAttribute('href', bookingUrl);
  });

  it('keeps copying the same booking link and manual-booking guidance', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    render(checklist());
    await user.click(screen.getByRole('button', { name: 'Copy' }));
    expect(writeText).toHaveBeenCalledExactlyOnceWith(bookingUrl);
    expect(screen.getByText('Use the dashboard to manually add a booking')).toBeInTheDocument();
  });

  it('retains explicit dismissal without marking a booking as completed', async () => {
    const user = userEvent.setup();
    render(checklist());
    await user.click(screen.getByRole('button', { name: 'Skip for now' }));
    expect(localStorage.getItem(LS_LAUNCH_CHECKLIST_DONE)).toBe('1');
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});

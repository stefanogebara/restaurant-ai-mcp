import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import ReservationsList from '../ReservationsList';
import TableLayoutPanel from '../TableLayoutPanel';
import en from '../../../i18n/locales/en.json';
import ptBR from '../../../i18n/locales/pt-BR.json';
import es from '../../../i18n/locales/es.json';
import type { UpcomingReservation } from '../../../types/host.types';

vi.mock('../../host/FloorPlanView', () => ({ default: () => null }));
vi.mock('../../host/TableGrid', () => ({ default: () => null }));

const reservation: UpcomingReservation = {
  reservation_id: 'refresh-badge-test',
  customer_name: 'Test Guest',
  customer_phone: '+15550000001',
  party_size: 2,
  date: '2026-11-09',
  time: '19:00',
  reservation_time: '2026-11-09T19:00:00Z',
  checked_in: false,
};

type RefreshMode = 'live' | 'periodic';

const panels = [
  {
    name: 'ReservationsList',
    element: (refreshMode?: RefreshMode, empty = false) => (
      <ReservationsList
        todayReservations={empty ? [] : [reservation]}
        tomorrowReservations={[]}
        onCheckIn={vi.fn()}
        onIntervention={vi.fn()}
        refreshMode={refreshMode}
      />
    ),
  },
  {
    name: 'TableLayoutPanel',
    element: (refreshMode?: RefreshMode) => (
      <TableLayoutPanel tables={[]} activeParties={[]} onRefresh={vi.fn()} refreshMode={refreshMode} />
    ),
  },
];

async function renderPanel(panel: typeof panels[number], mode?: RefreshMode, language = 'en', empty = false) {
  const i18n = createInstance();
  await i18n.init({
    lng: language,
    fallbackLng: 'en',
    resources: {
      en: { translation: en },
      'pt-BR': { translation: ptBR },
      es: { translation: es },
    },
    interpolation: { escapeValue: false },
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrap = (refreshMode?: RefreshMode) => (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>{panel.element(refreshMode, empty)}</MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>
  );
  const result = render(wrap(mode));
  return { ...result, changeMode: (refreshMode: RefreshMode) => result.rerender(wrap(refreshMode)) };
}

function expectNoLiveClaim(container: HTMLElement) {
  // textContent includes CSS-hidden variants. Check accessible names and tooltips too.
  const liveClaim = /\b(?:live|ao vivo|en vivo)\b/i;
  expect(container.textContent).not.toMatch(liveClaim);
  for (const element of container.querySelectorAll('[aria-label], [title]')) {
    expect(element.getAttribute('aria-label') ?? '').not.toMatch(liveClaim);
    expect(element.getAttribute('title') ?? '').not.toMatch(liveClaim);
  }
  expect(container.querySelector('.animate-ping')).not.toBeInTheDocument();
}

describe.each(panels)('$name refresh badge', (panel) => {
  it.each([undefined, 'live'] as const)('preserves the live badge for mode %s', async (mode) => {
    const { container } = await renderPanel(panel, mode);
    expect(screen.getByText('Live')).toBeVisible();
    expect(container.querySelector('.animate-ping')).toBeInTheDocument();
    expect(screen.queryByText('Updates automatically')).not.toBeInTheDocument();
  });

  it.each([
    ['en', 'Updates automatically'],
    ['pt-BR', 'Atualiza automaticamente'],
    ['es', 'Se actualiza automáticamente'],
  ])('shows neutral periodic text in %s without any hidden live claim', async (language, label) => {
    const { container } = await renderPanel(panel, 'periodic', language);
    const badge = screen.getByText(label);
    expect(badge).toBeVisible();
    expect(badge).toHaveClass('text-muted-stone');
    expect(badge.childElementCount).toBe(0);
    expectNoLiveClaim(container);
  });

  it('shows the periodic label with empty data', async () => {
    const { container } = await renderPanel(panel, 'periodic', 'en', true);
    expect(screen.getByText('Updates automatically')).toBeVisible();
    expectNoLiveClaim(container);
  });

  it('removes the live badge when switching to periodic mode', async () => {
    const { container, changeMode } = await renderPanel(panel);
    expect(screen.getByText('Live')).toBeInTheDocument();
    changeMode('periodic');
    expect(screen.getByText('Updates automatically')).toBeVisible();
    expectNoLiveClaim(container);
  });
});

it('keeps periodic reservations truthful when changing the day filter', async () => {
  const user = userEvent.setup();
  const { container } = await renderPanel(panels[0], 'periodic');
  await user.click(screen.getByRole('button', { name: 'Tomorrow' }));
  expect(screen.getByText('Updates automatically')).toBeVisible();
  expectNoLiveClaim(container);
  await user.click(screen.getByRole('button', { name: 'Today' }));
  expect(screen.getByText('Updates automatically')).toBeVisible();
  expectNoLiveClaim(container);
});

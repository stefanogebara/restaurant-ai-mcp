import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from 'i18next';
import InstagramPanel from '../InstagramPanel';
import { sendCaptionToReel } from '../instagramCaptionBus';

vi.mock('../../../hooks/useInstagramStatus', () => ({
  INSTAGRAM_STATUS_QUERY_KEY: ['instagram-status'],
  useInstagramStatus: () => ({
    data: { connected: true, status: 'active', username: 'cantina', tone_profile_ready: true },
    isLoading: false,
    isError: false,
  }),
}));
vi.mock('../../../contexts/ToastContext', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));
vi.mock('../InstagramCaptionDrafter', () => ({
  default: () => <input aria-label="Feed draft" defaultValue="" />,
}));
vi.mock('../InstagramReelPanel', () => ({
  default: () => <input aria-label="Reel draft" defaultValue="" />,
}));
vi.mock('../InstagramScheduledPostsPanel', () => ({
  default: () => <p>Scheduled workspace</p>,
}));

function mount() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={queryClient}><InstagramPanel /></QueryClientProvider>);
}

afterEach(async () => { await i18n.changeLanguage('en'); });

describe('Instagram creation workspace', () => {
  it('keeps both editors mounted and their drafts while switching modes', async () => {
    const user = userEvent.setup();
    mount();
    await user.type(screen.getByRole('textbox', { name: 'Feed draft' }), 'pizza tonight');

    await user.click(screen.getByRole('tab', { name: 'Reel' }));
    await user.type(screen.getByRole('textbox', { name: 'Reel draft' }), 'vertical video');
    await user.click(screen.getByRole('tab', { name: 'Scheduled' }));
    expect(screen.getByText('Scheduled workspace')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Feed post' }));
    expect(screen.getByRole('textbox', { name: 'Feed draft' })).toHaveValue('pizza tonight');
    await user.click(screen.getByRole('tab', { name: 'Reel' }));
    expect(screen.getByRole('textbox', { name: 'Reel draft' })).toHaveValue('vertical video');
  });

  it('opens Reel when a caption is transferred and supports arrow keys', async () => {
    const user = userEvent.setup();
    mount();
    act(() => sendCaptionToReel('From the draft'));
    expect(screen.getByRole('tab', { name: 'Reel' })).toHaveAttribute('aria-selected', 'true');

    await user.type(screen.getByRole('tab', { name: 'Reel' }), '{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Scheduled' })).toHaveAttribute('aria-selected', 'true');
  });

  it('localizes the workspace navigation in Portuguese and Spanish', async () => {
    await i18n.changeLanguage('pt-BR');
    mount();
    expect(screen.getByRole('tab', { name: 'Publicação' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Agendadas' })).toBeInTheDocument();
    await i18n.changeLanguage('es');
    expect(screen.getByRole('tab', { name: 'Publicación' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Programadas' })).toBeInTheDocument();
  });
});

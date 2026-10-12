import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from 'i18next';
import InstagramScheduledPostsPanel from '../InstagramScheduledPostsPanel';

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));
vi.mock('../../../services/api', () => ({ authFetch: fetchMock }));
vi.mock('../../../contexts/ToastContext', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><InstagramScheduledPostsPanel showEmptyState /></QueryClientProvider>);
}

const post = (index: number) => ({
  id: `post-${index}`,
  caption: `Prato ${index}`,
  media_type: 'feed',
  image_urls: [],
  scheduled_at: `2026-10-${String(index + 12).padStart(2, '0')}T18:00:00Z`,
  status: 'pending',
  ig_permalink: null,
  error: null,
  attempts: 0,
  created_at: '2026-10-12T12:00:00Z',
  completed_at: null,
});

beforeEach(() => fetchMock.mockReset());
afterEach(async () => { await i18n.changeLanguage('en'); });

describe('Instagram scheduled view', () => {
  it('explains the empty state instead of showing a blank view', async () => {
    await i18n.changeLanguage('pt-BR');
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true, posts: [] }) });
    mount();
    expect(await screen.findByText('Nada agendado por enquanto')).toBeInTheDocument();
    expect(screen.getByText(/Quando você agendar/)).toBeInTheDocument();
  });

  it('lets the owner reveal scheduled posts beyond the first five', async () => {
    await i18n.changeLanguage('pt-BR');
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true, posts: Array.from({ length: 6 }, (_, index) => post(index)) }) });
    mount();
    expect(await screen.findByText('Prato 0')).toBeInTheDocument();
    expect(screen.queryByText('Prato 5')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar mais 1' }));
    expect(screen.getByText('Prato 5')).toBeInTheDocument();
    expect(screen.getByText('Pendentes (6)')).toBeInTheDocument();
  });
});

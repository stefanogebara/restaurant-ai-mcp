import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from 'i18next';
import InstagramCaptionDrafter from '../InstagramCaptionDrafter';
import InstagramReelPanel from '../InstagramReelPanel';

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));
vi.mock('../../../services/api', () => ({ authFetch: fetchMock }));
vi.mock('../../../contexts/ToastContext', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <InstagramCaptionDrafter toneProfileReady language="pt" />
      <InstagramReelPanel workspaceMode />
    </QueryClientProvider>,
  );
}

afterEach(async () => { await i18n.changeLanguage('en'); });

describe('Instagram creation languages', () => {
  it('shows Portuguese controls and the detected caption language', async () => {
    await i18n.changeLanguage('pt-BR');
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true, month: { total_cents: 0 } }) });
    mount();
    expect(screen.getByRole('heading', { name: 'Criar legenda' })).toBeInTheDocument();
    expect(screen.getByLabelText('Sobre o que é a publicação?')).toBeInTheDocument();
    expect(screen.getByText('Legendas em português')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Criar 3 legendas' })).toBeDisabled();
    expect(screen.getByText('Criar Reel')).toBeInTheDocument();
    expect(screen.getByLabelText('Legenda')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Agendar para depois' })).toBeInTheDocument();
  });

  it('shows Spanish controls instead of English fallback copy', async () => {
    await i18n.changeLanguage('es');
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true, month: { total_cents: 0 } }) });
    mount();
    expect(screen.getByRole('heading', { name: 'Crear texto' })).toBeInTheDocument();
    expect(screen.getByLabelText('¿De qué trata la publicación?')).toBeInTheDocument();
    expect(screen.getByText('Crear Reel')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Programar para después' })).toBeInTheDocument();
  });
});

/**
 * CapturaPosAha — captura DEPOIS do aha (F3, decisão D2).
 *
 * Prende: (1) WhatsApp primeiro, e-mail escondido atrás de um toggle
 * discreto; (2) o e-mail vai para /api/demo/attach-contact com o token do
 * demo; (3) erro do servidor não engole o formulário.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CapturaPosAha from '../CapturaPosAha';
import type { DemoStrings } from '../../../hooks/useDemoLocale';

vi.mock('../../../lib/analytics', () => ({
  trackDemoFunnel: vi.fn(),
  trackWhatsAppTapped: vi.fn(),
}));

const t = {
  captureTitle: 'Gostou? Continue no seu WhatsApp',
  captureEmailToggle: 'Prefiro receber o link por e-mail',
  captureEmailSend: 'Enviar link',
  captureEmailDone: 'Enviado! Confira sua caixa de entrada.',
  captureEmailError: 'Não conseguimos salvar agora — tente de novo.',
} as unknown as DemoStrings;

function renderCard() {
  render(
    <CapturaPosAha
      demoToken="tok-123"
      restaurantId="rest-1"
      restaurantName="Cantina da Praça"
      lang="pt-BR"
      t={t}
    />,
  );
}

describe('CapturaPosAha', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('WhatsApp em destaque; e-mail só depois do toggle', () => {
    renderCard();
    expect(screen.getByText(/ver no seu próprio whatsapp/i)).toBeInTheDocument();
    expect(document.querySelector('input[type="email"]')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: t.captureEmailToggle }));
    expect(document.querySelector('input[type="email"]')).not.toBeNull();
  });

  it('envia o e-mail para attach-contact com o token do demo', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: t.captureEmailToggle }));
    fireEvent.change(document.querySelector('input[type="email"]')!, {
      target: { value: 'dona@cantina.br' },
    });
    fireEvent.click(screen.getByRole('button', { name: t.captureEmailSend }));

    await screen.findByText(t.captureEmailDone);
    const [url, opts] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(url)).toContain('/api/demo/attach-contact');
    expect(JSON.parse((opts as RequestInit).body as string)).toEqual({
      demo_token: 'tok-123',
      contact_email: 'dona@cantina.br',
    });
  });

  it('erro do servidor mostra a mensagem e mantém o formulário', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'nope' }),
    });
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: t.captureEmailToggle }));
    fireEvent.change(document.querySelector('input[type="email"]')!, {
      target: { value: 'dona@cantina.br' },
    });
    fireEvent.click(screen.getByRole('button', { name: t.captureEmailSend }));

    await screen.findByText(t.captureEmailError);
    await waitFor(() => expect(document.querySelector('input[type="email"]')).not.toBeNull());
  });
});

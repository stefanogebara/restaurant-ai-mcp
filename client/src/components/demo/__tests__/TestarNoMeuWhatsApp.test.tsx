import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TestarNoMeuWhatsApp from '../TestarNoMeuWhatsApp';

/**
 * O que estes testes prendem, além do caminho felizmente óbvio:
 *  - a UI não PROMETE conversa de volta (o envio funciona; o diálogo não);
 *  - a mensagem de bloqueio do servidor é mostrada como está — é ela que diz
 *    ao dono se é só esperar alguns minutos;
 *  - número incompleto não dispara requisição, porque cada envio custa dinheiro.
 */

const { mockTapped } = vi.hoisted(() => ({ mockTapped: vi.fn() }));
vi.mock('../../../lib/analytics', () => ({ trackWhatsAppTapped: mockTapped }));

const ok = (can_reply = false) => () => Promise.resolve({
  ok: true, json: () => Promise.resolve({ success: true, data: { sent_to: '5511****88', can_reply } }),
} as Response);

const falha = (error: string, status = 429) => Promise.resolve({
  ok: false, status, json: () => Promise.resolve({ success: false, error }),
} as Response);

beforeEach(() => {
  vi.restoreAllMocks();
  mockTapped.mockReset();
});

const renderizar = () =>
  render(<TestarNoMeuWhatsApp restaurantId="r-1" restaurantName="Mocotó" lang="pt-BR" />);

describe('TestarNoMeuWhatsApp', () => {
  it('envia o número só com dígitos e confirma na tela', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(ok());
    renderizar();

    await userEvent.type(screen.getByLabelText(/seu número/i), '+55 (11) 99999-8888');
    await userEvent.click(screen.getByRole('button', { name: /enviar/i }));

    await waitFor(() => expect(screen.getByText(/olhe seu whatsapp/i)).toBeInTheDocument());
    const corpo = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(corpo.phone).toBe('5511999998888');
    expect(corpo.restaurant_id).toBe('r-1');
  });

  it('número incompleto não dispara requisição — envio custa dinheiro', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(ok());
    renderizar();

    await userEvent.type(screen.getByLabelText(/seu número/i), '1199');
    expect(screen.getByRole('button', { name: /enviar/i })).toBeDisabled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('mostra a mensagem EXATA do servidor quando um limite bloqueia', async () => {
    // Texto genérico esconderia do dono que basta esperar alguns minutos.
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      falha('Já enviamos um teste para esse número. Aguarde alguns minutos antes de pedir outro.'));
    renderizar();

    await userEvent.type(screen.getByLabelText(/seu número/i), '5511999998888');
    await userEvent.click(screen.getByRole('button', { name: /enviar/i }));

    await waitFor(() => expect(screen.getByText(/aguarde alguns minutos/i)).toBeInTheDocument());
  });

  it('falha de rede não deixa o botão travado em "Enviando…"', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.reject(new Error('offline')));
    renderizar();

    await userEvent.type(screen.getByLabelText(/seu número/i), '5511999998888');
    await userEvent.click(screen.getByRole('button', { name: /enviar/i }));

    await waitFor(() => expect(screen.getByText(/sem conexão/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /enviar/i })).toBeEnabled();
  });

  it('não promete diálogo ANTES de enviar — só o backend sabe se vinculou', async () => {
    renderizar();
    expect(screen.queryByText(/responda por lá/i)).not.toBeInTheDocument();
  });

  it('can_reply=true CONVIDA a responder — o vínculo com o demo funcionou', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(ok(true));
    renderizar();

    await userEvent.type(screen.getByLabelText(/seu número/i), '5511999998888');
    await userEvent.click(screen.getByRole('button', { name: /enviar/i }));

    await waitFor(() => expect(screen.getByText(/responda por lá/i)).toBeInTheDocument());
    expect(screen.getByText(/a ia do seu restaurante/i)).toBeInTheDocument();
  });

  it('can_reply=false NÃO convida — vínculo recusado (ex: número de cliente real)', async () => {
    // A promessa seria falsa: a resposta cairia no fluxo normal e ninguém
    // atenderia como o demo. Pior decepção possível no pico de interesse.
    vi.spyOn(globalThis, 'fetch').mockImplementation(ok(false));
    renderizar();

    await userEvent.type(screen.getByLabelText(/seu número/i), '5511999998888');
    await userEvent.click(screen.getByRole('button', { name: /enviar/i }));

    await waitFor(() => expect(screen.getByText(/olhe seu whatsapp/i)).toBeInTheDocument());
    expect(screen.queryByText(/responda por lá/i)).not.toBeInTheDocument();
  });
});

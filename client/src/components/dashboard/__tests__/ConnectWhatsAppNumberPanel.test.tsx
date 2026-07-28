import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ConnectWhatsAppNumberPanel from '../ConnectWhatsAppNumberPanel';

/**
 * A máquina real mora no backend (13 testes lá); aqui só se prende a JANELA:
 * cada estado do servidor rende a tela certa, e o código digitado vai pro
 * endpoint certo.
 */

const { mockAuthFetch } = vi.hoisted(() => ({ mockAuthFetch: vi.fn() }));
vi.mock('../../../services/api', () => ({ authFetch: mockAuthFetch }));

function resposta(json: unknown, ok = true) {
  return Promise.resolve({ ok, json: () => Promise.resolve(json) } as Response);
}

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ConnectWhatsAppNumberPanel />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockAuthFetch.mockReset();
});

describe('ConnectWhatsAppNumberPanel', () => {
  it('nao_iniciado: mostra o formulário com +55 de padrão', async () => {
    mockAuthFetch.mockReturnValue(resposta({ success: true, data: { estado: 'nao_iniciado' } }));
    montar();
    expect(await screen.findByText(/Receive verification code/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Country/i)).toHaveValue('55');
  });

  it('iniciar envia cc+numero+metodo e a tela muda pro código', async () => {
    mockAuthFetch
      .mockReturnValueOnce(resposta({ success: true, data: { estado: 'nao_iniciado' } }))
      .mockReturnValueOnce(resposta({
        success: true,
        data: { estado: 'aguardando_codigo', numero_e164: '+5511999998888', metodo: 'SMS' },
      }));
    montar();

    const user = userEvent.setup();
    await user.type(await screen.findByPlaceholderText('11 3456-7890'), '11 99999-8888');
    await user.click(screen.getByText(/Receive verification code/i));

    await waitFor(() => expect(screen.getByText(/\+5511999998888/)).toBeInTheDocument());
    const corpo = JSON.parse(mockAuthFetch.mock.calls[1][1].body as string);
    expect(corpo).toMatchObject({ action: 'iniciar', cc: '55', metodo: 'sms' });
  });

  it('erro do backend aparece pro dono como veio — a mensagem já é amigável', async () => {
    mockAuthFetch
      .mockReturnValueOnce(resposta({ success: true, data: { estado: 'nao_iniciado' } }))
      .mockReturnValueOnce(resposta({ success: false, error: 'A Meta limitou tentativas para este número.' }, false));
    montar();

    const user = userEvent.setup();
    await user.type(await screen.findByPlaceholderText('11 3456-7890'), '11 99999-8888');
    await user.click(screen.getByText(/Receive verification code/i));

    expect(await screen.findByText(/limitou tentativas/i)).toBeInTheDocument();
  });

  it('ativo: mostra o número conectado e a nota de propagação', async () => {
    mockAuthFetch.mockReturnValue(resposta({
      success: true,
      data: { estado: 'ativo', numero_e164: '+5511999998888' },
    }));
    montar();
    expect(await screen.findByText('+5511999998888')).toBeInTheDocument();
    expect(screen.getByText(/within a minute/i)).toBeInTheDocument();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CnpjConfirmPanel from '../CnpjConfirmPanel';

/**
 * O painel de confirmação de CNPJ. O que estes testes prendem:
 *  1. NADA é escolhido sozinho — nem a sugestão de alta confiança dispensa o
 *     clique do dono. Casar CNPJ errado põe dado fiscal de outra empresa no
 *     cadastro, em silêncio;
 *  2. a pergunta dos sócios existe e sempre tem saída ("outra pessoa");
 *  3. falha nunca vira beco sem saída — o onboarding segue.
 */

const { mockAuthFetch } = vi.hoisted(() => ({ mockAuthFetch: vi.fn() }));
vi.mock('../../../services/api', () => ({ authFetch: mockAuthFetch }));

const socios = [
  { nome: 'JORGE FERREIRA BASTOS', qualificacao: 'Sócio-Administrador' },
  { nome: 'KEILA MARIA PINTO DE SOUSA BASTOS', qualificacao: 'Sócio-Administrador' },
];

const candidato = (over = {}) => ({
  cnpj: '38793527000193',
  razao_social: 'REI DO MOCOTO LTDA',
  nome_fantasia: null,
  municipio: 'sao paulo',
  uf: 'SP',
  situacao: 'ATIVA',
  porte: 'MICRO EMPRESA',
  do_setor_de_alimentacao: true,
  socios,
  confianca: 0.87,
  ...over,
});

function respostaCom(data: unknown, ok = true) {
  return Promise.resolve({ ok, json: () => Promise.resolve({ success: ok, data }) } as Response);
}

beforeEach(() => mockAuthFetch.mockReset());

describe('CnpjConfirmPanel', () => {
  it('mostra a empresa encontrada com o CNPJ formatado', async () => {
    mockAuthFetch.mockReturnValue(respostaCom({ candidatos: [candidato()], sugerido: null }));
    render(<CnpjConfirmPanel nome="Mocotó" cidade="São Paulo" onConfirm={vi.fn()} onSkip={vi.fn()} />);

    expect(await screen.findByText('REI DO MOCOTO LTDA')).toBeInTheDocument();
    expect(screen.getByText(/38\.793\.527\/0001-93/)).toBeInTheDocument();
  });

  it('sugestão do backend NÃO confirma sozinha — o dono ainda escolhe quem é', async () => {
    const onConfirm = vi.fn();
    mockAuthFetch.mockReturnValue(respostaCom({ candidatos: [candidato()], sugerido: candidato() }));
    render(<CnpjConfirmPanel nome="Mocotó" onConfirm={onConfirm} onSkip={vi.fn()} />);

    // A pergunta dos sócios aparece (sugestão pré-selecionada)...
    expect(await screen.findByText(/qual dos sócios/i)).toBeInTheDocument();
    // ...mas nada foi confirmado sem clique.
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('escolher o sócio devolve empresa + quem é a pessoa', async () => {
    const onConfirm = vi.fn();
    mockAuthFetch.mockReturnValue(respostaCom({ candidatos: [candidato()], sugerido: candidato() }));
    render(<CnpjConfirmPanel nome="Mocotó" onConfirm={onConfirm} onSkip={vi.fn()} />);

    await userEvent.click(await screen.findByText('JORGE FERREIRA BASTOS'));
    expect(onConfirm).toHaveBeenCalledWith({
      cnpj: '38793527000193',
      razao_social: 'REI DO MOCOTO LTDA',
      socio_confirmado: 'JORGE FERREIRA BASTOS',
    });
  });

  it('"outra pessoa" confirma a empresa SEM atribuir um sócio errado', async () => {
    // Gerente contratado, contador, sócio novo que ainda não consta — forçar
    // um nome da lista seria pior que não perguntar.
    const onConfirm = vi.fn();
    mockAuthFetch.mockReturnValue(respostaCom({ candidatos: [candidato()], sugerido: candidato() }));
    render(<CnpjConfirmPanel nome="Mocotó" onConfirm={onConfirm} onSkip={vi.fn()} />);

    await userEvent.click(await screen.findByText(/outra pessoa/i));
    expect(onConfirm).toHaveBeenCalledWith({
      cnpj: '38793527000193',
      razao_social: 'REI DO MOCOTO LTDA',
    });
  });

  it('situação diferente de ATIVA fica visível — baixada quase nunca é o restaurante em operação', async () => {
    mockAuthFetch.mockReturnValue(respostaCom({
      candidatos: [candidato({ situacao: 'BAIXADA' })], sugerido: null,
    }));
    render(<CnpjConfirmPanel nome="Mocotó" onConfirm={vi.fn()} onSkip={vi.fn()} />);
    expect(await screen.findByText('baixada')).toBeInTheDocument();
  });

  it('nada encontrado não é beco sem saída', async () => {
    const onSkip = vi.fn();
    mockAuthFetch.mockReturnValue(respostaCom({ candidatos: [], sugerido: null }));
    render(<CnpjConfirmPanel nome="Restaurante Novo" onConfirm={vi.fn()} onSkip={onSkip} />);

    await userEvent.click(await screen.findByText(/continuar/i));
    expect(onSkip).toHaveBeenCalled();
  });

  it('falha de rede aparece como falha — não como "sua empresa não existe"', async () => {
    mockAuthFetch.mockReturnValue(Promise.resolve({
      ok: false, json: () => Promise.resolve({ success: false, error: 'Falha ao consultar' }),
    } as Response));
    render(<CnpjConfirmPanel nome="Mocotó" onConfirm={vi.fn()} onSkip={vi.fn()} />);

    expect(await screen.findByText(/não conseguimos consultar/i)).toBeInTheDocument();
  });

  it('nome curto demais nem consulta o backend', async () => {
    render(<CnpjConfirmPanel nome="ab" onConfirm={vi.fn()} onSkip={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/não encontramos/i)).toBeInTheDocument());
    expect(mockAuthFetch).not.toHaveBeenCalled();
  });
});

import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FolhaDeConfirmacao } from '../FolhaDeConfirmacao';
import type { OnboardingData } from '../../../../types/onboarding.types';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    // Devolve o fallback já interpolado — é o texto que o dono vê de verdade.
    t: (_k: string, def?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const base = typeof def === 'string' ? def : '';
      const v = (typeof def === 'object' ? def : vars) || {};
      return base.replace(/\{\{(\w+)\}\}/g, (_m, k) => String((v as Record<string, unknown>)[k] ?? ''));
    },
    i18n: { language: 'pt' },
  }),
}));

const COMPLETO: Partial<OnboardingData> = {
  restaurant_name: 'Mocotó',
  city: 'São Paulo',
  restaurant_type: 'casual_dining',
  phone_number: '(11) 2951-4121',
  email: 'contato@mocoto.com.br',
  business_hours: [{ day: 'Monday', is_open: true, open_time: '12:00', close_time: '23:00' }],
} as Partial<OnboardingData>;

function montar(over: Partial<OnboardingData> = {}, props: Record<string, unknown> = {}) {
  const onConcluir = vi.fn();
  const updateData = vi.fn();
  const onEscolherVoz = vi.fn();
  render(
    <FolhaDeConfirmacao
      data={{ ...COMPLETO, ...over } as OnboardingData}
      updateData={updateData}
      vozEscolhida="neighborhood"
      onEscolherVoz={onEscolherVoz}
      onConcluir={onConcluir}
      {...props}
    />,
  );
  return { onConcluir, updateData, onEscolherVoz };
}

describe('FolhaDeConfirmacao', () => {
  test('abre com o que já sabemos, não com um formulário vazio', () => {
    montar();
    expect(screen.getByText(/Achamos isto sobre o Mocotó/)).toBeInTheDocument();
    expect(screen.getByText(/Mocotó · São Paulo/)).toBeInTheDocument();
  });

  test('com tudo preenchido, o botão libera', () => {
    const { onConcluir } = montar();
    const botao = screen.getByRole('button', { name: /Colocar no ar/ });
    expect(botao).not.toBeDisabled();
    fireEvent.click(botao);
    expect(onConcluir).toHaveBeenCalled();
  });

  // Um botão desabilitado sem dizer por quê é a pior tela do produto. O
  // rodapé precisa NOMEAR o que falta, não só travar.
  describe('o rodapé nomeia a pendência', () => {
    test('sem telefone', () => {
      montar({ phone_number: '' });
      expect(screen.getByText(/Falta o telefone/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Colocar no ar/ })).toBeDisabled();
    });

    test('sem horário aberto', () => {
      montar({ business_hours: [{ day: 'Monday', is_open: false, open_time: '', close_time: '' }] } as Partial<OnboardingData>);
      expect(screen.getByText(/Falta os horários/)).toBeInTheDocument();
    });

    test('lista várias pendências de uma vez', () => {
      montar({ phone_number: '', city: '' });
      const texto = screen.getByText(/^Falta /).textContent || '';
      expect(texto).toContain('a cidade');
      expect(texto).toContain('o telefone');
    });

    test('sem voz escolhida', () => {
      montar({}, { vozEscolhida: null });
      expect(screen.getByText(/Falta a voz da recepcionista/)).toBeInTheDocument();
    });
  });

  // O demo grava um placeholder @demo.seatable.one só para satisfazer o NOT
  // NULL. Deixá-lo passar é entregar um dono que não recebe confirmação de
  // reserva nenhuma — a coluna está preenchida e o cliente está incomunicável.
  describe('o e-mail placeholder do demo', () => {
    test('conta como ausente, não como preenchido', () => {
      montar({ email: 'mocoto@demo.seatable.one' });
      expect(screen.getByText(/Falta o e-mail/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Colocar no ar/ })).toBeDisabled();
    });

    test('não aparece dentro do campo, para o dono não achar que já respondeu', () => {
      montar({ email: 'mocoto@demo.seatable.one' });
      const campo = screen.getByLabelText('o e-mail') as HTMLInputElement;
      expect(campo.value).toBe('');
    });
  });

  test('a fonte do dado aparece — "pesquisou" não é a mesma coisa que "adivinhou"', () => {
    montar({}, { veioDoDemo: false });
    expect(screen.getAllByText(/do seu Google/).length).toBeGreaterThan(0);
  });

  test('quando veio do demo, a fonte muda', () => {
    montar({}, { veioDoDemo: true });
    expect(screen.getAllByText(/você configurou no demo/).length).toBeGreaterThan(0);
  });

  test('enviando trava o botão e avisa', () => {
    montar({}, { enviando: true });
    const botao = screen.getByRole('button', { name: /Colocando no ar/ });
    expect(botao).toBeDisabled();
  });

  // Progresso é a métrica do formulário — mede o quanto ainda falta VOCÊ
  // fazer. A folha mede o oposto.
  test('não existe barra de progresso nem contagem de passos', () => {
    const { container } = (montar(), { container: document.body });
    expect(container.textContent).not.toMatch(/passo \d|step \d|\d de \d/i);
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
  });

  test('editar um campo propaga para cima', () => {
    const { updateData } = montar({ phone_number: '' });
    fireEvent.change(screen.getByLabelText('o telefone'), { target: { value: '11999999999' } });
    expect(updateData).toHaveBeenCalledWith({ phone_number: '11999999999' });
  });
});

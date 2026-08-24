/**
 * ConversaPrimeiro — Ato 1 do Demo em Conversa (F2).
 *
 * Prende o contrato do overlay:
 *  1. nunca prende o dono — "pular" está sempre disponível e devolve null;
 *  2. quando a IA fecha reserva, a saída vira o CTA de payoff e devolve o
 *     booking para o painel inserir a reserva.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ConversaPrimeiro from '../ConversaPrimeiro';
import type { DemoChatBooking } from '../DemoWhatsAppSim';
import type { DemoStrings } from '../../../hooks/useDemoLocale';

const BOOKING: DemoChatBooking = {
  date: '2026-08-29',
  time: '20:00',
  party_size: 4,
  name: 'João Pedro Nascimento',
};

// O sim real chama /api/demo-chat; aqui só precisamos do gatilho onBooking.
vi.mock('../DemoWhatsAppSim', () => ({
  default: ({ onBooking }: { onBooking?: (b: DemoChatBooking) => void }) => (
    <button type="button" onClick={() => onBooking?.(BOOKING)}>
      simular booking
    </button>
  ),
}));

const t = {
  convEyebrow: 'Seu demo começa numa conversa',
  convTitle: 'Fale com a sua recepcionista IA — como se você fosse um cliente',
  convSkip: 'Pular e ver o painel →',
  convBooked: 'Reserva confirmada — veja ela cair no seu painel',
  convBookedCta: 'Ver no painel',
} as unknown as DemoStrings;

function renderOverlay(onDone = vi.fn()) {
  render(
    <ConversaPrimeiro
      restaurantName="Cantina da Praça"
      lang="pt-BR"
      restaurantId="rest-1"
      t={t}
      onDone={onDone}
    />,
  );
  return onDone;
}

describe('ConversaPrimeiro', () => {
  it('mostra a conversa com saída de escape sempre visível', () => {
    const onDone = renderOverlay();
    expect(screen.getByText(t.convTitle)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /pular e ver o painel/i }));
    expect(onDone).toHaveBeenCalledWith(null);
  });

  it('booking troca o skip pelo CTA de payoff e devolve a reserva', async () => {
    const onDone = renderOverlay();
    fireEvent.click(screen.getByRole('button', { name: /simular booking/i }));

    // findBy*: o AnimatePresence (mode="wait") só monta o bloco de payoff
    // depois da animação de saída do link de pular.
    expect(await screen.findByText(/Reserva confirmada/)).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: t.convBookedCta }));
    expect(onDone).toHaveBeenCalledWith(BOOKING);
  });
});

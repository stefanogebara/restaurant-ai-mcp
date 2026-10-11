import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuickInterventionModal from '../QuickInterventionModal';

const mutate = vi.fn();

vi.mock('@tanstack/react-query', () => ({
  useMutation: () => ({ mutate, isPending: false, isSuccess: false }),
}));

vi.mock('../../../services/api', () => ({ authFetch: vi.fn() }));

const reservation = {
  reservation_id: 'reservation-1',
  customer_name: 'Ana Silva',
  party_size: 2,
  date: '2026-09-30',
  time: '19:00',
  ml_risk_level: 'high',
  ml_risk_score: 72,
};

describe('QuickInterventionModal', () => {
  beforeEach(() => mutate.mockReset());

  it('shows Portuguese labels and a risk score, not a probability', () => {
    render(<QuickInterventionModal reservation={reservation} isOpen onClose={vi.fn()} language="pt-BR" />);

    expect(screen.getByRole('dialog', { name: 'Tomar uma ação' })).toBeInTheDocument();
    expect(screen.getByText('Alto · 72/100')).toBeInTheDocument();
    expect(screen.queryByText('72%')).not.toBeInTheDocument();
    expect(screen.getByText('Ações rápidas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fechar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registrar ação' })).toBeInTheDocument();
  });

  it('localizes the recorded action and uses the positive status colour', () => {
    render(
      <QuickInterventionModal
        reservation={{ ...reservation, intervention_taken: true, intervention_type: 'whatsapp_reminder' }}
        isOpen
        onClose={vi.fn()}
        language="pt-BR"
      />,
    );

    expect(screen.getByText('Ação já registrada')).toBeInTheDocument();
    expect(screen.getAllByText(/Enviei WhatsApp/)).toHaveLength(2);
    expect(screen.getByText('Ação já registrada').parentElement?.parentElement).toHaveClass('bg-emerald-500/10');
  });

  it('logs the selected action without changing its API identifier', async () => {
    const user = userEvent.setup();
    render(<QuickInterventionModal reservation={reservation} isOpen onClose={vi.fn()} language="pt-BR" />);

    await user.click(screen.getByRole('button', { name: 'Enviei SMS' }));
    await user.type(screen.getByPlaceholderText('Digite seu nome'), 'Carla');
    await user.click(screen.getByRole('button', { name: 'Registrar ação' }));

    expect(mutate).toHaveBeenCalledWith({
      reservation_id: 'reservation-1',
      intervention_type: 'sms_reminder',
      staff_name: 'Carla',
      notes: '',
    });
  });
});

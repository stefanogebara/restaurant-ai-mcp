import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from 'i18next';
import CustomerIntelligenceCard from '../CustomerIntelligenceCard';

const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }));
vi.mock('../../../hooks/useLTVData', () => ({
  useLTVAtRisk: () => ({ data: [{
    customer_id: 'guest-1', customer_name: 'Diego Souza', total_visits: 2,
    churn_risk_score: 100, last_visit_date: '2026-04-21',
  }], isLoading: false }),
  useLTVTopVIPs: () => ({ data: [], isLoading: false }),
  useSendCampaign: () => ({ mutate: mockSend, isPending: false }),
}));
vi.mock('../../../contexts/ToastContext', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));
vi.mock('../../common/ThiingsIcon', () => ({ default: () => <span aria-hidden="true" /> }));

afterEach(async () => {
  await i18n.changeLanguage('en');
  vi.clearAllMocks();
});

describe('CustomerIntelligenceCard', () => {
  it('presents a heuristic score, not a probability', async () => {
    await i18n.changeLanguage('pt-BR');
    render(<CustomerIntelligenceCard />);

    expect(screen.getByText('100/100')).toBeInTheDocument();
    expect(screen.queryByText('100%')).not.toBeInTheDocument();
    expect(screen.getByText(/Pontuação de risco acima de 70\/100/)).toBeInTheDocument();
  });

  it.each([
    ['pt-BR', 'Será um prazer receber você novamente em nosso restaurante. Esperamos ver você em breve.'],
    ['en', "We'd love to welcome you back to our restaurant. We hope to see you again soon."],
    ['es', 'Nos encantará recibirte de nuevo en nuestro restaurante. Esperamos verte pronto.'],
  ])('uses a neutral, localized draft in %s without sending it', async (language, expected) => {
    await i18n.changeLanguage(language);
    const user = userEvent.setup();
    render(<CustomerIntelligenceCard />);

    await user.click(screen.getByRole('button', { name: /Enviar|Send/i }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('textbox', { name: /Mensagem|Message|Mensaje/i })).toHaveValue(expected);
    expect(screen.queryByText(/complimentary welcome drink/i)).not.toBeInTheDocument();
    expect(mockSend).not.toHaveBeenCalled();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('updates an untouched draft when the email language changes', async () => {
    await i18n.changeLanguage('pt-BR');
    const user = userEvent.setup();
    render(<CustomerIntelligenceCard />);
    await user.click(screen.getByRole('button', { name: 'Enviar' }));

    await user.selectOptions(screen.getByRole('combobox', { name: 'Idioma do e-mail' }), 'en');
    expect(screen.getByRole('textbox', { name: 'Mensagem' })).toHaveValue("We'd love to welcome you back to our restaurant. We hope to see you again soon.");
    expect(mockSend).not.toHaveBeenCalled();
  });
});

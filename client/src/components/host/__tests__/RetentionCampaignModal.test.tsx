import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from 'i18next';
import { RetentionCampaignModal } from '../RetentionCampaignModal';

vi.mock('../../common/ThiingsIcon', () => ({ default: () => <span aria-hidden="true" /> }));

const customer = {
  customer_id: 'guest-1', customer_name: 'Diego Souza', churn_risk_score: 100,
  lifetime_value: 200, last_visit_date: '2026-04-21', total_visits: 2,
};

afterEach(async () => {
  await i18n.changeLanguage('en');
});

describe('RetentionCampaignModal', () => {
  it.each([
    ['pt-BR', 'Olá {name}, será um prazer receber você novamente em nosso restaurante. Esperamos ver você em breve.'],
    ['en', "Hi {name}, we'd love to welcome you back to our restaurant. We hope to see you again soon."],
    ['es', 'Hola {name}, nos encantará recibirte de nuevo en nuestro restaurante. Esperamos verte pronto.'],
  ])('uses a neutral draft in %s and shows a score rather than probability', async (language, draft) => {
    await i18n.changeLanguage(language);
    render(<RetentionCampaignModal isOpen onClose={vi.fn()} customer={customer} onSendCampaign={vi.fn()} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue(draft);
    expect(screen.getByText('100/100')).toBeInTheDocument();
    expect(screen.queryByText(/15%|complimentary dessert|priority seating/i)).not.toBeInTheDocument();
  });

  it('does not fall back to a template after the owner clears the message', async () => {
    await i18n.changeLanguage('pt-BR');
    const send = vi.fn();
    render(<RetentionCampaignModal isOpen onClose={vi.fn()} customer={customer} onSendCampaign={send} />);
    const user = userEvent.setup();

    await user.clear(screen.getByRole('textbox'));

    expect(screen.getByRole('textbox')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Enviar Campanha' })).toBeDisabled();
    expect(send).not.toHaveBeenCalled();
  });

  it('shows a real failure state when the simulated email send is rejected', async () => {
    await i18n.changeLanguage('pt-BR');
    const send = vi.fn().mockRejectedValue(new Error('provider rejected'));
    render(<RetentionCampaignModal isOpen onClose={vi.fn()} customer={customer} onSendCampaign={send} />);

    await userEvent.click(screen.getByRole('button', { name: 'Enviar Campanha' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('O e-mail não foi enviado.');
    expect(send).toHaveBeenCalledWith('guest-1', 'win_back', expect.stringContaining('Diego Souza'), 'pt-BR');
  });

  it('keeps the selected email language aligned with the preview and send payload', async () => {
    await i18n.changeLanguage('pt-BR');
    const send = vi.fn().mockResolvedValue(undefined);
    render(<RetentionCampaignModal isOpen onClose={vi.fn()} customer={customer} onSendCampaign={send} />);
    const user = userEvent.setup();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Idioma do e-mail' }), 'es');
    expect(screen.getByRole('textbox')).toHaveValue('Hola {name}, nos encantará recibirte de nuevo en nuestro restaurante. Esperamos verte pronto.');
    await user.click(screen.getByRole('button', { name: 'Enviar Campanha' }));

    expect(send).toHaveBeenCalledWith('guest-1', 'win_back', expect.stringContaining('Hola Diego Souza,'), 'es');
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from 'i18next';
import CampaignsPage from '../CampaignsPage';

vi.mock('../../components/layout/DashboardLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock('../../components/campaigns/CampaignList', () => ({
  default: () => <div>Histórico de teste</div>,
}));
vi.mock('../../components/campaigns/CampaignAutomationsPanel', () => ({
  default: () => <div>Automações de teste</div>,
}));

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR');
});

afterEach(async () => {
  await i18n.changeLanguage('en');
});

describe('CampaignsPage', () => {
  it('does not offer a send action while manual delivery is unverified', () => {
    render(<CampaignsPage />);

    expect(screen.getByRole('heading', { name: 'Campanhas' })).toBeInTheDocument();
    expect(screen.getByText(/O envio manual está pausado/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nova Campanha' })).not.toBeInTheDocument();
    expect(screen.getByText('Histórico de teste')).toBeInTheDocument();
  });

  it('switches to existing automations without changing them', async () => {
    render(<CampaignsPage />);

    await userEvent.click(screen.getByRole('button', { name: 'Automações' }));

    expect(screen.getByText('Automações de teste')).toBeInTheDocument();
    expect(screen.queryByText('Histórico de teste')).not.toBeInTheDocument();
  });
});

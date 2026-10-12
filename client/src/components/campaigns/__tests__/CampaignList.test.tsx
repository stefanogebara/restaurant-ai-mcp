import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from 'i18next';
import type { Campaign } from '../../../hooks/useCampaigns';
import CampaignList from '../CampaignList';

const { mockUseCampaignList } = vi.hoisted(() => ({ mockUseCampaignList: vi.fn() }));

vi.mock('../../../hooks/useCampaigns', () => ({ useCampaignList: mockUseCampaignList }));
vi.mock('../CampaignDetail', () => ({ default: () => <div>Delivery details</div> }));
vi.mock('../../common/ThiingsIcon', () => ({ default: ({ name }: { name: string }) => <span>{name}</span> }));

const campaign: Campaign = {
  id: 'camp-1', name: 'Noite VIP', campaign_type: 'win_back',
  message: 'Volte para jantar conosco', channel: 'whatsapp', status: 'pending',
  scheduled_at: null, sent_count: 0, delivered_count: 0, read_count: 0,
  failed_count: 0, created_at: '2026-04-02T08:14:00Z', segment_name: 'vip',
  whatsapp_template_name: null, recipient_count: 0,
};

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR');
  mockUseCampaignList.mockReturnValue({ data: [campaign], isLoading: false, isError: false, refetch: vi.fn() });
});

afterEach(async () => {
  await i18n.changeLanguage('en');
  vi.clearAllMocks();
});

describe('CampaignList', () => {
  it('uses the saved name and localized pending state without inventing a recipient total', () => {
    render(<CampaignList />);

    expect(screen.getByText('Noite VIP')).toBeInTheDocument();
    expect(screen.getByText('Pendente')).toBeInTheDocument();
    expect(screen.getByText('Volte para jantar conosco')).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
    expect(screen.queryByText(/Apr 2/)).not.toBeInTheDocument();
  });

  it('expands details with an accessible button', async () => {
    render(<CampaignList />);
    const button = screen.getByRole('button', { name: /Noite VIP/ });
    expect(button).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(button);

    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Delivery details')).toBeInTheDocument();
  });

  it('shows a retry action when loading fails', async () => {
    const refetch = vi.fn();
    mockUseCampaignList.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch });
    render(<CampaignList />);

    expect(screen.getByRole('alert')).toHaveTextContent('Não conseguimos carregar suas campanhas.');
    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(refetch).toHaveBeenCalledOnce();
  });
});

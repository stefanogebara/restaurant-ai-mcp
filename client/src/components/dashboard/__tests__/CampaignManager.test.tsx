import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import CampaignManager from '../CampaignManager';
import { useCampaignList, useCampaignDeliveryStats, type Campaign } from '../../../hooks/useCampaigns';

vi.mock('../../../hooks/useCampaigns', () => ({
  useCampaignList: vi.fn(),
  useCampaignDeliveryStats: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'pt-BR' },
    t: (key: string) => key,
  }),
}));

const campaign = (overrides: Partial<Campaign> = {}): Campaign => ({
  id: 'campaign-1',
  campaign_type: 'win_back',
  message: 'Olá {name}',
  channel: 'email',
  status: 'active',
  scheduled_at: null,
  sent_count: 0,
  delivered_count: 0,
  read_count: 0,
  failed_count: 0,
  created_at: '2026-09-30T12:00:00.000Z',
  segment_name: 'at_risk',
  whatsapp_template_name: null,
  recipient_count: 3,
  ...overrides,
});

describe('CampaignManager', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(useCampaignList).mockReturnValue({
      data: [campaign(), campaign({ id: 'whatsapp-1', channel: 'whatsapp' })],
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useCampaignList>);
    vi.mocked(useCampaignDeliveryStats).mockReturnValue({
      data: { total: 3, pending: 2, sent: 1, delivered: 0, read: 0, failed: 0, opted_out: 0 },
      isError: false,
    } as ReturnType<typeof useCampaignDeliveryStats>);
  });

  it('shows legacy email history and stats without offering unsupported bulk delivery', () => {
    render(<CampaignManager />);

    expect(screen.getByText('campaigns.emailUnavailable')).toBeInTheDocument();
    expect(screen.getByText('campaigns.deliveryDisabled')).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByText('campaigns.newCampaign')).not.toBeInTheDocument();
    expect(screen.queryByText('campaigns.sendNow')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /campaigns.segmentAtRisk/ }));

    expect(screen.getByText('campaigns.delivered')).toBeInTheDocument();
    expect(screen.getByText('campaigns.read')).toBeInTheDocument();
    expect(vi.mocked(useCampaignDeliveryStats)).toHaveBeenCalledWith('campaign-1');
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('does not present unavailable bulk email as a primary action when only WhatsApp history exists', () => {
    vi.mocked(useCampaignList).mockReturnValue({
      data: [campaign({ id: 'whatsapp-1', channel: 'whatsapp' })],
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useCampaignList>);

    render(<CampaignManager />);

    expect(screen.queryByRole('heading', { name: 'campaigns.title' })).not.toBeInTheDocument();
    expect(screen.queryByText('campaigns.segmentAtRisk')).not.toBeInTheDocument();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from 'i18next';
import CampaignManager from '../CampaignManager';

const { mockUseCampaignList } = vi.hoisted(() => ({ mockUseCampaignList: vi.fn() }));
vi.mock('../../../hooks/useCampaigns', () => ({ useCampaignList: mockUseCampaignList }));
vi.mock('../../common/ThiingsIcon', () => ({ default: () => <span aria-hidden="true" /> }));

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR');
  mockUseCampaignList.mockReturnValue({ data: [{ id: 'one', name: 'Jantar de outubro', message: 'Olá' }], isLoading: false, isError: false });
});
afterEach(async () => {
  await i18n.changeLanguage('en');
  vi.clearAllMocks();
});

describe('CampaignManager overview', () => {
  it('links to history without exposing creation or send actions', () => {
    render(<MemoryRouter><CampaignManager /></MemoryRouter>);

    expect(screen.getByText('Jantar de outubro')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver campanhas' })).toHaveAttribute('href', '/host-dashboard/campaigns');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText(/O envio manual está pausado/)).toBeInTheDocument();
  });
});

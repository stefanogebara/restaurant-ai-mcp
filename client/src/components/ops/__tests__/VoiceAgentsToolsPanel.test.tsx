import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../../test/renderWithProviders';

const get = vi.fn();
const post = vi.fn();
vi.mock('../../../services/api', () => ({ api: { get: (...a: unknown[]) => get(...a), post: (...a: unknown[]) => post(...a) } }));

import VoiceAgentsToolsPanel from '../VoiceAgentsToolsPanel';

const rows = [
  { restaurant_id: 'a0000000-0000-4000-8000-000000000001', restaurant_name: 'Osteria del Sole', status: 'outdated', reasons: ['lookup_reservation outdated'] },
  { restaurant_id: 'a0000000-0000-4000-8000-000000000002', restaurant_name: 'Mocotó', status: 'outdated', reasons: ['cancel_reservation outdated'] },
  { restaurant_id: 'a0000000-0000-4000-8000-000000000003', restaurant_name: 'Lu', status: 'ok', reasons: [] },
  { restaurant_id: 'a0000000-0000-4000-8000-000000000004', restaurant_name: 'Bottega', status: 'invalid', reasons: ['modify_reservation missing'] },
];

beforeEach(() => {
  get.mockReset().mockResolvedValue({ data: { success: true, rows } });
  post.mockReset().mockResolvedValue({ data: { success: true, changed: true } });
});

describe('VoiceAgentsToolsPanel', () => {
  it('offers updates only for outdated agents', async () => {
    renderWithProviders(<VoiceAgentsToolsPanel />);
    expect(await screen.findByText('Osteria del Sole')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Atualizar todas (2)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Atualizar ferramentas de Mocotó' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Atualizar ferramentas de Lu' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Atualizar ferramentas de Bottega' })).not.toBeInTheDocument();
    expect(screen.getByText('Precisa de revisão')).toBeInTheDocument();
  });

  it('"update all" calls one restaurant at a time, in order, then rereads', async () => {
    renderWithProviders(<VoiceAgentsToolsPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Atualizar todas (2)' }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(post.mock.calls.map(c => c[0])).toEqual([
      '/elevenlabs-voice-settings?action=admin_tools_sync&restaurant_id=a0000000-0000-4000-8000-000000000001',
      '/elevenlabs-voice-settings?action=admin_tools_sync&restaurant_id=a0000000-0000-4000-8000-000000000002',
    ]);
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  });
});

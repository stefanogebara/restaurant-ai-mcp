import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../../test/renderWithProviders';

const get = vi.fn();
const post = vi.fn();
vi.mock('../../../services/api', () => ({ api: { get: (...a: unknown[]) => get(...a), post: (...a: unknown[]) => post(...a) } }));

import VoiceAgentsLanguagePanel from '../VoiceAgentsLanguagePanel';

const rows = [
  { restaurant_id: '152dc287-46e6-4139-b8eb-12d1877b121f', restaurant_name: 'Osteria del Sole', agent_language: 'pt',
    agent: { language: 'en', model: 'eleven_flash_v2', summary: 'en' }, status: 'mismatch', reasons: ['language en != pt'] },
  { restaurant_id: '27b0272b-fd5f-41e2-81c0-e27faca99ac6', restaurant_name: 'Casa del Sol', agent_language: 'es',
    agent: { language: 'es', model: 'eleven_flash_v2_5', summary: 'es' }, status: 'ok', reasons: [] },
];

beforeEach(() => {
  get.mockReset().mockResolvedValue({ data: { success: true, rows } });
  post.mockReset().mockResolvedValue({ data: { success: true, changed: true,
    after: { ...rows[0], agent: { language: 'pt', model: 'eleven_flash_v2_5', summary: 'pt-br' }, status: 'ok', reasons: [] } } });
});

describe('VoiceAgentsLanguagePanel', () => {
  it('lists every own agent and offers sync only where the language differs', async () => {
    renderWithProviders(<VoiceAgentsLanguagePanel />);
    expect(await screen.findByText('Osteria del Sole')).toBeInTheDocument();
    expect(screen.getByText('Casa del Sol')).toBeInTheDocument();
    expect(screen.getByText('Diferente')).toBeInTheDocument();
    expect(screen.getByText('Em dia')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sincronizar Osteria del Sole' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sincronizar Casa del Sol' })).not.toBeInTheDocument();
    expect(get).toHaveBeenCalledWith('/elevenlabs-voice-settings?action=admin_language_report');
  });

  it('syncs only the restaurant clicked, then reads the report again', async () => {
    renderWithProviders(<VoiceAgentsLanguagePanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sincronizar Osteria del Sole' }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post).toHaveBeenCalledWith('/elevenlabs-voice-settings?action=admin_language_sync&restaurant_id=152dc287-46e6-4139-b8eb-12d1877b121f');
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  });
});

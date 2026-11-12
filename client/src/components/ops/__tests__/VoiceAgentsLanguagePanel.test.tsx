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

  // 2026-11-12: a prompt fix (today's date) reaches an agent only by a sync.
  // The bulk button updates old instructions and never touches a language
  // mismatch (Race Demo was left in Spanish on purpose).
  it('updates old instructions in bulk, one by one, and skips language mismatches', async () => {
    const outdated = [
      { restaurant_id: 'ecac1531-d66e-481e-8717-871f94894c5c', restaurant_name: 'Trattoria E2E Teste', agent_language: 'pt',
        agent: { language: 'pt', model: 'eleven_flash_v2_5', summary: 'pt-br' }, status: 'outdated', reasons: ['prompt outdated'] },
      { restaurant_id: '416e4e2b-93e1-449c-9422-843c7782d582', restaurant_name: 'V2 Audit Trattoria', agent_language: 'pt',
        agent: { language: 'pt', model: 'eleven_flash_v2_5', summary: 'pt-br' }, status: 'outdated', reasons: ['prompt outdated'] },
    ];
    get.mockResolvedValue({ data: { success: true, rows: [...rows, ...outdated] } });
    renderWithProviders(<VoiceAgentsLanguagePanel />);
    expect(await screen.findAllByText('Instruções antigas')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Atualizar instruções de Trattoria E2E Teste' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar instruções (2)' }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(post.mock.calls.map(([url]) => url)).toEqual([
      '/elevenlabs-voice-settings?action=admin_language_sync&restaurant_id=ecac1531-d66e-481e-8717-871f94894c5c',
      '/elevenlabs-voice-settings?action=admin_language_sync&restaurant_id=416e4e2b-93e1-449c-9422-843c7782d582',
    ]);
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../../test/renderWithProviders';

const get = vi.fn();
const post = vi.fn();
vi.mock('../../../services/api', () => ({ api: { get: (...a: unknown[]) => get(...a), post: (...a: unknown[]) => post(...a) } }));

import VoiceAgentsOrphanToolsPanel from '../VoiceAgentsOrphanToolsPanel';

// 15/11/2026: 758 tools in ElevenLabs, ~396 of restaurants that no longer
// exist. Counting is on demand; deletion goes in batches of 25 and the
// no-restaurant group has its own button.
const missing = Array.from({ length: 30 }, (_, i) => `tool_m${i}`);
const list = { counts: { total: 40, existing_restaurant: 5, missing_restaurant: 30, missing_restaurants: 4, unscoped: 3, foreign_host: 2, not_webhook: 0 },
  missing_restaurant: missing, unscoped: ['tool_u1', 'tool_u2', 'tool_u3'] };
const summary = (deleted: number) => ({ deleted, already_gone: 0, kept_in_use: 0, refused: 0, failed: 0, dependent_agent_statuses: { 404: deleted } });

beforeEach(() => {
  get.mockReset().mockResolvedValue({ data: list });
  post.mockReset().mockImplementation(async (_url: string, body: { tool_ids: string[] }) => ({ data: { summary: summary(body.tool_ids.length) } }));
});

describe('VoiceAgentsOrphanToolsPanel', () => {
  it('reads nothing until asked, then shows the groups', async () => {
    renderWithProviders(<VoiceAgentsOrphanToolsPanel />);
    expect(get).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Contar sobras' }));
    expect(await screen.findByText('30 (4 restaurantes)')).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith('/elevenlabs-voice-settings?action=admin_tools_orphans');
  });

  it('deletes the missing-restaurant group in batches of 25 and never sends the no-restaurant ids with it', async () => {
    renderWithProviders(<VoiceAgentsOrphanToolsPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Contar sobras' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Apagar 30 de restaurantes que não existem' }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(post.mock.calls.map(([, body]) => [body.bucket, body.tool_ids.length])).toEqual([['missing_restaurant', 25], ['missing_restaurant', 5]]);
    expect(post.mock.calls.flatMap(([, body]) => body.tool_ids)).not.toContain('tool_u1');
    expect(await screen.findByText(/30 apagadas/)).toBeInTheDocument();
  });
});

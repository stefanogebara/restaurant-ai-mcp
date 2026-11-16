import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../../test/renderWithProviders';

const get = vi.fn();
const post = vi.fn();
vi.mock('../../../services/api', () => ({ api: { get: (...a: unknown[]) => get(...a), post: (...a: unknown[]) => post(...a) } }));

import VoiceAgentsOrphanAgentsPanel from '../VoiceAgentsOrphanAgentsPanel';

// 16/11/2026: old test agents of deleted restaurants. Classification pages
// through the server; deletion goes 5 at a time and only sends orphans.
const row = (id: string, name: string, bucket: string) => ({ agent_id: id, name, bucket, reason: null, missing_restaurants: bucket === 'orphan' ? 1 : 0 });
const page1 = [...Array.from({ length: 6 }, (_, i) => row(`agent_o${i}`, `Link Test ${i} AI Host`, 'orphan')), row('agent_orch', 'Seatable Orchestrator v2', 'kept_named')];
const page2 = [row('agent_o6', 'Probe AI Host', 'orphan'), row('agent_u1', 'Murillo AI Receptionist', 'unproven')];

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  get.mockReset().mockImplementation(async (url: string) => ({ data: url.includes('cursor=') ? { rows: page2, next_cursor: null } : { rows: page1, next_cursor: 'c2' } }));
  post.mockReset().mockImplementation(async (_url: string, body: { agent_ids: string[] }) => ({ data: { results: body.agent_ids.map(id => ({ id, outcome: 'deleted' })) } }));
});

describe('VoiceAgentsOrphanAgentsPanel', () => {
  it('reads every page before showing groups, and sends only orphans in batches of 5', async () => {
    renderWithProviders(<VoiceAgentsOrphanAgentsPanel />);
    expect(get).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Classificar agentes' }));
    const removeButton = await screen.findByRole('button', { name: 'Apagar 7 agentes de restaurantes que não existem' }, { timeout: 5000 });
    expect(get).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Mantidos pela sua lista')).toBeInTheDocument();
    fireEvent.click(removeButton);
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2), { timeout: 8000 });
    const sent = post.mock.calls.map(([, body]) => body.agent_ids);
    expect(sent.map(ids => ids.length)).toEqual([5, 2]);
    expect(sent.flat()).not.toContain('agent_orch');
    expect(sent.flat()).not.toContain('agent_u1');
    expect(await screen.findByText(/7 apagados/)).toBeInTheDocument();
  });
});

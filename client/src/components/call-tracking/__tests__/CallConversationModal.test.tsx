import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import i18n from 'i18next';
import CallConversationModal from '../CallConversationModal';
import type { Conversation } from '../callTrackingTypes';

afterEach(async () => { await i18n.changeLanguage('en'); });

function renderTool(success: unknown) {
  const conversation = {
    id: 'call-row', conversation_id: 'provider-call',
    caller_phone: '+551150283918', called_phone: '+551150289356',
    started_at: '2026-11-09T13:00:32Z', ended_at: '2026-11-09T13:01:36Z',
    duration_seconds: 64, language: 'pt', outcome: 'information_only',
    tools_used: [{ tool_name: 'check_availability', success }], transcript: [],
  } as unknown as Conversation;
  render(<CallConversationModal conversation={conversation} onClose={vi.fn()} timeZone="America/Sao_Paulo" timeZoneLabel="São Paulo" />);
}

describe('Call tool result status', () => {
  it.each([null, undefined, 'false', 0])('does not report an unknown result (%s) as failure or success', success => {
    renderTool(success);
    expect(screen.getByText('Result not recorded')).toBeVisible();
    expect(screen.queryByText('Completed')).not.toBeInTheDocument();
    expect(screen.queryByText('Failed')).not.toBeInTheDocument();
    expect(screen.getByText('Information Only')).toBeVisible();
    expect(screen.getByText('1m 4s')).toBeVisible();
  });

  it('reports success only for an explicit successful result', () => {
    renderTool(true);
    expect(screen.getByText('Completed')).toBeVisible();
    expect(screen.queryByText('Failed')).not.toBeInTheDocument();
  });

  it('reports failure only for an explicit failed result', () => {
    renderTool(false);
    expect(screen.getByText('Failed')).toBeVisible();
    expect(screen.queryByText('Completed')).not.toBeInTheDocument();
  });

  it.each([
    ['pt-BR', 'Resultado não registrado'],
    ['es', 'Resultado no registrado'],
  ])('explains an unknown result in %s', async (language, label) => {
    await i18n.changeLanguage(language);
    renderTool(null);
    expect(screen.getByText(label)).toBeVisible();
  });
});

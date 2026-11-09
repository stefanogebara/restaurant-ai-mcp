import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import i18n from 'i18next';
import CallConversationModal from '../CallConversationModal';
import type { Conversation } from '../callTrackingTypes';

afterEach(async () => { await act(async () => { await i18n.changeLanguage('en'); }); });

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

function renderCall(overrides: Partial<Conversation> = {}) {
  const conversation = {
    id: 'call-row', conversation_id: 'provider-call', caller_phone: '+551150283918', called_phone: '+551150289356',
    started_at: '2026-11-09T13:00:32Z', ended_at: '2026-11-09T13:01:36Z',
    duration_seconds: 64, language: 'pt', outcome: 'information_only', transcript: [], ...overrides,
  } as Conversation;
  render(<CallConversationModal conversation={conversation} onClose={vi.fn()} timeZone="America/Sao_Paulo" timeZoneLabel="São Paulo" />);
}

describe('Call details speak only from recorded data', () => {
  it('omits empty provider tool turns while retaining both speakers and their words', () => {
    renderCall({ transcript: [
      { role: 'agent', content: 'How can I help?' },
      { role: 'agent', content: '' },
      { role: 'agent', content: '  \n ' },
      { role: 'user', content: 'Only check availability, please.' },
    ] });
    expect(screen.getByText('How can I help?')).toBeVisible();
    expect(screen.getByText('Only check availability, please.')).toBeVisible();
    expect(screen.getAllByText('Agent', { exact: true })).toHaveLength(1);
    expect(screen.getAllByText('Customer', { exact: true })).toHaveLength(1);
  });

  it('shows the empty transcript state when the provider supplied only silent turns', () => {
    renderCall({ transcript: [{ role: 'agent', content: '' }, { role: 'user', content: '   ' }] });
    expect(screen.getByText('No transcript available for this conversation.')).toBeVisible();
    expect(screen.queryByText('Agent', { exact: true })).not.toBeInTheDocument();
  });

  it('explains missing final data without presenting the initial English placeholder as detected language', () => {
    renderCall({ ended_at: undefined, duration_seconds: undefined, outcome: undefined, language: 'en' });
    expect(screen.getByText('Awaiting call result')).toBeVisible();
    expect(screen.getByText('Awaiting final duration')).toBeVisible();
    expect(screen.getByText('Available after the call')).toBeVisible();
    expect(screen.getByText('Awaiting the call transcript.')).toBeVisible();
    expect(screen.queryByText(/^en$/i)).not.toBeInTheDocument();
  });

  it('retains a known booking result even when final call metadata is pending', () => {
    renderCall({ ended_at: undefined, duration_seconds: undefined, outcome: 'reservation_created', language: 'en' });
    expect(screen.getByText('Reservation Created')).toBeVisible();
    expect(screen.getByText('Awaiting final duration')).toBeVisible();
  });

  it('uses a human activity name for an availability invocation', () => {
    renderCall({ tools_used: [{ tool_name: 'check_availability', success: true }] });
    expect(screen.getByText('Availability check')).toBeVisible();
    expect(screen.queryByText('check_availability')).not.toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeVisible();
  });
});

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


describe('Call detail dialog lifecycle', () => {
  const conversation = {
    id: 'call-row', conversation_id: 'provider-call', caller_phone: '+551150283918',
    called_phone: '+551150289356', started_at: '2026-11-09T13:00:32Z', language: 'pt', transcript: [],
  } as Conversation;

  it('keeps keyboard focus in place when polling refreshes data and the inline close callback changes', () => {
    const firstClose = vi.fn();
    const latestClose = vi.fn();
    const { rerender } = render(<CallConversationModal conversation={conversation} onClose={firstClose} timeZoneLabel="São Paulo" />);
    const close = screen.getAllByRole('button', { name: 'Close' })[0];
    close.focus();
    rerender(<CallConversationModal conversation={{ ...conversation, summary: 'Updated summary' }} onClose={latestClose} timeZoneLabel="São Paulo" />);
    expect(close).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(firstClose).not.toHaveBeenCalled();
    expect(latestClose).toHaveBeenCalledOnce();
  });

  it('restores the previous scroll lock and trigger focus only when closed', () => {
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();
    document.body.style.overflow = 'clip';
    const { unmount } = render(<CallConversationModal conversation={conversation} onClose={vi.fn()} timeZoneLabel="São Paulo" />);
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('clip');
    expect(trigger).toHaveFocus();
    trigger.remove();
    document.body.style.overflow = '';
  });
});

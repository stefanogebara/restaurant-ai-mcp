import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { renderWithProviders as render } from '../../../test/renderWithProviders';
import CallConversationList from '../CallConversationList';
import CallConversationModal from '../CallConversationModal';

it('explains an empty phone history when no line is assigned, but keeps filter feedback when filters are active', () => {
  const baseProps = {
    channel: 'phone' as const,
    phoneNotConfigured: true,
    conversations: [],
    onOutcomeChange: () => {},
    onConversationClick: () => {},
    timeZoneLabel: 'Times in restaurant',
  };
  const view = render(<CallConversationList {...baseProps} filter={{ period: '7d', outcome: 'all', language: 'all' }} />);
  expect(screen.getByText('No phone calls in this period')).toBeVisible();
  expect(screen.getByText(/no assigned phone line/i)).toBeVisible();

  view.rerender(<CallConversationList {...baseProps} filter={{ period: '7d', outcome: 'error', language: 'all' }} />);
  expect(screen.getByText('No calls match these filters')).toBeVisible();
  expect(screen.queryByText('No phone calls in this period')).not.toBeInTheDocument();
});

it('labels system errors as errors and a completed zero-second call as 0:00', () => {
  const onOutcomeChange = vi.fn();
  render(<CallConversationList
    channel="phone"
    conversations={[{
      id: 'call-1', conversation_id: 'conv-1', started_at: '2026-11-08T12:00:00Z',
      caller_phone: '+15551234567', called_phone: '+15559876543',
      duration_seconds: 0, language: 'en', outcome: 'error',
    }]}
    filter={{ period: '7d', outcome: 'all', language: 'all' }}
    onOutcomeChange={onOutcomeChange}
    onConversationClick={() => {}}
    timeZoneLabel="Times in restaurant"
  />);

  fireEvent.click(screen.getByRole('button', { name: 'Error' }));
  expect(onOutcomeChange).toHaveBeenCalledWith('error');
  expect(screen.getByText('0:00')).toBeVisible();
  expect(screen.queryByText('Live')).not.toBeInTheDocument();
});

it('shows the same zero-second duration in conversation details', () => {
  render(<CallConversationModal
    conversation={{ id: 'call-1', conversation_id: 'conv-1', started_at: '2026-11-08T12:00:00Z',
      caller_phone: '+15551234567', called_phone: '+15559876543', duration_seconds: 0, language: 'en' }}
    onClose={() => {}}
    timeZoneLabel="Times in restaurant"
  />);
  expect(screen.getByText('0m 0s')).toBeVisible();
});

it('does not label a completed call with missing duration as live', () => {
  render(<CallConversationList channel="phone" conversations={[{
    id: 'complete', conversation_id: 'complete-provider', caller_phone: '+15551234567', called_phone: '+15559876543',
    started_at: '2026-11-09T13:00:00Z', ended_at: '2026-11-09T13:01:00Z', language: 'pt', outcome: 'information_only',
  }]} filter={{ period: '7d', outcome: 'all', language: 'all' }} onOutcomeChange={vi.fn()} onConversationClick={vi.fn()} timeZoneLabel="São Paulo" />);
  expect(screen.queryByText('Live')).not.toBeInTheDocument();
  expect(screen.getByText('Unknown')).toBeVisible();
});

it('labels unfinished metadata as pending and omits the initial English placeholder', () => {
  render(<CallConversationList channel="phone" conversations={[{
    id: 'pending', conversation_id: 'pending-provider', caller_phone: '+15551234567', called_phone: '+15559876543',
    started_at: '2026-11-09T13:00:00Z', language: 'en',
  }]} filter={{ period: '7d', outcome: 'all', language: 'all' }} onOutcomeChange={vi.fn()} onConversationClick={vi.fn()} timeZoneLabel="São Paulo" />);
  expect(screen.getByText('Pending')).toBeVisible();
  expect(screen.getAllByText('Awaiting call result').length).toBeGreaterThan(0);
  expect(screen.queryByText(/· EN/)).not.toBeInTheDocument();
});

it('opens call details with the keyboard and keeps the guest action separate', async () => {
  const open = vi.fn(); const guest = vi.fn();
  render(<CallConversationList channel="phone" conversations={[{
    id: 'keyboard-call', conversation_id: 'provider-call', caller_phone: '+15551234567', called_phone: '+15559876543',
    started_at: '2026-11-09T13:00:00Z', ended_at: '2026-11-09T13:01:00Z', language: 'pt', outcome: 'information_only',
  }]} filter={{ period: '7d', outcome: 'all', language: 'all' }} onOutcomeChange={vi.fn()} onConversationClick={open} onPhoneClick={guest} timeZoneLabel="São Paulo" />);
  screen.getByRole('button', { name: /^Open call from/ }).focus();
  await userEvent.keyboard('{Enter}');
  expect(open).toHaveBeenCalledWith('keyboard-call');
  screen.getByRole('button', { name: /^View guest details for/ }).focus();
  await userEvent.keyboard('{Enter}');
  expect(guest).toHaveBeenCalledWith('+15551234567');
  expect(open).toHaveBeenCalledTimes(1);
});

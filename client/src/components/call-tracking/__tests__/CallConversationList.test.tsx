import { fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { renderWithProviders as render } from '../../../test/renderWithProviders';
import CallConversationList from '../CallConversationList';

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

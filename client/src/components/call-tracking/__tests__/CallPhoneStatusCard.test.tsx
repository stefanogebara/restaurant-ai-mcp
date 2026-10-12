import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { screen } from '@testing-library/react';
import { renderWithProviders as render } from '../../../test/renderWithProviders';
import CallPhoneStatusCard from '../CallPhoneStatusCard';

describe('CallPhoneStatusCard', () => {
  it('shows routing review instead of an active phone or setup controls', () => {
    render(<MemoryRouter><CallPhoneStatusCard
      phoneStatus={{
        name: 'Cantina A', has_agent: true, agent_id: 'agent-a', phone_number: null,
        phone_number_id: null, status: 'needs_review', error: null, configured_at: null,
      }}
      phoneStatusLoading={false}
      phoneStatusError={false}
      onRefreshStatus={() => {}}
    /></MemoryRouter>);
    expect(screen.getByText('Routing not verified')).toBeVisible();
    expect(screen.getByRole('link', { name: 'View phone setup' })).toHaveAttribute('href', '/host-dashboard/voice-settings#voice-settings:phone');
    expect(screen.queryByRole('button', { name: /set up|disconnect/i })).not.toBeInTheDocument();
  });
});

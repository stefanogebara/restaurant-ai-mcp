import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import CallPhoneStatusCard from '../CallPhoneStatusCard';
import type { PhoneStatusData } from '../callTrackingTypes';

const baseStatus: PhoneStatusData = {
  name: 'Casa Tuim',
  has_agent: true,
  agent_id: 'agent-1',
  phone_number: '+551140001234',
  phone_number_id: 'line-1',
  status: 'active',
  error: null,
  configured_at: null,
};

function renderCard(phoneStatus: PhoneStatusData) {
  render(
    <CallPhoneStatusCard
      phoneStatus={phoneStatus}
      phoneStatusLoading={false}
      setupLoading={false}
      diagnoseLoading={false}
      disconnectLoading={false}
      onSetupPhone={vi.fn()}
      onDiagnose={vi.fn()}
      onDisconnect={vi.fn()}
      onRefreshStatus={vi.fn()}
    />
  );
}

describe('CallPhoneStatusCard', () => {
  it('does not claim inbound calls work solely because registration says active', () => {
    renderCard(baseStatus);
    expect(screen.getAllByText('Registered · test pending').length).toBeGreaterThan(0);
    expect(screen.getByText('+551140001234')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /connect|disconnect/i })).not.toBeInTheDocument();
  });

  it('masks a number when ownership is unavailable', () => {
    renderCard({ ...baseStatus, status: 'unavailable' });
    expect(screen.getAllByText('No line is available for this restaurant.').length).toBeGreaterThan(0);
    expect(screen.queryByText('+551140001234')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Request phone setup' })).toHaveAttribute('href', expect.stringContaining('mailto:hello@seatable.one'));
  });
});

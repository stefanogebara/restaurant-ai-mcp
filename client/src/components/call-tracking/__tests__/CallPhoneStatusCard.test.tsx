import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders as render } from '../../../test/renderWithProviders';
import i18n from 'i18next';
import CallPhoneStatusCard from '../CallPhoneStatusCard';

describe('CallPhoneStatusCard', () => {
  it('does not claim a shared number is connected when none is assigned', () => {
    render(<MemoryRouter><CallPhoneStatusCard
      phoneStatus={{
        name: 'Cantina A', has_agent: true, agent_id: 'agent-a', phone_number: null,
        phone_number_id: null, status: 'not_configured', error: null, configured_at: null,
      }}
      phoneStatusLoading={false}
      phoneStatusError={false}
      onRefreshStatus={() => {}}
    /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'Phone not connected' })).toBeVisible();
    expect(screen.getByText(/No number has been assigned to this restaurant/)).toBeVisible();
    expect(screen.queryByText(/shared number|verify call routing/i)).not.toBeInTheDocument();
  });

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

  it('does not treat an old active flag as verified routing', () => {
    render(<MemoryRouter><CallPhoneStatusCard
      phoneStatus={{
        name: 'Cantina A', has_agent: true, agent_id: 'agent-a', phone_number: null,
        phone_number_id: null, status: 'active', error: null, configured_at: null,
      }}
      phoneStatusLoading={false}
      phoneStatusError={false}
      onRefreshStatus={() => {}}
    /></MemoryRouter>);
    expect(screen.getByText('Routing not verified')).toBeVisible();
  });
});


afterEach(async () => { await act(async () => { await i18n.changeLanguage('en'); }); });

it.each([
  ['en', 'Shared routing configured'],
  ['pt-BR', 'Roteamento compartilhado configurado'],
  ['es', 'Enrutamiento compartido configurado'],
])('distinguishes an eligible shared setup from a disconnected phone in %s', async (language, title) => {
  await act(async () => { await i18n.changeLanguage(language); });
  render(<MemoryRouter><CallPhoneStatusCard phoneStatus={{
    name: 'Sandbox', has_agent: false, agent_id: null, phone_number: null, phone_number_id: null,
    status: 'not_configured', shared_routing_enabled: true, error: null, configured_at: null,
  }} phoneStatusLoading={false} phoneStatusError={false} onRefreshStatus={() => {}} /></MemoryRouter>);
  const user = userEvent.setup();
  const disclosure = screen.getByRole('button', { name: `${i18n.t('callTracking.configured')} ${i18n.t('callTracking.phoneDetails')}` });
  expect(disclosure).toHaveAttribute('aria-expanded', 'false');
  const panel = document.getElementById(disclosure.getAttribute('aria-controls')!);
  expect(panel).toContainElement(screen.getByText(i18n.t('phoneIntegration.sharedConfiguredDescription')));
  disclosure.focus();
  await user.keyboard('{Enter}');
  expect(disclosure).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByRole('link', { name: i18n.t('callTracking.openPhoneSettings') })).toHaveAttribute('href', '/host-dashboard/voice-settings#voice-settings:phone');
  expect(screen.getByRole('heading', { name: title })).toBeVisible();
  expect(screen.getByText(i18n.t('phoneIntegration.sharedConfiguredDescription'))).toBeVisible();
  expect(screen.queryByText(i18n.t('phoneIntegration.notConnectedTitle'))).not.toBeInTheDocument();
  expect(screen.queryByText(i18n.t('phoneIntegration.notConnectedDescription'))).not.toBeInTheDocument();
  expect(screen.queryByText(/5028-9356/)).not.toBeInTheDocument();
  await user.keyboard(' ');
  expect(disclosure).toHaveAttribute('aria-expanded', 'false');
  expect(disclosure).toHaveFocus();
});

it('does not hide a failed status request behind cached shared setup', () => {
  render(<MemoryRouter><CallPhoneStatusCard phoneStatus={{
    name: 'Sandbox', has_agent: false, agent_id: null, phone_number: null, phone_number_id: null,
    status: 'not_configured', shared_routing_enabled: true, error: null, configured_at: null,
  }} phoneStatusLoading={false} phoneStatusError={true} onRefreshStatus={() => {}} /></MemoryRouter>);
  expect(screen.getByRole('alert')).toBeVisible();
  expect(screen.queryByRole('heading', { name: 'Shared routing configured' })).not.toBeInTheDocument();
});


it('keeps a failed refresh prominent when the saved shared setup was collapsed', () => {
  const phoneStatus = {
    name: 'Sandbox', has_agent: false, agent_id: null, phone_number: null, phone_number_id: null,
    status: 'not_configured' as const, shared_routing_enabled: true, error: null, configured_at: null,
  };
  const refresh = vi.fn();
  const view = (failed: boolean) => <MemoryRouter><CallPhoneStatusCard phoneStatus={phoneStatus}
    phoneStatusLoading={false} phoneStatusError={failed} onRefreshStatus={refresh} /></MemoryRouter>;
  const { rerender } = render(view(false));
  expect(screen.getByRole('button', { name: 'Configured View phone details' })).toHaveAttribute('aria-expanded', 'false');
  rerender(view(true));
  expect(screen.queryByRole('button', { name: 'Configured View phone details' })).not.toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent(i18n.t('phoneIntegration.statusUnavailable'));
  expect(screen.getByRole('link', { name: 'View phone setup' })).toBeVisible();
  expect(refresh).not.toHaveBeenCalled();
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { SidebarProvider } from '../../../contexts/SidebarContext';
import Sidebar from '../Sidebar';
import { hasFeatureAccess } from '../../../config/planFeatures';

const subscriptionState = vi.hoisted(() => ({ plan: 'Growth' }));

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'owner@example.com' }, signOut: vi.fn() }),
}));
vi.mock('../../../hooks/usePermission', () => ({
  usePermission: () => ({ can: () => true }),
}));
vi.mock('../../../hooks/useSubscription', () => ({
  useSubscription: () => ({ isLoading: false, data: { subscription: { plan: subscriptionState.plan } } }),
}));
vi.mock('../../../hooks/useRestaurantSettings', () => ({
  useRestaurantSettings: () => ({ data: { restaurant_name: 'Cantina Bella Vista' } }),
}));

beforeEach(() => { subscriptionState.plan = 'Growth'; });

describe('mobile sidebar navigation', () => {
  it('keeps the mobile settings label short while naming its destination fully', () => {
    render(
      <SidebarProvider>
        <MemoryRouter><Sidebar /></MemoryRouter>
      </SidebarProvider>,
    );

    const mobileNavigation = screen.getByRole('navigation', { name: 'Mobile navigation' });
    const settingsLink = mobileNavigation.querySelector('a[href="/host-dashboard/settings"]');
    expect(settingsLink?.textContent?.trim()).toBe('Settings');
    expect(settingsLink).toHaveAccessibleName('Restaurant Settings');
  });

  it('opens only from the bottom bar and closes inside the drawer', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <SidebarProvider>
        <MemoryRouter><Sidebar /></MemoryRouter>
      </SidebarProvider>,
    );
    const drawer = container.querySelector('aside');
    expect(drawer).toHaveClass('-translate-x-full');
    expect(screen.queryByRole('button', { name: 'Open navigation menu' })).not.toBeInTheDocument();
    expect(container.querySelector('[data-missing-icon]')).not.toBeInTheDocument();

    const more = screen.getByRole('button', { name: 'More' });
    expect(more).toHaveAttribute('aria-controls', 'dashboard-sidebar');
    expect(more).toHaveAttribute('aria-expanded', 'false');
    await user.click(more);
    expect(drawer).toHaveClass('translate-x-0');
    expect(more).toHaveAttribute('aria-expanded', 'true');

    await user.click(screen.getByRole('button', { name: 'Close menu' }));
    expect(drawer).toHaveClass('-translate-x-full');
    expect(more).toHaveAttribute('aria-expanded', 'false');
  });
});


function CurrentRoute() {
  const location = useLocation();
  return <output data-testid="current-route">{location.pathname}</output>;
}

function renderNavigation(path = '/host-dashboard/simple') {
  return render(
    <SidebarProvider>
      <MemoryRouter initialEntries={[path]}>
        <Sidebar />
        <CurrentRoute />
      </MemoryRouter>
    </SidebarProvider>,
  );
}

describe('Voice overview navigation', () => {
  it('lets a Free owner follow the desktop Voice link without granting paid Voice features', async () => {
    subscriptionState.plan = 'Free';
    renderNavigation();
    const navigation = screen.getByRole('navigation', { name: 'Main navigation' });
    const voiceLink = within(navigation).getByRole('link', { name: 'Voice & Calls' });
    expect(voiceLink).toHaveAttribute('href', '/host-dashboard/voice-settings');
    expect(within(navigation).queryByRole('link', { name: /Voice.*Locked feature/ })).not.toBeInTheDocument();
    expect(hasFeatureAccess('free', 'voiceAI')).toBe(false);
    await userEvent.click(voiceLink);
    expect(screen.getByTestId('current-route')).toHaveTextContent('/host-dashboard/voice-settings');
  });

  it('lets a Free owner reach Voice from mobile More and closes the drawer after navigation', async () => {
    subscriptionState.plan = 'Free';
    const { container } = renderNavigation();
    const drawer = container.querySelector('aside');
    const mobileNavigation = screen.getByRole('navigation', { name: 'Mobile navigation' });
    const moreButton = within(mobileNavigation).getByRole('button', { name: 'More' });
    await userEvent.click(moreButton);
    expect(drawer).toHaveClass('translate-x-0');
    const voiceLink = within(screen.getByRole('navigation', { name: 'Main navigation' })).getByRole('link', { name: 'Voice & Calls' });
    expect(voiceLink).toHaveAttribute('href', '/host-dashboard/voice-settings');
    await userEvent.click(voiceLink);
    expect(screen.getByTestId('current-route')).toHaveTextContent('/host-dashboard/voice-settings');
    expect(drawer).toHaveClass('-translate-x-full');
    expect(moreButton).toHaveAttribute('aria-expanded', 'false');
  });

  it('keeps the other paid navigation entries locked for Free owners', async () => {
    subscriptionState.plan = 'Free';
    renderNavigation();
    const navigation = screen.getByRole('navigation', { name: 'Main navigation' });
    const marketing = within(navigation).getByRole('link', { name: 'Marketing - Locked feature' });
    const customers = within(navigation).getByRole('link', { name: 'Customers - Locked feature' });
    expect(marketing).toHaveAttribute('href', '/subscription/manage');
    expect(customers).toHaveAttribute('href', '/subscription/manage');
    expect(hasFeatureAccess('free', 'advancedAnalytics')).toBe(false);
    expect(hasFeatureAccess('free', 'customerLTV')).toBe(false);
    await userEvent.click(marketing);
    expect(screen.getByTestId('current-route')).toHaveTextContent('/subscription/manage');
  });

  it.each([
    ['Free', '/host-dashboard/voice-settings'],
    ['Free', '/host-dashboard/calls'],
    ['Growth', '/host-dashboard/voice-settings'],
    ['Growth', '/host-dashboard/calls'],
  ])('keeps Voice navigation active for a %s owner on %s', (plan, path) => {
    subscriptionState.plan = plan;
    renderNavigation(path);
    const voiceLink = within(screen.getByRole('navigation', { name: 'Main navigation' })).getByRole('link', { name: 'Voice & Calls' });
    expect(voiceLink).toHaveAttribute('href', '/host-dashboard/voice-settings');
    expect(voiceLink).toHaveAttribute('aria-current', 'page');
  });
});


afterEach(() => document.getElementById('mobile-test-css')?.remove());

it('skips closed mobile navigation and transfers/restores focus through the actual More drawer', async () => {
  const css = document.createElement('style'); css.id = 'mobile-test-css';
  css.textContent = '.invisible { visibility: hidden; } .hidden { display: none; }';
  document.head.append(css);
  const { container } = renderNavigation();
  const drawer = container.querySelector('aside');
  expect(screen.queryByRole('button', { name: 'Close menu' })).not.toBeInTheDocument();
  await userEvent.tab();
  expect(document.activeElement?.closest('aside')).toBeNull();
  const more = screen.getByRole('button', { name: 'More' });
  await userEvent.click(more);
  expect(screen.getByRole('dialog')).toHaveFocus();
  expect(drawer).toHaveClass('visible');
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(more).toHaveFocus();
  expect(screen.queryByRole('button', { name: 'Close menu' })).not.toBeInTheDocument();
  await userEvent.click(more);
  await userEvent.click(screen.getByRole('button', { name: 'Close menu' }));
  expect(more).toHaveFocus();
});

it('preserves the desktop visibility override and accessible Voice navigation', () => {
  const { container } = renderNavigation();
  expect(container.querySelector('aside')).toHaveClass('lg:visible');
  const voice = screen.getByRole('link', { name: 'Voice & Calls' });
  voice.focus(); expect(voice).toHaveFocus();
});

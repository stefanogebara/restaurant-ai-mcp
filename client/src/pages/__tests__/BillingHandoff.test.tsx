import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import PricingSection from '../../landing/components/PricingSection';
import Login from '../Login';
import Welcome from '../Welcome';
import SubscriptionManage from '../SubscriptionManage';
import { authFetch } from '../../services/api';
import { useSubscriptionData } from '../../hooks/useSubscriptionManage';

const mocks = vi.hoisted(() => ({
  user: null as null | { id: string },
  signInWithGoogle: vi.fn(),
  signUpWithEmail: vi.fn(),
  restaurant: null as null | { restaurant_id: string },
  toastError: vi.fn(),
  openPortal: vi.fn(),
}));
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: mocks.user, loading: false, signInWithGoogle: mocks.signInWithGoogle, signUpWithEmail: mocks.signUpWithEmail }),
}));
vi.mock('../../contexts/ToastContext', () => ({ useToast: () => ({ error: mocks.toastError }) }));
vi.mock('../../lib/analytics', () => ({ trackPricingPlanClicked: vi.fn(), trackSignupStarted: vi.fn() }));
vi.mock('../../components/auth/LoginBrandPanel', () => ({ default: () => null }));
vi.mock('../../lib/supabase', () => ({
  supabase: { auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } },
}));
vi.mock('../../services/api', () => ({ authFetch: vi.fn() }));
vi.mock('../../hooks/usePermission', () => ({ usePermission: () => ({ can: () => true }) }));
vi.mock('../../hooks/useSubscriptionManage', () => ({
  useSubscriptionData: vi.fn(),
  useCustomerPortal: () => ({ isPending: false, mutate: mocks.openPortal }),
}));

function Location() {
  const { pathname, search } = useLocation();
  return <output>{pathname}{search}</output>;
}

function renderRoute(url: string) {
  return render(<MemoryRouter initialEntries={[url]}>
    <Location />
    <Routes>
      <Route path="/precos" element={<PricingSection />} />
      <Route path="/login" element={<Login />} />
      <Route path="/welcome" element={<Welcome />} />
      <Route path="/subscription/manage" element={<SubscriptionManage />} />
      <Route path="*" element={null} />
    </Routes>
  </MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  mocks.user = null;
  mocks.restaurant = null;
  vi.mocked(authFetch).mockImplementation(async url => url === '/api/onboarding/status'
    ? Response.json({ restaurant: mocks.restaurant, steps: {}, needs_recovery: false })
    : Response.json({ error: 'Checkout unavailable' }, { status: 400 }));
});

describe('selected plan handoff', () => {
  it('forwards the plan from pricing into Google OAuth without creating Checkout', async () => {
    renderRoute('/precos');
    fireEvent.click(screen.getByRole('link', { name: /^Professional/ }));
    expect(await screen.findByText('/login?plan=growth')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /google/i }));
    expect(mocks.signInWithGoogle).toHaveBeenCalledWith({ plan: 'growth' });
    expect(vi.mocked(authFetch).mock.calls.some(([url]) => url === '/api/create-checkout-session')).toBe(false);
  });

  it('passes the selected tier to email signup and waits for confirmation', async () => {
    mocks.signUpWithEmail.mockResolvedValue({ needsConfirmation: true });
    renderRoute('/login?plan=starter');
    expect(screen.getByText('Selected plan: Essential')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'owner@example.com' } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'TestPassword1' } });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));
    await waitFor(() => expect(mocks.signUpWithEmail).toHaveBeenCalledWith('owner@example.com', 'TestPassword1', 'starter'));
    expect(vi.mocked(authFetch).mock.calls.some(([url]) => url === '/api/create-checkout-session')).toBe(false);
  });

  it('carries an OAuth or email confirmation return into onboarding', async () => {
    mocks.user = { id: 'owner' };
    renderRoute('/welcome?plan=scale');
    expect(await screen.findByText('/onboarding?plan=scale')).toBeVisible();
    expect(vi.mocked(authFetch).mock.calls.some(([url]) => url === '/api/create-checkout-session')).toBe(false);
  });

  it('ignores an unrecognized tier', async () => {
    mocks.user = { id: 'owner' };
    renderRoute('/welcome?plan=constructor');
    expect(await screen.findByText('/onboarding')).toBeVisible();
  });

  it('requires an explicit click to start Checkout for the selected tier even with an onboarding trial', async () => {
    mocks.user = { id: 'owner' };
    mocks.restaurant = { restaurant_id: 'restaurant' };
    vi.mocked(useSubscriptionData).mockReturnValue({
      data: { status: 'trialing', planName: 'Growth', planPrice: '', hasBillingPortal: false },
    } as ReturnType<typeof useSubscriptionData>);

    renderRoute('/welcome?plan=growth');
    expect(await screen.findByText('/subscription/manage?plan=growth')).toBeVisible();
    expect(screen.getByText('Selected plan: Professional')).toBeVisible();
    expect(vi.mocked(authFetch).mock.calls.some(([url]) => url === '/api/create-checkout-session')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Stripe Checkout' }));
    expect(authFetch).toHaveBeenCalledWith('/api/create-checkout-session', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ planName: 'Growth' }),
    }));
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('Checkout unavailable'));
    expect(screen.getByRole('button', { name: 'Continue to Stripe Checkout' })).toBeEnabled();
  });

  it('resubscribes through Checkout and keeps the billing portal available for history', async () => {
    mocks.user = { id: 'owner' };
    vi.mocked(useSubscriptionData).mockReturnValue({
      data: { status: 'canceled', planName: 'Starter', planPrice: '', hasBillingPortal: true },
    } as ReturnType<typeof useSubscriptionData>);

    renderRoute('/subscription/manage');
    fireEvent.click(screen.getByRole('button', { name: /manage billing/i }));
    expect(mocks.openPortal).toHaveBeenCalledTimes(1);
    expect(vi.mocked(authFetch).mock.calls.some(([url]) => url === '/api/create-checkout-session')).toBe(false);
    fireEvent.click(screen.getAllByRole('button', { name: 'Resubscribe' })[0]);
    expect(authFetch).toHaveBeenCalledWith('/api/create-checkout-session', expect.objectContaining({
      body: JSON.stringify({ planName: 'Starter' }),
    }));
    expect(mocks.openPortal).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('Checkout unavailable'));
  });
});

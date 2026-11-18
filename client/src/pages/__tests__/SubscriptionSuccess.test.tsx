import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SubscriptionSuccess from '../SubscriptionSuccess';
import { authFetch } from '../../services/api';
import { hasRecentVerifiedCheckout, readBillingPlan, rememberBillingPlan } from '../../lib/billingHandoff';

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'checkout-owner' }, loading: false }) }));
vi.mock('../../services/api', () => ({ authFetch: vi.fn() }));
vi.mock('../../lib/supabase', () => ({ supabase: { auth: { refreshSession: vi.fn() } } }));

const ownerId = 'checkout-owner';
const api = vi.mocked(authFetch);
const paid = { status: 'complete', payment_status: 'paid', subscription_status: 'active', is_trial: false, plan: 'Starter' };
const trial = { ...paid, payment_status: 'no_payment_required', subscription_status: 'trialing', is_trial: true, plan: 'Growth' };

function checkoutResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

async function advance(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

async function renderReturn(path = '/subscription/success?session_id=cs_test_checkout') {
  const queryClient = new QueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/subscription/success" element={<SubscriptionSuccess />} />
          <Route path="/host-dashboard/simple" element={<h1>Restaurant dashboard</h1>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await advance(20);
}

beforeEach(() => {
  vi.useFakeTimers();
  api.mockReset();
  sessionStorage.clear();
  localStorage.clear();
});
afterEach(() => { vi.useRealTimers(); });

describe('Stripe checkout return', () => {
  it('keeps an unverified session pending and does not write a verification marker', async () => {
    api.mockImplementation(async () => checkoutResponse({ error: 'Pending payment' }, 402));
    await renderReturn();
    expect(screen.getByRole('heading', { name: 'Checkout confirmation pending' })).toBeVisible();
    expect(screen.queryByText('Payment confirmed')).not.toBeInTheDocument();
    expect(hasRecentVerifiedCheckout(ownerId)).toBe(false);
    await advance(40_000);
    expect(api).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('heading', { name: 'Restaurant dashboard' })).not.toBeInTheDocument();
  });

  it('keeps a verified payment separate from activation and continues only after the server confirms access', async () => {
    rememberBillingPlan(ownerId, 'starter');
    api.mockResolvedValueOnce(checkoutResponse({ ...paid, access_confirmed: false }))
      .mockResolvedValueOnce(checkoutResponse({ ...paid, access_confirmed: false }))
      .mockResolvedValueOnce(checkoutResponse({ ...paid, access_confirmed: true }));

    await renderReturn();
    expect(screen.getByRole('heading', { name: 'Payment confirmed' })).toBeVisible();
    expect(screen.getByText(/plan access is being activated/i)).toBeVisible();
    expect(screen.queryByText('Your Essential subscription is active.')).not.toBeInTheDocument();
    expect(hasRecentVerifiedCheckout(ownerId)).toBe(true);
    expect(readBillingPlan(ownerId)).toBeNull();

    await advance(3_020);
    expect(api).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('heading', { name: 'Restaurant dashboard' })).not.toBeInTheDocument();
    await advance(3_020);
    expect(api).toHaveBeenCalledTimes(3);
    expect(screen.getByText('Your Essential subscription is active.')).toBeVisible();

    for (let second = 0; second < 5; second += 1) await advance(1_050);
    expect(screen.getByRole('heading', { name: 'Restaurant dashboard' })).toBeVisible();
    expect(api).toHaveBeenCalledTimes(3);
  });

  it('shows a verified trial without paid copy, bounds polling, and supports a manual recheck', async () => {
    api.mockImplementation(async () => checkoutResponse({ ...trial, access_confirmed: false }));
    await renderReturn();
    expect(screen.getByRole('heading', { name: 'Trial confirmed' })).toBeVisible();
    expect(screen.queryByText('Payment confirmed')).not.toBeInTheDocument();
    expect(screen.getByText(/plan access is being activated/i)).toBeVisible();

    for (let check = 0; check < 12; check += 1) await advance(3_020);
    expect(api).toHaveBeenCalledTimes(11);
    expect(screen.queryByRole('heading', { name: 'Restaurant dashboard' })).not.toBeInTheDocument();

    api.mockResolvedValueOnce(checkoutResponse({ ...trial, access_confirmed: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    await advance(20);
    expect(screen.getByRole('heading', { name: 'Trial started' })).toBeVisible();
    expect(screen.getByText('Your Professional trial is active.')).toBeVisible();
    expect(api).toHaveBeenCalledTimes(12);
  });

  it('shows an active zero-total subscription without paid or trial copy', async () => {
    api.mockResolvedValueOnce(checkoutResponse({ ...paid, payment_status: 'no_payment_required', access_confirmed: true }));
    await renderReturn();
    expect(screen.getByRole('heading', { name: 'Subscription active' })).toBeVisible();
    expect(screen.queryByText('Payment confirmed')).not.toBeInTheDocument();
    expect(screen.queryByText('Trial started')).not.toBeInTheDocument();
  });

  it('does not query Stripe when the session ID is missing', async () => {
    await renderReturn('/subscription/success');
    expect(screen.getByRole('heading', { name: 'Checkout session missing' })).toBeVisible();
    expect(api).not.toHaveBeenCalled();
  });
});

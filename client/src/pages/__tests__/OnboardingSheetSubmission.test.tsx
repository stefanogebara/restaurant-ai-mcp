import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Onboarding from '../Onboarding';
import { authFetch } from '../../services/api';
import { proporMesas } from '../../lib/proporMesas';
import type { OnboardingData } from '../../types/onboarding.types';

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'sheet-owner', email: 'owner@example.com' } }) }));
vi.mock('../../contexts/ToastContext', () => ({ useToast: () => ({ error: vi.fn(), success: vi.fn() }) }));
vi.mock('../../lib/analytics', () => ({ trackOnboardingStepCompleted: vi.fn(), trackOnboardingCompleted: vi.fn() }));
vi.mock('../../services/api', () => ({ authFetch: vi.fn() }));
const api = vi.mocked(authFetch);
const existingAreas = [{ name: 'Garden', is_active: true, tables: [{ capacity: 6, count: 3, shape: 'round' as const, is_joinable: false, is_fixed_seating: true }] }];
const draft = {
  restaurant_name: 'Sheet Bistro', restaurant_type: '', country: '', city: 'São Paulo',
  phone_number: '+5511999990000', email: 'contact@example.com',
  business_hours: [
    { day: 'Monday', is_open: true, open_time: '12:00', close_time: '23:00' },
    { day: 'Friday', is_open: true, open_time: '12:00', close_time: '23:00' },
  ], areas: [], profile_data: { seat_count: 40 },
};
const saved = { success: true, restaurant: { restaurant_id: 'new-restaurant', booking_url: '/book/sheet-bistro' },
  setup: { restaurant: 'ok', voice_agent: 'ok', knowledge_base: 'ok', whatsapp_registry: 'ok', subscription: 'ok' } };
function setup(overrides = {}) {
  localStorage.setItem('onboarding_step:sheet-owner', '1');
  localStorage.setItem('onboarding_data:sheet-owner', JSON.stringify({ ...draft, ...overrides }));
  return render(<MemoryRouter><Onboarding /></MemoryRouter>);
}
function selectDetails() {
  fireEvent.change(screen.getByLabelText('Country'), { target: { value: 'BR' } });
  fireEvent.change(screen.getByLabelText('Restaurant Type'), { target: { value: 'bistro' } });
  fireEvent.click(screen.getByRole('radio', { name: /^Direct/ }));
}
function acceptLayout() { fireEvent.click(screen.getByRole('button', { name: 'Use this layout' })); }
function payload() {
  const request = api.mock.calls.find(([url]) => url === '/api/onboarding/complete');
  return JSON.parse(String(request?.[1]?.body)) as OnboardingData;
}
beforeEach(() => {
  localStorage.clear(); vi.clearAllMocks();
  api.mockImplementation(async url => ({ ok: true, json: async () => url === '/api/onboarding/complete' ? saved : { success: false } }) as Response);
});

describe('single-sheet launch submission', () => {
  it('submits selected country, edited hours and exactly the explicitly accepted seating, then shows a single completed result', async () => {
    const view = setup();
    expect(screen.getByText('Initial hours — please confirm')).toBeVisible();
    expect(screen.queryByText(/do seu Google/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Achamos isto/)).not.toBeInTheDocument();
    selectDetails();
    expect(screen.getByRole('button', { name: 'Colocar no ar' })).toBeDisabled();
    const hours = screen.getByRole('region', { name: 'Horários' });
    fireEvent.click(within(hours).getByRole('button', { name: 'Ajustar' }));
    fireEvent.change(screen.getByLabelText('Monday closing time'), { target: { value: '20:30' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Friday' }));
    acceptLayout();
    const proposal = proporMesas(40)!;
    expect(screen.getByText(`${proposal.totalMesas} mesas · ${proposal.totalLugares} lugares`)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Colocar no ar' }));
    expect(await screen.findByRole('heading', { name: 'Your restaurant has been created.' })).toBeVisible();
    const submitted = payload();
    expect(submitted).toMatchObject({ country: 'Brazil', country_code: 'BR', city: 'São Paulo', restaurant_type: 'bistro' });
    expect(submitted.areas).toEqual(proposal.areas);
    expect(submitted.business_hours.find(day => day.day === 'Monday')?.close_time).toBe('20:30');
    expect(submitted.business_hours.find(day => day.day === 'Friday')?.is_open).toBe(false);
    expect(screen.getByRole('link', { name: 'Go to Dashboard' })).toHaveAttribute('href', '/host-dashboard/simple?launch=1');
    expect(screen.getByRole('link', { name: 'Your booking link' })).toHaveAttribute('href', 'https://seatable.one/book/sheet-bistro');
    expect(screen.queryByRole('button', { name: 'Colocar no ar' })).not.toBeInTheDocument();
    expect(screen.getByText('Setup saved. Phone and WhatsApp connections still need verification.')).toBeVisible();
    expect(api.mock.calls.filter(([url]) => url === '/api/onboarding/complete')).toHaveLength(1);
    expect(localStorage.getItem('onboarding_data:sheet-owner')).toBeNull();
    view.unmount();
    render(<MemoryRouter><Onboarding /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'Your restaurant has been created.' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Colocar no ar' })).not.toBeInTheDocument();
    expect(api.mock.calls.filter(([url]) => url === '/api/onboarding/complete')).toHaveLength(1);
  });

  it('requires explicit acceptance of the declared initial layout when there is no researched capacity', async () => {
    setup({ profile_data: undefined });
    fireEvent.change(screen.getByLabelText('Country'), { target: { value: 'BR' } });
    fireEvent.click(screen.getByRole('radio', { name: /^Direct/ }));
    expect(screen.getByRole('button', { name: 'Colocar no ar' })).toBeDisabled();
    expect(screen.getByText('Initial layout — please confirm')).toBeVisible();
    acceptLayout();
    fireEvent.click(screen.getByRole('button', { name: 'Colocar no ar' }));
    expect(await screen.findByRole('heading', { name: 'Your restaurant has been created.' })).toBeVisible();
    expect(payload().restaurant_type).toBe('');
    expect(payload().areas).toEqual([{ name: 'Indoor', is_active: true, tables: [
      { capacity: 4, count: 4, shape: 'square', is_fixed_seating: false, is_joinable: true },
    ] }]);
  });

  it('shows partial readiness without claiming every integration is ready or asking for creation again', async () => {
    api.mockImplementation(async url => ({ ok: true, json: async () => url === '/api/onboarding/complete'
      ? { ...saved, setup: { restaurant: 'ok', voice_agent: 'failed', whatsapp_registry: 'ok' } } : {} }) as Response);
    setup({ areas: existingAreas }); selectDetails();
    fireEvent.click(screen.getByRole('button', { name: 'Colocar no ar' }));
    expect(await screen.findByRole('heading', { name: 'Your restaurant has been created.' })).toBeVisible();
    expect(screen.getByText('Voice agent').parentElement).toHaveTextContent('Needs attention');
    expect(screen.getByText('AI knowledge').parentElement).toHaveTextContent('Not reported');
    expect(screen.getByRole('link', { name: 'Go to Dashboard' })).toBeVisible();
    expect(payload().areas).toEqual(existingAreas);
  });

  it.each([false, true])('keeps the sheet retryable on a failed response (HTTP 200: %s)', async http200 => {
    api.mockResolvedValue({ ok: http200, json: async () => ({ success: false, error: 'Could not save setup' }) } as Response);
    setup({ areas: existingAreas }); selectDetails();
    fireEvent.click(screen.getByRole('button', { name: 'Colocar no ar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save setup');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Colocar no ar' })).toBeEnabled());
    expect(screen.queryByRole('heading', { name: 'Your restaurant has been created.' })).not.toBeInTheDocument();
  });

  it('blocks invalid hours and missing country before sending a launch request', () => {
    setup({ areas: existingAreas });
    expect(screen.getByRole('button', { name: 'Colocar no ar' })).toBeDisabled();
    selectDetails();
    fireEvent.click(within(screen.getByRole('region', { name: 'Horários' })).getByRole('button', { name: 'Ajustar' }));
    fireEvent.change(screen.getByLabelText('Monday closing time'), { target: { value: '10:00' } });
    expect(screen.getByRole('button', { name: 'Colocar no ar' })).toBeDisabled();
    expect(screen.getByRole('alert')).toBeVisible();
    expect(api).not.toHaveBeenCalled();
  });
});

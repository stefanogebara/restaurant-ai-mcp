import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Onboarding from '../Onboarding';
import { authFetch } from '../../services/api';

let mockUserId = 'voice-owner-a';
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: mockUserId, email: `${mockUserId}@example.com` } }),
}));
vi.mock('../../contexts/ToastContext', () => ({ useToast: () => ({ error: vi.fn(), success: vi.fn() }) }));
vi.mock('../../lib/analytics', () => ({ trackOnboardingStepCompleted: vi.fn(), trackOnboardingCompleted: vi.fn() }));
vi.mock('../../services/api', () => ({ authFetch: vi.fn() }));

const draft = {
  restaurant_name: 'QA Draft Resume', restaurant_type: 'bistro', country: 'Brazil', country_code: 'BR', city: 'São Paulo',
  phone_number: '+15555550123', email: 'contact@example.com',
  business_hours: [{ day: 'Monday', is_open: true, open_time: '18:00', close_time: '22:00' }],
  areas: [{ name: 'Indoor', is_active: true, tables: [{ capacity: 4, count: 4, shape: 'square', is_joinable: true, is_fixed_seating: false }] }],
};
const api = vi.mocked(authFetch);
const dataKey = (userId = mockUserId) => `onboarding_data:${userId}`;
function savedDraft(userId = mockUserId) { return JSON.parse(localStorage.getItem(dataKey(userId))!); }
function mount() { return render(<MemoryRouter><Onboarding /></MemoryRouter>); }
function seed(voice: unknown = undefined) {
  localStorage.setItem(`onboarding_step:${mockUserId}`, '1');
  localStorage.setItem(dataKey(), JSON.stringify({ ...draft, voz_preset: voice }));
}
function radio(name: string) { return screen.getByRole('radio', { name: new RegExp(`^${name}`) }); }

beforeEach(() => {
  localStorage.clear(); vi.clearAllMocks(); mockUserId = 'voice-owner-a';
  // Keep submission local and retryable; no restaurant or external service is created.
  api.mockResolvedValue({ ok: false, json: async () => ({ success: false, error: 'Local test response' }) } as Response);
});

describe('onboarding voice choice in the user draft', () => {
  it('retains a choice and a changed choice on remount, then submits the restored exact preset', async () => {
    seed();
    let view = mount();
    expect(screen.getByRole('button', { name: 'Colocar no ar' })).toBeDisabled();
    fireEvent.click(radio('Neighborhood'));
    expect(radio('Neighborhood')).toHaveAttribute('aria-checked', 'true');
    expect(savedDraft()).toMatchObject({ ...draft, voz_preset: 'neighborhood' });
    expect(api).not.toHaveBeenCalled();

    view.unmount(); view = mount();
    expect(radio('Neighborhood')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('button', { name: 'Colocar no ar' })).toBeEnabled();
    fireEvent.click(radio('Direct'));
    expect(radio('Neighborhood')).toHaveAttribute('aria-checked', 'false');
    view.unmount(); mount();
    expect(radio('Direct')).toHaveAttribute('aria-checked', 'true');
    expect(savedDraft()).toMatchObject({ ...draft, voz_preset: 'fast_efficient' });
    expect(api).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Colocar no ar' }));
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    expect(api.mock.calls[0][0]).toBe('/api/onboarding/complete');
    expect(JSON.parse(String(api.mock.calls[0][1]?.body))).toMatchObject({ ...draft, voz_preset: 'fast_efficient' });
    await screen.findByRole('alert');
  });

  it.each(['retired_voice', 'toString', null, { preset: 'neighborhood' }])('ignores an unknown or malformed saved preset %j', value => {
    seed(value); mount();
    expect(screen.getAllByRole('radio').every(option => option.getAttribute('aria-checked') === 'false')).toBe(true);
    expect(screen.getByRole('button', { name: 'Colocar no ar' })).toBeDisabled();
    expect(savedDraft()).toMatchObject(draft);
    expect(savedDraft()).not.toHaveProperty('voz_preset');
    expect(api).not.toHaveBeenCalled();
    fireEvent.click(radio('Upbeat'));
    expect(radio('Upbeat')).toHaveAttribute('aria-checked', 'true');
    expect(savedDraft().voz_preset).toBe('family_friendly');
  });

  it('restores each owner’s choice without sharing or overwriting the other owner’s draft', () => {
    seed(); let view = mount(); fireEvent.click(radio('Neighborhood'));
    const ownerA = localStorage.getItem(dataKey());
    view.unmount(); mockUserId = 'voice-owner-b'; seed(); view = mount();
    expect(screen.getAllByRole('radio').every(option => option.getAttribute('aria-checked') === 'false')).toBe(true);
    fireEvent.click(radio('Refined'));
    expect(savedDraft().voz_preset).toBe('fine_dining');
    expect(localStorage.getItem(dataKey('voice-owner-a'))).toBe(ownerA);
    view.unmount(); mockUserId = 'voice-owner-a'; mount();
    expect(radio('Neighborhood')).toHaveAttribute('aria-checked', 'true');
    expect(savedDraft('voice-owner-b').voz_preset).toBe('fine_dining');
    expect(localStorage.getItem('onboarding_data')).toBeNull();
    expect(api).not.toHaveBeenCalled();
  });
});

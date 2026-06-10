/**
 * Onboarding draft persistence — user-scoped localStorage keys.
 *
 * Regression guards for the 2026-06-10 onboarding audit:
 * - drafts must be keyed per user id so another account on the same
 *   browser never inherits a half-finished restaurant draft
 * - legacy unscoped drafts (onboarding_data / onboarding_step) must be
 *   migrated into the signed-in user's bucket, then removed
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Onboarding from '../Onboarding';

let mockUserId = 'user-a';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string | Record<string, unknown>) =>
      typeof fallback === 'string' ? fallback : _key,
    i18n: { language: 'en' },
  }),
}));

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: vi.fn() }));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: mockUserId, email: `${mockUserId}@test.dev` } }),
}));

vi.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

vi.mock('../../services/api', () => ({
  authFetch: vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) }),
}));

vi.mock('../../lib/analytics', () => ({
  trackOnboardingStepCompleted: vi.fn(),
  trackOnboardingCompleted: vi.fn(),
}));

vi.mock('../../components/common/ThiingsIcon', () => ({
  default: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

vi.mock('../../components/onboarding/Step0Search', () => ({
  default: () => <div data-testid="step-0" />,
}));
vi.mock('../../components/onboarding/Step1Welcome', () => ({
  default: () => <div data-testid="step-1" />,
}));
vi.mock('../../components/onboarding/Step2Contact', () => ({
  default: () => <div data-testid="step-2" />,
}));
vi.mock('../../components/onboarding/Step3TablesAndSettings', () => ({
  default: () => <div data-testid="step-3" />,
}));
vi.mock('../../components/onboarding/Step4Review', () => ({
  default: () => <div data-testid="step-4" />,
}));
vi.mock('../../components/onboarding/Step5ImportHistory', () => ({
  default: () => <div data-testid="step-5" />,
}));
vi.mock('../../components/onboarding/Step6TeachAI', () => ({
  default: () => <div data-testid="step-6" />,
}));
vi.mock('../../components/onboarding/OnboardingSuccessModal', () => ({
  default: () => <div data-testid="success-modal" />,
}));
vi.mock('../../components/onboarding/OnboardingStepSidebar', () => ({
  default: () => <nav data-testid="sidebar" />,
}));

function renderOnboarding() {
  return render(
    <MemoryRouter initialEntries={['/onboarding']}>
      <Onboarding />
    </MemoryRouter>,
  );
}

describe('Onboarding draft persistence (user-scoped keys)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mockUserId = 'user-a';
  });

  it('persists the draft under a per-user key', () => {
    renderOnboarding();
    expect(localStorage.getItem('onboarding_data:user-a')).toBeTruthy();
    expect(localStorage.getItem('onboarding_step:user-a')).toBe('1');
    // No unscoped writes
    expect(localStorage.getItem('onboarding_data')).toBeNull();
    expect(localStorage.getItem('onboarding_step')).toBeNull();
  });

  it('migrates a legacy unscoped draft into the signed-in user bucket', () => {
    localStorage.setItem('onboarding_step', '2');
    localStorage.setItem(
      'onboarding_data',
      JSON.stringify({ restaurant_name: 'Legacy Bistro' }),
    );

    renderOnboarding();

    // Restored to step 2 (Step 0 search is bypassed on resume)
    expect(screen.getByTestId('step-2')).toBeInTheDocument();
    // Draft now lives under the scoped key…
    expect(localStorage.getItem('onboarding_data:user-a')).toContain('Legacy Bistro');
    // …and the legacy keys are gone
    expect(localStorage.getItem('onboarding_data')).toBeNull();
    expect(localStorage.getItem('onboarding_step')).toBeNull();
  });

  it("does not let another user inherit someone else's draft", () => {
    localStorage.setItem('onboarding_step:user-a', '3');
    localStorage.setItem(
      'onboarding_data:user-a',
      JSON.stringify({ restaurant_name: 'User A Secret Bistro' }),
    );

    mockUserId = 'user-b';
    renderOnboarding();

    // Fresh start for user B: Step 0 search, not user A's step 3
    expect(screen.getByTestId('step-0')).toBeInTheDocument();
    expect(screen.queryByTestId('step-3')).not.toBeInTheDocument();
    // User B's draft contains no trace of user A's data
    expect(localStorage.getItem('onboarding_data:user-b') || '').not.toContain('Secret');
    // User A's draft is untouched
    expect(localStorage.getItem('onboarding_data:user-a')).toContain('User A Secret Bistro');
  });

  it('restores the right step for the returning user', () => {
    localStorage.setItem('onboarding_step:user-a', '3');
    localStorage.setItem(
      'onboarding_data:user-a',
      JSON.stringify({ restaurant_name: 'Resumed Bistro' }),
    );

    renderOnboarding();

    expect(screen.getByTestId('step-3')).toBeInTheDocument();
  });

  it('never rehydrates a draft that already has a restaurant_id (duplicate-launch guard)', () => {
    localStorage.setItem('onboarding_step:user-a', '4');
    localStorage.setItem(
      'onboarding_data:user-a',
      JSON.stringify({ restaurant_name: 'Already Live', restaurant_id: 'rest-123' }),
    );

    renderOnboarding();

    // Fresh start — Step 0, not Step 4
    expect(screen.getByTestId('step-0')).toBeInTheDocument();
  });
});

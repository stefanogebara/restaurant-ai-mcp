import { authFetch } from '../services/api';
import type { LaunchStepKey, LaunchSteps } from './onboardingLaunch';

export type RetryStep = Exclude<LaunchStepKey, 'restaurant'>;

export interface OnboardingStatus {
  restaurant: {
    restaurant_id: string;
    restaurant_name: string;
    booking_url: string | null;
    voice_agent_id: string | null;
  } | null;
  steps: LaunchSteps;
  needs_recovery: boolean;
}

const STATUS_URL = '/api/onboarding/status';

async function readStatus(response: Response): Promise<OnboardingStatus> {
  if (!response.ok) throw new Error('Setup status unavailable');
  const status = await response.json();
  if (!status || typeof status.needs_recovery !== 'boolean' || !status.steps
      || (status.restaurant !== null && typeof status.restaurant?.restaurant_id !== 'string')) {
    throw new Error('Invalid setup status');
  }
  return status;
}

export async function getOnboardingStatus(signal?: AbortSignal) {
  return readStatus(await authFetch(STATUS_URL, { signal, cache: 'no-store' }));
}

export async function retryOnboardingStep(restaurantId: string, step: RetryStep) {
  return readStatus(await authFetch(STATUS_URL, {
    method: 'POST', body: JSON.stringify({ restaurant_id: restaurantId, step }),
  }));
}

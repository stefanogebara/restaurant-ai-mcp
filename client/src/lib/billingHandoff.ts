export const BILLING_PLANS = {
  starter: 'Starter',
  growth: 'Growth',
  scale: 'Scale',
} as const;

export type BillingPlan = keyof typeof BILLING_PLANS;

export function parseBillingPlan(value: unknown): BillingPlan | null {
  return value === 'starter' || value === 'growth' || value === 'scale' ? value : null;
}

export function billingPlanFromName(value: unknown): BillingPlan | null {
  return typeof value === 'string' ? parseBillingPlan(value.toLowerCase()) : null;
}

export function withBillingPlan(path: string, plan: BillingPlan | null): string {
  return plan ? `${path}?plan=${plan}` : path;
}

function selectionKey(userId: string) {
  return `seatable_checkout_plan:${userId}`;
}

export function readBillingPlan(userId: string): BillingPlan | null {
  try { return parseBillingPlan(localStorage.getItem(selectionKey(userId))); }
  catch { return null; }
}

export function rememberBillingPlan(userId: string, plan: BillingPlan) {
  try { localStorage.setItem(selectionKey(userId), plan); } catch { /* URL still carries the selection */ }
}

export function clearBillingPlan(userId: string, plan: BillingPlan | null) {
  if (plan && readBillingPlan(userId) === plan) {
    try { localStorage.removeItem(selectionKey(userId)); } catch { /* storage unavailable */ }
  }
}

const ACTIVATION_WINDOW_MS = 10 * 60 * 1000;

export function markVerifiedCheckout(userId: string) {
  try { sessionStorage.setItem(`seatable_verified_checkout:${userId}`, String(Date.now())); }
  catch { /* the verification result is still shown */ }
}

export function hasRecentVerifiedCheckout(userId: string): boolean {
  try {
    const timestamp = sessionStorage.getItem(`seatable_verified_checkout:${userId}`);
    if (!timestamp) return false;
    const elapsed = Date.now() - Number(timestamp);
    return elapsed >= 0 && elapsed < ACTIVATION_WINDOW_MS;
  } catch { return false; }
}

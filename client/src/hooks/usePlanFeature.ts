import { useSubscription } from './useSubscription';
import { hasFeatureAccess, type PlanFeatures, type PlanType } from '../config/planFeatures';

/**
 * Resolve the current user's plan + a single feature gate in one call.
 *
 * Use this in hooks/components that hit premium-gated endpoints so we don't
 * flood the network with calls we know will return 403 (audit BUG #22: the
 * Insights page was firing 12 calls to /api/ltv, /api/retention-campaigns,
 * and /api/predictive-analytics on every trial-user mount, all 403s).
 *
 * Returns:
 *   - `hasAccess`: gate the underlying query with `enabled: hasAccess`.
 *   - `isLoading`: true while we don't yet know the plan — callers should
 *     treat this the same as `hasAccess: false` until it resolves, to avoid
 *     firing a 403 that we'd then need to suppress.
 *   - `plan`: the resolved plan tier, for callers that need more nuance
 *     than a single feature check.
 */
export function usePlanFeature(feature: keyof PlanFeatures): {
  hasAccess: boolean;
  isLoading: boolean;
  plan: PlanType;
} {
  const subscription = useSubscription();
  const isLoading = subscription.isLoading;
  const plan = (subscription.data?.subscription?.plan?.toLowerCase() ?? 'free') as PlanType;
  const hasAccess = !isLoading && hasFeatureAccess(plan, feature);
  return { hasAccess, isLoading, plan };
}

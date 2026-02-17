/**
 * Subscription Hook
 *
 * React hook to check user's subscription status and feature access
 */

import { useQuery } from '@tanstack/react-query';
import { authFetch } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

interface SubscriptionDetails {
  plan: string;
  status: string;
  current_period_end: string;
  trial_end: string | null;
  is_active: boolean;
  is_trial: boolean;
}

interface SubscriptionResponse {
  has_subscription: boolean;
  subscription?: SubscriptionDetails;
}

interface UseSubscriptionOptions {
  email?: string;
  enabled?: boolean;
}

/**
 * Hook to fetch and manage subscription status
 *
 * @param options - Configuration options
 * @param options.email - Customer email to check subscription for
 * @param options.enabled - Whether to enable the query (default: true)
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useSubscription({
 *   email: 'customer@example.com'
 * });
 *
 * if (data?.has_subscription && data.subscription.is_active) {
 *   // User has active subscription
 * }
 * ```
 */
export function useSubscription(options: UseSubscriptionOptions = {}) {
  const { email, enabled = true } = options;
  const { user } = useAuth();
  const sessionEmail = user?.email;

  const queryEmail = email || sessionEmail || localStorage.getItem('customer_email') || '';

  return useQuery<SubscriptionResponse>({
    queryKey: ['subscription', queryEmail || 'current-user'],
    queryFn: async () => {
      const apiUrl = import.meta.env.VITE_API_URL || '';

      if (!queryEmail) {
        return { has_subscription: false };
      }

      const response = await authFetch(
        `${apiUrl}/api/subscription-status?email=${encodeURIComponent(queryEmail)}`
      );

      if (!response.ok) {
        if (response.status === 404) {
          return { has_subscription: false };
        }
        throw new Error('Failed to fetch subscription status');
      }

      return response.json();
    },
    enabled: enabled && !!queryEmail,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 10 * 60 * 1000, // Refetch every 10 minutes
  });
}

/**
 * Check if user has access to a specific feature
 */
export function useFeatureAccess(featureName: string, email?: string) {
  const { data, isLoading } = useSubscription({ email });

  const hasAccess = () => {
    if (!data?.has_subscription || !data.subscription?.is_active) {
      return false;
    }

    const plan = data.subscription.plan.toLowerCase();

    // Feature access by plan
    const growthFeatures = [
      'ai_reservations',
      'host_dashboard',
      'basic_analytics',
      'advanced_analytics',
      'waitlist_management',
      'sms_notifications',
      'email_support',
      'voice_ai',
    ];
    const featureMap: Record<string, string[]> = {
      starter: ['ai_reservations', 'host_dashboard', 'basic_analytics', 'email_support'],
      growth: growthFeatures,
      professional: growthFeatures,
      scale: [
        ...growthFeatures,
        'priority_support',
        'custom_integrations',
      ],
    };

    return featureMap[plan]?.includes(featureName) || false;
  };

  return {
    hasAccess: hasAccess(),
    isLoading,
    subscription: data?.subscription,
  };
}

/**
 * Helper hook to get plan display information
 */
export function usePlanInfo(email?: string) {
  const { data, isLoading } = useSubscription({ email });

  const getPlanDisplayName = () => {
    if (!data?.subscription) return 'Free';
    return data.subscription.plan;
  };

  const getPlanColor = () => {
    if (!data?.subscription) return 'gray';
    const plan = data.subscription.plan.toLowerCase();
    if (plan === 'starter') return 'gray';
    if (plan === 'growth' || plan === 'professional') return 'purple';
    if (plan === 'scale') return 'gold';
    return 'gray';
  };

  return {
    planName: getPlanDisplayName(),
    planColor: getPlanColor(),
    isTrial: data?.subscription?.is_trial || false,
    isActive: data?.subscription?.is_active || false,
    trialEnd: data?.subscription?.trial_end,
    currentPeriodEnd: data?.subscription?.current_period_end,
    isLoading,
  };
}

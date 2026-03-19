/**
 * Profile Context
 *
 * Provides restaurant profile data throughout the application,
 * enabling dashboard components to access and use customization settings.
 */

import { createContext, useContext, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authFetch } from '../services/api';
import type { RestaurantProfile } from '../types/profile.types';
import { TEMPLATE_CONFIGS } from '../types/profile.types';
import { SETTINGS_STALE_TIME } from '../config/constants';

interface ProfileContextType {
  profile: RestaurantProfile | null;
  isLoading: boolean;
  error: string | null;
  refreshProfile: () => Promise<void>;
  updateProfile: (updates: Partial<RestaurantProfile>) => Promise<void>;
  isMetricVisible: (metricId: string) => boolean;
  getCustomization: <K extends keyof RestaurantProfile['customizations']>(
    key: K
  ) => RestaurantProfile['customizations'][K];
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

interface ProfileProviderProps {
  children: ReactNode;
  restaurantId?: string;
}

function getDefaultProfile(): RestaurantProfile {
  const simpleTemplate = TEMPLATE_CONFIGS.simple;
  return {
    template: 'simple',
    restaurant_type: 'traditional',
    size: 'medium',
    location_type: 'residential',
    primary_concerns: ['no_shows', 'regular_customers'],
    visible_metrics: simpleTemplate.visible_metrics,
    hidden_metrics: simpleTemplate.hidden_metrics,
    customizations: {
      risk_display: 'simple',
      time_format: '24h',
      currency: 'EUR',
      show_technical_details: false,
      font_size: 'large',
      language: 'en',
      color_scheme: 'default',
      notification_level: 'essential',
      ...simpleTemplate.customizations,
    },
  };
}

export function ProfileProvider({ children, restaurantId }: ProfileProviderProps) {
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error: queryError, refetch } = useQuery<RestaurantProfile>({
    queryKey: ['restaurant-profile', restaurantId],
    queryFn: async () => {
      if (!restaurantId) return getDefaultProfile();
      const response = await authFetch('/api/restaurant-settings/profile', {
        headers: {
          'Content-Type': 'application/json',
          'X-Restaurant-ID': restaurantId,
        },
      });
      if (!response.ok) throw new Error('Failed to fetch profile');
      const result = await response.json();
      return result.success && result.data ? result.data : getDefaultProfile();
    },
    staleTime: SETTINGS_STALE_TIME,
    retry: false,
  });

  // Always have a usable profile (fallback to default on error or loading)
  const profile = data ?? (isLoading ? null : getDefaultProfile());
  const error = isError ? (queryError instanceof Error ? queryError.message : 'Unknown error') : null;

  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<RestaurantProfile>) => {
      if (!restaurantId || !profile) throw new Error('Cannot update profile without restaurant ID');
      const updatedProfile = { ...profile, ...updates };
      const response = await authFetch('/api/restaurant-settings/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Restaurant-ID': restaurantId,
        },
        body: JSON.stringify({ metric_profile: updatedProfile }),
      });
      if (!response.ok) throw new Error('Failed to update profile');
      const result = await response.json();
      return result.success && result.data ? result.data : updatedProfile;
    },
    onSuccess: (updatedProfile) => {
      queryClient.setQueryData(['restaurant-profile', restaurantId], updatedProfile);
    },
  });

  const refreshProfile = () => refetch().then(() => {});
  const updateProfile = (updates: Partial<RestaurantProfile>) =>
    updateMutation.mutateAsync(updates).then(() => {});

  const isMetricVisible = (metricId: string): boolean => {
    if (!profile) return false;
    return (profile.visible_metrics as string[]).includes(metricId);
  };

  const getCustomization = <K extends keyof RestaurantProfile['customizations']>(
    key: K
  ): RestaurantProfile['customizations'][K] => {
    const p = profile ?? getDefaultProfile();
    return p.customizations[key];
  };

  const value: ProfileContextType = {
    profile,
    isLoading,
    error,
    refreshProfile,
    updateProfile,
    isMetricVisible,
    getCustomization,
  };

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useProfile() {
  const context = useContext(ProfileContext);
  if (context === undefined) {
    throw new Error('useProfile must be used within a ProfileProvider');
  }
  return context;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCustomization<K extends keyof RestaurantProfile['customizations']>(
  key: K
): RestaurantProfile['customizations'][K] {
  const { getCustomization } = useProfile();
  return getCustomization(key);
}

// eslint-disable-next-line react-refresh/only-export-components
export function useMetricVisibility(metricId: string): boolean {
  const { isMetricVisible } = useProfile();
  return isMetricVisible(metricId);
}

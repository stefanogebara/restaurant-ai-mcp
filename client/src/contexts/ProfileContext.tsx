/**
 * Profile Context
 *
 * Provides restaurant profile data throughout the application,
 * enabling dashboard components to access and use customization settings.
 */

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { authFetch } from '../services/api';
import type { RestaurantProfile } from '../types/profile.types';
import { TEMPLATE_CONFIGS } from '../types/profile.types';

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

export function ProfileProvider({ children, restaurantId }: ProfileProviderProps) {
  const [profile, setProfile] = useState<RestaurantProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get default profile based on template
  const getDefaultProfile = (): RestaurantProfile => {
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
  };

  // Fetch profile from API
  const fetchProfile = async () => {
    if (!restaurantId) {
      setProfile(getDefaultProfile());
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await authFetch('/api/restaurant-settings/profile', {
        headers: {
          'Content-Type': 'application/json',
          'X-Restaurant-ID': restaurantId,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch profile');
      }

      const data = await response.json();

      if (data.success && data.data) {
        setProfile(data.data);
      } else {
        // Use default profile if none exists
        setProfile(getDefaultProfile());
      }
    } catch (err) {
      console.error('Error fetching profile:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      // Fallback to default profile on error
      setProfile(getDefaultProfile());
    } finally {
      setIsLoading(false);
    }
  };

  // Refresh profile
  const refreshProfile = async () => {
    await fetchProfile();
  };

  // Update profile
  const updateProfile = async (updates: Partial<RestaurantProfile>) => {
    if (!restaurantId || !profile) {
      throw new Error('Cannot update profile without restaurant ID');
    }

    const updatedProfile = { ...profile, ...updates };

    try {
      const response = await authFetch('/api/restaurant-settings/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Restaurant-ID': restaurantId,
        },
        body: JSON.stringify({ metric_profile: updatedProfile }),
      });

      if (!response.ok) {
        throw new Error('Failed to update profile');
      }

      const data = await response.json();

      if (data.success && data.data) {
        setProfile(data.data);
      }
    } catch (err) {
      console.error('Error updating profile:', err);
      throw err;
    }
  };

  // Check if a metric is visible
  const isMetricVisible = (metricId: string): boolean => {
    if (!profile) return false;
    return profile.visible_metrics.includes(metricId);
  };

  // Get a specific customization value
  const getCustomization = <K extends keyof RestaurantProfile['customizations']>(
    key: K
  ): RestaurantProfile['customizations'][K] => {
    if (!profile) {
      const defaultProfile = getDefaultProfile();
      return defaultProfile.customizations[key];
    }
    return profile.customizations[key];
  };

  // Fetch profile on mount or when restaurantId changes
  useEffect(() => {
    fetchProfile();
  }, [restaurantId]);

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

// Custom hook to use profile context
export function useProfile() {
  const context = useContext(ProfileContext);
  if (context === undefined) {
    throw new Error('useProfile must be used within a ProfileProvider');
  }
  return context;
}

// Optional: Hook to get specific customizations easily
export function useCustomization<K extends keyof RestaurantProfile['customizations']>(
  key: K
): RestaurantProfile['customizations'][K] {
  const { getCustomization } = useProfile();
  return getCustomization(key);
}

// Optional: Hook to check metric visibility
export function useMetricVisibility(metricId: string): boolean {
  const { isMetricVisible } = useProfile();
  return isMetricVisible(metricId);
}

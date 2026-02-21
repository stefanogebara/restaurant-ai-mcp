/**
 * Welcome Page - Smart Redirect
 *
 * After login, checks the user's onboarding status:
 * - Has restaurant_config → redirect to dashboard
 * - No restaurant_config → redirect to onboarding
 *
 * Shows a loading spinner while checking.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

export default function Welcome() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      navigate('/login', { replace: true });
      return;
    }

    // Check if user has completed onboarding (has restaurant_config)
    const checkOnboardingStatus = async () => {
      try {
        const { data, error } = await supabase
          .schema('restaurant')
          .from('restaurant_config')
          .select('id')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .limit(1)
          .single();

        if (!error && data) {
          // User has completed onboarding → dashboard
          navigate('/host-dashboard/simple', { replace: true });
        } else {
          // No restaurant config → needs onboarding
          navigate('/onboarding', { replace: true });
        }
      } catch {
        // On error, default to onboarding
        navigate('/onboarding', { replace: true });
      } finally {
        setChecking(false);
      }
    };

    checkOnboardingStatus();
  }, [user, authLoading, navigate]);

  // Show loading while checking
  if (authLoading || checking) {
    return (
      <div className="min-h-screen bg-warm-white flex flex-col items-center justify-center gap-4">
        <div className="font-serif text-2xl text-deep-charcoal opacity-50">
          seatable<span className="text-burgundy">.</span>
        </div>
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-border-gray border-t-burgundy"></div>
        <p className="text-sm text-stone-gray font-light">Setting things up...</p>
      </div>
    );
  }

  return null;
}

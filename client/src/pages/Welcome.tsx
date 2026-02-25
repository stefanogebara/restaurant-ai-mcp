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
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { authFetch } from '../services/api';

export default function Welcome() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      navigate('/login', { replace: true });
      return;
    }

    // Check if this is a demo conversion (user clicked "Upgrade to keep your data")
    const params = new URLSearchParams(window.location.search);
    const fromDemo = params.get('from') === 'demo';
    const demoToken = params.get('token');

    // Clean up demo params from the URL immediately (before async work)
    if (fromDemo && demoToken) {
      window.history.replaceState({}, '', window.location.pathname);
    }

    // Check if user has completed onboarding (has restaurant_config)
    const checkOnboardingStatus = async () => {
      try {
        // Fire-and-forget demo conversion — don't block login on success/failure
        if (fromDemo && demoToken) {
          authFetch('/api/demo?action=convert', {
            method: 'POST',
            body: JSON.stringify({ token: demoToken }),
          }).catch(() => {
            // Conversion failure is non-fatal — user still gets logged in
          });
        }

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
          const destination = fromDemo && demoToken
            ? '/host-dashboard/simple?converted=demo'
            : '/host-dashboard/simple';
          navigate(destination, { replace: true });
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
        <div aria-hidden="true" className="animate-spin rounded-full h-8 w-8 border-2 border-border-gray border-t-burgundy"></div>
        <p role="status" className="text-sm text-stone-gray font-light">{t('common.settingUp')}</p>
      </div>
    );
  }

  return null;
}

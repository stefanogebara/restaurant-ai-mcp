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
import { LS_PENDING_DEMO_TOKEN } from '../config/localStorageKeys';

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

    // Check if this is a demo conversion (user clicked "Upgrade to keep your data").
    // Read from URL params first (Google OAuth carry-through), then localStorage
    // fallback (email/password login, or returning post-onboarding).
    const params = new URLSearchParams(window.location.search);
    const fromDemo = params.get('from') === 'demo';
    const urlToken = params.get('token');
    const localToken = localStorage.getItem(LS_PENDING_DEMO_TOKEN);
    const demoToken = urlToken || localToken || null;

    // Clean up demo params from the URL immediately (before async work)
    if (fromDemo && urlToken) {
      window.history.replaceState({}, '', window.location.pathname);
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
          // User has completed onboarding → attempt demo conversion if pending
          if (demoToken) {
            // Fire-and-forget — clear localStorage regardless of outcome
            authFetch('/api/demo?action=convert', {
              method: 'POST',
              body: JSON.stringify({ token: demoToken }),
            })
              .catch(() => {})
              .finally(() => localStorage.removeItem(LS_PENDING_DEMO_TOKEN));
          }
          const destination = demoToken
            ? '/host-dashboard/simple?converted=demo'
            : '/host-dashboard/simple';
          navigate(destination, { replace: true });
        } else {
          // No restaurant config → needs onboarding.
          // Keep pending_demo_token in localStorage so we retry convert after
          // onboarding completes and the user returns here.
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

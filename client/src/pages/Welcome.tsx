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
    // H8: honour the `next` param set by Login.tsx so an OAuth round-trip
    // returns the user to the page they originally tried to visit.
    const nextRaw = params.get('next');
    // Only allow same-origin paths (defends against open-redirect via `next`)
    const nextPath = nextRaw && nextRaw.startsWith('/') && !nextRaw.startsWith('//') ? nextRaw : null;

    // Clean up demo / next params from the URL immediately (before async work)
    if ((fromDemo && urlToken) || nextPath) {
      window.history.replaceState({}, '', window.location.pathname);
    }

    // Check if user has completed onboarding (has restaurant_config)
    const checkOnboardingStatus = async () => {
      try {
        // Use maybeSingle() — for a fresh user with no restaurant yet, .single()
        // returns a 406 (PGRST116) that floods the console (audit BUG #3).
        // maybeSingle() returns { data: null } cleanly for the 0-row case.
        const { data, error } = await supabase
          .schema('restaurant')
          .from('restaurant_config')
          .select('id')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();

        if (!error && data) {
          // User has completed onboarding → attempt demo conversion if pending.
          // Fire-and-forget so we don't block navigation by ~1s, BUT preserve the
          // token in localStorage if the conversion fails — the previous .finally
          // dropped the token unconditionally, which orphaned the user's demo
          // data (scrape, reservations, AI agent setup) on any network blip.
          // Same anti-pattern fixed in Onboarding's referral-attach (9e271d13 L4).
          if (demoToken) {
            authFetch('/api/demo/convert', {
              method: 'POST',
              body: JSON.stringify({ token: demoToken }),
            })
              .then(async (response) => {
                const body = await response.json().catch(() => null);
                if (response.ok && body?.success === true) {
                  localStorage.removeItem(LS_PENDING_DEMO_TOKEN);
                } else {
                  console.error('[Welcome] demo convert failed', { status: response.status, body });
                  // Keep token in localStorage so the next page load retries.
                }
              })
              .catch((err) => {
                console.error('[Welcome] demo convert network error', err);
                // Keep token for retry on next page load.
              });
          }
          // Priority: explicit `next=` (user's original target) wins over
          // the default dashboard. Demo conversion still wraps it.
          const baseDestination = nextPath || '/host-dashboard/simple';
          const destination = demoToken
            ? (nextPath ? `${baseDestination}${nextPath.includes('?') ? '&' : '?'}converted=demo` : '/host-dashboard/simple?converted=demo')
            : baseDestination;
          navigate(destination, { replace: true });
        } else {
          // No restaurant config → needs onboarding.
          // Keep pending_demo_token in localStorage so we retry convert after
          // onboarding completes and the user returns here.
          navigate('/onboarding', { replace: true });
        }
      } catch (err) {
        // Log so Sentry catches a population-wide config-lookup outage instead
        // of silently treating every user as a new signup. Falls back to
        // onboarding by design.
        console.error('[Welcome] restaurant_config lookup failed', err);
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

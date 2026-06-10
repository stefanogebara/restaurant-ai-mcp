/**
 * Authentication Context
 * Provides Google OAuth authentication via Supabase
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import type { User, Session } from '@supabase/supabase-js';
import {
  LS_CUSTOMER_EMAIL,
  LS_PENDING_DEMO_TOKEN,
  LS_ONBOARDING_DATA,
  LS_ONBOARDING_STEP,
  LS_REFERRAL_CODE,
  LS_STRIPE_CUSTOMER_ID,
  LS_SUBSCRIPTION_PLAN,
  LS_LAUNCH_CHECKLIST_DONE,
  LS_FIRST_RESERVATION_TRACKED,
} from '../config/localStorageKeys';
import { identifyUser } from '../lib/analytics';

type RestaurantRole = 'owner' | 'manager' | 'host' | 'staff';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  role: RestaurantRole | null;
  signInWithGoogle: (extraRedirectParams?: Record<string, string>) => Promise<void>;
  signInWithApple: (extraRedirectParams?: Record<string, string>) => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<{ needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<RestaurantRole | null>(null);

  useEffect(() => {
    // Use onAuthStateChange as the single source of truth.
    // INITIAL_SESSION fires once on setup and waits for URL token exchange
    // (OAuth callback) to complete before firing — this avoids the race
    // condition where getSession() returns null while tokens are still
    // being exchanged from the URL hash.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        // Store email in localStorage for onboarding
        if (session?.user?.email) {
          localStorage.setItem('customer_email', session.user.email);
          // Identify user in PostHog for session recording + funnel analysis
          identifyUser(session.user.id, {
            email: session.user.email,
            auth_provider: session.user.app_metadata?.provider || 'unknown',
          });
        } else {
          localStorage.removeItem(LS_CUSTOMER_EMAIL);
        }

        // Extract restaurant role from JWT payload.
        // payload.role is a standard Supabase claim ('authenticated' | 'anon') — not
        // a restaurant role. Custom restaurant roles are stored in app_metadata.restaurant_role.
        // If no custom role is found, default to 'owner' (restaurant owners sign in via OAuth).
        if (session?.access_token) {
          try {
            const payload = JSON.parse(atob(session.access_token.split('.')[1]));
            const SUPABASE_STANDARD_ROLES = ['authenticated', 'anon', 'service_role'];
            const customRole = payload.app_metadata?.restaurant_role as RestaurantRole | undefined;
            const isStandardRole = SUPABASE_STANDARD_ROLES.includes(payload.role);
            setRole(customRole || (isStandardRole ? 'owner' : (payload.role as RestaurantRole)) || 'owner');
          } catch {
            setRole('owner');
          }
        }

        // Clear stale state when sign-out or token refresh fails (C-05)
        if (event === 'SIGNED_OUT' || !session) {
          localStorage.removeItem(LS_CUSTOMER_EMAIL);
          setRole(null);
        }

        setLoading(false);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signInWithGoogle = async (extraRedirectParams?: Record<string, string>) => {
    // Build redirectTo URL, preserving any extra params (e.g. from=demo&token=...)
    // so they survive the OAuth round-trip back to /welcome
    let redirectTo = `${window.location.origin}/welcome`;
    if (extraRedirectParams && Object.keys(extraRedirectParams).length > 0) {
      const qs = new URLSearchParams(extraRedirectParams).toString();
      redirectTo = `${redirectTo}?${qs}`;
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        queryParams: {
          access_type: 'offline',
          prompt: 'select_account',
        },
      },
    });

    if (error) {
      throw error;
    }
  };

  // Apple SSO — mirrors signInWithGoogle. Only reachable when
  // VITE_APPLE_SSO_ENABLED=true (Login.tsx gates the button) because the
  // Supabase provider needs Apple Developer credentials configured first;
  // an ungated button would 400 at Apple's authorize endpoint.
  // Setup steps live in .env.example under "Apple SSO".
  const signInWithApple = async (extraRedirectParams?: Record<string, string>) => {
    let redirectTo = `${window.location.origin}/welcome`;
    if (extraRedirectParams && Object.keys(extraRedirectParams).length > 0) {
      const qs = new URLSearchParams(extraRedirectParams).toString();
      redirectTo = `${redirectTo}?${qs}`;
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: { redirectTo },
    });
    if (error) throw error;
  };

  const signInWithEmail = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signUpWithEmail = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/welcome`,
      },
    });
    if (error) throw error;
    // If email confirmation is required, session will be null
    const needsConfirmation = !data.session;
    return { needsConfirmation };
  };

  const signOut = async () => {
    // Clear every auth-scoped localStorage key on signOut so the next user
    // who signs in on the same browser doesn't inherit the previous user's
    // onboarding draft (restaurant name, phone, email…), demo conversion
    // token, referral code, or Stripe customer hint.
    //
    // Privacy leak the audit flagged: previous version only cleared
    // LS_CUSTOMER_EMAIL, leaving 8 other keys behind. User B signing in on
    // user A's laptop would land in /onboarding with user A's restaurant
    // pre-filled — names, phone, the whole form. Could submit it under
    // their own auth token if they don't notice.
    //
    // Deliberately NOT cleared: LS_LANGUAGE — that's a per-browser
    // preference (i18next picks it up), not auth-scoped state. Also NOT
    // cleared: per-user onboarding drafts (onboarding_data:{userId}) —
    // those are already isolated per account, and "Save & Exit" promises
    // the draft survives sign-out. Only the legacy unscoped draft keys
    // are cleared below.
    const authScopedKeys = [
      LS_CUSTOMER_EMAIL,
      LS_PENDING_DEMO_TOKEN,
      LS_ONBOARDING_DATA,
      LS_ONBOARDING_STEP,
      LS_REFERRAL_CODE,
      LS_STRIPE_CUSTOMER_ID,
      LS_SUBSCRIPTION_PLAN,
      LS_LAUNCH_CHECKLIST_DONE,
      LS_FIRST_RESERVATION_TRACKED,
    ];
    for (const key of authScopedKeys) {
      try { localStorage.removeItem(key); } catch { /* private mode */ }
    }
    try {
      await supabase.auth.signOut();
    } catch {
      // Even if signOut fails (e.g. stale session), clear local state
      setUser(null);
      setSession(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, role, signInWithGoogle, signInWithApple, signInWithEmail, signUpWithEmail, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

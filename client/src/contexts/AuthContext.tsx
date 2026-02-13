/**
 * Authentication Context
 * Provides Google OAuth authentication via Supabase
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import type { User, Session } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<{ needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

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
        } else {
          localStorage.removeItem('customer_email');
        }

        // Clear stale state when sign-out or token refresh fails
        if (event === 'SIGNED_OUT') {
          localStorage.removeItem('customer_email');
        }

        setLoading(false);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/welcome`,
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
    localStorage.removeItem('customer_email');
    try {
      await supabase.auth.signOut();
    } catch {
      // Even if signOut fails (e.g. stale session), clear local state
      setUser(null);
      setSession(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signInWithGoogle, signInWithEmail, signUpWithEmail, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

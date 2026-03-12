/**
 * Supabase Client for Frontend
 * Handles authentication with Google OAuth
 *
 * Session timeouts enforced:
 *   - Absolute timeout: 30 days from first sign-in
 *   - Idle timeout: 7 days since last activity
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
}

const STORAGE_KEY_SESSION_START = 'session_start';
const STORAGE_KEY_LAST_ACTIVITY = 'last_activity';

const ABSOLUTE_TIMEOUT_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const IDLE_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000;      // 7 days

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

/**
 * Updates the last activity timestamp in localStorage.
 * Call this on any authenticated user action (e.g. API calls, page navigation).
 */
export function trackActivity(): void {
  localStorage.setItem(STORAGE_KEY_LAST_ACTIVITY, Date.now().toString());
}

function isSessionExpired(): boolean {
  const now = Date.now();

  const sessionStartRaw = localStorage.getItem(STORAGE_KEY_SESSION_START);
  if (sessionStartRaw) {
    const sessionStart = parseInt(sessionStartRaw, 10);
    if (!isNaN(sessionStart) && now - sessionStart > ABSOLUTE_TIMEOUT_MS) {
      return true;
    }
  }

  const lastActivityRaw = localStorage.getItem(STORAGE_KEY_LAST_ACTIVITY);
  if (lastActivityRaw) {
    const lastActivity = parseInt(lastActivityRaw, 10);
    if (!isNaN(lastActivity) && now - lastActivity > IDLE_TIMEOUT_MS) {
      return true;
    }
  }

  return false;
}

function clearSessionTimestamps(): void {
  localStorage.removeItem(STORAGE_KEY_SESSION_START);
  localStorage.removeItem(STORAGE_KEY_LAST_ACTIVITY);
}

/**
 * Force sign-out and redirect to /login.
 * Prevents stale sessions from leaving users on broken pages (C-05).
 */
async function forceSignOutToLogin(): Promise<void> {
  clearSessionTimestamps();
  try {
    await supabase.auth.signOut();
  } catch {
    // Even if signOut fails, redirect to login
  }
  // Use replaceState so the user can't "back" into an expired session page
  if (window.location.pathname !== '/login' && !window.location.pathname.startsWith('/book/')) {
    window.location.replace('/login');
  }
}

// Listen for auth state changes to set session start and enforce timeouts.
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN' && session) {
    if (!localStorage.getItem(STORAGE_KEY_SESSION_START)) {
      localStorage.setItem(STORAGE_KEY_SESSION_START, Date.now().toString());
    }
    trackActivity();
    return;
  }

  if (event === 'SIGNED_OUT') {
    clearSessionTimestamps();
    return;
  }

  // Token refresh succeeded but session has exceeded custom limits → force sign-out
  if (event === 'TOKEN_REFRESHED' && session) {
    if (isSessionExpired()) {
      forceSignOutToLogin();
      return;
    }
  }

  // Token refresh failed (session is null) → force sign-out (C-05)
  if (event === 'TOKEN_REFRESHED' && !session) {
    forceSignOutToLogin();
    return;
  }
});

// On app load, immediately enforce timeouts if a session is already active.
supabase.auth.getSession().then(({ data }) => {
  if (data.session && isSessionExpired()) {
    forceSignOutToLogin();
  }
});

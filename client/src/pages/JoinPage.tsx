/**
 * Join Page — handles invite link clicks
 * Route: /join?token=<invite_token>
 *
 * Flow:
 *  1. Validate token via GET /api/invitations?token=
 *  2. If not logged in → show "Sign in to accept" button
 *  3. If logged in → POST /api/invitations to accept → redirect to dashboard
 */

import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

type State = 'loading' | 'valid' | 'invalid' | 'expired' | 'accepting' | 'done' | 'error';

export default function JoinPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const token = searchParams.get('token');

  const [state, setState] = useState<State>('loading');
  const [inviteInfo, setInviteInfo] = useState<{ email: string; role: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!token) { setState('invalid'); return; }
    fetch(`/api/invitations?token=${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.success) { setInviteInfo({ email: data.email, role: data.role }); setState('valid'); }
        else if (data.error?.includes('expired')) setState('expired');
        else setState('invalid');
      })
      .catch(() => setState('error'));
  }, [token]);

  useEffect(() => {
    if (state !== 'valid' || !user || !token) return;
    setState('accepting');
    supabase.auth.getSession().then(({ data: { session } }) => {
      fetch('/api/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ token }),
      })
        .then(r => r.json())
        .then(data => {
          if (data.success) { setState('done'); setTimeout(() => navigate('/host-dashboard/simple'), 1500); }
          else { setErrorMsg(data.error || 'Failed to accept'); setState('error'); }
        })
        .catch(() => setState('error'));
    });
  }, [state, user, token, navigate]);

  const handleSignIn = () => {
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.href, queryParams: { access_type: 'offline', prompt: 'select_account' } },
    });
  };

  const roleLabel = inviteInfo?.role
    ? inviteInfo.role.charAt(0).toUpperCase() + inviteInfo.role.slice(1)
    : 'Team Member';

  if (state === 'loading' || state === 'accepting') {
    return (
      <div className="min-h-screen bg-warm-white flex items-center justify-center">
        <div className="text-center">
          <div aria-hidden="true" className="animate-spin rounded-full h-8 w-8 border-2 border-border-gray border-t-burgundy mx-auto mb-3" />
          <p className="text-sm text-stone-gray" role="status">{state === 'accepting' ? 'Activating your account…' : 'Loading…'}</p>
        </div>
      </div>
    );
  }

  if (state === 'done') {
    return (
      <div className="min-h-screen bg-warm-white flex items-center justify-center p-6">
        <div className="bg-white border border-border-gray rounded-2xl p-8 max-w-sm text-center shadow-sm">
          <h2 className="text-lg font-bold text-deep-charcoal mb-2">You're in!</h2>
          <p className="text-sm text-stone-gray">Redirecting to your dashboard…</p>
        </div>
      </div>
    );
  }

  if (state === 'invalid' || state === 'expired' || state === 'error') {
    return (
      <div className="min-h-screen bg-warm-white flex items-center justify-center p-6">
        <div className="bg-white border border-border-gray rounded-2xl p-8 max-w-sm text-center shadow-sm">
          <h2 className="text-lg font-bold text-deep-charcoal mb-2">
            {state === 'expired' ? 'Invitation expired' : 'Invalid invitation'}
          </h2>
          <p className="text-sm text-stone-gray">
            {state === 'expired'
              ? 'This invite link has expired. Ask the restaurant owner to send a new one.'
              : errorMsg || 'This invite link is not valid.'}
          </p>
        </div>
      </div>
    );
  }

  // state === 'valid', user not logged in
  return (
    <div className="min-h-screen bg-warm-white flex items-center justify-center p-6">
      <div className="bg-white border border-border-gray rounded-2xl p-8 max-w-sm text-center shadow-sm">
        <h2 className="text-xl font-bold text-deep-charcoal mb-2">You're invited!</h2>
        <p className="text-sm text-stone-gray mb-1">
          Join as <span className="font-semibold text-deep-charcoal">{roleLabel}</span>
        </p>
        {inviteInfo?.email && (
          <p className="text-xs text-muted-stone mb-6">Invitation sent to {inviteInfo.email}</p>
        )}
        <button
          onClick={handleSignIn}
          className="w-full py-3 bg-burgundy hover:bg-burgundy-dark text-white font-semibold rounded-xl transition-colors text-sm"
        >
          Sign in with Google to accept
        </button>
      </div>
    </div>
  );
}

/**
 * Join Page — handles invite link clicks
 * Route: /join?token=<invite_token>
 *
 * Flow:
 *  1. Validate token via GET /api/invitations?token=
 *  2. If not logged in → show "Sign in to accept" button
 *  3. If logged in → POST /api/invitations to accept → redirect to dashboard
 */

import { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

export default function JoinPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const token = searchParams.get('token');

  const validateQuery = useQuery<{ email: string; role: string }>({
    queryKey: ['invitation', token],
    queryFn: async () => {
      const res = await fetch(`/api/invitations?token=${token!}`);
      const data = await res.json();
      if (!data.success) {
        const err = new Error(data.error || 'invalid') as Error & { expired?: boolean };
        err.expired = Boolean(data.error?.includes('expired'));
        throw err;
      }
      return { email: data.email, role: data.role };
    },
    enabled: !!token,
    retry: false,
    staleTime: Infinity,
  });

  const acceptMutation = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/invitations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to accept');
      return data;
    },
    onSuccess: () => setTimeout(() => navigate('/host-dashboard/simple'), 1500),
  });

  // Auto-accept once token is validated and user is logged in
  useEffect(() => {
    if (
      validateQuery.data &&
      user &&
      !acceptMutation.isPending &&
      !acceptMutation.isSuccess &&
      !acceptMutation.isError
    ) {
      acceptMutation.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validateQuery.data, user]);

  const inviteInfo = validateQuery.data ?? null;
  const rawRole = inviteInfo?.role;
  // Translate role labels; fall back to a Title-cased version of whatever the API sent.
  const roleLabel = rawRole
    ? t(`join.role.${rawRole}`, rawRole.charAt(0).toUpperCase() + rawRole.slice(1))
    : t('join.role.teamMember', 'Team Member');

  const handleSignIn = () => {
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.href,
        queryParams: { access_type: 'offline', prompt: 'select_account' },
      },
    });
  };

  // ─── Loading / accepting ────────────────────────────────────────────────────
  if (!token || validateQuery.isLoading || acceptMutation.isPending) {
    const msg = acceptMutation.isPending
      ? t('join.activating', 'Activating your account…')
      : t('join.loading', 'Loading…');
    return (
      <div className="min-h-screen bg-warm-white flex items-center justify-center">
        <div className="text-center">
          <div aria-hidden="true" className="animate-spin rounded-full h-8 w-8 border-2 border-border-gray border-t-burgundy mx-auto mb-3" />
          <p className="text-sm text-stone-gray" role="status">{msg}</p>
        </div>
      </div>
    );
  }

  // ─── Done ───────────────────────────────────────────────────────────────────
  if (acceptMutation.isSuccess) {
    return (
      <div className="min-h-screen bg-warm-white flex items-center justify-center p-6">
        <div className="bg-white border border-border-gray rounded-2xl p-8 max-w-sm text-center shadow-sm">
          <h2 className="text-lg font-bold text-deep-charcoal mb-2">{t('join.success', "You're in!")}</h2>
          <p className="text-sm text-stone-gray">{t('join.redirecting', 'Redirecting to your dashboard…')}</p>
        </div>
      </div>
    );
  }

  // ─── Error / invalid / expired ──────────────────────────────────────────────
  if (validateQuery.isError || acceptMutation.isError) {
    const validateErr = validateQuery.error as (Error & { expired?: boolean }) | null;
    const isExpired = validateErr?.expired;
    const errorMsg = acceptMutation.isError
      ? (acceptMutation.error instanceof Error ? acceptMutation.error.message : t('join.acceptFailed', 'Failed to accept invitation'))
      : '';
    return (
      <div className="min-h-screen bg-warm-white flex items-center justify-center p-6">
        <div className="bg-white border border-border-gray rounded-2xl p-8 max-w-sm text-center shadow-sm">
          <h2 className="text-lg font-bold text-deep-charcoal mb-2">
            {isExpired ? t('join.expiredTitle', 'Invitation expired') : t('join.invalidTitle', 'Invalid invitation')}
          </h2>
          <p className="text-sm text-stone-gray">
            {isExpired
              ? t('join.expiredBody', 'This invite link has expired. Ask the restaurant owner to send a new one.')
              : errorMsg || t('join.invalidBody', 'This invite link is not valid.')}
          </p>
        </div>
      </div>
    );
  }

  // ─── Valid, user not logged in ──────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-warm-white flex items-center justify-center p-6">
      <div className="bg-white border border-border-gray rounded-2xl p-8 max-w-sm text-center shadow-sm">
        <h2 className="text-xl font-bold text-deep-charcoal mb-2">{t('join.invitedTitle', "You're invited!")}</h2>
        <p className="text-sm text-stone-gray mb-1">
          {t('join.joinAs', 'Join as')}{' '}
          <span className="font-semibold text-deep-charcoal">{roleLabel}</span>
        </p>
        {inviteInfo?.email && (
          <p className="text-xs text-muted-stone mb-6">
            {t('join.sentTo', 'Invitation sent to {{email}}', { email: inviteInfo.email })}
          </p>
        )}
        <button
          type="button"
          onClick={handleSignIn}
          className="w-full py-3 bg-burgundy hover:bg-burgundy-dark text-white font-semibold rounded-xl transition-colors text-sm"
        >
          {t('join.signInToAccept', 'Sign in with Google to accept')}
        </button>
      </div>
    </div>
  );
}

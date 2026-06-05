/**
 * Instagram connector panel — lives in /host-dashboard/voice-settings under
 * the "Instagram" tab. Lets the user connect their IG Business account so
 * Seatable can learn their tone of voice (C2) and draft captions (C3).
 *
 * Modeled after StripeConnectPanel for visual + behavior parity.
 *
 * State machine:
 *   - not connected → "Connect Instagram" button → opens Meta OAuth in new tab
 *   - active        → shows handle + picture + followers + tone profile status
 *   - expired       → "Reconnect Instagram" (token past 60d)
 *   - restricted    → amber pill, shows last_error
 *   - revoked       → red pill, "Reconnect"
 */
import { useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { authFetch } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import { useInstagramStatus, type InstagramStatus, INSTAGRAM_STATUS_QUERY_KEY } from '../../hooks/useInstagramStatus';
import InstagramCaptionDrafter from './InstagramCaptionDrafter';

const STATUS_TONE: Record<InstagramStatus, { dot: string; bg: string; text: string; label: string }> = {
  active:     { dot: 'bg-emerald-500', bg: 'bg-emerald-100', text: 'text-emerald-800', label: 'Connected' },
  restricted: { dot: 'bg-amber-500',   bg: 'bg-amber-100',   text: 'text-amber-800',   label: 'Restricted' },
  expired:    { dot: 'bg-amber-500',   bg: 'bg-amber-100',   text: 'text-amber-800',   label: 'Expired' },
  revoked:    { dot: 'bg-red-500',     bg: 'bg-red-100',     text: 'text-red-800',     label: 'Revoked' },
};

// Map the callback's redirect reasons to user-facing toast copy. Same
// pattern as POSIntegrationPanel for Square return params.
const RETURN_REASONS: Record<string, { kind: 'success' | 'info' | 'error'; copy: string }> = {
  ok:                       { kind: 'success', copy: 'Instagram connected. Learning your tone now…' },
  denied:                   { kind: 'info',    copy: 'You declined the Instagram permissions — no harm done.' },
  no_ig_account:            { kind: 'error',   copy: "We couldn't find an Instagram Business account on any of your Pages. Convert your IG to a Business account and try again." },
  invalid_state:            { kind: 'error',   copy: 'That connect link expired (10 min limit) — please try again.' },
  token_exchange_failed:    { kind: 'error',   copy: 'Meta refused the connection. Please retry.' },
  long_token_exchange_failed: { kind: 'error', copy: 'Meta refused the long-lived token. Please retry.' },
  pages_fetch_failed:       { kind: 'error',   copy: "Couldn't list your Facebook Pages. Check you granted page permissions." },
  not_configured:           { kind: 'error',   copy: 'Instagram connector not yet configured on the server.' },
  server_error:             { kind: 'error',   copy: 'Something broke on our end — please try again or contact support.' },
};

interface OAuthStartResponse {
  success: boolean;
  url?: string;
  error?: string;
}

export default function InstagramPanel() {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();

  // Handle ?instagram_connect=<reason> return params after Meta redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reason = params.get('instagram_connect');
    if (!reason) return;

    const mapped = RETURN_REASONS[reason] ?? { kind: 'error' as const, copy: `Connection failed (${reason}).` };
    if (mapped.kind === 'success') toast.success(t(`instagram.return.${reason}`, mapped.copy));
    else if (mapped.kind === 'info') toast.info(t(`instagram.return.${reason}`, mapped.copy));
    else toast.error(t(`instagram.return.${reason}`, mapped.copy));

    // Refresh status so the panel shows the new connection
    queryClient.invalidateQueries({ queryKey: INSTAGRAM_STATUS_QUERY_KEY });

    // Strip the param so a page reload doesn't re-fire the toast
    const url = new URL(window.location.href);
    url.searchParams.delete('instagram_connect');
    window.history.replaceState({}, '', url.toString());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { data, isLoading, isError } = useInstagramStatus();

  const connectMutation = useMutation<string, Error>({
    mutationFn: async () => {
      const res = await authFetch('/api/instagram/oauth-start', { method: 'GET' });
      const body = (await res.json().catch(() => null)) as OAuthStartResponse | null;
      if (!res.ok || !body?.url) {
        throw new Error(body?.error || `Failed to start OAuth (HTTP ${res.status})`);
      }
      return body.url;
    },
    onSuccess: (url) => {
      // Open in same tab — Meta redirects back to /host-dashboard/voice-settings
      // with the ?instagram_connect=<reason> param the useEffect above handles.
      window.location.href = url;
    },
    onError: (err) => {
      toast.error(t('instagram.connectFailed', `Couldn't start Instagram connection: ${err.message}`));
    },
  });

  // Refresh-tone mutation: re-runs the LLM extractor over the last 30 posts.
  // Triggered by the small button under the IG handle row. Surfaces a toast
  // with the result so users see "Tone profile updated" or the upstream error.
  const refreshToneMutation = useMutation<unknown, Error>({
    mutationFn: async () => {
      const res = await authFetch('/api/instagram/recompute-tone', { method: 'POST' });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; profile?: unknown } | null;
      if (!res.ok || !body?.ok) {
        throw new Error(body?.error || `Refresh failed (HTTP ${res.status})`);
      }
      return body.profile;
    },
    onSuccess: () => {
      toast.success(t('instagram.toneRefreshed', 'Tone profile updated from your recent posts.'));
      queryClient.invalidateQueries({ queryKey: INSTAGRAM_STATUS_QUERY_KEY });
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  if (isLoading) {
    return <div className="text-sm text-muted-stone" data-testid="instagram-panel-loading">Loading Instagram status…</div>;
  }
  if (isError) {
    return (
      <div className="text-sm text-red-700" data-testid="instagram-panel-error">
        Couldn't fetch Instagram status. Refresh to retry.
      </div>
    );
  }

  const connected = data?.connected;
  const status = data?.status;
  const tone = STATUS_TONE[status as InstagramStatus] ?? null;

  return (
    <section className="glass-card p-6 space-y-5" data-testid="instagram-panel">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-deep-charcoal">Instagram</h2>
          <p className="text-sm text-muted-stone">
            {connected
              ? 'Seatable will learn your tone of voice from your recent posts and help draft new captions.'
              : 'Connect your Instagram Business account so Seatable can learn your tone of voice and help with content.'}
          </p>
        </div>
        {tone && (
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs ${tone.bg} ${tone.text}`}
            data-testid="instagram-panel-status-pill"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} />
            {tone.label}
          </span>
        )}
      </header>

      {connected && data?.username && (
        <div className="p-3 bg-white/60 backdrop-blur-glass-chip border border-glass-border-dark rounded-xl space-y-3" data-testid="instagram-panel-connected-card">
          <div className="flex items-center gap-3">
            {data.profile_picture_url && (
              <img
                src={data.profile_picture_url}
                alt=""
                className="w-10 h-10 rounded-full object-cover"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
              />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-deep-charcoal truncate">
                {data.display_name || `@${data.username}`}
                {data.display_name && <span className="text-muted-stone font-normal"> @{data.username}</span>}
              </p>
              <p className="text-xs text-muted-stone">
                {typeof data.followers_count === 'number' && `${data.followers_count.toLocaleString()} followers · `}
                {data.tone_profile_ready ? 'Tone profile ready' : 'Building tone profile…'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => refreshToneMutation.mutate()}
              disabled={refreshToneMutation.isPending}
              className="text-xs text-burgundy underline underline-offset-2 hover:text-burgundy-dark disabled:opacity-50"
              data-testid="instagram-panel-refresh-tone-cta"
            >
              {refreshToneMutation.isPending ? 'Refreshing…' : data.tone_profile_ready ? 'Refresh tone' : 'Build now'}
            </button>
          </div>

          {data.biography && (
            <p
              className="text-xs text-muted-stone whitespace-pre-line border-t border-glass-border-dark pt-3"
              data-testid="instagram-panel-bio"
            >
              {data.biography}
            </p>
          )}

          {data.website && (
            <a
              href={data.website}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 text-xs text-burgundy hover:text-burgundy-dark underline underline-offset-2"
              data-testid="instagram-panel-website-link"
            >
              {websiteLabel(data.website, data.bio_links)}
              <span aria-hidden>↗</span>
            </a>
          )}
        </div>
      )}

      {status === 'restricted' && data?.last_error && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Last error from Meta: {data.last_error}
        </p>
      )}

      {connected && (
        <InstagramCaptionDrafter
          toneProfileReady={!!data?.tone_profile_ready}
          language={data?.tone_language ?? null}
        />
      )}

      <div>
        <button
          type="button"
          onClick={() => connectMutation.mutate()}
          disabled={connectMutation.isPending}
          className="px-4 py-2 bg-burgundy text-white rounded-lg text-sm font-medium hover:bg-burgundy-dark transition-colors disabled:opacity-50"
          data-testid="instagram-panel-connect-cta"
        >
          {connectMutation.isPending
            ? 'Opening Meta…'
            : connected ? 'Reconnect Instagram' : 'Connect Instagram'}
        </button>
      </div>
    </section>
  );
}

/**
 * Instagram connector panel — lives in /host-dashboard/integrations under
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
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { authFetch } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import { useInstagramStatus, type InstagramStatus, INSTAGRAM_STATUS_QUERY_KEY } from '../../hooks/useInstagramStatus';
import InstagramCaptionDrafter from './InstagramCaptionDrafter';
import InstagramScheduledPostsPanel from './InstagramScheduledPostsPanel';
import InstagramReelPanel from './InstagramReelPanel';
import { subscribeReelCaption } from './instagramCaptionBus';

type InstagramView = 'feed' | 'reel' | 'scheduled';

const STATUS_TONE: Record<InstagramStatus, { dot: string; bg: string; text: string }> = {
  active:     { dot: 'bg-emerald-500', bg: 'bg-emerald-100', text: 'text-emerald-800' },
  restricted: { dot: 'bg-amber-500',   bg: 'bg-amber-100',   text: 'text-amber-800' },
  expired:    { dot: 'bg-amber-500',   bg: 'bg-amber-100',   text: 'text-amber-800' },
  revoked:    { dot: 'bg-red-500',     bg: 'bg-red-100',     text: 'text-red-800' },
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

/**
 * Returns the URL when its scheme is http(s), otherwise null. Defends
 * against XSS via `javascript:`/`data:`/`vbscript:` URLs in the IG bio
 * field — Meta does not sanitise the website field and an attacker who
 * owns the IG account could set it to a hostile scheme that would
 * execute when a host (the restaurant owner) clicks it from our panel.
 */
function safeHttpUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol === 'http:' || u.protocol === 'https:') return url;
  } catch { /* malformed url — refuse */ }
  return null;
}

/**
 * Friendly label for the bio website link: shows "View on linktr.ee" when
 * the URL is a known aggregator (we know that because the server populated
 * bio_links for it), otherwise shows the host.
 */
function websiteLabel(url: string, bioLinks: ReadonlyArray<{ host: string }> | null, linksLabel: string): string {
  let host = '';
  try { host = new URL(url).host.replace(/^www\./, ''); } catch { host = url; }
  if (bioLinks && bioLinks.length > 0) return `${host} (${bioLinks.length} ${linksLabel})`;
  return host;
}

export default function InstagramPanel() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [view, setView] = useState<InstagramView>('feed');

  // Both editors stay mounted, so switching views never discards an upload,
  // generated caption, or the local schedule form. A caption transfer opens
  // the Reel view before its editor scrolls into place.
  useEffect(() => subscribeReelCaption(() => setView('reel')), []);

  // Handle ?instagram_connect=<reason> return params after Meta redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reason = params.get('instagram_connect');
    if (!reason) return;

    const mapped = RETURN_REASONS[reason];
    const message = mapped ? t(`instagram.return.${reason}`, mapped.copy) : t('instagramPanel.connectFailed');
    if (mapped?.kind === 'success') toast.success(message);
    else if (mapped?.kind === 'info') toast.info(message);
    else toast.error(message);

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
      // Open in same tab — Meta redirects back to /host-dashboard/integrations
      // with the ?instagram_connect=<reason> param the useEffect above handles.
      window.location.href = url;
    },
    onError: (err) => {
      toast.error(`${t('instagramPanel.connectFailed')}: ${err.message}`);
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
      toast.success(t('instagramPanel.toneRefreshed'));
      queryClient.invalidateQueries({ queryKey: INSTAGRAM_STATUS_QUERY_KEY });
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  if (isLoading) {
    return <div className="text-sm text-muted-stone" data-testid="instagram-panel-loading">{t('instagramPanel.loading')}</div>;
  }
  if (isError) {
    return (
      <div className="text-sm text-red-700" data-testid="instagram-panel-error">
        {t('instagramPanel.loadFailed')}
      </div>
    );
  }

  const connected = data?.connected;
  const status = data?.status;
  const tone = STATUS_TONE[status as InstagramStatus] ?? null;

  return (
    <section className="space-y-6" data-testid="instagram-panel">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="font-serif text-2xl text-deep-charcoal">Instagram</h2>
          <p className="text-sm text-muted-stone">
            {connected
              ? t('instagramPanel.connectedDescription')
              : t('instagramPanel.connectDescription')}
          </p>
        </div>
        {tone && (
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs ${tone.bg} ${tone.text}`}
            data-testid="instagram-panel-status-pill"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} />
            {t(`instagramPanel.status.${status}`)}
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
                {typeof data.followers_count === 'number' && `${t('instagramPanel.followers', { count: data.followers_count, formattedCount: data.followers_count.toLocaleString(i18n.language) })} · `}
                {data.tone_profile_ready ? t('instagramPanel.toneReady') : t('instagramPanel.toneBuilding')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => refreshToneMutation.mutate()}
              disabled={refreshToneMutation.isPending}
              className="text-xs text-burgundy underline underline-offset-2 hover:text-burgundy-dark disabled:opacity-50"
              data-testid="instagram-panel-refresh-tone-cta"
            >
              {refreshToneMutation.isPending ? t('instagramPanel.refreshing') : data.tone_profile_ready ? t('instagramPanel.refreshTone') : t('instagramPanel.buildNow')}
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

          {data.website && safeHttpUrl(data.website) && (
            <a
              href={safeHttpUrl(data.website)!}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 text-xs text-burgundy hover:text-burgundy-dark underline underline-offset-2"
              data-testid="instagram-panel-website-link"
            >
              {websiteLabel(data.website, data.bio_links, t('instagramPanel.links'))}
              <span aria-hidden>↗</span>
            </a>
          )}
        </div>
      )}

      {status === 'restricted' && data?.last_error && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {t('instagramPanel.metaError')}: {data.last_error}
        </p>
      )}

      {connected && (
        <div className="space-y-6" data-testid="instagram-workspace">
          <div className="hairline" />
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-stone">
              {t('instagramPanel.workspaceEyebrow')}
            </p>
            <h3 className="font-serif text-2xl text-deep-charcoal mt-1">
              {t('instagramPanel.workspaceTitle')}
            </h3>
            <p className="text-[15px] text-muted-stone mt-1 max-w-2xl">
              {t('instagramPanel.workspaceDescription')}
            </p>
          </div>
          <div className="flex flex-wrap gap-2" role="tablist" aria-label={t('instagramPanel.workspaceTitle')}>
            {(['feed', 'reel', 'scheduled'] as const).map((item) => (
              <button
                key={item}
                id={`instagram-view-${item}`}
                type="button"
                role="tab"
                aria-selected={view === item}
                aria-controls={`instagram-panel-${item}`}
                tabIndex={view === item ? 0 : -1}
                onClick={() => setView(item)}
                onKeyDown={(event) => {
                  const views: InstagramView[] = ['feed', 'reel', 'scheduled'];
                  const index = views.indexOf(item);
                  const nextIndex = event.key === 'ArrowRight' ? (index + 1) % views.length
                    : event.key === 'ArrowLeft' ? (index + views.length - 1) % views.length
                      : event.key === 'Home' ? 0 : event.key === 'End' ? views.length - 1 : -1;
                  if (nextIndex < 0) return;
                  event.preventDefault();
                  setView(views[nextIndex]);
                  document.getElementById(`instagram-view-${views[nextIndex]}`)?.focus();
                }}
                className={`rounded-[100px] border px-4 py-2 text-sm transition-colors ${view === item
                  ? 'border-burgundy bg-burgundy text-white'
                  : 'border-glass-border-dark bg-white/60 text-deep-charcoal hover:border-burgundy'}`}
                data-testid={`instagram-view-${item}`}
              >
                {t(`instagramPanel.view.${item}`)}
              </button>
            ))}
          </div>
          <div id="instagram-panel-feed" role="tabpanel" aria-labelledby="instagram-view-feed" hidden={view !== 'feed'}>
            <InstagramCaptionDrafter
              toneProfileReady={!!data?.tone_profile_ready}
              language={data?.tone_language ?? null}
            />
            <button
              type="button"
              onClick={() => setView('reel')}
              className="mt-4 text-sm text-burgundy underline underline-offset-2 hover:text-burgundy-dark"
              data-testid="instagram-reel-panel-toggle"
            >
              {t('instagramPanel.switchToReel')}
            </button>
          </div>
          <div id="instagram-panel-reel" role="tabpanel" aria-labelledby="instagram-view-reel" hidden={view !== 'reel'}>
            <InstagramReelPanel workspaceMode onClose={() => setView('feed')} />
          </div>
          <div id="instagram-panel-scheduled" role="tabpanel" aria-labelledby="instagram-view-scheduled" hidden={view !== 'scheduled'}>
            <InstagramScheduledPostsPanel showEmptyState />
          </div>
        </div>
      )}

      <div>
        <button
          type="button"
          onClick={() => connectMutation.mutate()}
          disabled={connectMutation.isPending}
          className={connected
            ? 'text-sm text-burgundy underline underline-offset-2 hover:text-burgundy-dark disabled:opacity-50'
            : 'px-5 py-2.5 bg-burgundy text-white rounded-[100px] text-sm font-medium hover:bg-burgundy-dark transition-colors disabled:opacity-50'}
          data-testid="instagram-panel-connect-cta"
        >
          {connectMutation.isPending
            ? t('instagramPanel.openingMeta')
            : connected ? t('instagramPanel.reconnect') : t('instagramPanel.connect')}
        </button>
      </div>
    </section>
  );
}

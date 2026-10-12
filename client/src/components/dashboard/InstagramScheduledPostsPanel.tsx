/**
 * Lists scheduled Instagram posts for this restaurant and lets the user
 * cancel pending ones before the cron fires them.
 *
 * Three sections (each shows max 5 most recent of its kind, collapsible):
 *   - Pending (status='pending')   — scheduled to publish in the future
 *   - Recently published           — status='completed' with permalink
 *   - Failed                       — status='failed' with error
 *
 * Lives below the drafter inside InstagramPanel. Hidden entirely if
 * there's nothing to show — keeps the panel clean for users who never
 * use scheduling.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { authFetch } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import ThiingsIcon from '../common/ThiingsIcon';

interface ScheduledPost {
  id: string;
  caption: string;
  // media_type can be missing on rows created before the C.21 migration
  // backfill ran — treat undefined as 'feed' for back-compat.
  media_type?: 'feed' | 'reel' | null;
  image_urls: string[] | null;
  video_url?: string | null;
  scheduled_at: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'canceled';
  ig_permalink: string | null;
  error: string | null;
  attempts: number;
  created_at: string;
  completed_at: string | null;
}

function MediaTypeBadge({ post }: { post: ScheduledPost }) {
  if (post.media_type !== 'reel') return null;
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-stone-100 text-deep-charcoal text-[9px] uppercase font-medium tracking-wide"
      data-testid={`instagram-scheduled-reel-badge-${post.id}`}
    >
      Reel
    </span>
  );
}

const QUERY_KEY = ['instagram-scheduled-posts'] as const;
const PREVIEW_LIMIT = 5;

export default function InstagramScheduledPostsPanel({ showEmptyState = false }: { showEmptyState?: boolean }) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [pendingExpanded, setPendingExpanded] = useState(true);
  const [publishedExpanded, setPublishedExpanded] = useState(false);
  const [failedExpanded, setFailedExpanded] = useState(true);
  const [visibleCount, setVisibleCount] = useState<Record<'pending' | 'failed' | 'published', number>>({
    pending: PREVIEW_LIMIT, failed: PREVIEW_LIMIT, published: PREVIEW_LIMIT,
  });
  const showMore = (section: 'pending' | 'failed' | 'published') =>
    setVisibleCount((previous) => ({ ...previous, [section]: previous[section] + PREVIEW_LIMIT }));

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<{ posts: ScheduledPost[] }> => {
      const res = await authFetch('/api/instagram/schedule-post', { method: 'GET' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      return { posts: Array.isArray(body?.posts) ? body.posts : [] };
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const cancelMutation = useMutation<{ canceled: boolean }, Error, { id: string }>({
    mutationFn: async ({ id }) => {
      const res = await authFetch(`/api/instagram/schedule-post?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; canceled?: boolean; error?: string } | null;
      if (!res.ok || !body?.ok) throw new Error(body?.error || `Cancel failed (HTTP ${res.status})`);
      return { canceled: !!body.canceled };
    },
    onSuccess: ({ canceled }) => {
      if (canceled) {
        toast.success(t('instagram.scheduled.canceled'));
      } else {
        // The cron picked it up between fetch and click — show a softer message.
        toast.info(t('instagram.scheduled.cancelTooLate'));
      }
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) return showEmptyState
    ? <p role="status" className="text-sm text-muted-stone">{t('instagramPanel.loading')}</p>
    : null;
  if (isError) {
    return (
      <div className="text-xs text-red-700" data-testid="instagram-scheduled-posts-error">
        {t('instagram.scheduled.loadFailed')}{' '}
        <button type="button" onClick={() => refetch()} className="underline">{t('instagram.scheduled.retry')}</button>
      </div>
    );
  }

  const posts = data?.posts || [];
  const pending = posts
    .filter((p) => p.status === 'pending' || p.status === 'processing')
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
  const published = posts
    .filter((p) => p.status === 'completed')
    .sort((a, b) => new Date(b.completed_at || b.scheduled_at).getTime() - new Date(a.completed_at || a.scheduled_at).getTime());
  const failed = posts
    .filter((p) => p.status === 'failed')
    .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime());

  // Hide the whole panel if nothing's relevant — drafter alone for the
  // common case of users who haven't used scheduling.
  if (pending.length === 0 && published.length === 0 && failed.length === 0) {
    return showEmptyState ? (
      <div className="py-8 border-t border-glass-border-dark" data-testid="instagram-scheduled-empty">
        <h3 className="font-serif text-2xl text-deep-charcoal">{t('instagramPanel.scheduledEmptyTitle')}</h3>
        <p className="text-[15px] text-muted-stone mt-2 max-w-xl">{t('instagramPanel.scheduledEmptyBody')}</p>
      </div>
    ) : null;
  }

  return (
    <section
      className="space-y-6"
      data-testid="instagram-scheduled-posts-panel"
    >
      <header className="flex items-center justify-between">
        <h3 className="font-serif text-2xl text-deep-charcoal">{t('instagram.scheduled.title')}</h3>
        <button
          type="button"
          onClick={() => refetch()}
          className="text-xs text-burgundy underline underline-offset-2"
        >
          {t('instagram.scheduled.refresh')}
        </button>
      </header>

      {pending.length > 0 && (
        <Section
          title={t('instagram.scheduled.pending', { count: pending.length })}
          testId="scheduled-pending"
          expanded={pendingExpanded}
          onToggle={() => setPendingExpanded((v) => !v)}
        >
          {pending.slice(0, visibleCount.pending).map((p) => (
            <PendingRow
              key={p.id}
              post={p}
              onCancel={() => cancelMutation.mutate({ id: p.id })}
              canceling={cancelMutation.isPending}
            />
          ))}
          {pending.length > visibleCount.pending && (
            <button type="button" onClick={() => showMore('pending')} className="text-sm text-burgundy underline underline-offset-2">
              {t('instagram.scheduled.showMore', { count: pending.length - visibleCount.pending })}
            </button>
          )}
        </Section>
      )}

      {failed.length > 0 && (
        <Section
          title={t('instagram.scheduled.failed', { count: failed.length })}
          testId="scheduled-failed"
          expanded={failedExpanded}
          onToggle={() => setFailedExpanded((v) => !v)}
        >
          {failed.slice(0, visibleCount.failed).map((p) => (
            <FailedRow key={p.id} post={p} />
          ))}
          {failed.length > visibleCount.failed && (
            <button type="button" onClick={() => showMore('failed')} className="text-sm text-burgundy underline underline-offset-2">
              {t('instagram.scheduled.showMore', { count: failed.length - visibleCount.failed })}
            </button>
          )}
        </Section>
      )}

      {published.length > 0 && (
        <Section
          title={t('instagram.scheduled.published', { count: published.length })}
          testId="scheduled-published"
          expanded={publishedExpanded}
          onToggle={() => setPublishedExpanded((v) => !v)}
        >
          {published.slice(0, visibleCount.published).map((p) => (
            <PublishedRow key={p.id} post={p} />
          ))}
          {published.length > visibleCount.published && (
            <button type="button" onClick={() => showMore('published')} className="text-sm text-burgundy underline underline-offset-2">
              {t('instagram.scheduled.showMore', { count: published.length - visibleCount.published })}
            </button>
          )}
        </Section>
      )}
    </section>
  );
}

function Section({
  title, testId, expanded, onToggle, children,
}: {
  title: string;
  testId: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div data-testid={`instagram-${testId}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={`instagram-${testId}-content`}
        className="w-full flex items-center justify-between text-xs font-medium text-deep-charcoal py-1 hover:text-burgundy transition-colors"
      >
        <span>{title}</span>
        <ThiingsIcon name="chevron-down" pxSize={16} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      <div id={`instagram-${testId}-content`} hidden={!expanded} className="space-y-2 mt-2">{children}</div>
    </div>
  );
}

function PendingRow({ post, onCancel, canceling }: { post: ScheduledPost; onCancel: () => void; canceling: boolean }) {
  const { t, i18n } = useTranslation();
  const isReel = post.media_type === 'reel';
  const imageCount = post.image_urls?.length ?? 0;
  return (
    <div
      className="flex items-start gap-3 p-2 border border-glass-border-input rounded-lg bg-white"
      data-testid={`instagram-pending-row-${post.id}`}
    >
      <Thumb post={post} />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-deep-charcoal line-clamp-2">
          <MediaTypeBadge post={post} />
          {isReel ? <> </> : null}
          {post.caption}
        </p>
        <p className="text-[11px] text-muted-stone mt-1">
          {new Date(post.scheduled_at).toLocaleString(i18n.language)}
          {isReel
            ? <> · {t('instagram.scheduled.reel')}</>
            : <> · {t('instagram.scheduled.images', { count: imageCount })}</>
          }
          {post.status === 'processing' && <span className="text-amber-700"> · {t('instagram.scheduled.processing')}</span>}
        </p>
      </div>
      <button
        type="button"
        onClick={onCancel}
        disabled={canceling || post.status === 'processing'}
        className="text-xs text-red-700 underline underline-offset-2 hover:text-red-900 disabled:opacity-50"
        data-testid={`instagram-pending-cancel-${post.id}`}
      >
        {t('instagram.scheduled.cancel')}
      </button>
    </div>
  );
}

function PublishedRow({ post }: { post: ScheduledPost }) {
  const { t, i18n } = useTranslation();
  return (
    <div
      className="flex items-start gap-3 p-2 border border-glass-border-input rounded-lg bg-white"
      data-testid={`instagram-published-row-${post.id}`}
    >
      <Thumb post={post} />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-deep-charcoal line-clamp-2">
          <MediaTypeBadge post={post} />
          {post.media_type === 'reel' ? <> </> : null}
          {post.caption}
        </p>
        <p className="text-[11px] text-muted-stone mt-1">
          {t('instagram.scheduled.postedAt', { date: post.completed_at ? new Date(post.completed_at).toLocaleString(i18n.language) : '—' })}
        </p>
      </div>
      {post.ig_permalink && (
        <a
          href={post.ig_permalink}
          target="_blank"
          rel="noreferrer noopener"
          className="text-xs text-burgundy underline underline-offset-2"
          data-testid={`instagram-published-permalink-${post.id}`}
        >
          {t('instagram.scheduled.view')} ↗
        </a>
      )}
    </div>
  );
}

function FailedRow({ post }: { post: ScheduledPost }) {
  const { t, i18n } = useTranslation();
  return (
    <div
      className="flex items-start gap-3 p-2 border border-red-300 rounded-lg bg-red-50"
      data-testid={`instagram-failed-row-${post.id}`}
    >
      <Thumb post={post} />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-deep-charcoal line-clamp-2">
          <MediaTypeBadge post={post} />
          {post.media_type === 'reel' ? <> </> : null}
          {post.caption}
        </p>
        <p className="text-[11px] text-red-700 mt-1">
          {post.error || t('instagram.scheduled.publishFailed')} · {t('instagram.scheduled.attempts', { count: post.attempts })} ·{' '}
          {new Date(post.scheduled_at).toLocaleString(i18n.language)}
        </p>
      </div>
    </div>
  );
}

/**
 * Thumbnail tile. Feed posts use image_urls[0] (the cover slide of a
 * carousel, or the only image of a single). Reels don't carry a poster
 * frame in the schedule row (we don't generate one server-side yet), so
 * we render a play-icon placeholder instead.
 */
function Thumb({ post }: { post: ScheduledPost }) {
  if (post.media_type === 'reel') {
    return (
      <div
        className="relative w-10 h-10 rounded overflow-hidden border border-glass-border-dark bg-deep-charcoal flex items-center justify-center flex-shrink-0"
        data-testid={`instagram-thumb-reel-${post.id}`}
      >
        <ThiingsIcon name="play" pxSize={18} className="text-white" />
      </div>
    );
  }
  const urls = post.image_urls || [];
  const first = urls[0];
  if (!first) return null;
  return (
    <div className="relative w-10 h-10 rounded overflow-hidden border border-glass-border-dark bg-white flex-shrink-0">
      <img src={first} alt="" className="w-full h-full object-cover" />
      {urls.length > 1 && (
        <span className="absolute bottom-0 right-0 bg-deep-charcoal/90 text-white text-[9px] px-1 rounded-tl">
          ×{urls.length}
        </span>
      )}
    </div>
  );
}

/**
 * Reels publisher (C.18). Sits below the carousel/feed-post drafter on
 * InstagramPanel. Mutually exclusive with images: a Reel is a single
 * video, no carousel, no per-image flow.
 *
 * UX is intentionally simpler than the feed-post flow:
 *   - One file picker (mp4 / mov)
 *   - One caption textarea (pre-fillable from the LLM drafter? — out of
 *     scope for v1; users can type or paste)
 *   - "Post as Reel" button → upload → publish-reel endpoint
 *
 * The endpoint blocks for up to 60s while Meta processes the video.
 * We show "Processing… (this can take up to a minute)" so the user
 * knows we haven't hung.
 */
import { useState, useRef, useEffect } from 'react';
import ThiingsIcon from '../../components/common/ThiingsIcon';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { authFetch } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import { subscribeReelCaption } from './instagramCaptionBus';

const MAX_VIDEO_BYTES = 32 * 1024 * 1024;
const MAX_CAPTION_LEN = 2200;
const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 5 * 60_000;  // give up after 5 min — Higgsfield rarely exceeds 2 min

/**
 * Default scheduled time: tomorrow at noon LOCAL. Returned in the
 * "YYYY-MM-DDTHH:mm" shape that <input type="datetime-local"> binds to.
 * Mirrors the helper in InstagramCaptionDrafter — kept duplicated here
 * because cross-importing one tiny helper between two leaf components
 * isn't worth it.
 */
function defaultScheduledAt(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(12, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function InstagramReelPanel({
  disabled = false,
  workspaceMode = false,
  onClose,
}: {
  disabled?: boolean;
  workspaceMode?: boolean;
  onClose?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [caption, setCaption] = useState('');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoName, setVideoName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sectionRef = useRef<HTMLElement>(null);

  // C.20: subscribe to "send caption to reel" events from the feed-post
  // drafter above. On a caption arriving: pre-fill the textarea, open
  // the panel, scroll into view. Toast tells the user where it landed.
  useEffect(() => {
    const unsubscribe = subscribeReelCaption((incoming) => {
      setCaption(incoming);
      setOpen(true);
      // Defer scroll until after the panel actually mounts (open: false → true
      // means the section ref was null when the event fired). One microtask
      // is enough — the panel re-render runs synchronously after setOpen.
      requestAnimationFrame(() => {
        sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
    return unsubscribe;
  }, []);

  const publishMutation = useMutation<
    { permalink: string | null },
    Error,
    { caption: string; video_url: string }
  >({
    mutationFn: async (input) => {
      const res = await authFetch('/api/instagram/publish-reel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const body = (await res.json().catch(() => null)) as {
        ok?: boolean; error?: string; media_id?: string; permalink?: string | null;
      } | null;
      if (!res.ok || !body?.ok) {
        throw new Error(body?.error || `Reel publish failed (HTTP ${res.status})`);
      }
      return { permalink: body.permalink ?? null };
    },
    onSuccess: ({ permalink }) => {
      toast.success(permalink
        ? t('instagram.reel.postedWithLink', { link: permalink })
        : t('instagram.reel.posted'));
      // Reset so the next reel starts fresh
      setOpen(false);
      setCaption('');
      setVideoUrl(null);
      setVideoName(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const fileToBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') return reject(new Error('Read result was not a string'));
      const comma = result.indexOf(',');
      resolve(comma === -1 ? result : result.slice(comma + 1));
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });

  const onVideoSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/^video\/(mp4|quicktime)$/i.test(file.type)) {
      toast.error(t('instagram.reel.invalidType'));
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      toast.error(t('instagram.reel.tooLarge', { size: MAX_VIDEO_BYTES / 1024 / 1024 }));
      return;
    }
    setUploading(true);
    try {
      const dataB64 = await fileToBase64(file);
      const res = await authFetch('/api/instagram/upload-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, content_type: file.type, data_b64: dataB64 }),
      });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; url?: string; error?: string } | null;
      if (!res.ok || !body?.ok || !body.url) {
        throw new Error(body?.error || `Upload failed (HTTP ${res.status})`);
      }
      setVideoUrl(body.url);
      setVideoName(file.name);
      toast.success(t('instagram.reel.uploaded'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('instagram.reel.uploadFailed'));
    } finally {
      setUploading(false);
    }
  };

  const onPublish = () => {
    if (publishMutation.isPending) return;
    if (!videoUrl || caption.trim().length < 1) return;
    publishMutation.mutate({ caption: caption.trim(), video_url: videoUrl });
  };

  // ─── Schedule-for-later (C.21) ─────────────────────────────────────
  // Same pattern as the feed drafter's schedule path — POST to
  // /api/instagram/schedule-post with media_type='reel'. Cron worker
  // branches on media_type.
  const [scheduleMode, setScheduleMode] = useState(false);
  const [scheduledAt, setScheduledAt] = useState<string>(() => defaultScheduledAt());

  const scheduleMutation = useMutation<
    { id: string; scheduled_at: string },
    Error,
    { caption: string; video_url: string; scheduled_at: string }
  >({
    mutationFn: async (input) => {
      const res = await authFetch('/api/instagram/schedule-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...input, media_type: 'reel' }),
      });
      const body = (await res.json().catch(() => null)) as {
        ok?: boolean; error?: string; id?: string; scheduled_at?: string;
      } | null;
      if (!res.ok || !body?.ok || !body.id || !body.scheduled_at) {
        throw new Error(body?.error || `Schedule failed (HTTP ${res.status})`);
      }
      return { id: body.id, scheduled_at: body.scheduled_at };
    },
    onSuccess: ({ scheduled_at }) => {
      const when = new Date(scheduled_at).toLocaleString(i18n.language);
      toast.success(t('instagram.reel.scheduledFor', { date: when }));
      setOpen(false);
      setCaption('');
      setVideoUrl(null);
      setVideoName(null);
      setScheduleMode(false);
      setScheduledAt(defaultScheduledAt());
      queryClient.invalidateQueries({ queryKey: ['instagram-scheduled-posts'] });
    },
    onError: (err) => toast.error(err.message),
  });

  const onSchedule = () => {
    if (scheduleMutation.isPending) return;
    if (!videoUrl || caption.trim().length < 1 || !scheduledAt) return;
    const iso = new Date(scheduledAt).toISOString();
    scheduleMutation.mutate({ caption: caption.trim(), video_url: videoUrl, scheduled_at: iso });
  };

  // ─── AI video generation (C.19) ──────────────────────────────────
  const [genOpen, setGenOpen] = useState(false);
  const [genPrompt, setGenPrompt] = useState('');
  const [genProvider, setGenProvider] = useState<'higgsfield'>('higgsfield');
  const [genJobId, setGenJobId] = useState<string | null>(null);
  const [genStatus, setGenStatus] = useState<'idle' | 'starting' | 'processing' | 'failed' | 'completed'>('idle');
  const [genError, setGenError] = useState<string | null>(null);
  const genStartedAtRef = useRef<number | null>(null);

  const startGenMutation = useMutation<{ job_id: string }, Error, { prompt: string; provider: string }>({
    mutationFn: async (input) => {
      const res = await authFetch('/api/instagram/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; job_id?: string; error?: string } | null;
      if (!res.ok || !body?.ok || !body.job_id) {
        throw new Error(body?.error || `Generation start failed (HTTP ${res.status})`);
      }
      return { job_id: body.job_id };
    },
    onSuccess: ({ job_id }) => {
      setGenJobId(job_id);
      setGenStatus('processing');
      setGenError(null);
      genStartedAtRef.current = Date.now();
    },
    onError: (err) => {
      setGenStatus('failed');
      setGenError(err.message);
      toast.error(err.message);
    },
  });

  // Poll while processing. The interval kicks off when genStatus moves
  // to 'processing' (set in startGenMutation.onSuccess) and clears on
  // unmount or status transition.
  useEffect(() => {
    if (genStatus !== 'processing' || !genJobId) return;
    let canceled = false;
    const poll = async () => {
      if (canceled) return;
      if (genStartedAtRef.current && Date.now() - genStartedAtRef.current > POLL_TIMEOUT_MS) {
        setGenStatus('failed');
        setGenError('Generation took longer than 5 minutes — please try again.');
        return;
      }
      try {
        const res = await authFetch(`/api/instagram/generate-video?job_id=${encodeURIComponent(genJobId)}`, { method: 'GET' });
        const body = (await res.json().catch(() => null)) as { ok?: boolean; status?: string; url?: string; error?: string } | null;
        if (canceled) return;
        if (!res.ok || !body?.ok) {
          setGenStatus('failed');
          setGenError(body?.error || `Poll failed (HTTP ${res.status})`);
          return;
        }
        if (body.status === 'completed' && body.url) {
          // Video ready — populate the upload field so the existing publish
          // flow takes over. User still types caption + clicks Post as Reel.
          setVideoUrl(body.url);
          setVideoName('AI-generated.mp4');
          setGenStatus('completed');
          toast.success(t('instagram.reel.videoGenerated'));
          queryClient.invalidateQueries({ queryKey: ['instagram-gen-spend'] });
          return;
        }
        if (body.status === 'failed') {
          setGenStatus('failed');
          setGenError(body.error || 'Generation failed');
          return;
        }
        // still processing — wait + try again
        setTimeout(poll, POLL_INTERVAL_MS);
      } catch (err) {
        if (canceled) return;
        setGenStatus('failed');
        setGenError(err instanceof Error ? err.message : 'Poll failed');
      }
    };
    setTimeout(poll, POLL_INTERVAL_MS);
    return () => { canceled = true; };
  }, [genStatus, genJobId, t, toast, queryClient]);

  const onStartGen = () => {
    if (startGenMutation.isPending || genStatus === 'processing') return;
    const p = genPrompt.trim();
    if (p.length < 3) return;
    setGenStatus('starting');
    setGenError(null);
    startGenMutation.mutate({ prompt: p, provider: genProvider });
  };

  const elapsedSec = genStartedAtRef.current ? Math.floor((Date.now() - genStartedAtRef.current) / 1000) : 0;

  if (!open && !workspaceMode) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="text-xs text-burgundy underline underline-offset-2 hover:text-burgundy-dark disabled:opacity-50"
        data-testid="instagram-reel-panel-toggle"
      >
        {t('instagram.reel.switchToReel')}
      </button>
    );
  }

  return (
    <section
      ref={sectionRef}
      className="border border-glass-border-dark rounded-xl p-4 space-y-3 bg-warm-white"
      data-testid="instagram-reel-panel"
    >
      <header className="flex items-center justify-between">
        <h3 className="font-serif text-2xl text-deep-charcoal">{t('instagram.reel.title')}</h3>
        <button
          type="button"
          onClick={() => { setOpen(false); onClose?.(); }}
          disabled={uploading || publishMutation.isPending}
          className="text-xs text-muted-stone hover:text-deep-charcoal disabled:opacity-50"
          data-testid="instagram-reel-panel-close"
        >
          {t('instagram.reel.hide')}
        </button>
      </header>

      <label className="text-xs text-muted-stone block">{t('instagram.reel.videoLabel')}</label>
      <div className="flex items-center gap-2 flex-wrap">
        <label
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-glass-border-input rounded-lg text-xs text-deep-charcoal hover:border-burgundy transition-colors ${
            uploading || publishMutation.isPending ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
          }`}
          data-testid="instagram-reel-upload"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/quicktime"
            onChange={onVideoSelected}
            disabled={uploading || publishMutation.isPending}
            className="hidden"
          />
          {uploading ? t('instagram.reel.uploading') : videoUrl ? t('instagram.reel.replaceVideo') : t('instagram.reel.uploadVideo')}
        </label>
        <button
          type="button"
          onClick={() => setGenOpen((v) => !v)}
          disabled={uploading || publishMutation.isPending || genStatus === 'processing'}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-glass-border-input rounded-lg text-xs text-deep-charcoal hover:border-burgundy transition-colors disabled:opacity-50"
          data-testid="instagram-reel-gen-toggle"
        >
          <ThiingsIcon name="sparkles" pxSize={15} className="text-ocre-600" />
          {genOpen ? t('instagram.reel.hideGenerator') : t('instagram.reel.showGenerator')}
        </button>
        {videoName && (
          <span className="text-xs text-muted-stone truncate" data-testid="instagram-reel-video-name">
            {videoName}
          </span>
        )}
      </div>

      {genOpen && (
        <div
          className="border border-glass-border-dark rounded-lg p-2 space-y-2 bg-white/65"
          data-testid="instagram-reel-gen-panel"
        >
          <label className="text-xs text-muted-stone block">
            {t('instagram.reel.generatorPrompt')}
          </label>
          <textarea
            value={genPrompt}
            onChange={(e) => setGenPrompt(e.target.value)}
            placeholder={t('instagram.reel.generatorPlaceholder')}
            rows={2}
            maxLength={1000}
            disabled={genStatus === 'processing' || startGenMutation.isPending}
            className="w-full px-3 py-2 border border-glass-border-input rounded-lg text-sm focus:outline-none focus:border-burgundy resize-y disabled:opacity-50"
            data-testid="instagram-reel-gen-prompt"
          />
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={genProvider}
              onChange={(e) => setGenProvider(e.target.value as 'higgsfield')}
              disabled={genStatus === 'processing' || startGenMutation.isPending}
              className="px-2 py-1.5 border border-glass-border-input rounded-lg text-xs bg-white text-deep-charcoal disabled:opacity-50"
              data-testid="instagram-reel-gen-provider"
            >
              <option value="higgsfield">Higgsfield</option>
            </select>
            <button
              type="button"
              onClick={onStartGen}
              disabled={startGenMutation.isPending || genStatus === 'processing' || genPrompt.trim().length < 3}
              className="px-3 py-1.5 bg-burgundy text-white rounded-lg text-xs font-medium hover:bg-burgundy-dark disabled:opacity-50 transition-colors"
              data-testid="instagram-reel-gen-submit"
            >
              {startGenMutation.isPending
                ? t('instagram.reel.starting')
                : genStatus === 'processing'
                  ? t('instagram.reel.generating', { seconds: elapsedSec })
                  : t('instagram.reel.generate')}
            </button>
            <span className="text-xs text-muted-stone">{t('instagram.reel.generatorHint')}</span>
          </div>
          {genStatus === 'failed' && genError && (
            <p className="text-[11px] text-red-700" data-testid="instagram-reel-gen-error">{genError}</p>
          )}
        </div>
      )}

      <label htmlFor="instagram-reel-caption" className="text-xs text-muted-stone block">{t('instagram.reel.caption')}</label>
      <textarea
        id="instagram-reel-caption"
        value={caption}
        onChange={(e) => setCaption(e.target.value.slice(0, MAX_CAPTION_LEN))}
        placeholder={t('instagram.reel.captionPlaceholder')}
        rows={3}
        className="w-full px-3 py-2 border border-glass-border-input rounded-lg text-sm focus:outline-none focus:border-burgundy resize-y"
        data-testid="instagram-reel-caption"
      />

      {scheduleMode && (
        <div
          className="border border-glass-border-dark rounded-lg p-2 space-y-2 bg-white/65"
          data-testid="instagram-reel-schedule-panel"
        >
          <label htmlFor="instagram-reel-scheduled-at" className="text-xs text-muted-stone block">{t('instagram.reel.postOn')}</label>
          <input
            id="instagram-reel-scheduled-at"
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            disabled={scheduleMutation.isPending}
            className="w-full px-3 py-2 border border-glass-border-input rounded-lg text-sm focus:outline-none focus:border-burgundy disabled:opacity-50"
            data-testid="instagram-reel-scheduled-at"
          />
          <p className="text-[10px] text-muted-stone">
            {t('instagram.reel.scheduleWindow')}
          </p>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {!scheduleMode ? (
          <button
            type="button"
            onClick={onPublish}
            disabled={publishMutation.isPending || uploading || !videoUrl || caption.trim().length < 1}
            className="px-3 py-1.5 bg-burgundy text-white rounded-lg text-xs font-medium hover:bg-burgundy-dark disabled:opacity-50 transition-colors"
            data-testid="instagram-reel-publish"
          >
            {publishMutation.isPending ? t('instagram.reel.processing') : t('instagram.reel.publish')}
          </button>
        ) : (
          <button
            type="button"
            onClick={onSchedule}
            disabled={scheduleMutation.isPending || uploading || !videoUrl || caption.trim().length < 1 || !scheduledAt}
            className="px-3 py-1.5 bg-burgundy text-white rounded-lg text-xs font-medium hover:bg-burgundy-dark disabled:opacity-50 transition-colors"
            data-testid="instagram-reel-schedule-submit"
          >
            {scheduleMutation.isPending ? t('instagram.reel.scheduling') : t('instagram.reel.schedule')}
          </button>
        )}
        <button
          type="button"
          onClick={() => setScheduleMode((v) => !v)}
          disabled={publishMutation.isPending || scheduleMutation.isPending || uploading}
          className="text-xs text-burgundy underline underline-offset-2 hover:text-burgundy-dark disabled:opacity-50"
          data-testid="instagram-reel-schedule-toggle"
        >
          {scheduleMode ? t('instagram.reel.cancelSchedule') : t('instagram.reel.scheduleLater')}
        </button>
      </div>

      <p className="text-[10px] text-muted-stone">
        {scheduleMode
          ? t('instagram.reel.scheduleNote')
          : t('instagram.reel.publishNote')}
      </p>
    </section>
  );
}

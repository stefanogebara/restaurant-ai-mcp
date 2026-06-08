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
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { authFetch } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import { subscribeReelCaption } from './instagramCaptionBus';

const MAX_VIDEO_BYTES = 32 * 1024 * 1024;
const MAX_CAPTION_LEN = 2200;
const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 5 * 60_000;  // give up after 5 min — Higgsfield rarely exceeds 2 min

export default function InstagramReelPanel({ disabled = false }: { disabled?: boolean }) {
  const { t } = useTranslation();
  const toast = useToast();
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
      toast.success(
        permalink
          ? t('instagram.reelPosted', `Reel posted → ${permalink}`)
          : t('instagram.reelPosted', 'Reel posted.'),
      );
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
      toast.error(t('instagram.reelInvalidType', 'Only MP4 or MOV videos are supported.'));
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      toast.error(t('instagram.reelTooLarge', `Video must be ${MAX_VIDEO_BYTES / 1024 / 1024} MB or smaller.`));
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
      toast.success(t('instagram.reelUploaded', 'Video uploaded — ready to post.'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('instagram.reelUploadFailed', 'Upload failed.'));
    } finally {
      setUploading(false);
    }
  };

  const onPublish = () => {
    if (publishMutation.isPending) return;
    if (!videoUrl || caption.trim().length < 1) return;
    publishMutation.mutate({ caption: caption.trim(), video_url: videoUrl });
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
          toast.success(t('instagram.videoGenerated', 'Video generated — caption it and post.'));
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
  }, [genStatus, genJobId, t, toast]);

  const onStartGen = () => {
    if (startGenMutation.isPending || genStatus === 'processing') return;
    const p = genPrompt.trim();
    if (p.length < 3) return;
    setGenStatus('starting');
    setGenError(null);
    startGenMutation.mutate({ prompt: p, provider: genProvider });
  };

  const elapsedSec = genStartedAtRef.current ? Math.floor((Date.now() - genStartedAtRef.current) / 1000) : 0;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="text-xs text-burgundy underline underline-offset-2 hover:text-burgundy-dark disabled:opacity-50"
        data-testid="instagram-reel-panel-toggle"
      >
        Or post a Reel instead
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
        <p className="text-sm font-medium text-deep-charcoal">Post a Reel</p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={uploading || publishMutation.isPending}
          className="text-xs text-muted-stone hover:text-deep-charcoal disabled:opacity-50"
          data-testid="instagram-reel-panel-close"
        >
          Hide
        </button>
      </header>

      <label className="text-xs text-muted-stone block">Video (MP4 or MOV, ≤32 MB)</label>
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
          {uploading ? 'Uploading…' : videoUrl ? 'Replace video' : 'Upload video'}
        </label>
        <button
          type="button"
          onClick={() => setGenOpen((v) => !v)}
          disabled={uploading || publishMutation.isPending || genStatus === 'processing'}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-glass-border-input rounded-lg text-xs text-deep-charcoal hover:border-burgundy transition-colors disabled:opacity-50"
          data-testid="instagram-reel-gen-toggle"
        >
          <span aria-hidden>✨</span>
          {genOpen ? 'Hide AI generator' : 'Generate with AI'}
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
            Describe the video clip you want (5s vertical 9:16 — works best for product shots, b-roll)
          </label>
          <textarea
            value={genPrompt}
            onChange={(e) => setGenPrompt(e.target.value)}
            placeholder="Slow zoom on a sizzling steak, soft restaurant lighting, steam rising…"
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
                ? 'Starting…'
                : genStatus === 'processing'
                  ? `Generating… ${elapsedSec}s`
                  : 'Generate'}
            </button>
            <span className="text-[10px] text-muted-stone">~60–120s · ~$0.50 per clip · added on success</span>
          </div>
          {genStatus === 'failed' && genError && (
            <p className="text-[11px] text-red-700" data-testid="instagram-reel-gen-error">{genError}</p>
          )}
        </div>
      )}

      <label className="text-xs text-muted-stone block">Caption</label>
      <textarea
        value={caption}
        onChange={(e) => setCaption(e.target.value.slice(0, MAX_CAPTION_LEN))}
        placeholder="What's the reel about?"
        rows={3}
        className="w-full px-3 py-2 border border-glass-border-input rounded-lg text-sm focus:outline-none focus:border-burgundy resize-y"
        data-testid="instagram-reel-caption"
      />

      <button
        type="button"
        onClick={onPublish}
        disabled={publishMutation.isPending || uploading || !videoUrl || caption.trim().length < 1}
        className="px-3 py-1.5 bg-burgundy text-white rounded-lg text-xs font-medium hover:bg-burgundy-dark disabled:opacity-50 transition-colors"
        data-testid="instagram-reel-publish"
      >
        {publishMutation.isPending ? 'Processing… (up to a minute)' : 'Post as Reel'}
      </button>
      <p className="text-[10px] text-muted-stone">
        Meta processes Reels server-side — the post may take 30–60s to land.
      </p>
    </section>
  );
}

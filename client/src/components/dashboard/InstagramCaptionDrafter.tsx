/**
 * Caption drafter widget — shows under the connected Instagram block in
 * InstagramPanel. User types a topic ("the new wood-fired pizza"), picks
 * a length, hits Draft, gets 3 captions in their own voice (via the C2
 * tone profile).
 *
 * Each draft has a Copy button (writes to clipboard). No auto-posting in
 * v1 — user posts manually via IG.
 *
 * Disabled until the tone profile is ready (tone_profile_ready flag from
 * the status endpoint), with a helpful inline note pointing to the
 * Refresh button on the parent.
 */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { authFetch } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import { sendCaptionToReel } from './instagramCaptionBus';
import InstagramGenSpendPill from './InstagramGenSpendPill';

type Length = 'short' | 'medium' | 'long';

interface DraftResponse {
  ok: boolean;
  drafts?: string[];
  error?: string;
}

export interface InstagramCaptionDrafterProps {
  toneProfileReady: boolean;
  /** Detected language of the tone profile. Used to show "Drafting in pt-BR" so users understand drafts come back in their account's posting language. */
  language?: 'pt' | 'es' | 'fr' | 'it' | 'en' | null;
}

const LENGTHS: { id: Length; label: string }[] = [
  { id: 'short',  label: 'Short' },
  { id: 'medium', label: 'Medium' },
  { id: 'long',   label: 'Long' },
];

/** Map ISO-2 to a friendly label + flag emoji for the language pill. */
const LANGUAGE_DISPLAY: Record<NonNullable<InstagramCaptionDrafterProps['language']>, { flag: string; label: string }> = {
  pt: { flag: '🇧🇷', label: 'Portuguese' },
  es: { flag: '🇪🇸', label: 'Spanish' },
  fr: { flag: '🇫🇷', label: 'French' },
  it: { flag: '🇮🇹', label: 'Italian' },
  en: { flag: '🇺🇸', label: 'English' },
};

export default function InstagramCaptionDrafter({ toneProfileReady, language }: InstagramCaptionDrafterProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const [topic, setTopic] = useState('');
  const [length, setLength] = useState<Length>('medium');
  const [drafts, setDrafts] = useState<string[]>([]);

  const draftMutation = useMutation<string[], Error, { topic: string; length: Length }>({
    mutationFn: async (input) => {
      const res = await authFetch('/api/instagram/draft-caption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const body = (await res.json().catch(() => null)) as DraftResponse | null;
      if (!res.ok || !body?.ok || !body.drafts) {
        throw new Error(body?.error || `Draft failed (HTTP ${res.status})`);
      }
      return body.drafts;
    },
    onSuccess: (d) => setDrafts(d),
    onError: (err) => toast.error(err.message),
  });

  const onDraft = () => {
    const trimmed = topic.trim();
    if (trimmed.length < 3) return;
    draftMutation.mutate({ topic: trimmed, length });
  };

  const onCopy = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t('instagram.draftCopied', `Draft ${index + 1} copied to clipboard.`));
    } catch {
      toast.error(t('instagram.draftCopyFailed', "Couldn't copy — your browser may have blocked clipboard access."));
    }
  };

  if (!toneProfileReady) {
    return (
      <div
        className="border border-glass-border-dark rounded-xl p-4 bg-warm-white"
        data-testid="instagram-caption-drafter-disabled"
      >
        <p className="text-sm font-medium text-deep-charcoal">Caption drafter</p>
        <p className="text-xs text-muted-stone mt-1">
          We need to learn your voice first — tap <strong>Build now</strong> above to extract your tone profile, then come back.
        </p>
      </div>
    );
  }

  const langDisplay = language ? LANGUAGE_DISPLAY[language] : null;

  return (
    <div className="border border-glass-border-dark rounded-xl p-4 space-y-4 bg-warm-white" data-testid="instagram-caption-drafter">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-deep-charcoal">Caption drafter</p>
          <p className="text-xs text-muted-stone mt-1">Tell us what you want to post about, we'll draft 3 captions in your voice.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <InstagramGenSpendPill />
          {langDisplay && (
            <span
              className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-warm-white border border-glass-border-dark text-muted-stone"
              title={`Drafts will be written in ${langDisplay.label} (detected from your IG posts)`}
              data-testid="instagram-caption-drafter-language"
            >
              <span aria-hidden>{langDisplay.flag}</span>
              <span>Drafting in {langDisplay.label}</span>
            </span>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs text-muted-stone block">What's the post about?</label>
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. our new sourdough pizza"
          maxLength={300}
          className="w-full px-3 py-2 border border-glass-border-input rounded-lg text-sm focus:outline-none focus:border-burgundy"
          data-testid="instagram-caption-drafter-topic"
        />
      </div>

      <div className="space-y-2">
        <label className="text-xs text-muted-stone block">Length</label>
        <div className="flex gap-2">
          {LENGTHS.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => setLength(l.id)}
              className={
                'px-3 py-1.5 rounded-full text-xs border transition-colors ' +
                (length === l.id
                  ? 'bg-burgundy text-white border-burgundy'
                  : 'bg-white/60 text-deep-charcoal border-glass-border-dark hover:border-burgundy')
              }
              data-testid={`instagram-caption-drafter-length-${l.id}`}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={onDraft}
        disabled={draftMutation.isPending || topic.trim().length < 3}
        className="px-4 py-2 bg-burgundy text-white rounded-lg text-sm font-medium hover:bg-burgundy-dark disabled:opacity-50 transition-colors"
        data-testid="instagram-caption-drafter-submit"
      >
        {draftMutation.isPending ? 'Drafting…' : 'Draft 3 captions'}
      </button>

      {drafts.length > 0 && (
        <div className="space-y-3 pt-2 border-t border-glass-border-dark" data-testid="instagram-caption-drafter-results">
          {drafts.map((d, i) => (
            <DraftCard key={i} draft={d} index={i} onCopy={() => onCopy(d, i)} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * One draft card. Owns its own "publishing" state so each card's
 * image-URL input + publish button is independent. Showing the publish
 * UI as collapsible (you have to click "Post to Instagram" before the
 * image URL field appears) keeps the default layout uncluttered —
 * users who only want Copy don't see the post controls at all.
 */
const CAROUSEL_MAX = 10;

/**
 * Sensible default scheduled time: tomorrow at noon LOCAL. The cron
 * polls every 15 min so 0-15 min delivery jitter from this exact time
 * is expected; we tell the user that in the inline copy.
 *
 * Returned as a "YYYY-MM-DDTHH:mm" string that's directly bindable to
 * <input type="datetime-local"> without further formatting.
 */
function defaultScheduledAt(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(12, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface RecentMediaItem {
  id: string;
  image_url: string;
  thumbnail_url: string | null;
  media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
  permalink: string;
  timestamp: string;
}

function DraftCard({ draft, index, onCopy }: { draft: string; index: number; onCopy: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [postingOpen, setPostingOpen] = useState(false);
  // imageUrls[] is the source of truth — single posts have 1 entry,
  // carousels have 2-10. The "or paste URL" input still lives, but it
  // now APPENDS to imageUrls rather than replacing.
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [pasteUrl, setPasteUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  // Recent-media picker state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [recentMedia, setRecentMedia] = useState<RecentMediaItem[] | null>(null);
  const [recentMediaLoading, setRecentMediaLoading] = useState(false);
  const [recentMediaError, setRecentMediaError] = useState<string | null>(null);

  // ─── AI image generation state (C.16) ──────────────────────────────
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [genPrompt, setGenPrompt] = useState('');
  const [genModel, setGenModel] = useState<'gpt-image-1' | 'nano-banana'>('gpt-image-1');

  const generateMutation = useMutation<
    { url: string; model: string; cost_cents: number },
    Error,
    { prompt: string; model: string }
  >({
    mutationFn: async (input) => {
      const res = await authFetch('/api/instagram/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const body = (await res.json().catch(() => null)) as {
        ok?: boolean; error?: string; url?: string; model?: string; cost_cents?: number;
      } | null;
      if (!res.ok || !body?.ok || !body.url) {
        throw new Error(body?.error || `Generation failed (HTTP ${res.status})`);
      }
      return { url: body.url, model: body.model || input.model, cost_cents: body.cost_cents ?? 0 };
    },
    onSuccess: ({ url }) => {
      if (imageUrls.includes(url)) return;  // shouldn't happen — UUID path
      if (imageUrls.length >= CAROUSEL_MAX) {
        toast.error(t('instagram.uploadMaxReached', `Maximum ${CAROUSEL_MAX} images per post.`));
        return;
      }
      setImageUrls((prev) => [...prev, url]);
      toast.success(t('instagram.generated', 'Image generated and added.'));
    },
    onError: (err) => toast.error(err.message),
  });

  const onGenerate = () => {
    if (generateMutation.isPending) return;
    const p = genPrompt.trim();
    if (p.length < 3) return;
    if (imageUrls.length >= CAROUSEL_MAX) {
      toast.error(t('instagram.uploadMaxReached', `Maximum ${CAROUSEL_MAX} images per post.`));
      return;
    }
    generateMutation.mutate({ prompt: p, model: genModel });
  };

  const publishMutation = useMutation<
    { permalink: string | null; post_kind?: string },
    Error,
    { caption: string; image_urls: string[] }
  >({
    mutationFn: async (input) => {
      const res = await authFetch('/api/instagram/publish-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const body = (await res.json().catch(() => null)) as {
        ok?: boolean; error?: string; media_id?: string; permalink?: string | null; post_kind?: string;
      } | null;
      if (!res.ok || !body?.ok) {
        throw new Error(body?.error || `Publish failed (HTTP ${res.status})`);
      }
      return { permalink: body.permalink ?? null, post_kind: body.post_kind };
    },
    onSuccess: ({ permalink, post_kind }) => {
      const verb = post_kind === 'carousel' ? 'Carousel posted' : 'Posted';
      toast.success(
        permalink
          ? t('instagram.publishedWithLink', `${verb} → ${permalink}`)
          : t('instagram.published', `${verb}.`),
      );
      // Reset the form so the card looks "done".
      setPostingOpen(false);
      setImageUrls([]);
      setPasteUrl('');
    },
    onError: (err) => toast.error(err.message),
  });

  const onPublish = () => {
    if (publishMutation.isPending) return;
    if (imageUrls.length === 0) return;
    publishMutation.mutate({ caption: draft, image_urls: imageUrls });
  };

  // ─── Schedule-for-later (C.15) ─────────────────────────────────────
  // The "Schedule" path inserts a row into scheduled_instagram_posts
  // and the every-15-min cron handles the actual publish at the right
  // time. We default the picker to "tomorrow 12:00 local" — a sane
  // restaurant default — but let the user override.
  const [scheduleMode, setScheduleMode] = useState(false);
  const [scheduledAt, setScheduledAt] = useState<string>(() => defaultScheduledAt());

  const scheduleMutation = useMutation<
    { id: string; scheduled_at: string },
    Error,
    { caption: string; image_urls: string[]; scheduled_at: string }
  >({
    mutationFn: async (input) => {
      const res = await authFetch('/api/instagram/schedule-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
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
      const when = new Date(scheduled_at).toLocaleString();
      toast.success(t('instagram.scheduled', `Scheduled for ${when}.`));
      setPostingOpen(false);
      setImageUrls([]);
      setPasteUrl('');
      setScheduleMode(false);
      setScheduledAt(defaultScheduledAt());
      // Refresh the scheduled-posts panel so the new row appears immediately.
      queryClient.invalidateQueries({ queryKey: ['instagram-scheduled-posts'] });
    },
    onError: (err) => toast.error(err.message),
  });

  const onSchedule = () => {
    if (scheduleMutation.isPending) return;
    if (imageUrls.length === 0 || !scheduledAt) return;
    // The <input type="datetime-local"> value is "YYYY-MM-DDTHH:mm" in
    // LOCAL time. The Date constructor parses that as local → ISO. The
    // backend re-validates so a stale value is rejected cleanly.
    const iso = new Date(scheduledAt).toISOString();
    scheduleMutation.mutate({ caption: draft, image_urls: imageUrls, scheduled_at: iso });
  };

  const onAddPastedUrl = () => {
    const url = pasteUrl.trim();
    if (url.length < 8 || imageUrls.length >= CAROUSEL_MAX) return;
    setImageUrls((prev) => [...prev, url]);
    setPasteUrl('');
  };

  const onRemoveImage = (i: number) => {
    setImageUrls((prev) => prev.filter((_, idx) => idx !== i));
  };

  /**
   * Reorders imageUrls by moving the item at fromIdx to toIdx. Critical
   * for IG carousels because the first slide is the carousel's cover in
   * feed — restaurants need to control which dish photo greets a scroller.
   *
   * Stable for fromIdx === toIdx (returns the same array reference so
   * React skips the re-render).
   */
  const moveImage = (fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return;
    setImageUrls((prev) => {
      if (fromIdx < 0 || fromIdx >= prev.length || toIdx < 0 || toIdx >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
  };

  // Drag state — the index of the currently-dragged thumb (or null if
  // not dragging). Tracking this in component state instead of relying
  // solely on the DataTransfer payload makes the visual feedback
  // (highlighted source + drop target) work consistently across browsers.
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const onDragStart = (idx: number) => (e: React.DragEvent<HTMLDivElement>) => {
    setDraggingIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
    // setData is required for Firefox to fire any drag events at all.
    // The payload itself doesn't matter — we use component state instead.
    try { e.dataTransfer.setData('text/plain', String(idx)); } catch { /* IE */ }
  };

  const onDragOver = (idx: number) => (e: React.DragEvent<HTMLDivElement>) => {
    if (draggingIdx === null || draggingIdx === idx) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIdx !== idx) setDragOverIdx(idx);
  };

  const onDrop = (idx: number) => (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    // Prefer component state, fall back to DataTransfer for safety.
    const from = draggingIdx ?? Number(e.dataTransfer.getData('text/plain'));
    if (Number.isFinite(from) && from !== idx) moveImage(from, idx);
    setDraggingIdx(null);
    setDragOverIdx(null);
  };

  const onDragEnd = () => {
    setDraggingIdx(null);
    setDragOverIdx(null);
  };

  /**
   * Loads /api/instagram/recent-media on first picker-open + caches in
   * component state. Re-opens are instant. The user can also force a
   * refresh via the reload button.
   */
  const loadRecentMedia = async (force = false) => {
    if (!force && recentMedia !== null) return;  // already loaded
    setRecentMediaLoading(true);
    setRecentMediaError(null);
    try {
      const res = await authFetch('/api/instagram/recent-media', { method: 'GET' });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; media?: RecentMediaItem[]; error?: string } | null;
      if (!res.ok || !body?.ok || !Array.isArray(body.media)) {
        throw new Error(body?.error || `Recent media failed (HTTP ${res.status})`);
      }
      setRecentMedia(body.media);
    } catch (err) {
      setRecentMediaError(err instanceof Error ? err.message : 'Failed to load recent posts');
    } finally {
      setRecentMediaLoading(false);
    }
  };

  const onTogglePicker = () => {
    const next = !pickerOpen;
    setPickerOpen(next);
    if (next) void loadRecentMedia();
  };

  const onPickFromRecent = (item: RecentMediaItem) => {
    if (imageUrls.includes(item.image_url)) {
      toast.info(t('instagram.alreadyAdded', "You've already added that one."));
      return;
    }
    if (imageUrls.length >= CAROUSEL_MAX) {
      toast.error(t('instagram.uploadMaxReached', `Maximum ${CAROUSEL_MAX} images per post.`));
      return;
    }
    setImageUrls((prev) => [...prev, item.image_url]);
  };

  /**
   * Read a File as base64 (without the data:URL prefix) so we can POST it
   * as JSON to /api/instagram/upload-image. Resolves with the bare b64
   * string or rejects on read error.
   */
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

  /**
   * Uploads ONE file to Supabase Storage via /api/instagram/upload-image.
   * Returns the public URL on success, throws on error. Used by
   * onFilesSelected to upload multi-selected files sequentially —
   * sequential keeps the order deterministic AND keeps the burst under
   * Vercel's per-call timeout.
   */
  const uploadOneFile = async (file: File): Promise<string> => {
    if (!/^image\/(jpe?g|png|webp)$/i.test(file.type)) {
      throw new Error(t('instagram.uploadInvalidType', `${file.name}: only JPEG, PNG, or WebP supported.`));
    }
    if (file.size > 4 * 1024 * 1024) {
      throw new Error(t('instagram.uploadTooLarge', `${file.name}: must be 4 MB or smaller.`));
    }
    const dataB64 = await fileToBase64(file);
    const res = await authFetch('/api/instagram/upload-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: file.name, content_type: file.type, data_b64: dataB64 }),
    });
    const body = (await res.json().catch(() => null)) as { ok?: boolean; url?: string; error?: string } | null;
    if (!res.ok || !body?.ok || !body.url) {
      throw new Error(body?.error || `Upload failed (HTTP ${res.status})`);
    }
    return body.url;
  };

  const onFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';  // reset so re-picking the same file fires onChange
    if (files.length === 0) return;

    const room = CAROUSEL_MAX - imageUrls.length;
    if (room <= 0) {
      toast.error(t('instagram.uploadMaxReached', `Maximum ${CAROUSEL_MAX} images per post.`));
      return;
    }
    const accepted = files.slice(0, room);
    if (files.length > room) {
      toast.info(t('instagram.uploadTrimmed', `Only ${room} more images fit — ignoring ${files.length - room}.`));
    }

    setUploading(true);
    const uploadedUrls: string[] = [];
    try {
      for (const file of accepted) {
        const url = await uploadOneFile(file);
        uploadedUrls.push(url);
        // Append progressively so the user sees thumbnails landing
        setImageUrls((prev) => [...prev, url]);
      }
      toast.success(t('instagram.uploadOk', `Uploaded ${uploadedUrls.length} image${uploadedUrls.length === 1 ? '' : 's'}.`));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('instagram.uploadFailed', 'Upload failed.'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-white/65 backdrop-blur-glass-card border border-glass-border-dark rounded-lg p-3 space-y-2" data-testid={`instagram-caption-drafter-card-${index}`}>
      <p className="text-sm text-deep-charcoal whitespace-pre-wrap">{draft}</p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onCopy}
          className="text-xs text-burgundy underline underline-offset-2 hover:text-burgundy-dark"
          data-testid={`instagram-caption-drafter-copy-${index}`}
        >
          Copy
        </button>
        <button
          type="button"
          onClick={() => setPostingOpen((v) => !v)}
          className="text-xs text-burgundy underline underline-offset-2 hover:text-burgundy-dark"
          data-testid={`instagram-caption-drafter-post-toggle-${index}`}
        >
          {postingOpen ? 'Hide post fields' : 'Post to Instagram'}
        </button>
        <button
          type="button"
          onClick={() => {
            sendCaptionToReel(draft);
            toast.success(t('instagram.sentToReel', 'Sent to the Reel panel below.'));
          }}
          className="text-xs text-burgundy underline underline-offset-2 hover:text-burgundy-dark"
          data-testid={`instagram-caption-drafter-send-to-reel-${index}`}
        >
          Send to Reel
        </button>
      </div>

      {postingOpen && (
        <div className="border-t border-glass-border-dark pt-2 space-y-2" data-testid={`instagram-caption-drafter-post-form-${index}`}>
          <label className="text-xs text-muted-stone block">
            Images {imageUrls.length > 0 && <span className="text-deep-charcoal">({imageUrls.length}/{CAROUSEL_MAX})</span>}
          </label>

          {/* Thumbnail grid — appears once at least one image is added.
              Drag a thumb onto another to reorder. The first slide is the
              carousel cover on IG, so order matters. */}
          {imageUrls.length > 0 && (
            <div className="flex flex-wrap gap-2" data-testid={`instagram-caption-drafter-thumbs-${index}`}>
              {imageUrls.map((u, i) => (
                <div
                  key={u + '#' + i}
                  draggable={!publishMutation.isPending && !uploading && imageUrls.length > 1}
                  onDragStart={onDragStart(i)}
                  onDragOver={onDragOver(i)}
                  onDrop={onDrop(i)}
                  onDragEnd={onDragEnd}
                  className={
                    'relative w-16 h-16 rounded-lg overflow-hidden border bg-white cursor-move transition-opacity ' +
                    (draggingIdx === i ? 'opacity-30 ' : '') +
                    (dragOverIdx === i ? 'border-burgundy ring-2 ring-burgundy/40 ' : 'border-glass-border-dark ')
                  }
                  data-testid={`instagram-caption-drafter-thumb-${index}-${i}`}
                  aria-grabbed={draggingIdx === i || undefined}
                  title={imageUrls.length > 1 ? `Drag to reorder. Slide ${i + 1} of ${imageUrls.length}${i === 0 ? ' (cover)' : ''}` : undefined}
                >
                  {i === 0 && imageUrls.length > 1 && (
                    <span
                      className="absolute top-0.5 left-0.5 px-1 rounded text-[9px] bg-burgundy text-white font-medium uppercase tracking-wide pointer-events-none"
                      data-testid={`instagram-caption-drafter-thumb-cover-${index}`}
                    >
                      Cover
                    </span>
                  )}
                  <img src={u} alt="" className="w-full h-full object-cover pointer-events-none" />
                  <button
                    type="button"
                    onClick={() => onRemoveImage(i)}
                    disabled={publishMutation.isPending || uploading}
                    className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-burgundy text-white text-xs leading-none flex items-center justify-center hover:bg-burgundy-dark disabled:opacity-50"
                    aria-label={`Remove image ${i + 1}`}
                    data-testid={`instagram-caption-drafter-thumb-remove-${index}-${i}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <label
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-glass-border-input rounded-lg text-xs text-deep-charcoal hover:border-burgundy transition-colors ${
                uploading || publishMutation.isPending || imageUrls.length >= CAROUSEL_MAX
                  ? 'opacity-50 cursor-not-allowed'
                  : 'cursor-pointer'
              }`}
              data-testid={`instagram-caption-drafter-upload-${index}`}
            >
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                onChange={onFilesSelected}
                disabled={uploading || publishMutation.isPending || imageUrls.length >= CAROUSEL_MAX}
                className="hidden"
              />
              {uploading ? 'Uploading…' : imageUrls.length === 0 ? 'Upload images' : 'Add more'}
            </label>
            <button
              type="button"
              onClick={onTogglePicker}
              disabled={publishMutation.isPending || imageUrls.length >= CAROUSEL_MAX}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-glass-border-input rounded-lg text-xs text-deep-charcoal hover:border-burgundy transition-colors disabled:opacity-50"
              data-testid={`instagram-caption-drafter-picker-toggle-${index}`}
            >
              {pickerOpen ? 'Hide recent posts' : 'From your posts'}
            </button>
            <button
              type="button"
              onClick={() => setGeneratorOpen((v) => !v)}
              disabled={publishMutation.isPending || imageUrls.length >= CAROUSEL_MAX}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-glass-border-input rounded-lg text-xs text-deep-charcoal hover:border-burgundy transition-colors disabled:opacity-50"
              data-testid={`instagram-caption-drafter-generator-toggle-${index}`}
            >
              <span aria-hidden>✨</span>
              {generatorOpen ? 'Hide AI generator' : 'Generate with AI'}
            </button>
            <span className="text-xs text-muted-stone">or paste URLs</span>
          </div>

          {generatorOpen && (
            <div
              className="border border-glass-border-dark rounded-lg p-2 space-y-2 bg-warm-white"
              data-testid={`instagram-caption-drafter-generator-${index}`}
            >
              <label className="text-xs text-muted-stone block">
                Describe the image you want (e.g. "wood-fired margherita pizza on a marble table, soft natural light")
              </label>
              <textarea
                value={genPrompt}
                onChange={(e) => setGenPrompt(e.target.value)}
                placeholder="A beautifully plated tiramisu with espresso art…"
                rows={2}
                maxLength={1000}
                className="w-full px-3 py-2 border border-glass-border-input rounded-lg text-sm focus:outline-none focus:border-burgundy resize-y"
                data-testid={`instagram-caption-drafter-gen-prompt-${index}`}
              />
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={genModel}
                  onChange={(e) => setGenModel(e.target.value as 'gpt-image-1' | 'nano-banana')}
                  disabled={generateMutation.isPending}
                  className="px-2 py-1.5 border border-glass-border-input rounded-lg text-xs bg-white text-deep-charcoal"
                  data-testid={`instagram-caption-drafter-gen-model-${index}`}
                >
                  <option value="gpt-image-1">GPT Image</option>
                  <option value="nano-banana">Nano Banana (Gemini)</option>
                </select>
                <button
                  type="button"
                  onClick={onGenerate}
                  disabled={generateMutation.isPending || genPrompt.trim().length < 3}
                  className="px-3 py-1.5 bg-burgundy text-white rounded-lg text-xs font-medium hover:bg-burgundy-dark disabled:opacity-50 transition-colors"
                  data-testid={`instagram-caption-drafter-gen-submit-${index}`}
                >
                  {generateMutation.isPending ? 'Generating… (20-40s)' : 'Generate'}
                </button>
                <span className="text-[10px] text-muted-stone">~4¢ per image · added to your post on success</span>
              </div>
            </div>
          )}

          {pickerOpen && (
            <div
              className="border border-glass-border-dark rounded-lg p-2 space-y-2 bg-warm-white"
              data-testid={`instagram-caption-drafter-picker-${index}`}
            >
              {recentMediaLoading && (
                <p className="text-xs text-muted-stone py-2 text-center">Loading your recent posts…</p>
              )}
              {recentMediaError && (
                <div className="flex items-center justify-between gap-2 text-xs">
                  <p className="text-red-700">{recentMediaError}</p>
                  <button
                    type="button"
                    onClick={() => void loadRecentMedia(true)}
                    className="text-burgundy underline underline-offset-2"
                  >
                    Retry
                  </button>
                </div>
              )}
              {!recentMediaLoading && !recentMediaError && recentMedia !== null && recentMedia.length === 0 && (
                <p className="text-xs text-muted-stone py-2 text-center">
                  No recent posts found. Post something on Instagram first, then come back.
                </p>
              )}
              {!recentMediaLoading && recentMedia !== null && recentMedia.length > 0 && (
                <div
                  className="grid grid-cols-4 sm:grid-cols-6 gap-2"
                  data-testid={`instagram-caption-drafter-picker-grid-${index}`}
                >
                  {recentMedia.map((item, mediaIdx) => {
                    const alreadyAdded = imageUrls.includes(item.image_url);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onPickFromRecent(item)}
                        disabled={alreadyAdded || publishMutation.isPending}
                        className={`relative aspect-square rounded-md overflow-hidden border transition-colors ${
                          alreadyAdded
                            ? 'border-emerald-500 ring-2 ring-emerald-200 cursor-default'
                            : 'border-glass-border-dark hover:border-burgundy cursor-pointer'
                        }`}
                        title={alreadyAdded ? 'Already added' : `Use this image (${new Date(item.timestamp).toLocaleDateString()})`}
                        data-testid={`instagram-caption-drafter-picker-item-${index}-${mediaIdx}`}
                      >
                        <img src={item.image_url} alt="" className="w-full h-full object-cover" />
                        {alreadyAdded && (
                          <span className="absolute inset-0 bg-emerald-500/30 flex items-center justify-center text-white text-lg font-semibold">
                            ✓
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <input
              type="url"
              value={pasteUrl}
              onChange={(e) => setPasteUrl(e.target.value)}
              placeholder="https://your-cdn.com/photo.jpg"
              disabled={publishMutation.isPending || imageUrls.length >= CAROUSEL_MAX}
              className="flex-1 px-3 py-2 border border-glass-border-input rounded-lg text-sm focus:outline-none focus:border-burgundy disabled:opacity-50"
              data-testid={`instagram-caption-drafter-image-url-${index}`}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onAddPastedUrl();
                }
              }}
            />
            <button
              type="button"
              onClick={onAddPastedUrl}
              disabled={pasteUrl.trim().length < 8 || imageUrls.length >= CAROUSEL_MAX || publishMutation.isPending}
              className="px-3 py-2 text-xs text-burgundy border border-glass-border-input rounded-lg hover:border-burgundy disabled:opacity-50 transition-colors"
              data-testid={`instagram-caption-drafter-add-url-${index}`}
            >
              Add
            </button>
          </div>

          {/* Schedule-for-later panel — appears when the user toggles
              the "Schedule" link. Hidden by default to keep the post
              flow uncluttered for the "just post it now" case. */}
          {scheduleMode && (
            <div
              className="border border-glass-border-dark rounded-lg p-2 space-y-2 bg-warm-white"
              data-testid={`instagram-caption-drafter-schedule-panel-${index}`}
            >
              <label className="text-xs text-muted-stone block">
                Post on
              </label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                disabled={scheduleMutation.isPending}
                className="w-full px-3 py-2 border border-glass-border-input rounded-lg text-sm focus:outline-none focus:border-burgundy disabled:opacity-50"
                data-testid={`instagram-caption-drafter-scheduled-at-${index}`}
              />
              <p className="text-[10px] text-muted-stone">
                Actually posts within 0–15 min of this time (cron polls every 15 min).
              </p>
            </div>
          )}

          <div className="flex items-center gap-2">
            {!scheduleMode ? (
              <button
                type="button"
                onClick={onPublish}
                disabled={publishMutation.isPending || uploading || imageUrls.length === 0}
                className="px-3 py-1.5 bg-burgundy text-white rounded-lg text-xs font-medium hover:bg-burgundy-dark disabled:opacity-50 transition-colors"
                data-testid={`instagram-caption-drafter-publish-${index}`}
              >
                {publishMutation.isPending
                  ? 'Posting…'
                  : imageUrls.length >= 2
                    ? `Post carousel (${imageUrls.length})`
                    : 'Post now'}
              </button>
            ) : (
              <button
                type="button"
                onClick={onSchedule}
                disabled={scheduleMutation.isPending || uploading || imageUrls.length === 0 || !scheduledAt}
                className="px-3 py-1.5 bg-burgundy text-white rounded-lg text-xs font-medium hover:bg-burgundy-dark disabled:opacity-50 transition-colors"
                data-testid={`instagram-caption-drafter-schedule-submit-${index}`}
              >
                {scheduleMutation.isPending ? 'Scheduling…' : 'Schedule'}
              </button>
            )}

            <button
              type="button"
              onClick={() => setScheduleMode((v) => !v)}
              disabled={publishMutation.isPending || scheduleMutation.isPending || uploading}
              className="text-xs text-burgundy underline underline-offset-2 hover:text-burgundy-dark disabled:opacity-50"
              data-testid={`instagram-caption-drafter-schedule-toggle-${index}`}
            >
              {scheduleMode ? 'Cancel scheduling' : 'Schedule for later'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

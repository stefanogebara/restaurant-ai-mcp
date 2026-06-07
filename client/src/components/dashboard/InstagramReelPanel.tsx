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
import { useState, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { authFetch } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';

const MAX_VIDEO_BYTES = 32 * 1024 * 1024;
const MAX_CAPTION_LEN = 2200;

export default function InstagramReelPanel({ disabled = false }: { disabled?: boolean }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [caption, setCaption] = useState('');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoName, setVideoName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        {videoName && (
          <span className="text-xs text-muted-stone truncate" data-testid="instagram-reel-video-name">
            {videoName}
          </span>
        )}
      </div>

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

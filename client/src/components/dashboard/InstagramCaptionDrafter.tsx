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
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { authFetch } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';

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

function DraftCard({ draft, index, onCopy }: { draft: string; index: number; onCopy: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [postingOpen, setPostingOpen] = useState(false);
  // imageUrls[] is the source of truth — single posts have 1 entry,
  // carousels have 2-10. The "or paste URL" input still lives, but it
  // now APPENDS to imageUrls rather than replacing.
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [pasteUrl, setPasteUrl] = useState('');
  const [uploading, setUploading] = useState(false);

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
      </div>

      {postingOpen && (
        <div className="border-t border-glass-border-dark pt-2 space-y-2" data-testid={`instagram-caption-drafter-post-form-${index}`}>
          <label className="text-xs text-muted-stone block">
            Images {imageUrls.length > 0 && <span className="text-deep-charcoal">({imageUrls.length}/{CAROUSEL_MAX})</span>}
          </label>

          {/* Thumbnail grid — appears once at least one image is added. */}
          {imageUrls.length > 0 && (
            <div className="flex flex-wrap gap-2" data-testid={`instagram-caption-drafter-thumbs-${index}`}>
              {imageUrls.map((u, i) => (
                <div
                  key={u + '#' + i}
                  className="relative w-16 h-16 rounded-lg overflow-hidden border border-glass-border-dark bg-white"
                  data-testid={`instagram-caption-drafter-thumb-${index}-${i}`}
                >
                  <img src={u} alt="" className="w-full h-full object-cover" />
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

          <div className="flex items-center gap-2">
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
            <span className="text-xs text-muted-stone">or paste URLs</span>
          </div>

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
        </div>
      )}
    </div>
  );
}

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
function DraftCard({ draft, index, onCopy }: { draft: string; index: number; onCopy: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [postingOpen, setPostingOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState('');

  const publishMutation = useMutation<{ permalink: string | null }, Error, { caption: string; image_url: string }>({
    mutationFn: async (input) => {
      const res = await authFetch('/api/instagram/publish-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; media_id?: string; permalink?: string | null } | null;
      if (!res.ok || !body?.ok) {
        throw new Error(body?.error || `Publish failed (HTTP ${res.status})`);
      }
      return { permalink: body.permalink ?? null };
    },
    onSuccess: ({ permalink }) => {
      toast.success(
        permalink
          ? t('instagram.publishedWithLink', `Posted to Instagram → ${permalink}`)
          : t('instagram.published', 'Posted to Instagram.'),
      );
      // Collapse the post UI and clear the URL so the card looks "done".
      setPostingOpen(false);
      setImageUrl('');
    },
    onError: (err) => toast.error(err.message),
  });

  const onPublish = () => {
    if (publishMutation.isPending) return;
    if (imageUrl.trim().length < 8) return;
    publishMutation.mutate({ caption: draft, image_url: imageUrl.trim() });
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
            Image URL <span className="text-muted-stone/70">(publicly accessible https URL, e.g. on your site or Cloudinary)</span>
          </label>
          <input
            type="url"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://your-cdn.com/photo.jpg"
            className="w-full px-3 py-2 border border-glass-border-input rounded-lg text-sm focus:outline-none focus:border-burgundy"
            data-testid={`instagram-caption-drafter-image-url-${index}`}
          />
          <button
            type="button"
            onClick={onPublish}
            disabled={publishMutation.isPending || imageUrl.trim().length < 8}
            className="px-3 py-1.5 bg-burgundy text-white rounded-lg text-xs font-medium hover:bg-burgundy-dark disabled:opacity-50 transition-colors"
            data-testid={`instagram-caption-drafter-publish-${index}`}
          >
            {publishMutation.isPending ? 'Posting…' : 'Post now'}
          </button>
        </div>
      )}
    </div>
  );
}

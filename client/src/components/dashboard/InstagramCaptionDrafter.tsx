/**
 * Caption drafter widget â€” shows under the connected Instagram block in
 * InstagramPanel. User types a topic ("the new wood-fired pizza"), picks
 * a length, hits Draft, gets 3 captions in their own voice (via the C2
 * tone profile).
 *
 * Each draft has a Copy button (writes to clipboard). No auto-posting in
 * v1 â€” user posts manually via IG.
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
}

const LENGTHS: { id: Length; label: string }[] = [
  { id: 'short',  label: 'Short' },
  { id: 'medium', label: 'Medium' },
  { id: 'long',   label: 'Long' },
];

export default function InstagramCaptionDrafter({ toneProfileReady }: InstagramCaptionDrafterProps) {
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
      toast.error(t('instagram.draftCopyFailed', "Couldn't copy â€” your browser may have blocked clipboard access."));
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
          We need to learn your voice first â€” tap <strong>Build now</strong> above to extract your tone profile, then come back.
        </p>
      </div>
    );
  }

  return (
    <div className="border border-glass-border-dark rounded-xl p-4 space-y-4 bg-warm-white" data-testid="instagram-caption-drafter">
      <div>
        <p className="text-sm font-medium text-deep-charcoal">Caption drafter</p>
        <p className="text-xs text-muted-stone mt-1">Tell us what you want to post about, we'll draft 3 captions in your voice.</p>
      </div>

      <div className="space-y-2">
        <label className="text-xs text-muted-stone block">What's the post about?</label>
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. our new sourdough pizza"
          maxLength={300}
          className="w-full px-3 py-2 border border-glass-border-dark rounded-lg text-sm focus:outline-none focus:border-burgundy"
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
        {draftMutation.isPending ? 'Draftingâ€¦' : 'Draft 3 captions'}
      </button>

      {drafts.length > 0 && (
        <div className="space-y-3 pt-2 border-t border-glass-border-dark" data-testid="instagram-caption-drafter-results">
          {drafts.map((d, i) => (
            <div key={i} className="bg-white/65 backdrop-blur-glass-card border border-glass-border-dark rounded-lg p-3 space-y-2">
              <p className="text-sm text-deep-charcoal whitespace-pre-wrap">{d}</p>
              <button
                type="button"
                onClick={() => onCopy(d, i)}
                className="text-xs text-burgundy underline underline-offset-2 hover:text-burgundy-dark"
                data-testid={`instagram-caption-drafter-copy-${i}`}
              >
                Copy
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

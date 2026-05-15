import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { X, Share2 } from 'lucide-react';
import { trackShareClicked, trackDemoFunnel } from '../../lib/analytics';

const SHARE_URL = 'https://seatable.one';

interface SharePromptProps {
  /** Where this share prompt is displayed */
  location: 'demo_dashboard' | 'landing' | 'post_demo';
}

export default function SharePrompt({ location }: SharePromptProps) {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');

  if (dismissed) return null;

  const shareMessage = t(
    'landing.share.message',
    'Check out Seatable — AI that answers calls, WhatsApp, and manages reservations for restaurants. Try the demo: {{url}}',
    { url: SHARE_URL }
  );

  const whatsappLink = `https://wa.me/?text=${encodeURIComponent(shareMessage)}`;

  const handleShare = async (channel: 'whatsapp' | 'copy_link') => {
    trackShareClicked({ location, channel });
    trackDemoFunnel({ step: 'demo_share_clicked' });
    if (channel !== 'copy_link') return;

    // Previously this was `.catch(() => {})` — user clicked Copy, nothing
    // happened, no feedback. Now: surface success and (rare) failure so the
    // user always knows whether the share-link is in their clipboard.
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      console.error('[SharePrompt] clipboard API unavailable');
      setCopyState('error');
      setTimeout(() => setCopyState('idle'), 2500);
      return;
    }
    try {
      await navigator.clipboard.writeText(SHARE_URL);
      setCopyState('copied');
    } catch (err) {
      console.error('[SharePrompt] clipboard write failed', err);
      setCopyState('error');
    } finally {
      setTimeout(() => setCopyState('idle'), 2500);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 12 }}
        transition={{ duration: 0.3 }}
        className="relative bg-white border border-border-gray rounded-2xl p-5 shadow-sm"
      >
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="absolute top-3 right-3 text-warm-stone hover:text-deep-charcoal transition-colors"
          aria-label={t('common.dismiss', 'Dismiss')}
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-burgundy/10 flex items-center justify-center flex-shrink-0">
            <Share2 className="w-4 h-4 text-burgundy" />
          </div>
          <div>
            <p className="text-sm font-semibold text-deep-charcoal">
              {t('landing.share.heading', 'Know another restaurant owner?')}
            </p>
            <p className="text-xs text-warm-stone mt-0.5">
              {t('landing.share.subtitle', 'Share Seatable with them — they\'ll thank you.')}
            </p>
            <div className="flex items-center gap-2 mt-3">
              <a
                href={whatsappLink}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => handleShare('whatsapp')}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-[#9F1239] hover:bg-[#20BD5A] text-white text-xs font-semibold rounded-full transition-colors"
              >
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                {t('landing.share.whatsapp', 'Share via WhatsApp')}
              </a>
              <button
                type="button"
                onClick={() => handleShare('copy_link')}
                aria-live="polite"
                className={`px-4 py-1.5 border text-xs font-medium rounded-full transition-all ${
                  copyState === 'copied'
                    ? 'border-burgundy/40 text-burgundy'
                    : copyState === 'error'
                      ? 'border-red-300 text-red-600'
                      : 'border-border-gray hover:border-burgundy/40 text-warm-stone hover:text-deep-charcoal'
                }`}
              >
                {copyState === 'copied'
                  ? t('landing.share.copied', 'Link copied!')
                  : copyState === 'error'
                    ? t('landing.share.copyFailed', 'Copy failed')
                    : t('landing.share.copyLink', 'Copy link')}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '../../contexts/ToastContext';

interface Props { slug: string; }

export default function EmbedSnippetPanel({ slug }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const snippet = `<script src="${window.location.origin}/widget.js?slug=${slug}"></script>`;

  const handleCopy = () => {
    // Older browsers, non-HTTPS contexts, and "clipboard blocked by permissions
    // policy" iframes all reject the promise. Without a catch the button silently
    // does nothing and the owner can't tell if it worked. Surface a toast so they
    // know to copy manually from the visible <pre>.
    navigator.clipboard.writeText(snippet).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch((err) => {
      console.error('[EmbedSnippetPanel] clipboard write failed', err);
      toast.error(t('settings.copyFailed'));
    });
  };

  return (
    <div className="py-5 border-t border-[#E7E5E4] mt-8 space-y-4">
      <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-stone">{t('dashboard.embedWidgetTitle', 'Booking Widget')}</h2>
      <p className="text-xs text-warm-stone">
        {t('dashboard.embedWidgetDescription', 'Paste this snippet anywhere on your website to add a booking button.')}
      </p>
      <div className="relative">
        <pre className="bg-soft-gray rounded-xl px-4 py-3 text-xs text-deep-charcoal overflow-x-auto whitespace-pre-wrap break-all">
          {snippet}
        </pre>
        <button
          type="button"
          onClick={handleCopy}
          aria-label="Copy snippet"
          className="absolute top-2 right-2 px-3 py-1 bg-deep-charcoal text-white text-xs rounded-lg hover:bg-charcoal-dark transition-colors"
        >
          {copied ? t('common.copied', 'Copied!') : t('common.copy', 'Copy')}
        </button>
      </div>
    </div>
  );
}

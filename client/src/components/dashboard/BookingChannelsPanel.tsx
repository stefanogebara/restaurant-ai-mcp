/** Share one booking link; keep QR and website code as optional formats. */
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../common/ThiingsIcon';
import QRCodePanel from './QRCodePanel';

interface Props {
  slug: string;
}

type CopiedKey = 'url' | 'widget' | null;
const BASE_URL = 'https://seatable.one';

export default function BookingChannelsPanel({ slug }: Props) {
  const { t } = useTranslation();
  const [copiedKey, setCopiedKey] = useState<CopiedKey>(null);
  const [copyFailed, setCopyFailed] = useState(false);
  const bookingUrl = `${BASE_URL}/book/${encodeURIComponent(slug)}`;
  const widgetSnippet = `<script src="${BASE_URL}/widget.js" data-slug="${slug.replaceAll('"', '&quot;')}"></script>`;

  const handleCopy = useCallback(async (key: CopiedKey, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setCopyFailed(false);
      window.setTimeout(() => setCopiedKey((current) => current === key ? null : current), 2000);
    } catch {
      setCopyFailed(true);
    }
  }, []);

  return (
    <div className="space-y-10 py-5">
      <section aria-labelledby="booking-link-title" className="space-y-5">
        <div>
          <h2 id="booking-link-title" className="font-serif text-2xl text-deep-charcoal">
            {t('bookingChannels.shareTitle')}
          </h2>
          <p className="mt-1 text-[15px] text-muted-stone max-w-2xl">
            {t('bookingChannels.shareDescription')}
          </p>
        </div>
        <div className="liquid-capsule p-4 sm:p-5 space-y-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-stone">
            {t('bookingChannels.directUrl')}
          </p>
          <p className="font-mono text-sm text-deep-charcoal break-all select-all">{bookingUrl}</p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => handleCopy('url', bookingUrl)}
              className="inline-flex items-center gap-2 rounded-[100px] bg-burgundy px-5 py-2.5 text-sm font-medium text-white hover:bg-burgundy-dark"
            >
              <ThiingsIcon name={copiedKey === 'url' ? 'check' : 'clipboard'} size="xs" />
              {copiedKey === 'url' ? t('common.copied') : t('bookingChannels.copyUrl')}
            </button>
            <a href={bookingUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-burgundy underline underline-offset-2 hover:text-burgundy-dark">
              {t('bookingChannels.openLink')}
            </a>
          </div>
          {copyFailed && <p role="alert" className="text-sm text-red-700">{t('bookingChannels.copyFailed')}</p>}
        </div>
        <p className="text-sm text-muted-stone">{t('bookingChannels.whereToShare')}</p>
      </section>

      <div className="hairline" />

      <section aria-labelledby="booking-qr-title" className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(280px,340px)] md:items-start">
        <div>
          <h2 id="booking-qr-title" className="font-serif text-2xl text-deep-charcoal">
            {t('bookingChannels.qrCode')}
          </h2>
          <p className="mt-1 text-[15px] text-muted-stone max-w-lg">{t('bookingChannels.qrCodeDesc')}</p>
        </div>
        <QRCodePanel slug={slug} />
      </section>

      <div className="hairline" />

      <details className="group">
        <summary className="cursor-pointer list-none flex items-center justify-between gap-3 text-sm font-medium text-deep-charcoal">
          <span>{t('bookingChannels.widgetEmbed')}</span>
          <span aria-hidden="true" className="text-muted-stone transition-transform group-open:rotate-45">+</span>
        </summary>
        <p className="mt-3 text-[15px] text-muted-stone">{t('bookingChannels.websiteHelp')}</p>
        <pre className="mt-4 overflow-x-auto rounded-xl bg-soft-gray p-4 text-xs text-deep-charcoal whitespace-pre-wrap break-all">{widgetSnippet}</pre>
        <button
          type="button"
          onClick={() => handleCopy('widget', widgetSnippet)}
          className="mt-3 inline-flex items-center gap-2 text-sm text-burgundy underline underline-offset-2 hover:text-burgundy-dark"
        >
          <ThiingsIcon name={copiedKey === 'widget' ? 'check' : 'clipboard'} size="xs" />
          {copiedKey === 'widget' ? t('common.copied') : t('bookingChannels.copyWidget')}
        </button>
        {copyFailed && <p role="alert" className="mt-2 text-sm text-red-700">{t('bookingChannels.copyFailed')}</p>}
      </details>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import ThiingsIcon from '../../common/ThiingsIcon';
import type { getSheetCopy } from './sheetCopy';

type Copy = ReturnType<typeof getSheetCopy>;

/** The slug of https://seatable.one/book/<slug>, or null for any other URL. */
function bookingSlug(url: string): string | null {
  const match = /^https:\/\/seatable\.one\/book\/([a-z0-9][a-z0-9-]{1,98}[a-z0-9])(?:[/?#]|$)/.exec(url);
  return match ? match[1] : null;
}

/**
 * The booking link the owner can share today: copy it, or print the QR code
 * (the existing /api/booking-qr PNG, so no QR library ships to the browser).
 */
export default function BookingLinkCard({ url, copy }: { url: string; copy: Copy }) {
  const slug = bookingSlug(url);
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked: the link stays visible and selectable */ }
  }

  const qr = slug ? `/api/booking-qr?slug=${encodeURIComponent(slug)}` : null;
  const pill = 'inline-flex min-h-10 items-center gap-1.5 rounded-full border border-glass-border-dark px-4 py-2 text-[14px] font-medium text-deep-charcoal hover:bg-soft-gray focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-burgundy/60 transition-colors';

  return (
    <section className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-center" data-testid="booking-link-card">
      {qr && (
        <img src={qr} alt={copy.qrAlt} width={112} height={112} loading="lazy"
          className="h-28 w-28 shrink-0 rounded-2xl border border-glass-border-dark bg-white p-2" />
      )}
      <div className="min-w-0">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-stone">{copy.bookingLink}</h2>
        <a href={url} target="_blank" rel="noreferrer"
          className="mt-1 block break-all text-[17px] text-deep-charcoal underline decoration-glass-border-input underline-offset-4 hover:decoration-deep-charcoal">
          {url.replace(/^https:\/\//, '')}
        </a>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={copyLink} className={pill}>
            <ThiingsIcon name={copied ? 'check' : 'copy'} pxSize={15} className={copied ? 'text-emerald-600' : ''} />
            <span aria-live="polite">{copied ? copy.copied : copy.copyLink}</span>
          </button>
          {qr && (
            <a href={qr} download={`${slug}-qr.png`} className={pill}>
              <ThiingsIcon name="download" pxSize={15} />
              {copy.downloadQr}
            </a>
          )}
        </div>
        {qr && <p className="mt-2 text-[13px] text-muted-stone">{copy.qrHint}</p>}
      </div>
    </section>
  );
}

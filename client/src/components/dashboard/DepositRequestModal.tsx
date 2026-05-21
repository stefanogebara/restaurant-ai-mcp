import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authFetch } from '../../services/api';

interface DepositRequestModalProps {
  open: boolean;
  /** Reservation we're generating a deposit link for. */
  reservation: {
    reservation_id: string;
    customer_name?: string | null;
    customer_phone?: string | null;
    party_size?: number | null;
    date?: string | null;
    time?: string | null;
  } | null;
  /** Caller closes the modal — typically clears the selected reservation. */
  onClose: () => void;
}

interface LinkPayload {
  checkout_url: string;
  payment_intent_id: string | null;
  deposit_amount: number;
  currency: string;
  whatsapp_message: string;
  customer_phone: string | null;
}

/**
 * Phase AA.5 — modal that the deposit-suggest chip opens.
 *
 * Generates a Stripe Checkout URL via /api/request-deposit-link, then
 * gives the host two one-click ways to send it to the customer:
 *   - Copy the URL
 *   - Open WhatsApp with the message + link pre-filled (wa.me deep link)
 *
 * The endpoint is idempotent: hitting it twice for the same reservation
 * returns `already_requested` so we just show the message instead of
 * creating a duplicate Stripe session.
 */
export default function DepositRequestModal({
  open,
  reservation,
  onClose,
}: DepositRequestModalProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<LinkPayload | null>(null);
  const [copyOk, setCopyOk] = useState(false);

  useEffect(() => {
    if (!open || !reservation) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPayload(null);
    setCopyOk(false);

    authFetch('/api/request-deposit-link', {
      method: 'POST',
      body: JSON.stringify({ reservation_id: reservation.reservation_id }),
    })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setError(
            json?.error ||
              t('dashboard.depositSuggest.modal.errorGeneric', 'Failed to generate the deposit link.'),
          );
          return;
        }
        setPayload(json as LinkPayload);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || t('dashboard.depositSuggest.modal.errorGeneric', 'Failed to generate the deposit link.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, reservation, t]);

  if (!open || !reservation) return null;

  const copy = async () => {
    if (!payload?.checkout_url) return;
    try {
      await navigator.clipboard.writeText(payload.checkout_url);
      setCopyOk(true);
      setTimeout(() => setCopyOk(false), 1800);
    } catch {
      // Fallback for browsers that don't allow clipboard from this context.
      window.prompt(
        t('dashboard.depositSuggest.modal.copyFallback', 'Copy this link:'),
        payload.checkout_url,
      );
    }
  };

  const openWhatsApp = () => {
    if (!payload) return;
    const phone = (payload.customer_phone || reservation.customer_phone || '').replace(/[^\d]/g, '');
    const encoded = encodeURIComponent(payload.whatsapp_message);
    const url = phone
      ? `https://wa.me/${phone}?text=${encoded}`
      : `https://wa.me/?text=${encoded}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="deposit-request-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
      onClick={onClose}
    >
      <div
        className="bg-warm-white border border-border-default rounded-2xl max-w-md w-full p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="deposit-request-title" className="text-lg font-semibold text-deep-charcoal mb-1">
          {t('dashboard.depositSuggest.modal.title', 'Request a deposit')}
        </h2>
        <p className="text-sm text-muted-stone mb-4">
          {reservation.customer_name || t('dashboard.depositSuggest.modal.guest', 'Guest')}
          {' • '}
          {reservation.party_size || 1} {t('dashboard.depositSuggest.modal.guests', 'guests')}
          {' • '}
          {reservation.date}
          {reservation.time ? ` ${reservation.time.slice(0, 5)}` : ''}
        </p>

        {loading && (
          <div className="py-6 text-center text-sm text-muted-stone" role="status" aria-busy="true">
            {t('dashboard.depositSuggest.modal.loading', 'Generating link…')}
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700 mb-3"
          >
            {error}
          </div>
        )}

        {payload && (
          <div className="space-y-3">
            <div className="px-3 py-2 rounded-lg bg-stone-50 border border-border-default text-sm">
              <div className="text-deep-charcoal font-medium mb-1">
                {payload.currency.toUpperCase()} {payload.deposit_amount.toFixed(2)}
              </div>
              <div className="text-xs text-muted-stone break-all">{payload.checkout_url}</div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={copy}
                className="flex-1 px-3 py-2 rounded-lg border border-border-default text-sm font-medium hover:bg-stone-50 transition-colors"
              >
                {copyOk
                  ? t('dashboard.depositSuggest.modal.copied', 'Copied!')
                  : t('dashboard.depositSuggest.modal.copyLink', 'Copy link')}
              </button>
              <button
                type="button"
                onClick={openWhatsApp}
                className="flex-1 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors"
              >
                {t('dashboard.depositSuggest.modal.sendWhatsApp', 'Open in WhatsApp')}
              </button>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="w-full mt-5 text-xs text-muted-stone hover:text-deep-charcoal"
        >
          {t('common.close', 'Close')}
        </button>
      </div>
    </div>
  );
}

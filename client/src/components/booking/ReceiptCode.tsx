import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

type CopyResult = { code: string; status: 'copying' | 'copied' | 'manual' };

export default function ReceiptCode({ code }: { code: string }) {
  const { t } = useTranslation();
  const labelId = useId();
  const [result, setResult] = useState<CopyResult | null>(null);
  const status = result?.code === code ? result.status : 'idle';

  const copyCode = async () => {
    setResult({ code, status: 'copying' });
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(code);
      setResult({ code, status: 'copied' });
    } catch {
      setResult({ code, status: 'manual' });
    }
  };

  return (
    <div className="min-w-0 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span id={labelId} className="text-[13px] text-warm-stone">{t('reservations.confirmationId')}</span>
        <button
          type="button"
          onClick={copyCode}
          disabled={status === 'copying'}
          aria-busy={status === 'copying'}
          className="min-h-[44px] max-w-full rounded-full px-3 text-sm font-medium text-burgundy hover:bg-burgundy/[6%] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-burgundy focus-visible:ring-offset-2 disabled:opacity-60"
        >
          {t('reservations.confirmation.copyCode')}
        </button>
      </div>
      <code aria-labelledby={labelId} className="block w-full min-w-0 max-w-full select-all whitespace-normal break-all font-mono text-[13px] font-medium text-deep-charcoal">{code}</code>
      <p role="status" aria-live="polite" className={`mt-1 text-[13px] leading-relaxed ${status === 'copied' ? 'text-emerald-700' : 'text-amber-800'}`}>
        {status === 'copied' ? t('reservations.confirmation.codeCopied') : status === 'manual' ? t('reservations.confirmation.copyCodeManual') : ''}
      </p>
    </div>
  );
}

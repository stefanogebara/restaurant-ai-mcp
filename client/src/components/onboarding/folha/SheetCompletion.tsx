import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { getSheetCopy } from './sheetCopy';

const RESULTS = ['restaurant', 'voice_agent', 'knowledge_base', 'whatsapp_registry', 'subscription'] as const;
export default function SheetCompletion({ setup, bookingUrl }: { setup: Record<string, string> | null; bookingUrl: string | null }) {
  const { t, i18n } = useTranslation();
  const copy = getSheetCopy(i18n.language);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  return <main className="mx-auto w-full max-w-[620px] px-6 py-12 text-deep-charcoal">
    <h1 ref={heading} tabIndex={-1} className="font-serif text-3xl sm:text-4xl focus:outline-none">{copy.savedTitle}</h1>
    <h2 className="mt-8 mb-3 font-sans text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-stone">{copy.results}</h2>
    <dl className="divide-y divide-glass-border-dark">
      {RESULTS.map(key => <div key={key} className="flex flex-wrap items-center justify-between gap-2 py-3">
        <dt className="text-[15px]">{copy[key]}</dt>
        <dd className={`text-sm ${setup?.[key] === 'ok' ? 'text-emerald-700' : 'text-amber-700'}`}>
          {setup?.[key] === 'ok' ? copy.configured : setup?.[key] ? copy.needsAttention : copy.notReported}
        </dd>
      </div>)}
    </dl>
    <p className="mt-5 text-[15px] leading-relaxed text-muted-stone">{copy.verification}</p>
    {RESULTS.some(key => setup?.[key] !== 'ok') && <p className="mt-3 text-sm text-muted-stone">{copy.support}</p>}
    {bookingUrl && <a href={bookingUrl} className="mt-5 inline-flex min-h-11 max-w-full items-center break-all text-sm text-burgundy underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-burgundy/60">
      {t('onboarding.yourBookingLink', 'Your booking link')}
    </a>}
    <div className="mt-8">
      <a href="/host-dashboard/simple?launch=1" className="inline-flex min-h-11 items-center justify-center rounded-full bg-burgundy px-6 py-3 text-sm font-medium text-white hover:bg-burgundy-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-burgundy/60 focus-visible:ring-offset-2">
        {t('onboarding.goToDashboard', 'Go to Dashboard')}
      </a>
    </div>
  </main>;
}

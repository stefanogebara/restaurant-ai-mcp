import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import DashboardLayout from '../components/layout/DashboardLayout';
import ConnectWhatsAppNumberPanel from '../components/dashboard/ConnectWhatsAppNumberPanel';
import AiPersonalityPanel from '../components/dashboard/AiPersonalityPanel';
import ManagerNotificationsPanel from '../components/dashboard/ManagerNotificationsPanel';
import FeedbackSettingsPanel from '../components/dashboard/FeedbackSettingsPanel';
import SurveySettingsPanel from '../components/dashboard/SurveySettingsPanel';
import WhatsAppDeliveryTest from '../components/dashboard/WhatsAppDeliveryTest';
import WhatsAppOwnerPreferences from '../components/dashboard/WhatsAppOwnerPreferences';
import { whatsappCopy } from '../components/dashboard/whatsappCopy';
import { useWhatsAppProvision } from '../hooks/useWhatsAppProvision';
import { useWhatsAppStatus } from '../hooks/useWhatsAppSettings';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { formatWhatsAppNumber } from '../components/whatsapp/formatWhatsAppNumber';

// Mount optional settings on first opening; preserve edits when collapsed.
export function WhatsAppDisclosure({ title, children }: { title: string; children: ReactNode }) {
  const [visited, setVisited] = useState(false);
  return <details className="group border-t border-brand-line py-3.5" onToggle={event => {
    if (event.currentTarget.open) setVisited(true);
  }}>
    <summary className="cursor-pointer list-none font-brand text-[13px] font-medium text-brand-ink focus-visible:outline-brand-action [&::-webkit-details-marker]:hidden"><span className="flex items-center justify-between gap-4">{title}<span aria-hidden="true" className="text-lg font-light leading-none text-brand-muted group-open:rotate-45">+</span></span></summary>
    {visited && <div className="pt-5">{children}</div>}
  </details>;
}

export function WhatsAppWorkspace() {
  const { i18n } = useTranslation();
  const copy = whatsappCopy(i18n.language);
  const status = useWhatsAppStatus();
  const provision = useWhatsAppProvision();
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const loading = status.isLoading || provision.isLoading;
  // Global credentials and the owner's phone are NOT a restaurant connection.
  const number = provision.data?.numero_e164 || '';
  const validNumber = /^\+?[1-9]\d{7,14}$/.test(number);
  const malformedRegistration = provision.data?.estado === 'ativo' && !validNumber;
  const hasError = status.isError || provision.isError || malformedRegistration;
  const registered = !hasError && provision.data?.estado === 'ativo' && validNumber;
  const pending = !hasError && provision.data?.estado === 'aguardando_codigo';
  const setupError = !hasError && provision.data?.estado === 'erro';
  const label = hasError ? copy.unknown : registered ? copy.connected
    : pending ? copy.pending : setupError ? copy.errorStatus : copy.disconnected;
  const statusTone = hasError || setupError ? 'bg-red-50 text-red-700 ring-red-200' : registered
    ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : pending
      ? 'bg-amber-50 text-amber-800 ring-amber-200' : 'bg-brand-paper text-brand-ink ring-brand-line';
  const connectionTitle = hasError || setupError ? copy.errorTitle : registered ? copy.test
    : pending ? copy.pendingTitle : copy.disconnectedTitle;
  const nextStep = hasError || setupError ? copy.errorNext : registered ? copy.activeNext
    : pending ? copy.pendingNext : copy.disconnectedNext;
  const refresh = () => { void status.refetch(); void provision.refetch(); };
  return <div className="mx-auto max-w-5xl bg-brand-paper px-4 pb-20 pt-7 font-brand text-[15px] text-brand-ink sm:px-8 sm:pt-12">
    <header className={registered ? 'mx-auto mb-7 max-w-[720px] sm:mb-10' : 'mb-8 sm:mb-14'}>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-muted">{registered ? 'WhatsApp' : 'Seatable / WhatsApp'}</p>
      <h1 aria-label={registered ? copy.test : undefined} className={`font-brand font-normal leading-[1.02] tracking-[-0.055em] ${registered ? 'text-[clamp(36px,5vw,58px)]' : 'text-[clamp(40px,5.4vw,64px)]'}`}>{registered ? <><span className="block">{copy.testLead}</span><em className="block font-serif font-normal italic tracking-[-0.045em]">{copy.testAccent}</em></> : 'WhatsApp'}</h1>
      {!registered && <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-brand-muted sm:mt-4 sm:text-[17px]">{copy.pageIntro}</p>}
    </header>
    {loading ? <p role="status" className="py-12 text-brand-muted">{copy.refreshing}</p> : <>
      {registered ? <section aria-label={copy.test} className="mx-auto mb-9 max-w-[720px] sm:mb-12">
        <div className="border-t border-brand-line pt-5 sm:pt-7">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-muted">{copy.suggestedLabel}</p>
          <blockquote className="mt-3 max-w-[30ch] font-brand text-[20px] leading-[1.22] tracking-[-0.03em] text-brand-ink sm:text-[25px]">“{copy.suggestedMessage}”</blockquote>
          <p className="mt-3 text-[12px] leading-relaxed text-brand-muted">{copy.suggestedHint}</p>
          <a href={`https://wa.me/${number.replace(/\D/g, '')}?text=${encodeURIComponent(copy.suggestedMessage)}`} target="_blank" rel="noopener noreferrer" className="mt-5 flex min-h-12 w-full items-center justify-center rounded-full bg-brand-action px-6 py-3 text-[14px] font-semibold text-brand-paper transition-colors hover:bg-brand-ink">{copy.open}</a>
        </div>
        <div className="pt-5 sm:pt-6">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
            <p className="flex items-center gap-2 text-[13px] font-medium text-emerald-800"><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-emerald-600" />{copy.connected}</p>
            <button type="button" onClick={refresh} disabled={status.isFetching || provision.isFetching} className="text-[12px] text-brand-action underline underline-offset-4 disabled:opacity-50">{copy.retry}</button>
          </div>
          <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-5 gap-y-1">
            <p className="break-all font-brand text-[clamp(23px,3vw,31px)] leading-none tracking-[-0.04em]">{formatWhatsAppNumber(number)}</p>
            <button type="button" className="text-[13px] text-brand-action underline underline-offset-4" onClick={async () => {
              try { await navigator.clipboard.writeText(number); setCopied(true); setCopyError(false); }
              catch { setCopyError(true); }
            }}>{copied ? copy.copied : copy.copy}</button>
          </div>
          {copyError && <p role="alert" className="mt-2 text-red-700">{copy.copyFailed}</p>}
          <p className="mt-3 text-[12px] leading-relaxed text-brand-muted">{copy.registeredOnly}</p>
        </div>
        <div className="mt-7 border-t border-brand-line pt-5 sm:mt-9 sm:pt-7">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-muted">{copy.panelStep}</p>
          <p className="mt-2 text-[14px] leading-relaxed text-brand-muted">{copy.confirmHint}</p>
          <Link to="/host-dashboard/simple" className="mt-4 flex min-h-12 w-full items-center justify-center rounded-full border border-brand-action px-6 py-3 text-[14px] font-medium text-brand-action transition-colors hover:bg-brand-action hover:text-brand-paper">{copy.openPanel}</Link>
        </div>
      </section> : <section aria-labelledby="wa-connection-heading" className="mb-10 sm:mb-16">
        <div className="mb-5 flex items-center justify-between gap-4 border-t border-brand-line pt-4 sm:mb-8">
          <p className="text-[11px] font-medium uppercase tracking-[0.09em] text-brand-muted">{copy.connectionStep}</p>
          <button type="button" onClick={refresh} disabled={status.isFetching || provision.isFetching} className="shrink-0 text-[13px] font-medium text-brand-action underline underline-offset-4 disabled:opacity-50">{copy.retry}</button>
        </div>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-14">
          <div className="min-w-0">
            <span className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[13px] font-medium ring-1 ${statusTone}`}><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />{label}</span>
            <h2 id="wa-connection-heading" className="mt-4 max-w-[20ch] font-brand text-[clamp(32px,3.2vw,42px)] font-normal leading-[1.05] tracking-[-0.05em]">{connectionTitle}</h2>
            <p className="mt-2 max-w-[45ch] leading-relaxed text-brand-muted sm:mt-3">{nextStep}</p>
          </div>
          <div className="min-w-0">{hasError ? <div role="alert" className="border-t border-brand-line pt-5"><p className="text-red-700">{copy.loadError}</p><a className="inline-block mt-3 text-brand-action underline" href="mailto:hello@seatable.one">{copy.support}</a></div> : <>
          <ConnectWhatsAppNumberPanel />
          <p className="mt-4 text-sm leading-relaxed text-brand-muted">{copy.migration} <a href="mailto:hello@seatable.one" className="text-brand-action underline">{copy.support}</a></p>
          </>}</div>
        </div>
      </section>}
      {!hasError && <section aria-label={copy.settingsTitle} className="mx-auto max-w-[720px]">
        <WhatsAppDisclosure title={copy.settingsTitle}>
            <WhatsAppDisclosure title={copy.delivery}><WhatsAppDeliveryTest configured={Boolean(status.data?.api_configured)} /></WhatsAppDisclosure>
            <WhatsAppDisclosure title={copy.personality}><AiPersonalityPanel /></WhatsAppDisclosure>
            <WhatsAppDisclosure title={copy.notifications}><p className="mb-5 text-brand-muted">{copy.notificationHint}</p><WhatsAppOwnerPreferences /><ManagerNotificationsPanel /></WhatsAppDisclosure>
            <WhatsAppDisclosure title={copy.automated}><p className="mb-5 text-sm text-brand-muted">{copy.postVisitPolicy}</p><FeedbackSettingsPanel /><SurveySettingsPanel /></WhatsAppDisclosure>
        </WhatsAppDisclosure>
      </section>}
    </>}
  </div>;
}

export default function WhatsAppSettingsPage() {
  useDocumentTitle('WhatsApp | seatable');
  return <DashboardLayout appearance="hero"><WhatsAppWorkspace /></DashboardLayout>;
}

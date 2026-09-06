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

// Mount optional settings on first opening; preserve edits when collapsed.
export function WhatsAppDisclosure({ title, children }: { title: string; children: ReactNode }) {
  const [visited, setVisited] = useState(false);
  return <details className="border-t hairline py-5" onToggle={event => {
    if (event.currentTarget.open) setVisited(true);
  }}>
    <summary className="cursor-pointer text-[15px] font-medium text-deep-charcoal focus-visible:outline-burgundy">{title}</summary>
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
  const hasError = status.isError || provision.isError;
  const loading = status.isLoading || provision.isLoading;
  // Global credentials and the owner's phone are NOT a restaurant connection.
  const number = provision.data?.numero_e164 || '';
  const registered = !hasError && provision.data?.estado === 'ativo' && /^\+?[1-9]\d{7,14}$/.test(number);
  const label = hasError ? copy.unknown : registered ? copy.connected
    : provision.data?.estado === 'aguardando_codigo' ? copy.pending : copy.disconnected;
  const refresh = () => { void status.refetch(); void provision.refetch(); };
  return <div className="mx-auto max-w-4xl px-4 py-8 sm:px-8 sm:py-12 text-[15px] text-deep-charcoal">
    <header className="mb-10 sm:mb-12">
      <p className="text-[12px] uppercase tracking-[0.14em] text-muted-stone mb-3">WhatsApp</p>
      <h1 className="font-serif text-3xl sm:text-4xl">{registered ? copy.test : copy.connect}</h1>
      <p className="mt-3 text-muted-stone max-w-xl">{copy.intro}</p>
    </header>
    {loading ? <p role="status">{copy.refreshing}</p> : <>
      <section aria-label={copy.number} className="mb-10">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <span className={`rounded-full px-3 py-1 text-sm ${hasError ? 'bg-red-50 text-red-700' : registered ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{label}</span>
          <button type="button" onClick={refresh} disabled={status.isFetching || provision.isFetching} className="text-sm text-burgundy underline underline-offset-4 disabled:opacity-50">{copy.retry}</button>
        </div>
        {hasError ? <div role="alert"><p className="text-red-700">{copy.loadError}</p><a className="inline-block mt-3 text-burgundy underline" href="mailto:hello@seatable.one">{copy.support}</a></div> : registered ? <>
          <p className="font-serif text-3xl sm:text-4xl break-words">{number}</p>
          <p className="text-muted-stone mt-3 max-w-xl">{copy.registeredHint}</p>
          <button type="button" className="mt-3 text-burgundy underline" onClick={async () => {
            try { await navigator.clipboard.writeText(number); setCopied(true); setCopyError(false); }
            catch { setCopyError(true); }
          }}>{copied ? copy.copied : copy.copy}</button>
          {copyError && <p role="alert" className="text-red-700">{copy.copyFailed}</p>}
        </> : <>
          <ConnectWhatsAppNumberPanel />
          <p className="mt-4 text-sm text-muted-stone">{copy.migration} <a href="mailto:hello@seatable.one" className="text-burgundy underline">{copy.support}</a></p>
        </>}
      </section>
      <section aria-labelledby="wa-test-heading" className="border-t hairline py-8 sm:py-10">
        <h2 id="wa-test-heading" className="font-serif text-2xl">{copy.test}</h2>
        <p className="mt-3 max-w-xl text-muted-stone">{registered ? copy.testHint : copy.locked}</p>
        {registered && <div className="flex flex-wrap gap-4 items-center mt-6 mb-5">
          <a href={`https://wa.me/${number.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="bg-burgundy text-white rounded-full px-6 py-3 text-sm font-medium">{copy.open}</a>
          <Link to="/host-dashboard/simple" className="text-burgundy text-sm underline underline-offset-4">{copy.reservations}</Link>
        </div>}
        {!hasError && <WhatsAppDisclosure title={copy.delivery}><WhatsAppDeliveryTest configured={Boolean(status.data?.api_configured)} /></WhatsAppDisclosure>}
      </section>
      {!hasError && <section aria-label={copy.preferences}>
        <h2 className="text-[12px] uppercase tracking-[0.14em] text-muted-stone mb-4">{copy.preferences}</h2>
        <WhatsAppDisclosure title={copy.personality}><AiPersonalityPanel /></WhatsAppDisclosure>
        <WhatsAppDisclosure title={copy.notifications}><p className="text-muted-stone mb-5">{copy.notificationHint}</p><WhatsAppOwnerPreferences /><ManagerNotificationsPanel /></WhatsAppDisclosure>
        <WhatsAppDisclosure title={copy.automated}><FeedbackSettingsPanel /><SurveySettingsPanel /></WhatsAppDisclosure>
      </section>}
    </>}
  </div>;
}

export default function WhatsAppSettingsPage() {
  useDocumentTitle('WhatsApp | seatable');
  return <DashboardLayout><WhatsAppWorkspace /></DashboardLayout>;
}

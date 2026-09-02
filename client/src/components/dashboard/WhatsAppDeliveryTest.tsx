import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSendTestMessage, useWhatsAppTestMessageStatus } from '../../hooks/useWhatsAppSettings';
import { whatsappCopy } from './whatsappCopy';

export default function WhatsAppDeliveryTest({ configured }: { configured: boolean }) {
  const { t, i18n } = useTranslation();
  const copy = whatsappCopy(i18n.language);
  const latest = useWhatsAppTestMessageStatus();
  const send = useSendTestMessage();
  const [phone, setPhone] = useState('');
  const [now, setNow] = useState(Date.now);
  const data = latest.data;
  const waiting = ['accepted', 'sent', 'queued'].includes(data?.status || '');
  const deliveryDeadline = Date.parse(data?.requested_at || '') + 10 * 60 * 1000;
  const unconfirmed = waiting && (!Number.isFinite(deliveryDeadline) || deliveryDeadline <= now);
  useEffect(() => {
    if (!waiting || !Number.isFinite(deliveryDeadline) || deliveryDeadline <= Date.now()) return;
    const timer = window.setTimeout(() => setNow(Date.now()), deliveryDeadline - Date.now());
    return () => window.clearTimeout(timer);
  }, [waiting, deliveryDeadline]);
  const digits = (value: string) => value.replace(/\D/g, '');
  const cooldown = Boolean(data?.cooldown_expires_at && digits(data.recipient_phone) === digits(phone) && Date.parse(data.cooldown_expires_at) > now);
  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);
  const valid = /^\+[1-9]\d{7,14}$/.test(phone.replace(/\s/g, ''));
  const delivered = data?.status === 'delivered' || data?.status === 'read';
  const sentId = send.data?.data?.id;
  const currentResult = Boolean(sentId && data?.id === sentId);
  return <div className="space-y-4">
    <p className="text-sm text-muted-stone max-w-xl">{copy.deliveryHint}</p>
    {!configured && <p className="text-amber-700">{copy.testUnavailable}</p>}
    <form onSubmit={event => {
      event.preventDefault();
      if (valid && configured && !cooldown && !send.isPending) send.mutate(phone.replace(/\s/g, ''));
    }}>
      <label htmlFor="wa-test-phone" className="block mb-2 text-sm">{copy.recipient}</label>
      <div className="flex flex-col sm:flex-row gap-3">
        <input id="wa-test-phone" type="tel" placeholder="+55 11 99999 9999" value={phone} onChange={event => setPhone(event.target.value)} disabled={send.isPending} className="min-w-0 flex-1 border border-glass-border-input rounded-lg bg-glass-subtle px-3 py-3" />
        <button type="submit" disabled={!configured || !valid || cooldown || send.isPending} className="rounded-full px-5 py-3 bg-burgundy text-white disabled:opacity-40 text-sm">{send.isPending ? copy.sending : copy.send}</button>
      </div>
    </form>
    {cooldown && <p role="status" className="text-sm text-amber-700">{copy.cooldown}</p>}
    {send.isError && <p role="alert" className="text-red-700">{send.error.message === 'TEST_TEMPLATE_UNAVAILABLE' ? copy.templateUnavailable : send.error.message === 'TEST_CONFIG_INCOMPLETE' ? copy.configIncomplete : send.error.message}</p>}
    {send.isSuccess && !(currentResult && (delivered || unconfirmed || data?.status === 'failed')) && <p role="status" className="text-amber-700 text-sm">{copy.accepted}</p>}
    {latest.isError ? <div role="alert"><p>{copy.deliveryError}</p><button type="button" className="text-burgundy underline" onClick={() => void latest.refetch()}>{copy.retry}</button></div>
      : latest.isLoading ? <p role="status">{copy.refreshing}</p>
        : data ? <div aria-live="polite" className="border-t hairline pt-4">
          <p className="text-sm text-muted-stone">{copy.lastTest} · {data.recipient_phone}</p>
          <p className={`mt-2 text-sm ${data.status === 'failed' ? 'text-red-700' : delivered ? 'text-emerald-700' : 'text-amber-700'}`}>{unconfirmed ? copy.unconfirmed : t(`settings.testStatus.${data.status}`, data.status)}</p>
          {unconfirmed && <div className="mt-2 text-sm"><p className="text-muted-stone">{copy.unconfirmedHint}</p><button type="button" disabled={latest.isFetching} onClick={() => void latest.refetch()} className="mt-2 text-burgundy underline disabled:opacity-50">{copy.retry}</button></div>}
          {data.error_message && <p className="text-red-700 text-sm mt-2">{data.error_message}</p>}
          <details className="mt-3 text-sm text-muted-stone"><summary className="cursor-pointer">{copy.details}</summary>
            <button type="button" disabled={latest.isFetching} className="mt-3 text-burgundy underline disabled:opacity-50" onClick={() => void latest.refetch()}>{latest.isFetching ? copy.refreshing : copy.retry}</button>
            <dl className="mt-2 space-y-2">
              {[['settings.providerLabel', data.provider], ['settings.requestedAt', data.requested_at], ['settings.deliveredAt', data.delivered_at], ['settings.readAt', data.read_at]].map(([key, value]) => <div key={key}><dt>{t(key!)}</dt><dd className="break-words">{value || '—'}</dd></div>)}
            </dl>
          </details>
        </div> : <p className="text-sm text-muted-stone">{copy.noTest}</p>}
  </div>;
}

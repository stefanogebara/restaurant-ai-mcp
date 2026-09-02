import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSaveWhatsAppSettings, useWhatsAppStatus } from '../../hooks/useWhatsAppSettings';
import { whatsappCopy } from './whatsappCopy';

export default function WhatsAppOwnerPreferences() {
  const { i18n } = useTranslation();
  const copy = whatsappCopy(i18n.language);
  const { data } = useWhatsAppStatus();
  const save = useSaveWhatsAppSettings();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const dirty = enabled !== null || phone !== null;
  const validPhone = phone === null || /^\+?[1-9]\d{9,14}$/.test(phone.replace(/\s/g, ''));
  return <form className="space-y-4 mb-8" onSubmit={event => {
    event.preventDefault();
    if (!dirty || !validPhone || save.isPending) return;
    save.mutate({ ...(enabled !== null ? { enabled } : {}), ...(phone !== null ? { phone_number: phone } : {}) }, {
      onSuccess: () => { setEnabled(null); setPhone(null); },
    });
  }}>
    <label className="flex items-center gap-3"><input type="checkbox" checked={enabled ?? data?.enabled ?? false} disabled={save.isPending} onChange={e => setEnabled(e.target.checked)} />{copy.enabled}</label>
    <label className="block" htmlFor="wa-owner">{copy.owner}</label>
    <input id="wa-owner" type="tel" value={phone ?? data?.phone_number ?? ''} disabled={save.isPending} onChange={e => setPhone(e.target.value)} placeholder="+55 11 99999 9999" className="w-full rounded-lg border border-glass-border-input bg-glass-subtle px-3 py-3" />
    <button type="submit" disabled={!dirty || !validPhone || save.isPending} className="rounded-full bg-burgundy px-5 py-3 text-white disabled:opacity-40">{save.isPending ? copy.refreshing : copy.save}</button>
    {save.isError && <p role="alert" className="text-red-700">{save.error.message}</p>}
    {save.isSuccess && !dirty && <p role="status" className="text-emerald-700">{copy.saved}</p>}
  </form>;
}

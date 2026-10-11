import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../common/ThiingsIcon';
import { useFindDuplicates, useMergeCustomers } from '../../hooks/useCustomers';
import type { DuplicateGroup } from '../../hooks/useCustomers';

interface DuplicateCustomersPanelProps {
  onClose: () => void;
}

const focusables = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), [href], [tabindex]:not([tabindex="-1"])';

function CustomerIdentity({ customer }: { customer: DuplicateGroup['customers'][number] }) {
  const { t } = useTranslation();
  return (
    <div className="min-w-0 flex-1">
      <span className="min-w-0 break-words text-[15px] font-medium leading-snug text-brand-ink sm:text-sm">
        {customer.customer_name || customer.customer_phone}
      </span>
      <p className="mt-1 text-xs text-brand-muted">{t('crm.visitCount', { count: customer.total_visits ?? 0 })}</p>
    </div>
  );
}

function lastVisitLabel(value: string | null | undefined, locale: string) {
  if (!value) return '—';
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric', month: 'short',
    year: date.getUTCFullYear() === new Date().getUTCFullYear() ? undefined : 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export default function DuplicateCustomersPanel({ onClose }: DuplicateCustomersPanelProps) {
  const { t, i18n } = useTranslation();
  const { data, isLoading, isError } = useFindDuplicates(true);
  const mergeCustomers = useMergeCustomers();
  const [confirmGroup, setConfirmGroup] = useState<DuplicateGroup | null>(null);
  const [keepId, setKeepId] = useState<string | null>(null);
  const [mergeId, setMergeId] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const firstRadioRef = useRef<HTMLInputElement>(null);
  const mergeErrorRef = useRef<HTMLParagraphElement>(null);
  const returnGroupIndexRef = useRef<number | null>(null);
  const titleId = useId();

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  useEffect(() => {
    if (confirmGroup) firstRadioRef.current?.focus();
    else if (returnGroupIndexRef.current !== null) {
      const action = dialogRef.current?.querySelectorAll<HTMLButtonElement>('[data-duplicate-action]')[returnGroupIndexRef.current];
      (action?.isConnected ? action : closeButtonRef.current)?.focus();
      returnGroupIndexRef.current = null;
    } else closeButtonRef.current?.focus();
  }, [confirmGroup]);

  useEffect(() => {
    if (mergeCustomers.isError) mergeErrorRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [mergeCustomers.isError]);

  const closeConfirmation = () => {
    if (mergeCustomers.isPending) return;
    setConfirmGroup(null);
    setKeepId(null);
    setMergeId(null);
    mergeCustomers.reset();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (mergeCustomers.isPending) return;
      if (confirmGroup) closeConfirmation();
      else onClose();
    }
    if (event.key !== 'Tab' || !dialogRef.current) return;
    const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(focusables));
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  const openConfirmation = (group: DuplicateGroup, index: number) => {
    returnGroupIndexRef.current = index;
    mergeCustomers.reset();
    setConfirmGroup(group);
    setKeepId(group.customers[0]?.customer_id ?? null);
    setMergeId(group.customers.length === 2 ? group.customers[1].customer_id : null);
  };

  const handleMerge = () => {
    if (!confirmGroup || !keepId || !mergeId || keepId === mergeId) return;
    if (!confirmGroup.customers.some((customer) => customer.customer_id === keepId)
      || !confirmGroup.customers.some((customer) => customer.customer_id === mergeId)) return;
    mergeCustomers.mutate({ keepId, mergeId }, {
      onSuccess: () => {
        returnGroupIndexRef.current = null;
        setConfirmGroup(null);
        setKeepId(null);
        setMergeId(null);
      },
    });
  };

  const duplicates = data?.duplicates ?? [];
  const title = confirmGroup ? t('crm.confirmMerge', 'Confirm Merge') : t('crm.findDuplicates', 'Find Duplicates');
  const keptCustomer = confirmGroup?.customers.find((customer) => customer.customer_id === keepId);
  const absorbedCustomer = confirmGroup?.customers.find((customer) => customer.customer_id === mergeId);
  const combinedVisits = (keptCustomer?.total_visits ?? 0) + (absorbedCustomer?.total_visits ?? 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 sm:items-center sm:p-5"
      onMouseDown={(event) => { if (event.target === event.currentTarget && !mergeCustomers.isPending) onClose(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handleKeyDown}
        className="flex max-h-[94dvh] w-full max-w-[690px] flex-col overflow-hidden rounded-t-[22px] border border-brand-line bg-brand-paper font-brand text-brand-ink shadow-[0_22px_70px_rgba(20,28,18,0.22)] outline-none sm:max-h-[86dvh] sm:rounded-[22px]"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-brand-line px-5 py-4 sm:px-8 sm:py-5">
          <div className="min-w-0">
            <h2 id={titleId} className="font-brand text-[25px] font-normal leading-none tracking-[-0.055em] sm:text-[30px]">{title}</h2>
            {!confirmGroup && duplicates.length > 0 && (
              <p className="mt-2 text-[13px] text-brand-muted">
                {duplicates.length === 1
                  ? t('crm.duplicateGroupFound', '{{count}} group found', { count: 1 })
                  : t('crm.duplicateGroupsFound', '{{count}} groups found', { count: duplicates.length })}
              </p>
            )}
          </div>
          <button ref={closeButtonRef} type="button" onClick={onClose} disabled={mergeCustomers.isPending} aria-label={t('common.close', 'Close')} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-brand-muted hover:bg-brand-ink/[0.05] hover:text-brand-ink focus-visible:outline-2 focus-visible:outline-brand-action disabled:opacity-50">
            <ThiingsIcon name="close" pxSize={17} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto scroll-pb-5 px-5 py-4 sm:px-8 sm:py-6">
          {confirmGroup ? (
            <>
              <p className="max-w-[52ch] text-[13px] leading-relaxed text-brand-muted">{t('crm.mergeExplanation', 'Select the record to keep and the record to absorb. Only those two records will be merged.')}</p>
              <div className="mt-3 border-y border-brand-line py-2">
                <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-brand-muted">
                  {t('crm.matchedBy', 'Matched by')}: {confirmGroup.match_field === 'phone' ? t('crm.matchPhone', 'Phone') : t('crm.matchEmail', 'Email')}
                </p>
                <p className="mt-1 break-all text-sm text-brand-ink">{confirmGroup.match_value}</p>
              </div>
              <fieldset className="mt-4">
                <legend className="mb-2 text-xs font-medium uppercase tracking-[0.1em] text-brand-muted">{t('crm.recordToKeep', 'Record to keep')}</legend>
                <div className="divide-y divide-brand-line border-y border-brand-line">
                  {confirmGroup.customers.map((customer, index) => (
                    <label key={customer.customer_id} className={['flex min-h-[54px] cursor-pointer items-start gap-3 px-2 py-2 hover:bg-brand-ink/[0.035]', keepId === customer.customer_id ? 'bg-brand-action/[0.055]' : ''].join(' ')}>
                      <input
                        ref={index === 0 ? firstRadioRef : undefined}
                        type="radio"
                        name="keep_customer"
                        checked={keepId === customer.customer_id}
                        onChange={() => {
                          setKeepId(customer.customer_id);
                          setMergeId(confirmGroup.customers.length === 2
                            ? confirmGroup.customers.find((candidate) => candidate.customer_id !== customer.customer_id)?.customer_id ?? null
                            : null);
                        }}
                        className="mt-1 h-4 w-4 shrink-0 accent-brand-action focus-visible:outline-2 focus-visible:outline-brand-action"
                      />
                      <CustomerIdentity customer={customer} />
                    </label>
                  ))}
                </div>
              </fieldset>
              {confirmGroup.customers.length > 2 && (
                <label className="mt-4 block text-xs font-medium uppercase tracking-[0.1em] text-brand-muted">
                  {t('crm.recordToAbsorb', 'Record to merge into the one kept')}
                  <select value={mergeId ?? ''} onChange={(event) => setMergeId(event.target.value || null)} className="mt-2 min-h-11 w-full rounded-[8px] border border-brand-line bg-brand-paper px-3 py-2 text-sm font-normal normal-case tracking-normal text-brand-ink focus-visible:outline-2 focus-visible:outline-brand-action">
                    <option value="">—</option>
                    {confirmGroup.customers.filter((customer) => customer.customer_id !== keepId).map((customer) => (
                      <option key={customer.customer_id} value={customer.customer_id}>{customer.customer_name || customer.customer_phone}</option>
                    ))}
                  </select>
                </label>
              )}
              {mergeCustomers.isError && <p ref={mergeErrorRef} role="alert" className="mt-4 scroll-mb-5 text-sm text-red-700">{t('crm.mergeError', 'Could not merge these records. Try again.')}</p>}
            </>
          ) : isLoading ? (
            <div className="flex min-h-[190px] items-center justify-center" role="status" aria-label={t('common.loading', 'Loading')}>
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-brand-line border-t-brand-action" aria-hidden="true" />
            </div>
          ) : isError ? (
            <p role="alert" className="py-12 text-center text-sm text-red-700">{t('crm.duplicatesError', 'Failed to load duplicates')}</p>
          ) : duplicates.length === 0 ? (
            <p className="py-12 text-center text-sm text-brand-muted">{t('crm.noDuplicates', 'No duplicate customers found')}</p>
          ) : (
            <div className="divide-y divide-brand-line">
              {duplicates.map((group, index) => (
                <section key={group.match_field + '-' + group.match_value + '-' + index} className="py-5 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <p className="text-xs text-brand-muted">
                      {t('crm.matchedBy', 'Matched by')} {group.match_field === 'phone' ? t('crm.matchPhone', 'Phone') : t('crm.matchEmail', 'Email')}
                    </p>
                    <p className="break-all text-sm font-medium text-brand-ink">{group.match_value}</p>
                  </div>
                  <div className="mt-5 hidden grid-cols-[minmax(0,1fr)_96px_132px] gap-3 border-b border-brand-line pb-2 text-[11px] text-brand-muted sm:grid">
                    <span>{t('crm.colName', 'Customer')}</span>
                    <span>{t('crm.totalVisits', 'Visits')}</span>
                    <span>{t('crm.lastVisit', 'Last visit')}</span>
                  </div>
                  <div className="mt-3 divide-y divide-brand-line/70 sm:mt-0">
                    {group.customers.map((customer) => (
                      <div key={customer.customer_id} className="grid gap-x-3 py-2.5 first:pt-0 sm:grid-cols-[minmax(0,1fr)_96px_132px] sm:items-center sm:py-3 sm:first:pt-3">
                        <div className="min-w-0 sm:[&_p]:hidden"><CustomerIdentity customer={customer} /></div>
                        <span className="hidden text-sm tabular-nums text-brand-ink sm:block">{customer.total_visits ?? 0}</span>
                        <span className="text-xs text-brand-muted sm:text-sm"><span className="sm:hidden">{t('crm.lastVisit', 'Last visit')}: </span>{lastVisitLabel(customer.last_visit_date, i18n.language)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex justify-end">
                    <button data-duplicate-action type="button" onClick={() => openConfirmation(group, index)} className="min-h-10 w-full rounded-full bg-brand-action px-5 py-2 text-sm font-medium text-white hover:bg-brand-ink focus-visible:outline-2 focus-visible:outline-brand-action sm:w-auto">
                      {t('crm.merge', 'Merge')}
                    </button>
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>

        {confirmGroup && (
          <footer className="flex shrink-0 flex-col gap-1 border-t border-brand-line bg-brand-paper px-5 py-2.5 sm:flex-row sm:items-center sm:justify-end sm:gap-2 sm:px-8 sm:py-4">
            {keptCustomer && absorbedCustomer && (
              <div className="min-w-0 sm:mr-auto">
                <p className="truncate text-xs text-brand-muted">{absorbedCustomer.customer_name || absorbedCustomer.customer_phone} → {keptCustomer.customer_name || keptCustomer.customer_phone}</p>
                <p className="mt-0.5 text-sm font-medium text-brand-ink">{t('crm.mergeResult', 'Result')}: {t('crm.visitCount', { count: combinedVisits })}</p>
              </div>
            )}
            <div className="flex items-center justify-end gap-3">
              <button type="button" onClick={closeConfirmation} disabled={mergeCustomers.isPending} className="min-h-10 rounded-full px-3 text-sm text-brand-muted hover:text-brand-ink focus-visible:outline-2 focus-visible:outline-brand-action disabled:opacity-50">{t('common.cancel', 'Cancel')}</button>
              <button type="button" onClick={handleMerge} disabled={!keepId || !mergeId || mergeCustomers.isPending} className="min-h-10 rounded-full bg-brand-action px-5 py-2 text-sm font-medium text-white hover:bg-brand-ink focus-visible:outline-2 focus-visible:outline-brand-action disabled:cursor-not-allowed disabled:opacity-40">
                {mergeCustomers.isPending ? t('crm.merging', 'Merging...') : t('crm.mergeCustomers', 'Merge Customers')}
              </button>
            </div>
          </footer>
        )}
      </div>
    </div>
  );
}

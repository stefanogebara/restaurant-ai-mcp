import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import TagEditor from './TagEditor';
import CustomerProfileSections from './CustomerProfileSections';
import { displayCustomerPreset, type CustomerPresetKind } from './CustomerProfilePresets';
import { formatCurrency } from '../../utils/currency';
import { useCustomerDetail, useUpdateTags, useAddNote, useDeleteNote, useUpdateProfile } from '../../hooks/useCustomers';
import type { ProfileUpdatePayload } from '../../hooks/useCustomers';

interface CrmCustomerDrawerProps {
  customerId: string | null;
  onClose: () => void;
  initialView?: 'service' | 'relationship';
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

export default function CrmCustomerDrawer({ customerId, onClose, initialView = 'service' }: CrmCustomerDrawerProps) {
  const { t, i18n } = useTranslation();
  const isOpen = !!customerId;

  const { data: customer, isLoading, isError, refetch } = useCustomerDetail(customerId);
  const today = localDateKey(new Date());
  const nextReservation = customer?.recent_reservations
    ?.filter((reservation) => ['confirmed', 'pending'].includes(reservation.status.toLowerCase()) && reservation.date >= today)
    .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`))[0];
  const nextReservationDate = nextReservation ? reservationDateParts(nextReservation.date, i18n.language) : null;
  const otherReservations = customer?.recent_reservations?.filter((reservation) => reservation.id !== nextReservation?.id) ?? [];
  const updateTags = useUpdateTags();
  const addNote = useAddNote();
  const deleteNote = useDeleteNote();
  const updateProfile = useUpdateProfile();

  const [noteText, setNoteText] = useState('');
  const [activeView, setActiveView] = useState<'service' | 'relationship'>(initialView);
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1280);
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (customerId) setActiveView(initialView);
  }, [customerId, initialView]);

  useEffect(() => {
    const update = () => setIsDesktop(window.innerWidth >= 1280);
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const updateScrollLock = () => {
      document.body.style.overflow = window.innerWidth < 1280 ? 'hidden' : previousOverflow;
    };
    updateScrollLock();
    window.addEventListener('resize', updateScrollLock);
    dialogRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || window.innerWidth >= 1280 || !dialogRef.current) return;
      const focusables = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        .filter((element) => element.getClientRects().length > 0);
      if (focusables.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === dialogRef.current || !dialogRef.current.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialogRef.current.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', updateScrollLock);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [isOpen]);

  const handleTagsChange = (tags: string[]) => {
    if (!customerId) return;
    updateTags.mutate({ customerId, tags });
  };

  const handleAddNote = () => {
    const content = noteText.trim();
    if (!content || !customerId) return;
    addNote.mutate(
      { customerId, content },
      { onSuccess: () => setNoteText('') }
    );
  };

  const handleDeleteNote = (noteId: string) => {
    if (!customerId) return;
    deleteNote.mutate({ customerId, noteId });
  };

  const handleUpdateProfile = (payload: ProfileUpdatePayload) => {
    updateProfile.mutate(payload);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop on smaller screens */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/15 xl:hidden"
            onClick={onClose}
          />

          {/* Customer profile */}
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal={!isDesktop}
            aria-label={customer?.customer_name || t('crm.customerProfile', 'Customer profile')}
            tabIndex={-1}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 340 }}
            className="fixed inset-y-0 right-0 z-50 w-full overflow-x-hidden overflow-y-auto border-l border-brand-line bg-brand-paper font-brand text-brand-ink sm:w-[520px]"
          >
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-line border-t-brand-action" />
              </div>
            ) : isError || !customer ? (
              <div role="alert" className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
                <p className="text-sm text-deep-charcoal">
                  {t('crm.detailLoadError', 'Não foi possível carregar a ficha deste cliente.')}
                </p>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => void refetch()} className="rounded-full bg-brand-action px-4 py-2 text-xs font-medium text-white">
                    {t('common.retry', 'Tentar novamente')}
                  </button>
                  <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-xs font-medium text-brand-action">
                    {t('common.close', 'Fechar')}
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Header */}
                <div className="px-5 pb-5 pt-5 text-brand-ink sm:px-8 lg:pt-12">
                  <p className="mb-4 hidden text-[11px] font-medium uppercase tracking-[0.12em] text-brand-muted lg:block">{t('crm.customerProfile', 'Customer profile')}</p>
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="min-w-0 break-words font-brand text-[39px] font-normal leading-[1.03] tracking-[-0.06em] sm:text-[43px]">{customer.customer_name || customer.customer_phone}</h2>
                    <button
                      type="button"
                      onClick={onClose}
                      className="flex h-10 w-10 shrink-0 items-center justify-center text-brand-action hover:text-brand-ink focus-visible:outline-2 focus-visible:outline-brand-action"
                      aria-label={t('common.close', 'Fechar')}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                  <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums text-brand-muted">
                    {customer.customer_tier !== 'at_risk' && <span className="font-medium uppercase tracking-[0.11em] text-brand-action">{t(`crm.tier_${customer.customer_tier}`, customer.customer_tier)}</span>}
                    <span>{customer.customer_phone}</span>
                    {customer.customer_email && <span className="break-all">{customer.customer_email}</span>}
                  </p>
                </div>

                <nav aria-label={t('crm.profileViews', 'Profile views')} className="mx-5 flex gap-7 border-b border-brand-line sm:mx-8">
                  <button type="button" aria-current={activeView === 'service' ? 'page' : undefined} onClick={() => setActiveView('service')} className={`min-h-11 border-b-2 pb-1 text-sm focus-visible:outline-2 focus-visible:outline-brand-action ${activeView === 'service' ? 'border-brand-action text-brand-ink' : 'border-transparent text-brand-muted hover:text-brand-ink'}`}>{t('crm.serviceKnowledge', 'For service')}</button>
                  <button type="button" aria-current={activeView === 'relationship' ? 'page' : undefined} onClick={() => setActiveView('relationship')} className={`min-h-11 border-b-2 pb-1 text-sm focus-visible:outline-2 focus-visible:outline-brand-action ${activeView === 'relationship' ? 'border-brand-action text-brand-ink' : 'border-transparent text-brand-muted hover:text-brand-ink'}`}>{t('crm.relationshipView', 'Relationship')}</button>
                </nav>

                <div className="px-5 pb-12 sm:px-8">
                  {activeView === 'service' && <section aria-label={t('crm.serviceKnowledge', 'For service')} className="pb-3 pt-7">
                    {nextReservation && <div className="border-b border-brand-line pb-7">
                      <h3 className="text-[11px] font-medium uppercase tracking-[0.12em] text-brand-muted">{t('crm.nextReservation', 'Next reservation')}</h3>
                      <div className="mt-4 flex items-end justify-between gap-4 text-brand-ink">
                        <p className="flex min-w-0 items-baseline gap-2"><span className="font-serif text-[48px] italic leading-none">{nextReservationDate?.day}</span><span className="min-w-0 truncate text-lg tracking-[-0.03em]">{nextReservationDate?.month}</span></p>
                        <span className="shrink-0 text-[30px] leading-none tabular-nums tracking-[-0.05em]">{nextReservation.time}</span>
                      </div>
                      <p className="mt-3 text-xs tabular-nums text-brand-muted">{nextReservationDate?.year} <span aria-hidden="true">·</span> {nextReservation.party_size} {t('crm.people', 'guests')}</p>
                      {customer.seating_preferences?.length > 0 && <p className="mt-4 text-xs text-brand-muted">{t('crm.seatingPreference', 'Seating preference')}: <span className="text-brand-ink">{customer.seating_preferences.map((value) => displayCustomerPreset(value, 'seating')).join(', ')}</span></p>}
                    </div>}
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="pt-5 text-[11px] font-medium uppercase tracking-[0.12em] text-brand-muted">{t('crm.serviceNotes', 'Service notes')}</h3>
                      {customer.notes?.length > 0 && <details className="relative">
                        <summary aria-label={t('crm.noteActions', 'Note actions')} className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-full text-brand-muted marker:hidden hover:bg-brand-ink/5 focus-visible:outline-2 focus-visible:outline-brand-action">
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="3" cy="8" r="1.1" /><circle cx="8" cy="8" r="1.1" /><circle cx="13" cy="8" r="1.1" /></svg>
                        </summary>
                        <div className="absolute right-0 top-9 z-10 min-w-[9rem] rounded-xl border border-brand-line bg-brand-paper p-1 shadow-lg">
                          <button type="button" onClick={() => handleDeleteNote(customer.notes[0].id)} className="w-full rounded-lg px-3 py-2 text-left text-xs text-red-700 hover:bg-red-700/5 focus-visible:outline-2 focus-visible:outline-brand-action" aria-label={t('crm.deleteNote', 'Excluir nota')}>{t('crm.deleteNote', 'Delete note')}</button>
                        </div>
                      </details>}
                    </div>
                    {/* Note list */}
                    {customer.notes && customer.notes.length > 0 ? (
                      <div className="mt-2">
                        <p className="max-w-[48ch] break-words text-[19px] leading-[1.4] tracking-[-0.025em] text-brand-ink">{customer.notes[0].content}</p>
                        <div className="mt-1 flex items-center gap-4 text-xs text-brand-muted">
                          <span>{new Date(customer.notes[0].created_at).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                        </div>
                        {customer.notes.length > 1 && <details className="mt-3 border-t border-brand-line pt-2 text-xs text-brand-muted">
                          <summary className="min-h-8 cursor-pointer list-none text-brand-action underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-brand-action">{t('crm.otherNotes', { count: customer.notes.length - 1, defaultValue: '{{count}} older notes' })}</summary>
                          <div className="space-y-4 pb-3 pt-2">{customer.notes.slice(1).map((note) => <div key={note.id} className="border-t border-brand-line pt-3"><p className="text-sm leading-5 text-brand-ink">{note.content}</p><div className="mt-1 flex items-center justify-between"><span>{new Date(note.created_at).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' })}</span><button type="button" onClick={() => handleDeleteNote(note.id)} className="min-h-8 hover:text-red-700 hover:underline" aria-label={t('crm.deleteNote', 'Excluir nota')}>{t('crm.deleteNote', 'Delete note')}</button></div></div>)}</div>
                        </details>}
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-brand-muted">
                        {t('crm.noNotes', 'Nenhuma nota adicionada')}
                      </p>
                    )}
                    <div className="mt-2">
                      {customer.allergies?.length || customer.dietary_restrictions?.length || (!nextReservation && customer.seating_preferences?.length) ? (
                        <div>
                          {customer.allergies?.length > 0 && <Fact label={t('crm.allergies', 'Allergies')} values={customer.allergies} kind="allergy" />}
                          {customer.dietary_restrictions?.length > 0 && <Fact label={t('crm.dietaryRestrictions', 'Dietary restrictions')} values={customer.dietary_restrictions} kind="dietary" />}
                          {!nextReservation && customer.seating_preferences?.length > 0 && <Fact label={t('crm.seatingPreference', 'Seating preference')} values={customer.seating_preferences} kind="seating" />}
                        </div>
                      ) : !customer.notes?.length && <p className="text-sm text-brand-muted">{t('crm.noServicePreferences', 'No service preferences recorded yet.')}</p>}
                    </div>
                    <details className="group mt-4">
                      <summary className="inline-flex min-h-8 cursor-pointer list-none items-center text-xs font-medium text-brand-action underline decoration-brand-line underline-offset-4 marker:hidden hover:text-brand-ink focus-visible:outline-2 focus-visible:outline-brand-action">
                        {t('crm.addNote', 'Add note')}
                      </summary>
                      <div className="pt-2">
                    {/* Add note */}
                    <div className="mb-3">
                      <textarea
                        value={noteText}
                        onChange={(e) => setNoteText(e.target.value)}
                        placeholder={t('crm.notePlaceholder', 'Adicionar nota...')}
                        rows={2}
                        className="w-full resize-none rounded-xl border border-brand-line bg-white/70 px-4 py-3 text-sm text-brand-ink placeholder:text-brand-muted focus-visible:outline-2 focus-visible:outline-brand-action"
                      />
                      <button
                        type="button"
                        onClick={handleAddNote}
                        disabled={!noteText.trim() || addNote.isPending}
                        className="mt-2 rounded-full bg-brand-action px-4 py-2 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {addNote.isPending
                          ? t('crm.saving', 'Salvando...')
                          : t('crm.addNote', 'Adicionar Nota')}
                      </button>
                    </div>

                      </div>
                    </details>
                  </section>}

                  {activeView === 'relationship' && <section aria-label={t('crm.relationshipSnapshot', 'Relationship at a glance')} className="pb-6 pt-8">
                    <div className="grid gap-5 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] sm:gap-7">
                      <div>
                        <p className="text-[11px] text-brand-muted">{t('crm.visitHistory', 'Visit history')}</p>
                        <p className="mt-1.5 flex items-baseline gap-2 text-brand-ink"><span className="text-[42px] leading-none tabular-nums tracking-[-0.055em]">{customer.total_visits}</span><span className="text-[14px]">{t('crm.visitsRecorded', 'recorded visits')}</span></p>
                        {customer.first_visit_date && <p className="mt-3 text-[12px] tabular-nums text-brand-muted">{t('crm.firstVisit', 'First visit')}: <span className="text-brand-ink">{formatVisitDate(customer.first_visit_date, i18n.language)}</span></p>}
                        {customer.last_visit_date && <p className="mt-1 text-[12px] tabular-nums text-brand-muted">{t('crm.lastVisit', 'Last visit')}: <span className="text-brand-ink">{formatVisitDate(customer.last_visit_date, i18n.language)}</span></p>}
                      </div>
                      <div aria-label={customer.churn_risk_score != null ? `${t('crm.returnRisk', 'Risk of not returning')}: ${Math.round(customer.churn_risk_score)}/100` : undefined} className="border-t border-brand-line pt-4 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
                        <p className="text-[12px] text-brand-muted">{t('crm.historicalRisk', 'Historical return signal')}</p>
                        <p className="mt-1.5 tabular-nums text-[25px] leading-none tracking-[-0.03em] text-ocre-700">{customer.churn_risk_score != null ? <>{Math.round(customer.churn_risk_score)}<span className="ml-0.5 text-[12px] tracking-normal text-brand-muted">/100</span></> : '—'}</p>
                        {customer.churn_risk_score != null && customer.churn_risk_score > 70 && <p className="mt-1 text-xs text-ocre-700">{t('crm.elevatedHistoricalSignal', 'Elevated historical signal')}</p>}
                        <p className="mt-2 text-[12px] leading-[1.5] text-brand-muted">{t('crm.riskNotProbability', 'An index for review, not a probability.')}</p>
                        <details className="mt-1 text-xs text-brand-muted"><summary className="inline-flex min-h-9 cursor-pointer list-none items-center text-brand-action underline decoration-brand-line underline-offset-2 focus-visible:outline-2 focus-visible:outline-brand-action">{t('crm.howReadRisk', 'What does this mean?')}</summary><p className="max-w-[48ch] pb-2 leading-5">{t('crm.scoreBasis', 'Based on visit history; not a probability.')}</p>{customer.lifetime_value != null && <div className="mt-2 pb-2"><p className="text-brand-ink">{t('crm.viewValueProjection', 'View value projection')}: <span className="tabular-nums">{formatCurrency(Math.round(customer.lifetime_value))}</span></p><p className="mt-1 max-w-[48ch] leading-5">{t('crm.valueProjectionBasis', 'Estimated from visit frequency and average spend. This is not recorded revenue.')}</p></div>}</details>
                      </div>
                    </div>
                    {nextReservation && <div className="mt-6 border-t border-brand-line pt-5">
                      <h3 className="text-xs text-brand-muted">{t('crm.nextReservation', 'Next reservation')}</h3>
                      <p className="mt-2 text-[21px] leading-tight tabular-nums tracking-[-0.03em] text-brand-ink">{formatVisitDate(nextReservation.date, i18n.language)} <span className="text-brand-muted">·</span> {nextReservation.time}</p>
                      <p className="mt-1 flex items-center gap-3 text-xs text-brand-muted"><span>{nextReservation.party_size} {t('crm.people', 'guests')}</span><StatusBadge status={nextReservation.status} /></p>
                      <button type="button" onClick={() => setActiveView('service')} className="mt-2 min-h-8 text-xs font-medium text-brand-action underline decoration-brand-line underline-offset-4 focus-visible:outline-2 focus-visible:outline-brand-action">{t('crm.viewServiceBooking', 'View service details')}</button>
                    </div>}
                  </section>}

                  {/* Reservations may include future or cancelled entries; they are not all visits. */}
                  {activeView === 'relationship' && <section aria-label={t('crm.recentReservations', 'Recent reservations')} className="border-t border-brand-line py-5">
                    <h3 className="font-brand text-sm font-medium text-brand-ink">{t('crm.recentReservations', 'Recent reservations')}</h3>
                    {otherReservations.length > 0 ? (
                      <div className="mt-3 divide-y divide-brand-line">
                        {otherReservations.map((res) => (
                          <div key={res.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 py-3 text-sm">
                            <div className="min-w-0">
                              <span className="block tabular-nums font-medium text-brand-ink">{formatVisitDate(res.date, i18n.language)}</span>
                              <span className="mt-0.5 block tabular-nums text-xs text-brand-muted">{res.time}</span>
                            </div>
                            <div className="flex flex-col items-end gap-0.5 text-right">
                              <span className="text-xs text-brand-muted">{res.party_size} {t('crm.people', 'pessoas')}</span>
                              <StatusBadge status={res.status} />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-3 text-sm leading-6 text-brand-muted">
                        {nextReservation
                          ? t('crm.noOtherReservations', 'No other reservations recorded.')
                          : customer.total_visits > 0
                            ? t('crm.noVisitDetails', 'Visits are recorded, but dated reservation details are unavailable.')
                            : t('crm.noVisits', 'No reservations recorded')}
                      </p>
                    )}
                  </section>}
                  {activeView === 'service' && <details className="group border-t border-brand-line pt-4">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-medium text-brand-action marker:hidden focus-visible:outline-2 focus-visible:outline-brand-action">
                      {t('crm.editProfile', 'Edit profile')}
                      <svg className="transition-transform group-open:rotate-180" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m3 6 5 5 5-5" /></svg>
                    </summary>
                    <div className="space-y-7 pt-5">
                  {/* Tags */}
                  <Section title={t('crm.tags', 'Tags')}>
                    <TagEditor
                      key={customer.customer_id}
                      tags={customer.tags || []}
                      onTagsChange={handleTagsChange}
                    />
                  </Section>

                  {/* Profile Sections (Allergies, Dietary, Seating, Occasions) */}
                  <CustomerProfileSections
                    key={customer.customer_id}
                    customerId={customer.customer_id}
                    allergies={customer.allergies || []}
                    dietaryRestrictions={customer.dietary_restrictions || []}
                    seatingPreferences={customer.seating_preferences || []}
                    specialOccasions={customer.special_occasions || {}}
                    onUpdateProfile={handleUpdateProfile}
                  />

                    </div>
                  </details>}
                </div>
              </>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── Sub-components ─────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-3 font-brand text-xs font-medium text-brand-muted">{title}</h3>
      {children}
    </div>
  );
}

function Fact({ label, values, kind }: { label: string; values: string[]; kind: CustomerPresetKind }) {
  return <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 py-1.5 text-sm"><span className="text-brand-muted">{label}</span><span className="text-brand-ink">{values.map((value) => displayCustomerPreset(value, kind)).join(', ')}</span></div>;
}

function formatVisitDate(value: string, locale: string): string {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
}

function reservationDateParts(value: string, locale: string): { day: string; month: string; year: string } {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return { day: value, month: '', year: '' };
  return {
    day: String(date.getDate()),
    month: date.toLocaleDateString(locale, { month: 'long' }),
    year: String(date.getFullYear()),
  };
}

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const key = status.toLowerCase() === 'no-show' ? 'noShow' : status.toLowerCase();
  const colorMap: Record<string, string> = {
    confirmed: 'text-emerald-700',
    completed: 'text-brand-muted',
    cancelled: 'text-red-700',
    'no-show': 'text-amber-700',
    pending: 'text-brand-muted',
  };
  const cls = colorMap[status.toLowerCase()] || colorMap.pending;
  return (
    <span className={`text-[10px] font-medium uppercase tracking-[0.08em] ${cls}`}>
      {t(`reservations.${key}`, status)}
    </span>
  );
}

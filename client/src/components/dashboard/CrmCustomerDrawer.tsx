import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import CustomerTierBadge from './CustomerTierBadge';
import TagEditor from './TagEditor';
import CustomerProfileSections from './CustomerProfileSections';
import { formatCurrency } from '../../utils/currency';
import { useCustomerDetail, useUpdateTags, useAddNote, useDeleteNote, useUpdateProfile } from '../../hooks/useCustomers';
import type { ProfileUpdatePayload } from '../../hooks/useCustomers';

interface CrmCustomerDrawerProps {
  customerId: string | null;
  onClose: () => void;
}

export default function CrmCustomerDrawer({ customerId, onClose }: CrmCustomerDrawerProps) {
  const { t, i18n } = useTranslation();
  const isOpen = !!customerId;

  const { data: customer, isLoading, isError, refetch } = useCustomerDetail(customerId);
  const updateTags = useUpdateTags();
  const addNote = useAddNote();
  const deleteNote = useDeleteNote();
  const updateProfile = useUpdateProfile();

  const [noteText, setNoteText] = useState('');
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1024);

  useEffect(() => {
    const update = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

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
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/15 lg:hidden"
            onClick={onClose}
          />

          {/* Drawer */}
          <motion.div
            role="dialog"
            aria-modal={!isDesktop}
            aria-label={customer?.customer_name || t('crm.customerProfile', 'Customer profile')}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 340 }}
            className="fixed inset-y-0 right-0 z-50 w-full overflow-x-hidden overflow-y-auto border-l border-brand-line bg-brand-paper font-brand text-brand-ink shadow-xl sm:w-[520px] lg:w-[560px] lg:shadow-none"
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
                <div className="bg-brand-paper px-5 pb-3 pt-5 sm:px-8">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-brand-muted">{t('crm.customerProfile', 'Customer profile')}</span>
                  <button
                    type="button"
                    onClick={onClose}
                    className="-mr-2 flex h-10 w-10 items-center justify-center rounded-full text-brand-action hover:bg-brand-ink/5 focus-visible:outline-2 focus-visible:outline-brand-action"
                    aria-label={t('common.close', 'Fechar')}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                  </div>
                  <h2 className="break-words font-brand text-[32px] font-normal leading-[1.04] tracking-[-0.055em] sm:text-[38px]">{customer.customer_name || customer.customer_phone}</h2>
                  <p className="mt-2 text-xs tabular-nums text-brand-muted">{customer.customer_phone}{customer.customer_email && <span className="ml-3 break-all">{customer.customer_email}</span>}</p>
                  {customer.customer_tier !== 'at_risk' && <div className="mt-2"><CustomerTierBadge tier={customer.customer_tier as 'vip' | 'regular' | 'occasional' | 'new'} compact /></div>}
                </div>

                <div className="px-5 pb-12 sm:px-8">
                  {/* Notes */}
                  <section aria-label={t('crm.serviceKnowledge', 'For service')} className="pb-7 pt-4">
                    <h3 className="font-brand text-xs font-medium text-brand-muted">{t('crm.serviceKnowledge', 'For service')}</h3>
                    {/* Note list */}
                    {customer.notes && customer.notes.length > 0 ? (
                      <div className="mt-2">
                        <p className="max-w-[34ch] break-words font-brand text-[21px] leading-[1.25] tracking-[-0.03em] text-brand-ink sm:text-[23px]">{customer.notes[0].content}</p>
                        <div className="mt-3 flex items-center justify-between gap-3 text-xs text-brand-muted">
                          <span>{new Date(customer.notes[0].created_at).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                          <button type="button" onClick={() => handleDeleteNote(customer.notes[0].id)} className="min-h-8 text-brand-muted underline-offset-4 hover:text-red-700 hover:underline focus-visible:outline-2 focus-visible:outline-brand-action" aria-label={t('crm.deleteNote', 'Excluir nota')}>{t('crm.deleteNote', 'Delete note')}</button>
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
                    <div className="mt-5">
                      {customer.allergies?.length || customer.dietary_restrictions?.length || customer.seating_preferences?.length ? (
                        <div className="border-t border-brand-line pt-2">
                          {customer.allergies?.length > 0 && <Fact label={t('crm.allergies', 'Allergies')} values={customer.allergies} />}
                          {customer.dietary_restrictions?.length > 0 && <Fact label={t('crm.dietaryRestrictions', 'Dietary restrictions')} values={customer.dietary_restrictions} />}
                          {customer.seating_preferences?.length > 0 && <Fact label={t('crm.seatingShort', 'Seating')} values={customer.seating_preferences} />}
                        </div>
                      ) : <p className="text-sm text-brand-muted">{t('crm.noServicePreferences', 'No service preferences recorded yet.')}</p>}
                    </div>
                    <details className="group mt-4">
                      <summary className="inline-flex min-h-9 cursor-pointer list-none items-center rounded-full border border-brand-line px-4 text-xs font-medium text-brand-action marker:hidden hover:border-brand-action focus-visible:outline-2 focus-visible:outline-brand-action">
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
                  </section>

                  <section aria-label={t('crm.relationshipSnapshot', 'Relationship at a glance')} className="border-y border-brand-line py-5">
                    <div className="grid grid-cols-2 gap-6">
                      <StatBox label={t('crm.totalVisits', 'Visitas')} value={String(customer.total_visits)} />
                      <StatBox label={t('crm.recordedRevenue', 'Recorded revenue')} value={customer.total_revenue != null ? formatCurrency(Math.round(customer.total_revenue)) : '—'} />
                    </div>
                    <div className="mt-5 flex flex-wrap items-start justify-between gap-x-5 gap-y-2 text-xs text-brand-muted">
                      <p className="tabular-nums">{t('crm.estimatedValue', 'Estimated value')}: {customer.lifetime_value != null ? formatCurrency(Math.round(customer.lifetime_value)) : '—'}</p>
                      <div className="text-right">
                        <p aria-label={customer.churn_risk_score != null ? `${t('crm.riskSignal', 'Risk signal')}: ${Math.round(customer.churn_risk_score)}/100` : undefined}>
                          {t('crm.riskSignal', 'Risk signal')}: <span className="tabular-nums text-ocre-700">{customer.churn_risk_score != null ? `${Math.round(customer.churn_risk_score)}/100` : '—'}</span>
                        </p>
                        <details><summary className="inline-block min-h-7 cursor-pointer list-none underline decoration-brand-line underline-offset-2 focus-visible:outline-2 focus-visible:outline-brand-action">{t('crm.howReadRisk', 'What does this mean?')}</summary><p className="max-w-[18rem] pb-2 text-left leading-5">{t('crm.scoreBasis', 'Based on visit history; not a probability.')}</p></details>
                      </div>
                    </div>
                    {customer.last_visit_date && !customer.recent_reservations?.length && <p className="mt-3 text-xs text-brand-muted">{t('crm.lastVisitInProfile', { date: formatVisitDate(customer.last_visit_date, i18n.language), defaultValue: `Last visit: ${formatVisitDate(customer.last_visit_date, i18n.language)}` })}</p>}
                  </section>

                  {/* Visit History */}
                  <section aria-label={t('crm.visitHistory', 'Visit history')} className="py-6">
                    <h3 className="font-brand text-xs font-medium text-brand-muted">{t('crm.visitHistory', 'Visit history')}</h3>
                    {customer.recent_reservations && customer.recent_reservations.length > 0 ? (
                      <div className="mt-3 divide-y divide-brand-line">
                        {customer.recent_reservations.map((res) => (
                          <div
                            key={res.id}
                            className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-3 text-sm"
                          >
                            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                              <span className="tabular-nums font-medium text-brand-ink">{formatVisitDate(res.date, i18n.language)}</span>
                              <span className="tabular-nums text-xs text-brand-muted">{res.time}</span>
                            </div>
                            <div className="flex items-baseline gap-2 text-right">
                              <span className="text-xs text-brand-muted">{res.party_size} {t('crm.people', 'pessoas')}</span>
                              {res.status.toLowerCase() !== 'completed' && <StatusBadge status={res.status} />}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-3 text-sm leading-6 text-brand-muted">
                        {customer.total_visits > 0
                          ? t('crm.noVisitDetails', 'Há visitas registradas, mas os detalhes não estão disponíveis.')
                          : t('crm.noVisits', 'Nenhuma visita registrada')}
                      </p>
                    )}
                  </section>
                  <details className="group border-t border-brand-line pt-4">
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
                  </details>
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

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate font-brand text-[25px] leading-none tabular-nums tracking-[-0.04em] text-brand-ink sm:text-[28px]">{value}</p>
      <p className="mt-2 text-xs leading-4 text-brand-muted">{label}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-3 font-brand text-xs font-medium text-brand-muted">{title}</h3>
      {children}
    </div>
  );
}

function Fact({ label, values }: { label: string; values: string[] }) {
  return <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 py-1.5 text-sm"><span className="text-brand-muted">{label}</span><span className="text-brand-ink">{values.join(', ')}</span></div>;
}

function formatVisitDate(value: string, locale: string): string {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
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

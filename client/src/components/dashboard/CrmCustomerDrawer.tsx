import { useState } from 'react';
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
  const { t } = useTranslation();
  const isOpen = !!customerId;

  const { data: customer, isLoading } = useCustomerDetail(customerId);
  const updateTags = useUpdateTags();
  const addNote = useAddNote();
  const deleteNote = useDeleteNote();
  const updateProfile = useUpdateProfile();

  const [noteText, setNoteText] = useState('');

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
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed right-0 top-0 h-full w-[420px] max-w-[90vw] bg-glass-modal backdrop-blur-glass-modal shadow-glass-modal z-50 overflow-y-auto border-l border-glass-border-dark"
          >
            {isLoading || !customer ? (
              <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-border-gray border-t-burgundy" />
              </div>
            ) : (
              <>
                {/* Header */}
                <div className="sticky top-0 bg-glass-panel backdrop-blur-glass-nav border-b border-glass-border-dark px-6 py-4 flex items-center justify-between z-10">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="font-serif text-[24px] leading-tight text-deep-charcoal truncate">
                        {customer.customer_name || customer.customer_phone}
                      </h2>
                      <CustomerTierBadge
                        tier={customer.customer_tier as 'vip' | 'regular' | 'occasional' | 'new' | 'at_risk'}
                        visitCount={customer.total_visits}
                      />
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <p className="font-mono text-xs text-muted-stone">{customer.customer_phone}</p>
                      {customer.customer_email && (
                        <p className="text-xs text-muted-stone">{customer.customer_email}</p>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    className="p-2 hover:bg-deep-charcoal/[0.05] rounded-[46px] transition-colors flex-shrink-0"
                    aria-label={t('common.close', 'Fechar')}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>

                <div className="px-6 py-5 space-y-6">
                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 gap-3">
                    <StatBox
                      label={t('crm.totalVisits', 'Visitas')}
                      value={String(customer.total_visits)}
                    />
                    <StatBox
                      label={t('crm.avgSpend', 'Ticket Medio')}
                      value={customer.avg_revenue_per_visit ? formatCurrency(Math.round(customer.avg_revenue_per_visit)) : '--'}
                    />
                    <StatBox
                      label={t('crm.totalRevenue', 'Receita Total')}
                      value={customer.total_revenue ? formatCurrency(Math.round(customer.total_revenue)) : '--'}
                    />
                    <StatBox
                      label={t('crm.churnRisk', 'Risco de Churn')}
                      value={customer.churn_risk_score != null ? `${customer.churn_risk_score}%` : '--'}
                      valueColor={customer.churn_risk_score > 50 ? 'text-red-600' : undefined}
                    />
                  </div>

                  {/* Tags */}
                  <Section title={t('crm.tags', 'Tags')}>
                    <TagEditor
                      tags={customer.tags || []}
                      onTagsChange={handleTagsChange}
                    />
                  </Section>

                  {/* Profile Sections (Allergies, Dietary, Seating, Occasions) */}
                  <CustomerProfileSections
                    customerId={customer.customer_id}
                    allergies={customer.allergies || []}
                    dietaryRestrictions={customer.dietary_restrictions || []}
                    seatingPreferences={customer.seating_preferences || []}
                    specialOccasions={customer.special_occasions || {}}
                    onUpdateProfile={handleUpdateProfile}
                  />

                  {/* Notes */}
                  <Section title={t('crm.notes', 'Notas')}>
                    {/* Add note */}
                    <div className="mb-3">
                      <textarea
                        value={noteText}
                        onChange={(e) => setNoteText(e.target.value)}
                        placeholder={t('crm.notePlaceholder', 'Adicionar nota...')}
                        rows={2}
                        className="w-full text-sm glass-pill rounded-xl px-3.5 py-2.5 text-deep-charcoal placeholder:text-muted-stone focus:outline-none focus:ring-2 focus:ring-burgundy/30 resize-none"
                      />
                      <button
                        type="button"
                        onClick={handleAddNote}
                        disabled={!noteText.trim() || addNote.isPending}
                        className="mt-2 px-4 py-1.5 text-xs font-medium bg-burgundy text-white rounded-[100px] hover:bg-burgundy-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        {addNote.isPending
                          ? t('crm.saving', 'Salvando...')
                          : t('crm.addNote', 'Adicionar Nota')}
                      </button>
                    </div>

                    {/* Note list */}
                    {customer.notes && customer.notes.length > 0 ? (
                      <div className="space-y-2">
                        {customer.notes.map((note) => (
                          <div
                            key={note.id}
                            className="text-[15px] text-deep-charcoal py-3 border-b hairline last:border-0 flex items-start justify-between gap-2"
                          >
                            <div className="min-w-0">
                              <p>{note.content}</p>
                              <span className="font-mono text-[10px] text-muted-stone">
                                {new Date(note.created_at).toLocaleDateString('pt-BR')}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleDeleteNote(note.id)}
                              className="text-muted-stone hover:text-red-700 transition-colors flex-shrink-0 mt-0.5"
                              aria-label={t('crm.deleteNote', 'Excluir nota')}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-stone italic">
                        {t('crm.noNotes', 'Nenhuma nota adicionada')}
                      </p>
                    )}
                  </Section>

                  {/* Visit History */}
                  <Section title={t('crm.visitHistory', 'Histórico de Visitas')}>
                    {customer.recent_reservations && customer.recent_reservations.length > 0 ? (
                      <div className="space-y-2">
                        {customer.recent_reservations.map((res) => (
                          <div
                            key={res.id}
                            className="flex items-center justify-between text-sm border-b hairline py-2.5 last:border-0"
                          >
                            <div>
                              <span className="font-mono text-deep-charcoal font-medium">{res.date}</span>
                              <span className="font-mono text-muted-stone ml-2">{res.time}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-muted-stone">
                                {res.party_size} {t('crm.people', 'pessoas')}
                              </span>
                              <StatusBadge status={res.status} />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-stone italic">
                        {t('crm.noVisits', 'Nenhuma visita registrada')}
                      </p>
                    )}
                  </Section>
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

function StatBox({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div>
      <p className={`font-serif text-[24px] leading-none tabular-nums ${valueColor || 'text-deep-charcoal'}`}>{value}</p>
      <p className="text-[10px] font-semibold text-muted-stone uppercase tracking-[0.12em] mt-2">{label}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[11px] font-semibold text-muted-stone uppercase tracking-[0.12em] mb-2">{title}</h3>
      {children}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    confirmed: 'bg-emerald-600/[0.10] text-emerald-700',
    completed: 'bg-burgundy/[0.08] text-burgundy',
    cancelled: 'bg-red-700/[0.08] text-red-700',
    'no-show': 'bg-amber-600/[0.12] text-amber-700',
    pending: 'bg-muted-stone/[0.10] text-muted-stone',
  };
  const cls = colorMap[status.toLowerCase()] || colorMap.pending;
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-[0.08em] px-2 py-0.5 rounded-[46px] ${cls}`}>
      {status}
    </span>
  );
}

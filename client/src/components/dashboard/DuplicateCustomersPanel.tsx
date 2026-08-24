import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import CustomerTierBadge from './CustomerTierBadge';
import { useFindDuplicates, useMergeCustomers } from '../../hooks/useCustomers';
import type { DuplicateGroup } from '../../hooks/useCustomers';

interface DuplicateCustomersPanelProps {
  onClose: () => void;
}

export default function DuplicateCustomersPanel({ onClose }: DuplicateCustomersPanelProps) {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useFindDuplicates(true);
  const mergeCustomers = useMergeCustomers();

  const [confirmGroup, setConfirmGroup] = useState<DuplicateGroup | null>(null);
  const [keepId, setKeepId] = useState<string | null>(null);

  const handleMerge = () => {
    if (!confirmGroup || !keepId) return;
    const mergeTarget = confirmGroup.customers.find((c) => c.customer_id !== keepId);
    if (!mergeTarget) return;

    mergeCustomers.mutate(
      { keepId, mergeId: mergeTarget.customer_id },
      {
        onSuccess: () => {
          setConfirmGroup(null);
          setKeepId(null);
        },
      }
    );
  };

  const duplicates = data?.duplicates ?? [];

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="glass-modal w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-glass-border-dark">
          <div>
            <h2 className="font-serif text-[24px] leading-tight text-deep-charcoal">
              {t('crm.findDuplicates', 'Find Duplicates')}
            </h2>
            {duplicates.length > 0 && (
              <p className="text-sm text-muted-stone mt-0.5">
                {t('crm.duplicateGroupsFound', '{{count}} groups found', {
                  count: duplicates.length,
                })}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-deep-charcoal/[0.05] rounded-[46px] transition-colors"
            aria-label={t('common.close', 'Close')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-border-gray border-t-burgundy" />
            </div>
          ) : isError ? (
            <p className="text-sm text-red-600 text-center py-12">
              {t('crm.duplicatesError', 'Failed to load duplicates')}
            </p>
          ) : duplicates.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-muted-stone">
                {t('crm.noDuplicates', 'No duplicate customers found')}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {duplicates.map((group, idx) => (
                <DuplicateGroupCard
                  key={`${group.match_type}-${group.match_value}-${idx}`}
                  group={group}
                  onMerge={() => {
                    setConfirmGroup(group);
                    setKeepId(group.customers[0]?.customer_id ?? null);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Merge Confirmation Modal */}
      {confirmGroup && (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
          <div className="glass-modal w-full max-w-md p-6">
            <h3 className="font-serif text-[20px] text-deep-charcoal mb-3">
              {t('crm.confirmMerge', 'Confirm Merge')}
            </h3>
            <p className="text-sm text-muted-stone mb-4">
              {t('crm.mergeExplanation', 'Select the primary record to keep. The other record will be merged into it.')}
            </p>

            <div className="space-y-2 mb-5">
              {confirmGroup.customers.map((c) => (
                <label
                  key={c.customer_id}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    keepId === c.customer_id
                      ? 'border-burgundy bg-burgundy/[0.06]'
                      : 'border-glass-border-dark hover:bg-deep-charcoal/[0.02]'
                  }`}
                >
                  <input
                    type="radio"
                    name="keep_customer"
                    checked={keepId === c.customer_id}
                    onChange={() => setKeepId(c.customer_id)}
                    className="accent-burgundy"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-deep-charcoal truncate">
                      {c.customer_name || c.customer_phone}
                    </p>
                    <p className="text-xs text-muted-stone">
                      {c.total_visits} {t('crm.visits', 'visits')}
                    </p>
                  </div>
                  <CustomerTierBadge
                    tier={c.customer_tier as 'vip' | 'regular' | 'occasional' | 'new' | 'at_risk'}
                    compact
                  />
                </label>
              ))}
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setConfirmGroup(null);
                  setKeepId(null);
                }}
                className="px-5 py-2 text-sm font-medium text-muted-stone hover:text-deep-charcoal glass-pill rounded-[46px] transition-colors"
              >
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                type="button"
                onClick={handleMerge}
                disabled={!keepId || mergeCustomers.isPending}
                className="px-5 py-2 text-sm font-medium text-white bg-burgundy rounded-[100px] hover:bg-burgundy-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {mergeCustomers.isPending
                  ? t('crm.merging', 'Merging...')
                  : t('crm.mergeCustomers', 'Merge Customers')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// â”€â”€â”€ Sub-component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function DuplicateGroupCard({
  group,
  onMerge,
}: {
  group: DuplicateGroup;
  onMerge: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="border border-glass-border-dark rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-semibold text-muted-stone uppercase tracking-[0.12em]">
          {t('crm.matchedBy', 'Matched by')}: {group.match_type}
        </span>
        <button
          type="button"
          onClick={onMerge}
          className="px-4 py-1.5 text-xs font-medium text-burgundy border border-burgundy/40 rounded-[46px] hover:bg-burgundy/[0.06] transition-colors"
        >
          {t('crm.merge', 'Merge')}
        </button>
      </div>

      <div className="space-y-2">
        {group.customers.map((c) => (
          <div
            key={c.customer_id}
            className="flex items-center justify-between text-sm"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-medium text-deep-charcoal truncate">
                {c.customer_name || c.customer_phone}
              </span>
              <CustomerTierBadge
                tier={c.customer_tier as 'vip' | 'regular' | 'occasional' | 'new' | 'at_risk'}
                compact
              />
            </div>
            <span className="text-xs text-muted-stone flex-shrink-0 ml-3">
              {c.total_visits} {t('crm.visits', 'visits')}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

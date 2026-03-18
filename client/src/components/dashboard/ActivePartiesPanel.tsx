import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { ActiveParty } from '../../types/host.types';
import ThiingsIcon from '../common/ThiingsIcon';

interface ActivePartiesPanelProps {
  parties: ActiveParty[];
  onCompleteService: (party: ActiveParty, totalBill?: number) => void;
  language?: 'en' | 'es';
  isLoading?: boolean;
}

export default function ActivePartiesPanel({
  parties,
  onCompleteService,
  language: _language,
  isLoading,
}: ActivePartiesPanelProps) {
  const { t } = useTranslation();
  const [billInputs, setBillInputs] = useState<Record<string, string>>({});

  // Tick every 15s to keep elapsed timers live
  const [, setTick] = useState(0);
  useEffect(() => {
    if (parties.length === 0) return;
    const id = setInterval(() => setTick((n) => n + 1), 15000);
    return () => clearInterval(id);
  }, [parties.length]);
  if (isLoading) {
    return (
      <div role="status" aria-label="Loading active parties" className="p-5">
        <div className="h-5 w-32 bg-border-gray rounded animate-pulse mb-4" />
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="p-3 bg-soft-gray rounded-xl">
              <div className="h-4 w-24 bg-border-gray rounded animate-pulse mb-2" />
              <div className="h-3 w-36 bg-soft-gray rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-[#E5E7EB]">
        <div>
          <div className="flex items-center gap-2.5">
            <h3 className="text-[13px] font-semibold uppercase tracking-widest text-[#111827]">{t('dashboard.activeParties')}</h3>
            <span className="text-[11px] font-semibold bg-[#9F1239]/[8%] text-[#9F1239] px-2.5 py-0.5 rounded-full">
              {parties.length}
            </span>
            {parties.length > 0 && (
              <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-600">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                {t('common.live', 'Live')}
              </span>
            )}
          </div>
          {parties.reduce((sum, p) => sum + (p.party_size ?? 0), 0) > 0 && (
            <p className="text-xs text-muted-stone mt-0.5">
              {parties.reduce((sum, p) => sum + (p.party_size ?? 0), 0)} {t('dashboard.activePartiesPanel.guestsSeated')}
            </p>
          )}
        </div>
      </div>

      {/* List */}
      {parties.length === 0 ? (
        <div className="text-center py-10 px-6">
          <div className="w-14 h-14 bg-soft-gray rounded-2xl flex items-center justify-center mx-auto mb-3">
            <ThiingsIcon name="layout-grid" pxSize={28} />
          </div>
          <p className="text-sm font-semibold text-deep-charcoal mb-1">{t('dashboard.activePartiesPanel.noActive')}</p>
          <p className="text-xs text-stone-gray">{t('dashboard.activePartiesPanel.addHint')}</p>
        </div>
      ) : (
        <div className="max-h-[400px] overflow-y-auto py-1">
          {parties.map((party) => (
            <div key={party.service_id} className="px-6 py-4 border-b border-[#E5E7EB] last:border-b-0">
              <PartyRow
                party={party}
                billValue={billInputs[party.service_id] || ''}
                onBillChange={(val) => setBillInputs(prev => ({ ...prev, [party.service_id]: val }))}
                onComplete={(totalBill) => onCompleteService(party, totalBill)}
                language={_language}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Internal row ----

function formatTimestamp(ts: string, locale = 'en-US'): string {
  if (!ts) return '--:--';
  return new Date(ts).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

interface PartyRowProps {
  party: ActiveParty;
  billValue: string;
  onBillChange: (val: string) => void;
  onComplete: (totalBill?: number) => void;
  language?: 'en' | 'es';
}

function PartyRow({ party, billValue, onBillChange, onComplete }: PartyRowProps) {
  const { t, i18n } = useTranslation();
  const isOverdue = party.is_overdue;

  return (
    <div>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#9F1239]/15 to-[#9F1239]/10 flex items-center justify-center text-[10px] font-bold text-[#9F1239] border border-[#9F1239]/20 flex-shrink-0">
            {(party.customer_name || '--')
              .split(' ')
              .map((n) => n[0])
              .slice(0, 2)
              .join('')
              .toUpperCase()}
          </div>
          <div className="font-semibold text-deep-charcoal text-sm truncate min-w-0" title={party.customer_name || ''}>
            {party.customer_name}
          </div>
        </div>
        <span className="text-xs font-medium text-stone-gray flex-shrink-0 ml-2">
          {formatTimestamp(party.seated_at, i18n.language)}
        </span>
      </div>

      <div className="flex items-center gap-3 text-xs text-stone-gray mb-2">
        <span className="font-medium">{party.party_size} {t('dashboard.activePartiesPanel.guests')}</span>
        {party.tables && party.tables.length > 0 && (
          <span className="bg-soft-gray px-2 py-0.5 rounded-lg text-xs font-semibold max-w-[120px] truncate">{t('dashboard.activePartiesPanel.table')} {party.tables.join(', ')}</span>
        )}
        {isOverdue && (
          <span className="text-red-600 font-semibold">{t('dashboard.activePartiesPanel.overdue')}</span>
        )}
      </div>

      {/* Time progress */}
      {party.time_elapsed_minutes !== undefined && (
        <div>
          <div className="h-[2px] bg-[#F3F4F6] rounded-full overflow-hidden mt-2 mb-3">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(
                  ((party.time_elapsed_minutes) /
                    (party.time_elapsed_minutes + Math.max(party.time_remaining_minutes, 0))) * 100,
                  100
                )}%`,
                background: isOverdue ? '#ef4444' : '#9F1239',
              }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-muted-stone mb-1">
            <span>{party.time_elapsed_minutes}m {t('dashboard.activePartiesPanel.elapsed')}</span>
            <span>{party.time_remaining_minutes > 0 ? `${party.time_remaining_minutes}m ${t('dashboard.activePartiesPanel.left')}` : t('dashboard.activePartiesPanel.overdue')}</span>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 mt-2">
        <input
          type="number"
          min={0}
          placeholder={t('dashboard.activePartiesPanel.billAmount')}
          value={billValue}
          onChange={e => onBillChange(e.target.value)}
          className="w-24 sm:w-28 border border-border-gray rounded-lg px-2 py-1 text-xs text-deep-charcoal focus:outline-none focus:ring-1 focus:ring-[#9F1239]/30"
          aria-label="Total bill amount"
        />
        <button
          type="button"
          onClick={() => {
            const parsed = billValue ? parseFloat(billValue) : undefined;
            onComplete(parsed !== undefined && !isNaN(parsed) ? parsed : undefined);
          }}
          className="flex-1 px-3 py-2.5 min-h-[44px] bg-soft-gray hover:bg-border-gray text-deep-charcoal text-xs font-medium rounded-xl transition-colors"
        >
          {t('dashboard.completeService')}
        </button>
      </div>
    </div>
  );
}

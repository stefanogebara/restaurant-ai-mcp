import type { ActiveParty } from '../../types/host.types';

interface ActivePartiesPanelProps {
  parties: ActiveParty[];
  onCompleteService: (party: ActiveParty) => void;
  language?: 'en' | 'es';
  isLoading?: boolean;
}

const translations = {
  en: {
    activeParties: 'Active Parties',
    noActive: 'No active parties yet',
    addHint: 'Add a walk-in or check in a reservation to get started',
    guests: 'guests',
    table: 'Table',
    overdue: 'Overdue',
    elapsed: 'elapsed',
    left: 'left',
    completeService: 'Complete Service',
  },
  es: {
    activeParties: 'Mesas Activas',
    noActive: 'Sin mesas activas',
    addHint: 'Añade un walk-in o haz check-in de una reserva para comenzar',
    guests: 'pax',
    table: 'Mesa',
    overdue: 'Excedido',
    elapsed: 'transcurridos',
    left: 'restantes',
    completeService: 'Completar Servicio',
  },
};

export default function ActivePartiesPanel({
  parties,
  onCompleteService,
  language = 'en',
  isLoading,
}: ActivePartiesPanelProps) {
  const t = translations[language];
  if (isLoading) {
    return (
      <div className="bg-white border border-[#E7E5E4] rounded-2xl p-5">
        <div className="h-5 w-32 bg-[#E7E5E4] rounded animate-pulse mb-4" />
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="p-3 bg-[#F5F5F4] rounded-xl">
              <div className="h-4 w-24 bg-[#E7E5E4] rounded animate-pulse mb-2" />
              <div className="h-3 w-36 bg-[#F5F5F4] rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#E7E5E4] rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-[#F5F5F4]">
        <div className="flex items-center gap-2.5">
          <span className="text-[15px] font-semibold text-[#1C1917] tracking-tight">{t.activeParties}</span>
          <span className="text-[11px] font-semibold bg-[rgba(159,18,57,0.08)] text-[#9F1239] px-2.5 py-0.5 rounded-full">
            {parties.length}
          </span>
        </div>
      </div>

      {/* List */}
      {parties.length === 0 ? (
        <div className="text-center py-10 px-4">
          <div className="w-14 h-14 bg-[#F5F5F4] rounded-2xl flex items-center justify-center mx-auto mb-3">
            <svg className="w-7 h-7 text-[#A8A29E]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-[#1C1917] mb-1">{t.noActive}</p>
          <p className="text-xs text-[#57534E]">{t.addHint}</p>
        </div>
      ) : (
        <div className="divide-y divide-[#E7E5E4]/50 max-h-[400px] overflow-y-auto">
          {parties.map((party) => (
            <PartyRow
              key={party.service_id}
              party={party}
              onComplete={() => onCompleteService(party)}
              language={language}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Internal row ----

function formatTimestamp(ts: string): string {
  if (!ts) return '--:--';
  return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

interface PartyRowProps {
  party: ActiveParty;
  onComplete: () => void;
  language: 'en' | 'es';
}

function PartyRow({ party, onComplete, language }: PartyRowProps) {
  const t = translations[language];
  const isOverdue = party.is_overdue;

  return (
    <div className={`p-3.5 ${isOverdue ? 'bg-red-50/50' : ''}`}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#9F1239]/15 to-[#7c3aed]/15 flex items-center justify-center text-[10px] font-bold text-[#9F1239] border border-[#9F1239]/20 flex-shrink-0">
            {party.customer_name
              .split(' ')
              .map((n) => n[0])
              .slice(0, 2)
              .join('')
              .toUpperCase()}
          </div>
          <div className="font-semibold text-[#1C1917] text-sm truncate">
            {party.customer_name}
          </div>
        </div>
        <span className="text-xs font-medium text-[#57534E] flex-shrink-0 ml-2">
          {formatTimestamp(party.seated_at)}
        </span>
      </div>

      <div className="flex items-center gap-3 text-xs text-[#57534E] mb-2">
        <span className="font-medium">{party.party_size} {t.guests}</span>
        <span className="bg-[#F5F5F4] px-2 py-0.5 rounded text-xs font-semibold">{t.table} {party.tables?.join(', ')}</span>
        {isOverdue && (
          <span className="text-red-600 font-semibold">{t.overdue}</span>
        )}
      </div>

      {/* Time progress */}
      {party.time_elapsed_minutes !== undefined && (
        <div className="mb-2">
          <div className="h-1.5 bg-[#E7E5E4] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${isOverdue ? 'bg-gradient-to-r from-red-500 to-red-400' : 'bg-gradient-to-r from-[#1C1917] to-[#57534E]'}`}
              style={{
                width: `${Math.min(
                  ((party.time_elapsed_minutes) /
                    (party.time_elapsed_minutes + Math.max(party.time_remaining_minutes, 0))) * 100,
                  100
                )}%`,
              }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-[#A8A29E] mt-0.5">
            <span>{party.time_elapsed_minutes}m {t.elapsed}</span>
            <span>{party.time_remaining_minutes > 0 ? `${party.time_remaining_minutes}m ${t.left}` : t.overdue}</span>
          </div>
        </div>
      )}

      <button
        onClick={onComplete}
        className="w-full mt-2 px-3 py-2.5 min-h-[44px] bg-[#F5F5F4] hover:bg-[#E7E5E4] text-[#1C1917] text-xs font-medium rounded-lg transition-colors"
      >
        {t.completeService}
      </button>
    </div>
  );
}

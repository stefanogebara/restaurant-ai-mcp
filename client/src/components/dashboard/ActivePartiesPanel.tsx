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
      <div className="bg-white border border-[#E7E5E4] rounded-xl shadow-sm p-4">
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
    <div className="bg-white border border-[#E7E5E4] rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[#E7E5E4]">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-[#7c3aed]/10 rounded-lg">
            <svg className="w-5 h-5 text-[#7c3aed]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <h2 className="text-base font-bold text-[#1C1917]">{t.activeParties}</h2>
          <span className="px-2 py-0.5 bg-[#7c3aed]/10 text-[#7c3aed] rounded-lg text-xs font-bold">
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
    <div className={`p-3.5 hover:bg-[#F5F5F4]/50 transition-colors ${isOverdue ? 'bg-red-50/50' : ''}`}>
      <div className="flex items-start justify-between mb-2">
        <div className="font-semibold text-[#1C1917] text-sm truncate">
          {party.customer_name}
        </div>
        <span className="text-xs font-medium text-[#57534E] bg-white px-2 py-0.5 rounded-md flex-shrink-0 ml-2">
          {formatTimestamp(party.seated_at)}
        </span>
      </div>

      <div className="flex items-center gap-3 text-xs text-[#57534E] mb-2">
        <div className="flex items-center gap-1">
          <svg className="w-3.5 h-3.5 text-[#9F1239]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <span className="font-medium">{party.party_size} {t.guests}</span>
        </div>
        <div className="flex items-center gap-1">
          <svg className="w-3.5 h-3.5 text-[#9F1239]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <span className="font-medium">{t.table} {party.tables?.join(', ')}</span>
        </div>
        {isOverdue && (
          <span className="text-red-600 font-semibold">{t.overdue}</span>
        )}
      </div>

      {/* Time progress */}
      {party.time_elapsed_minutes !== undefined && (
        <div className="mb-2">
          <div className="h-1 bg-[#F5F5F4] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${isOverdue ? 'bg-red-500' : 'bg-[#7c3aed]'}`}
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
        className="w-full mt-2 px-3 py-2.5 min-h-[44px] bg-[#9F1239] hover:bg-[#881337] text-white text-xs font-semibold rounded-lg transition-all shadow-sm hover:shadow-md active:scale-95"
      >
        {t.completeService}
      </button>
    </div>
  );
}

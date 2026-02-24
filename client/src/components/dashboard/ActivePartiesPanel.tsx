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
      <div className="bg-white border border-border-gray rounded-2xl p-5">
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
    <div className="bg-white border border-border-gray rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-soft-gray">
        <div>
          <div className="flex items-center gap-2.5">
            <h3 className="text-[15px] font-semibold text-deep-charcoal tracking-tight">{t.activeParties}</h3>
            <span className="text-[11px] font-semibold bg-burgundy/[8%] text-burgundy px-2.5 py-0.5 rounded-full">
              {parties.length}
            </span>
          </div>
          {parties.reduce((sum, p) => sum + (p.party_size ?? 0), 0) > 0 && (
            <p className="text-xs text-muted-stone mt-0.5">
              {parties.reduce((sum, p) => sum + (p.party_size ?? 0), 0)} guests seated
            </p>
          )}
        </div>
      </div>

      {/* List */}
      {parties.length === 0 ? (
        <div className="text-center py-10 px-6">
          <div className="w-14 h-14 bg-soft-gray rounded-2xl flex items-center justify-center mx-auto mb-3">
            <svg className="w-7 h-7 text-muted-stone" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-deep-charcoal mb-1">{t.noActive}</p>
          <p className="text-xs text-stone-gray">{t.addHint}</p>
        </div>
      ) : (
        <div className="max-h-[400px] overflow-y-auto py-1">
          {parties.map((party) => (
            <div key={party.service_id} className="mx-2 my-1.5 rounded-xl border border-border-gray bg-white p-4 hover:shadow-sm transition-shadow duration-200">
              <PartyRow
                party={party}
                onComplete={() => onCompleteService(party)}
                language={language}
              />
            </div>
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
    <div>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-burgundy/15 to-violet-600/15 flex items-center justify-center text-[10px] font-bold text-burgundy border border-burgundy/20 flex-shrink-0">
            {party.customer_name
              .split(' ')
              .map((n) => n[0])
              .slice(0, 2)
              .join('')
              .toUpperCase()}
          </div>
          <div className="font-semibold text-deep-charcoal text-sm truncate">
            {party.customer_name}
          </div>
        </div>
        <span className="text-xs font-medium text-stone-gray flex-shrink-0 ml-2">
          {formatTimestamp(party.seated_at)}
        </span>
      </div>

      <div className="flex items-center gap-3 text-xs text-stone-gray mb-2">
        <span className="font-medium">{party.party_size} {t.guests}</span>
        <span className="bg-soft-gray px-2 py-0.5 rounded text-xs font-semibold">{t.table} {party.tables?.join(', ')}</span>
        {isOverdue && (
          <span className="text-red-600 font-semibold">{t.overdue}</span>
        )}
      </div>

      {/* Time progress */}
      {party.time_elapsed_minutes !== undefined && (
        <div>
          <div className="h-2 bg-soft-gray rounded-full overflow-hidden mt-2 mb-3">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(
                  ((party.time_elapsed_minutes) /
                    (party.time_elapsed_minutes + Math.max(party.time_remaining_minutes, 0))) * 100,
                  100
                )}%`,
                background: isOverdue ? '#ef4444' : 'linear-gradient(to right, #10b981, #34d399)',
              }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-muted-stone mb-1">
            <span>{party.time_elapsed_minutes}m {t.elapsed}</span>
            <span>{party.time_remaining_minutes > 0 ? `${party.time_remaining_minutes}m ${t.left}` : t.overdue}</span>
          </div>
        </div>
      )}

      <button
        onClick={onComplete}
        className="w-full mt-3 px-3 py-2.5 min-h-[44px] bg-soft-gray hover:bg-border-gray text-deep-charcoal text-xs font-medium rounded-lg transition-colors"
      >
        {t.completeService}
      </button>
    </div>
  );
}

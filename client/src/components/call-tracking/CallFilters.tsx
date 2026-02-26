import type { CallFilter } from './callTrackingTypes';

const PERIOD_OPTIONS = [
  { value: '1d',  label: '24h' },
  { value: '7d',  label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
] as const;

interface Props {
  filter: CallFilter;
  onChange: (filter: CallFilter) => void;
}

export default function CallFilters({ filter, onChange }: Props) {
  return (
    <div className="bg-white rounded-2xl border border-border-gray overflow-hidden">
      <div className="flex items-center gap-6 px-6 py-4">
        {/* Period */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-stone">Period</span>
          <div className="flex gap-0">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                type="button"
                key={opt.value}
                onClick={() => onChange({ ...filter, period: opt.value })}
                className={`text-xs font-medium px-3 py-1.5 rounded-xl transition-colors ${
                  filter.period === opt.value
                    ? 'text-deep-charcoal bg-soft-gray'
                    : 'text-muted-stone hover:text-stone-gray'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Outcome */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-stone">Outcome</span>
          <select
            aria-label="Filter by outcome"
            value={filter.outcome}
            onChange={(e) => onChange({ ...filter, outcome: e.target.value })}
            className="text-xs font-medium px-3 py-1.5 bg-soft-gray border-0 rounded-xl text-deep-charcoal cursor-pointer focus:outline-none focus:ring-2 focus:ring-burgundy/20"
          >
            <option value="all">All</option>
            <option value="reservation_created">Booked</option>
            <option value="information_only">Info</option>
            <option value="error">Errors</option>
            <option value="abandoned">Abandoned</option>
          </select>
        </div>

        {/* Language */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-stone">Language</span>
          <select
            aria-label="Filter by language"
            value={filter.language}
            onChange={(e) => onChange({ ...filter, language: e.target.value })}
            className="text-xs font-medium px-3 py-1.5 bg-soft-gray border-0 rounded-xl text-deep-charcoal cursor-pointer focus:outline-none focus:ring-2 focus:ring-burgundy/20"
          >
            <option value="all">All</option>
            <option value="en">EN</option>
            <option value="es">ES</option>
            <option value="pt">PT</option>
            <option value="fr">FR</option>
            <option value="it">IT</option>
          </select>
        </div>
      </div>
    </div>
  );
}

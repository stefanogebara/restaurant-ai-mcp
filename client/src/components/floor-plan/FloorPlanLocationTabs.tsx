import type { Table } from '../../types/host.types';

interface Props {
  tables: Table[];
  locations: string[];
  activeLocation: string;
  onLocationChange: (loc: string) => void;
}

export default function FloorPlanLocationTabs({ tables, locations, activeLocation, onLocationChange }: Props) {
  if (locations.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 mb-4 flex-wrap">
      {locations.map(loc => {
        const count = tables.filter(t => (t.location || 'Main') === loc).length;
        const isActive = activeLocation === loc;
        return (
          <button
            key={loc}
            type="button"
            onClick={() => onLocationChange(loc)}
            className={`h-9 px-4 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
              isActive
                ? 'bg-deep-charcoal text-white shadow-sm'
                : 'bg-white text-warm-stone border border-border-gray hover:text-deep-charcoal hover:border-stone-gray/50'
            }`}
          >
            {loc}
            <span className={`text-xs font-semibold min-w-[18px] text-center ${
              isActive ? 'text-white/70' : 'text-muted-stone'
            }`}>
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

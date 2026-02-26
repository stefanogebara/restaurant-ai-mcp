import ThiingsIcon from '../common/ThiingsIcon';
import type { Reservation } from './customerProfile.types';

interface CustomerVisitHistoryProps {
  reservations: Reservation[];
  showAll: boolean;
  onToggle: () => void;
}

export default function CustomerVisitHistory({ reservations, showAll, onToggle }: CustomerVisitHistoryProps) {
  const visible = showAll ? reservations : reservations.slice(0, 5);

  return (
    <div className="bg-white rounded-2xl border border-border-gray p-6 shadow-lg">
      <button onClick={onToggle} aria-expanded={showAll} className="w-full flex items-center justify-between">
        <h2 className="text-lg font-semibold font-serif text-deep-charcoal flex items-center gap-2">
          <ThiingsIcon name="utensils" size="sm" />
          Visit History
          <span className="px-2 py-0.5 bg-burgundy/10 text-burgundy text-xs rounded-full font-semibold">{reservations.length}</span>
        </h2>
        {showAll ? <ThiingsIcon name="chevron-up" size="sm" /> : <ThiingsIcon name="chevron-down" size="sm" />}
      </button>

      <div className="mt-4 space-y-2">
        {visible.map((res) => (
          <div key={res.id} className="flex items-center justify-between p-3 bg-soft-gray rounded-xl">
            <div className="flex items-center gap-4">
              <div>
                <div className="text-sm font-medium text-deep-charcoal">
                  {new Date(res.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
                <div className="text-xs text-stone-gray">{res.time}</div>
              </div>
              <div>
                <div className="text-sm text-deep-charcoal">Party of {res.party_size}</div>
                <div className="text-xs text-stone-gray capitalize">{res.status}</div>
              </div>
            </div>
            {res.special_requests && (
              <div className="max-w-xs text-right">
                <div className="text-xs text-stone-gray italic truncate">"{res.special_requests}"</div>
              </div>
            )}
          </div>
        ))}

        {reservations.length === 0 && (
          <div className="text-center py-6">
            <div className="w-10 h-10 mx-auto mb-2 bg-soft-gray rounded-xl flex items-center justify-center">
              <ThiingsIcon name="calendar" pxSize={18} />
            </div>
            <p className="text-sm text-stone-gray">No reservation history</p>
          </div>
        )}
      </div>
    </div>
  );
}

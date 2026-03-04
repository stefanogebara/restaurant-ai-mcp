import ThiingsIcon from '../common/ThiingsIcon';
import type { DemoWaitlistEntry } from '../../hooks/useDemoState';

interface DemoWaitlistPanelProps {
  entries: DemoWaitlistEntry[];
  onSeat: (id: string) => void;
}

function minutesAgo(isoString: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(isoString).getTime()) / 60_000));
}

export default function DemoWaitlistPanel({ entries, onSeat }: DemoWaitlistPanelProps) {
  return (
    <div className="bg-white border border-border-gray rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-soft-gray">
        <div className="flex items-center gap-2.5">
          <h3 className="text-[15px] font-semibold text-deep-charcoal tracking-tight">
            Waitlist
          </h3>
          <span className="text-[11px] font-semibold bg-burgundy/[8%] text-burgundy px-2.5 py-0.5 rounded-full">
            {entries.length}
          </span>
        </div>
      </div>

      {/* List */}
      {entries.length === 0 ? (
        <div className="text-center py-10 px-6">
          <div className="w-12 h-12 rounded-2xl bg-soft-gray flex items-center justify-center mb-3 mx-auto">
            <ThiingsIcon name="clipboard-list" pxSize={20} className="text-muted-stone" />
          </div>
          <p className="text-sm font-semibold text-deep-charcoal mb-1">No one waiting</p>
          <p className="text-xs text-stone-gray">Guests added to the waitlist will appear here</p>
        </div>
      ) : (
        <div className="divide-y divide-warm-white">
          {entries.map((entry) => {
            const initials = entry.customer_name
              .split(' ')
              .map((n) => n[0])
              .slice(0, 2)
              .join('')
              .toUpperCase();

            const waited = minutesAgo(entry.added_at);

            return (
              <div
                key={entry.id}
                className="flex items-center gap-4 px-6 py-4 hover:bg-warm-white/50 transition-colors"
              >
                {/* Avatar */}
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-200 to-orange-300 flex items-center justify-center text-[13px] font-semibold text-amber-900 flex-shrink-0">
                  {initials}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-deep-charcoal truncate">
                    {entry.customer_name}
                  </div>
                  <div className="text-xs text-muted-stone mt-0.5">
                    {entry.party_size} guests
                    {entry.special_requests && <span> &middot; {entry.special_requests}</span>}
                  </div>
                </div>

                {/* Wait time */}
                <div className="text-right flex-shrink-0 mr-2">
                  <div className="text-xs font-medium text-stone-gray">{waited}m</div>
                  <div className="text-[10px] text-muted-stone">waited</div>
                </div>

                {/* Seat button */}
                <button
                  type="button"
                  onClick={() => onSeat(entry.id)}
                  className="px-3 py-1.5 bg-burgundy hover:bg-burgundy-dark text-white text-xs font-semibold rounded-xl transition-colors flex-shrink-0"
                >
                  Seat
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

import { LEGEND_ITEMS } from './floorPlanConstants';

export default function FloorPlanLegend() {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2.5">
      {LEGEND_ITEMS.map(({ label, stroke, fill }) => (
        <div key={label} className="flex items-center gap-2">
          <span
            className="w-4 h-4 rounded-lg border flex items-center justify-center"
            style={{ borderColor: stroke, background: fill }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: stroke }} />
          </span>
          <span className="text-xs text-warm-stone font-medium">{label}</span>
        </div>
      ))}

      <div className="flex items-center gap-2 ml-auto">
        <svg width="22" height="8" className="flex-shrink-0">
          <line x1="0" y1="4" x2="22" y2="4"
            stroke="#9F1239" strokeWidth="1.5" strokeDasharray="4,3" opacity="0.5" />
        </svg>
        <span className="text-xs text-warm-stone font-medium">Linked tables</span>
      </div>
    </div>
  );
}

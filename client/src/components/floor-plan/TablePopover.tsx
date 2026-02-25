import { useState, useRef, useEffect } from 'react';
import ThiingsIcon from '../common/ThiingsIcon';
import type { Table, TableShape } from '../../types/host.types';
import { SHAPES, CAPACITIES, getStatusKey, getStatusStyle } from './floorPlanConstants';

const STATUS_LABEL: Record<string, string> = {
  available: 'Available',
  occupied:  'Occupied',
  reserved:  'Reserved',
  cleaning:  'Cleaning',
  default:   'Unknown',
};

interface Props {
  table: Table;
  position: { x: number; y: number };
  onClose: () => void;
  onDelete: (id: string) => void;
  onUpdateProps: (data: { table_id: string; shape?: string; capacity?: number }) => void;
}

export default function TablePopover({ table, position, onClose, onDelete, onUpdateProps }: Props) {
  const [shape, setShape] = useState(table.shape || 'round');
  const [capacity, setCapacity] = useState(table.capacity || 2);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const hasChanges = shape !== table.shape || capacity !== table.capacity;
  const st = getStatusStyle(table.status);
  const statusKey = getStatusKey(table.status);

  return (
    <div
      ref={popoverRef}
      className="absolute z-30 w-60 rounded-2xl border border-border-gray shadow-xl bg-white"
      style={{ left: position.x, top: position.y }}
    >
      {/* Header */}
      <div className="px-4 py-3.5 border-b border-border-gray flex items-start justify-between">
        <div>
          <div className="font-semibold text-sm text-deep-charcoal">Table {table.table_number}</div>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: st.stroke }} />
            <span className="text-xs font-medium" style={{ color: st.text }}>
              {STATUS_LABEL[statusKey] ?? 'Unknown'}
            </span>
            <span className="text-xs text-muted-stone">&middot; {table.location || 'Main'}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="p-1.5 hover:bg-soft-gray rounded-xl transition-colors text-muted-stone mt-0.5"
        >
          <ThiingsIcon name="close" pxSize={14} />
        </button>
      </div>

      {/* Controls */}
      <div className="p-4 space-y-3.5">
        <div>
          <label className="block text-[11px] font-semibold text-warm-stone mb-1.5 uppercase tracking-wider">
            Shape
          </label>
          <select
            value={shape}
            onChange={e => setShape(e.target.value as TableShape)}
            className="w-full px-3 py-2 bg-soft-gray border border-border-gray rounded-xl text-xs text-deep-charcoal focus:outline-none focus:ring-2 focus:ring-burgundy/20 focus:border-burgundy transition-colors"
          >
            {SHAPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-warm-stone mb-1.5 uppercase tracking-wider">
            Capacity
          </label>
          <div className="flex gap-1.5">
            {CAPACITIES.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setCapacity(c)}
                className={`flex-1 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                  capacity === c
                    ? 'bg-burgundy text-white border-burgundy'
                    : 'bg-white text-stone-gray border-border-gray hover:border-burgundy/40'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2 pt-1 border-t border-border-gray">
          {hasChanges && (
            <button
              type="button"
              onClick={() => { onUpdateProps({ table_id: table.id, shape, capacity }); onClose(); }}
              className="flex-1 py-1.5 bg-deep-charcoal text-white text-xs font-semibold rounded-xl hover:bg-stone-mid transition-colors"
            >
              Save Changes
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (confirm(`Delete table ${table.table_number}?`)) { onDelete(table.id); onClose(); }
            }}
            className="flex-1 py-1.5 border border-red-200 text-red-600 text-xs font-semibold rounded-xl hover:bg-red-50 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

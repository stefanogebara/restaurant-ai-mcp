import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../common/ThiingsIcon';
import type { Table, TableShape } from '../../types/host.types';
import { SHAPES, CAPACITIES, getStatusKey, getStatusStyle } from './floorPlanConstants';

const STATUS_LABEL_KEYS: Record<string, string> = {
  available: 'floorPlan.status.available',
  occupied:  'floorPlan.status.occupied',
  reserved:  'floorPlan.status.reserved',
  cleaning:  'floorPlan.status.cleaning',
  default:   'floorPlan.status.unknown',
};

// Build the shapeâ†’i18n key map from the canonical SHAPES list so we don't
// drift if a shape is added or renamed.
const SHAPE_LABEL_KEYS: Record<string, string> = Object.fromEntries(
  SHAPES.map(s => [s.value, `floorPlan.shape.${s.i18nKey}`]),
);

interface Props {
  table: Table;
  position: { x: number; y: number };
  onClose: () => void;
  onDelete: (id: string) => void;
  onUpdateProps: (data: { table_id: string; shape?: string; capacity?: number }) => void;
}

export default function TablePopover({ table, position, onClose, onDelete, onUpdateProps }: Props) {
  const { t } = useTranslation();
  const [shape, setShape] = useState(table.shape || 'round');
  const [capacity, setCapacity] = useState(table.capacity || 2);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouse = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleMouse);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleMouse);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  const hasChanges = shape !== table.shape || capacity !== table.capacity;
  const st = getStatusStyle(table.status);
  const statusKey = getStatusKey(table.status);

  return (
    <div
      ref={popoverRef}
      className="absolute z-30 w-60 glass-modal"
      style={{ left: position.x, top: position.y }}
    >
      {/* Header */}
      <div className="px-4 py-3.5 border-b border-glass-border-dark flex items-start justify-between">
        <div>
          <div className="font-semibold text-sm text-deep-charcoal">{t('floorPlan.tableLabel', 'Table')} {table.table_number}</div>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: st.stroke }} />
            <span className="text-xs font-medium" style={{ color: st.text }}>
              {t(STATUS_LABEL_KEYS[statusKey] ?? 'floorPlan.status.unknown', statusKey)}
            </span>
            <span className="text-xs text-muted-stone">&middot; {t(`floorPlan.location.${(table.location || 'main').toLowerCase()}`, table.location || 'Main')}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close', 'Close')}
          className="p-1.5 hover:bg-soft-gray rounded-xl transition-colors text-muted-stone mt-0.5"
        >
          <ThiingsIcon name="close" pxSize={14} />
        </button>
      </div>

      {/* Controls */}
      <div className="p-4 space-y-3.5">
        <div>
          <label className="block text-[11px] font-semibold text-warm-stone mb-1.5 uppercase tracking-wider">
            {t('floorPlan.shape.label', 'Shape')}
          </label>
          <select
            value={shape}
            onChange={e => setShape(e.target.value as TableShape)}
            className="w-full px-3 py-2 bg-soft-gray border border-glass-border-input rounded-xl text-xs text-deep-charcoal focus:outline-none focus:ring-2 focus:ring-burgundy/20 focus:border-burgundy transition-colors"
          >
            {SHAPES.map(s => <option key={s.value} value={s.value}>{t(SHAPE_LABEL_KEYS[s.value] || s.label, s.label)}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-warm-stone mb-1.5 uppercase tracking-wider">
            {t('floorPlan.capacity', 'Capacity')}
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
                    : 'bg-white text-stone-gray border-glass-border-dark hover:border-burgundy/40'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2 pt-1 border-t border-glass-border-dark">
          {hasChanges && (
            <button
              type="button"
              onClick={() => { onUpdateProps({ table_id: table.id, shape, capacity }); onClose(); }}
              className="flex-1 py-1.5 bg-deep-charcoal text-white text-xs font-semibold rounded-xl hover:bg-stone-mid transition-colors"
            >
              {t('floorPlan.saveChanges', 'Save Changes')}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (confirm(t('floorPlan.deleteConfirm', 'Delete table {{number}}?', { number: table.table_number }))) { onDelete(table.id); onClose(); }
            }}
            className="flex-1 py-1.5 border border-red-200 text-red-600 text-xs font-semibold rounded-xl hover:bg-red-50 transition-colors"
          >
            {t('floorPlan.delete', 'Delete')}
          </button>
        </div>
      </div>
    </div>
  );
}

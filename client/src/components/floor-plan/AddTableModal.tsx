import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../common/ThiingsIcon';
import type { Table, TableShape } from '../../types/host.types';
import { getTableSize } from '../../types/host.types';
import { SHAPES, CAPACITIES, GRID_COLS, GRID_ROWS } from './floorPlanConstants';

interface Props {
  onClose: () => void;
  onAdd: (data: {
    table_number: number; capacity: number; shape: string;
    location: string; position_x: number; position_y: number;
  }) => void;
  nextNumber: number;
  locations: string[];
  activeLocation: string;
  tables: Table[];
}

export default function AddTableModal({ onClose, onAdd, nextNumber, locations, activeLocation, tables }: Props) {
  const { t } = useTranslation();
  const [tableNumber, setTableNumber] = useState(nextNumber);
  const [capacity, setCapacity] = useState(4);
  const [shape, setShape] = useState<TableShape>('round');
  const [location, setLocation] = useState(activeLocation);
  const [newLocation, setNewLocation] = useState('');
  const [showNewLoc, setShowNewLoc] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const loc = showNewLoc && newLocation.trim() ? newLocation.trim() : location;

    // Build the occupied-cell set from each existing table's full footprint â€”
    // not just its anchor cell. Previously a 1x1 anchor check let new
    // rectangles/booths render on top of adjacent tables until the user
    // dragged them apart.
    const sameLocationTables = tables.filter(t => (t.location || 'Main') === loc);
    const occupied = new Set<string>();
    for (const t of sameLocationTables) {
      const tShape = (t.shape?.toLowerCase() || 'round') as TableShape;
      const tSize = getTableSize(tShape, t.capacity || 2);
      const tx = t.position_x || 0;
      const ty = t.position_y || 0;
      for (let dy = 0; dy < tSize.height; dy++) {
        for (let dx = 0; dx < tSize.width; dx++) {
          occupied.add(`${tx + dx},${ty + dy}`);
        }
      }
    }

    // Find a position where the new table's full footprint clears all neighbors.
    const newSize = getTableSize(shape, capacity);
    let px = 1, py = 1, fits = false;
    for (let row = 1; row <= GRID_ROWS - newSize.height - 1 && !fits; row++) {
      for (let col = 1; col <= GRID_COLS - newSize.width - 1 && !fits; col++) {
        let clear = true;
        for (let dy = 0; dy < newSize.height && clear; dy++) {
          for (let dx = 0; dx < newSize.width && clear; dx++) {
            if (occupied.has(`${col + dx},${row + dy}`)) clear = false;
          }
        }
        if (clear) { px = col; py = row; fits = true; }
      }
    }

    onAdd({ table_number: tableNumber, capacity, shape, location: loc, position_x: px, position_y: py });
  };

  return (
    <div
      className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-table-modal-title"
        className="glass-modal w-full max-w-md"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-glass-border-dark flex items-center justify-between">
          <div>
            <h2 id="add-table-modal-title" className="text-base font-semibold text-deep-charcoal">{t('floorPlan.addTableModal.title')}</h2>
            <p className="text-xs text-warm-stone mt-0.5">{t('floorPlan.addTableModal.subtitle')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="p-1.5 hover:bg-soft-gray rounded-xl transition-colors text-muted-stone hover:text-stone-gray"
          >
            <ThiingsIcon name="close" pxSize={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Table Number */}
          <div>
            <label className="block text-[11px] font-semibold text-warm-stone mb-1.5 uppercase tracking-wider">
              {t('floorPlan.addTableModal.tableNumber')}
            </label>
            <input
              type="number"
              value={tableNumber}
              onChange={e => setTableNumber(Number(e.target.value))}
              min={1}
              className="w-full px-3 py-2.5 border border-glass-border-dark rounded-xl text-sm text-deep-charcoal focus:outline-none focus:ring-2 focus:ring-burgundy/20 focus:border-burgundy transition-colors"
            />
          </div>

          {/* Capacity */}
          <div>
            <label className="block text-[11px] font-semibold text-warm-stone mb-2 uppercase tracking-wider">
              {t('floorPlan.addTableModal.capacity')}
            </label>
            <div className="flex gap-2">
              {CAPACITIES.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCapacity(c)}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all ${
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

          {/* Shape */}
          <div>
            <label className="block text-[11px] font-semibold text-warm-stone mb-2 uppercase tracking-wider">
              {t('floorPlan.shape.label')}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {SHAPES.map(s => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setShape(s.value)}
                  className={`py-2 px-3 rounded-xl text-sm font-medium border transition-all ${
                    shape === s.value
                      ? 'bg-burgundy text-white border-burgundy'
                      : 'bg-white text-stone-gray border-glass-border-dark hover:border-burgundy/40'
                  }`}
                >
                  {t(`floorPlan.shape.${s.i18nKey}`, s.label)}
                </button>
              ))}
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="block text-[11px] font-semibold text-warm-stone mb-2 uppercase tracking-wider">
              {t('floorPlan.addTableModal.section')}
            </label>
            {!showNewLoc ? (
              <div className="flex gap-2">
                <select
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                  className="flex-1 px-3 py-2.5 border border-glass-border-dark rounded-xl text-sm text-deep-charcoal focus:outline-none focus:ring-2 focus:ring-burgundy/20 focus:border-burgundy transition-colors"
                >
                  {locations.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
                <button
                  type="button"
                  onClick={() => setShowNewLoc(true)}
                  className="px-3 py-2.5 border border-glass-border-dark rounded-xl text-sm text-stone-gray hover:border-burgundy/40 transition-colors"
                >
                  {t('floorPlan.addTableModal.addNew')}
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newLocation}
                  onChange={e => setNewLocation(e.target.value)}
                  placeholder={t('placeholders.tableName', 'e.g. Terrace')}
                  autoFocus
                  className="flex-1 px-3 py-2.5 border border-glass-border-dark rounded-xl text-sm text-deep-charcoal focus:outline-none focus:ring-2 focus:ring-burgundy/20 focus:border-burgundy transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowNewLoc(false)}
                  className="px-3 py-2.5 border border-glass-border-dark rounded-xl text-sm text-stone-gray hover:border-burgundy/40 transition-colors"
                >
                  {t('common.cancel')}
                </button>
              </div>
            )}
          </div>

          <button
            type="submit"
            className="w-full py-2.5 bg-deep-charcoal hover:bg-stone-mid text-white font-semibold rounded-xl transition-colors text-sm"
          >
            {t('floorPlan.addTable')}
          </button>
        </form>
      </div>
    </div>
  );
}

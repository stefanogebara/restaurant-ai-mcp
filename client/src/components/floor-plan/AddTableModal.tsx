import { useState } from 'react';
import ThiingsIcon from '../common/ThiingsIcon';
import type { Table, TableShape } from '../../types/host.types';
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
  const [tableNumber, setTableNumber] = useState(nextNumber);
  const [capacity, setCapacity] = useState(4);
  const [shape, setShape] = useState<TableShape>('round');
  const [location, setLocation] = useState(activeLocation);
  const [newLocation, setNewLocation] = useState('');
  const [showNewLoc, setShowNewLoc] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const loc = showNewLoc && newLocation.trim() ? newLocation.trim() : location;
    const occupied = new Set(
      tables.filter(t => (t.location || 'Main') === loc)
        .map(t => `${t.position_x},${t.position_y}`),
    );
    let px = 1, py = 1;
    for (let row = 1; row < GRID_ROWS - 1; row++) {
      for (let col = 1; col < GRID_COLS - 2; col++) {
        if (!occupied.has(`${col},${row}`)) { px = col; py = row; row = GRID_ROWS; break; }
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
        className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-border-gray"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-border-gray flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-deep-charcoal">Add Table</h2>
            <p className="text-xs text-warm-stone mt-0.5">Configure the new table</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 hover:bg-soft-gray rounded-xl transition-colors text-muted-stone hover:text-stone-gray"
          >
            <ThiingsIcon name="close" pxSize={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Table Number */}
          <div>
            <label className="block text-[11px] font-semibold text-warm-stone mb-1.5 uppercase tracking-wider">
              Table Number
            </label>
            <input
              type="number"
              value={tableNumber}
              onChange={e => setTableNumber(Number(e.target.value))}
              min={1}
              className="w-full px-3 py-2.5 border border-border-gray rounded-xl text-sm text-deep-charcoal focus:outline-none focus:ring-2 focus:ring-burgundy/20 focus:border-burgundy transition-colors"
            />
          </div>

          {/* Capacity */}
          <div>
            <label className="block text-[11px] font-semibold text-warm-stone mb-2 uppercase tracking-wider">
              Capacity
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
                      : 'bg-white text-stone-gray border-border-gray hover:border-burgundy/40'
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
              Shape
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
                      : 'bg-white text-stone-gray border-border-gray hover:border-burgundy/40'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="block text-[11px] font-semibold text-warm-stone mb-2 uppercase tracking-wider">
              Section
            </label>
            {!showNewLoc ? (
              <div className="flex gap-2">
                <select
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                  className="flex-1 px-3 py-2.5 border border-border-gray rounded-xl text-sm text-deep-charcoal focus:outline-none focus:ring-2 focus:ring-burgundy/20 focus:border-burgundy transition-colors"
                >
                  {locations.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
                <button
                  type="button"
                  onClick={() => setShowNewLoc(true)}
                  className="px-3 py-2.5 border border-border-gray rounded-xl text-sm text-stone-gray hover:border-burgundy/40 transition-colors"
                >
                  + New
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newLocation}
                  onChange={e => setNewLocation(e.target.value)}
                  placeholder="e.g. Terrace"
                  autoFocus
                  className="flex-1 px-3 py-2.5 border border-border-gray rounded-xl text-sm text-deep-charcoal focus:outline-none focus:ring-2 focus:ring-burgundy/20 focus:border-burgundy transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowNewLoc(false)}
                  className="px-3 py-2.5 border border-border-gray rounded-xl text-sm text-stone-gray hover:border-burgundy/40 transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          <button
            type="submit"
            className="w-full py-2.5 bg-deep-charcoal hover:bg-stone-mid text-white font-semibold rounded-xl transition-colors text-sm"
          >
            Add Table
          </button>
        </form>
      </div>
    </div>
  );
}

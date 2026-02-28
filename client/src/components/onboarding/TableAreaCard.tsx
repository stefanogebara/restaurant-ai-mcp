import ThiingsIcon from '../common/ThiingsIcon';
import type { RestaurantArea, TableShape, TableConfiguration } from '../../types/onboarding.types';

const TABLE_CAPACITIES = [2, 4, 6, 8];

interface TableAreaCardProps {
  area: RestaurantArea;
  areaIndex: number;
  canRemove: boolean;
  getTableCount: (areaIndex: number, capacity: number, shape: TableShape) => number;
  getTableConfig: (areaIndex: number, capacity: number, shape: TableShape) => TableConfiguration | undefined;
  updateTableConfig: (areaIndex: number, capacity: number, shape: TableShape, field: 'count' | 'is_fixed_seating' | 'is_joinable', value: number | boolean) => void;
  updateAreaName: (areaIndex: number, name: string) => void;
  onRemove: (index: number) => void;
}

export { TABLE_CAPACITIES };

export default function TableAreaCard({
  area, areaIndex, canRemove, getTableCount, getTableConfig, updateTableConfig, updateAreaName, onRemove,
}: TableAreaCardProps) {
  return (
    <div className="bg-soft-gray border border-border-gray rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <input
          type="text"
          value={area.name}
          onChange={(e) => updateAreaName(areaIndex, e.target.value)}
          className="text-lg font-semibold bg-transparent border-none text-deep-charcoal focus:outline-none focus:ring-2 focus:ring-burgundy rounded px-2 py-1"
        />
        {canRemove && (
          <button
            onClick={() => onRemove(areaIndex)}
            className="p-2 hover:bg-red-600/10 text-red-600 rounded-xl transition-colors"
            aria-label="Remove area"
          >
            <ThiingsIcon name="trash" pxSize={20} />
          </button>
        )}
      </div>

      <div className="space-y-4">
        {TABLE_CAPACITIES.map((capacity) => (
          <div key={capacity} className="bg-white rounded-xl p-4 border border-border-gray">
            <h4 className="text-sm font-semibold text-deep-charcoal mb-3">{capacity}-Person Tables</h4>
            <div className="grid grid-cols-2 gap-3">
              {(['round', 'square'] as TableShape[]).map((shape) => (
                <div key={shape} className="p-3 bg-soft-gray rounded-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-6 h-6 border-2 border-burgundy ${shape === 'round' ? 'rounded-full' : 'rounded'}`} />
                    <span className="text-sm font-medium text-deep-charcoal capitalize">{shape}</span>
                  </div>
                  <input
                    type="number"
                    min="0"
                    value={getTableCount(areaIndex, capacity, shape) || ''}
                    placeholder="0"
                    onChange={(e) => updateTableConfig(areaIndex, capacity, shape, 'count', parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-white border border-border-gray rounded-xl text-deep-charcoal placeholder-muted-stone focus:outline-none focus:ring-2 focus:ring-burgundy text-sm"
                  />
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      type="checkbox"
                      checked={getTableConfig(areaIndex, capacity, shape)?.is_fixed_seating || false}
                      onChange={(e) => updateTableConfig(areaIndex, capacity, shape, 'is_fixed_seating', e.target.checked)}
                      className="w-4 h-4 rounded border-border-gray text-burgundy focus:ring-burgundy"
                    />
                    <span className="text-xs text-stone-gray">
                      Fixed seating{' '}
                      <span title="Tick if this table cannot be moved or combined with adjacent tables." className="cursor-help">ⓘ</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

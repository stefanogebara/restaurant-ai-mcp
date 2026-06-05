import { useTranslation } from 'react-i18next';
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

// eslint-disable-next-line react-refresh/only-export-components
export { TABLE_CAPACITIES };

const SHAPE_KEYS: Record<string, string> = {
  round: 'onboarding.round',
  square: 'onboarding.square',
};

export default function TableAreaCard({
  area, areaIndex, canRemove, getTableCount, getTableConfig, updateTableConfig, updateAreaName, onRemove,
}: TableAreaCardProps) {
  const { t } = useTranslation();
  return (
    <div className="bg-soft-gray border border-glass-border-dark rounded-xl p-5">
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
          <div key={capacity} className="glass-card p-4">
            <h4 className="text-sm font-semibold text-deep-charcoal mb-3">{t('onboarding.personTables', { count: capacity })}</h4>
            <div className="grid grid-cols-2 gap-3">
              {(['round', 'square'] as TableShape[]).map((shape) => (
                <div key={shape} className="p-3 bg-soft-gray rounded-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-6 h-6 border-2 border-burgundy ${shape === 'round' ? 'rounded-full' : 'rounded'}`} />
                    <span className="text-sm font-medium text-deep-charcoal">{t(SHAPE_KEYS[shape] || shape)}</span>
                  </div>
                  <input
                    type="number"
                    min="0"
                    value={getTableCount(areaIndex, capacity, shape) || ''}
                    placeholder="0"
                    onChange={(e) => updateTableConfig(areaIndex, capacity, shape, 'count', parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 glass-panel rounded-xl text-deep-charcoal placeholder-muted-stone focus:outline-none focus:ring-2 focus:ring-burgundy text-sm"
                  />
                  <label className="flex items-start gap-2 mt-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={getTableConfig(areaIndex, capacity, shape)?.is_fixed_seating || false}
                      onChange={(e) => updateTableConfig(areaIndex, capacity, shape, 'is_fixed_seating', e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded border-glass-border-input text-burgundy focus:ring-burgundy"
                    />
                    {/* Explanation is rendered inline (not in a `title=` tooltip)
                        so it's actually readable on touch devices. */}
                    <span className="text-xs text-stone-gray leading-snug">
                      <span className="font-medium">{t('onboarding.fixedSeating')}</span>
                      <span className="block text-[11px] text-muted-stone">{t('onboarding.fixedSeatingHint')}</span>
                    </span>
                  </label>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

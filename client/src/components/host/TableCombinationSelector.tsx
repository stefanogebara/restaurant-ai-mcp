import { useState, useEffect } from 'react';
import type { Table } from '../../types/host.types';
import ThiingsIcon from '../common/ThiingsIcon';
import {
  suggestTableCombinations,
  formatTableNumbers,
  getCombinationColorClass,
  type TableCombination
} from '../../utils/tableCombinations';

interface TableCombinationSelectorProps {
  availableTables: Table[];
  partySize: number;
  onSelect: (tableIds: string[], tableNumbers: string[]) => void;
  selectedTableIds?: string[];
}

export default function TableCombinationSelector({
  availableTables,
  partySize,
  onSelect,
  selectedTableIds = []
}: TableCombinationSelectorProps) {
  const [combinations, setCombinations] = useState<TableCombination[]>([]);
  const [selectedCombination, setSelectedCombination] = useState<TableCombination | null>(null);

  useEffect(() => {
    const suggested = suggestTableCombinations(availableTables, partySize, 5);
    setCombinations(suggested);

    // Auto-select best combination if none selected
    if (suggested.length > 0 && selectedTableIds.length === 0) {
      setSelectedCombination(suggested[0]);
      onSelect(
        suggested[0].tables.map(t => t.id),
        suggested[0].tables.map(t => t.table_number)
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableTables, partySize]);

  const handleSelectCombination = (combination: TableCombination) => {
    setSelectedCombination(combination);
    onSelect(
      combination.tables.map(t => t.id),
      combination.tables.map(t => t.table_number)
    );
  };

  if (combinations.length === 0) {
    return (
      <div className="bg-burgundy/5 border border-burgundy/20 rounded-xl p-4 text-center">
        <div className="w-12 h-12 mx-auto mb-3 bg-burgundy/10 rounded-2xl flex items-center justify-center">
          <ThiingsIcon name="alert-triangle" pxSize={24} />
        </div>
        <div className="text-burgundy font-semibold">No available tables</div>
        <div className="text-burgundy/70 text-sm mt-1">
          All tables are currently occupied or reserved.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-deep-charcoal">
          Suggested Table Combinations
        </h3>
        <span className="text-xs text-stone-gray">
          Party of {partySize}
        </span>
      </div>

      {combinations.map((combination, index) => {
        const isSelected = selectedCombination === combination;
        const colorClass = getCombinationColorClass(combination.score);

        return (
          <button
            key={index}
            onClick={() => handleSelectCombination(combination)}
            className={`
              w-full text-left p-4 rounded-2xl border-2 transition-all
              ${isSelected
                ? 'border-burgundy bg-burgundy/10'
                : 'border-border-gray hover:border-burgundy/50 bg-white'
              }
            `}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  {isSelected && (
                    <div className="w-5 h-5 rounded-full bg-burgundy flex items-center justify-center text-white">
                      <ThiingsIcon name="check" pxSize={12} />
                    </div>
                  )}
                  <div className="font-semibold text-deep-charcoal">
                    {formatTableNumbers(combination.tables)}
                  </div>
                  {index === 0 && (
                    <span className="px-2 py-0.5 bg-amber-600/20 text-amber-600 text-xs font-semibold rounded-full">
                      Best Match
                    </span>
                  )}
                </div>

                <div className="text-sm text-stone-gray">
                  {combination.reason}
                </div>
              </div>

              <div className={`px-3 py-1 rounded-lg border ${colorClass} text-sm font-semibold`}>
                {combination.totalCapacity} seats
              </div>
            </div>

            {/* Table details */}
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border-gray/50">
              {combination.tables.map((table, tIndex) => (
                <div key={tIndex} className="flex items-center gap-1.5 text-xs">
                  <div className="w-6 h-6 rounded-lg bg-burgundy/20 flex items-center justify-center font-bold text-burgundy">
                    {table.table_number}
                  </div>
                  <span className="text-stone-gray">
                    {table.capacity} seats • {table.location}
                  </span>
                  {tIndex < combination.tables.length - 1 && (
                    <span className="text-muted-stone mx-1">+</span>
                  )}
                </div>
              ))}
            </div>

            {/* Score indicator */}
            <div className="mt-3 pt-2 border-t border-border-gray/50">
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-soft-gray rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      combination.score >= 140
                        ? 'bg-rose-600'
                        : combination.score >= 100
                        ? 'bg-amber-600'
                        : 'bg-burgundy'
                    }`}
                    style={{ width: `${Math.min((combination.score / 150) * 100, 100)}%` }}
                  />
                </div>
                <span className="text-xs text-stone-gray font-medium">
                  {combination.score >= 140 ? 'Excellent' : combination.score >= 100 ? 'Good' : 'Fair'}
                </span>
              </div>
            </div>
          </button>
        );
      })}

      {/* Manual selection hint */}
      <div className="mt-4 p-3 bg-soft-gray border border-border-gray rounded-xl">
        <div className="flex items-start gap-2">
          <ThiingsIcon name="info" pxSize={16} className="text-burgundy mt-0.5 flex-shrink-0" />
          <div className="text-xs text-stone-gray">
            <strong className="text-deep-charcoal">Tip:</strong> Combinations are ranked by efficiency.
            Same-section and adjacent tables score higher for easier service.
          </div>
        </div>
      </div>
    </div>
  );
}

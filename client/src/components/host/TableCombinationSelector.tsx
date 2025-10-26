import { useState, useEffect } from 'react';
import type { Table } from '../../types/host.types';
import {
  suggestTableCombinations,
  formatTableNumbers,
  getCombinationColorClass,
  type TableCombination
} from '../../utils/tableCombinations';

interface TableCombinationSelectorProps {
  availableTables: Table[];
  partySize: number;
  onSelect: (tableIds: string[]) => void;
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
      onSelect(suggested[0].tables.map(t => t.id));
    }
  }, [availableTables, partySize]);

  const handleSelectCombination = (combination: TableCombination) => {
    setSelectedCombination(combination);
    onSelect(combination.tables.map(t => t.id));
  };

  if (combinations.length === 0) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
        <div className="text-4xl mb-2">⚠️</div>
        <div className="text-red-800 font-semibold">No available tables</div>
        <div className="text-red-600 text-sm mt-1">
          All tables are currently occupied or reserved.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-foreground">
          Suggested Table Combinations
        </h3>
        <span className="text-xs text-muted-foreground">
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
              w-full text-left p-4 rounded-xl border-2 transition-all
              ${isSelected
                ? 'border-primary bg-primary/10 shadow-lg'
                : 'border-border hover:border-primary/50 bg-card'
              }
            `}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  {isSelected && (
                    <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                      <svg className="w-3 h-3 text-primary-foreground" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}
                  <div className="font-semibold text-foreground">
                    {formatTableNumbers(combination.tables)}
                  </div>
                  {index === 0 && (
                    <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-600 text-xs font-semibold rounded-full">
                      Best Match
                    </span>
                  )}
                </div>

                <div className="text-sm text-muted-foreground">
                  {combination.reason}
                </div>
              </div>

              <div className={`px-3 py-1 rounded-lg border ${colorClass} text-sm font-semibold`}>
                {combination.totalCapacity} seats
              </div>
            </div>

            {/* Table details */}
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/50">
              {combination.tables.map((table, tIndex) => (
                <div key={tIndex} className="flex items-center gap-1.5 text-xs">
                  <div className="w-6 h-6 rounded-md bg-primary/20 flex items-center justify-center font-bold text-primary">
                    {table.table_number}
                  </div>
                  <span className="text-muted-foreground">
                    {table.capacity} seats • {table.location}
                  </span>
                  {tIndex < combination.tables.length - 1 && (
                    <span className="text-muted-foreground mx-1">+</span>
                  )}
                </div>
              ))}
            </div>

            {/* Score indicator */}
            <div className="mt-3 pt-2 border-t border-border/50">
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      combination.score >= 140
                        ? 'bg-green-500'
                        : combination.score >= 100
                        ? 'bg-yellow-500'
                        : 'bg-orange-500'
                    }`}
                    style={{ width: `${Math.min((combination.score / 150) * 100, 100)}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground font-medium">
                  {combination.score >= 140 ? 'Excellent' : combination.score >= 100 ? 'Good' : 'Fair'}
                </span>
              </div>
            </div>
          </button>
        );
      })}

      {/* Manual selection hint */}
      <div className="mt-4 p-3 bg-muted/50 border border-border rounded-lg">
        <div className="flex items-start gap-2">
          <svg className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          <div className="text-xs text-muted-foreground">
            <strong className="text-foreground">Tip:</strong> Combinations are ranked by efficiency.
            Same-section and adjacent tables score higher for easier service.
          </div>
        </div>
      </div>
    </div>
  );
}

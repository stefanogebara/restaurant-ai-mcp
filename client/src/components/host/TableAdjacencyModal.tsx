import { useState } from 'react';
import type { TableConfig } from '../../services/api';

interface TableAdjacencyModalProps {
  table: TableConfig;
  allTables: TableConfig[];
  onSave: (adjacentIds: string[]) => void;
  onCancel: () => void;
  isLoading: boolean;
}

export default function TableAdjacencyModal({
  table,
  allTables,
  onSave,
  onCancel,
  isLoading,
}: TableAdjacencyModalProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>(table.adjacent_tables || []);

  const toggleTable = (tableId: string) => {
    setSelectedIds((prev) =>
      prev.includes(tableId) ? prev.filter((id) => id !== tableId) : [...prev, tableId]
    );
  };

  const tablesByLocation: Record<string, TableConfig[]> = {};
  allTables.forEach((t) => {
    const loc = t.location || 'Main';
    if (!tablesByLocation[loc]) tablesByLocation[loc] = [];
    tablesByLocation[loc].push(t);
  });

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 max-h-[80vh] overflow-y-auto">
        <h3 className="text-xl font-bold text-deep-charcoal mb-2">
          Set Adjacent Tables for Table {table.table_number}
        </h3>
        <p className="text-sm text-muted-stone mb-4">
          Select which tables can be combined with this table. Only flexible tables in the same location are shown.
        </p>

        {Object.entries(tablesByLocation).map(([location, locationTables]) => (
          <div key={location} className="mb-4">
            <h4 className="text-sm font-medium text-warm-stone mb-2">{location}</h4>
            <div className="grid grid-cols-3 gap-2">
              {locationTables.map((t) => (
                <button
                  key={t.id}
                  onClick={() => toggleTable(t.id)}
                  className={`p-3 rounded-2xl border-2 transition-all text-left ${
                    selectedIds.includes(t.id)
                      ? 'border-deep-charcoal bg-soft-gray'
                      : 'border-glass-border-dark hover:border-muted-stone'
                  }`}
                >
                  <div className="font-medium text-deep-charcoal">Table {t.table_number}</div>
                  <div className="text-xs text-muted-stone">{t.capacity} seats</div>
                </button>
              ))}
            </div>
          </div>
        ))}

        {allTables.length === 0 && (
          <div className="text-center py-8">
            <p className="text-sm text-muted-stone">No other flexible tables in this location</p>
          </div>
        )}

        <div className="flex gap-3 mt-6 pt-4 border-t border-glass-border-dark">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 border border-glass-border-dark text-stone-gray rounded-xl hover:bg-soft-gray transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(selectedIds)}
            disabled={isLoading}
            className="flex-1 px-4 py-2 bg-deep-charcoal text-white rounded-xl hover:bg-charcoal-dark transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Saving...' : `Save (${selectedIds.length} selected)`}
          </button>
        </div>
      </div>
    </div>
  );
}

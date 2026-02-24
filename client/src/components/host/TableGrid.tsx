import type { Table } from '../../types/host.types';
import TableCard from './TableCard';

interface TableGridProps {
  tables: Table[];
  onTableClick?: (table: Table) => void;
}

export default function TableGrid({ tables, onTableClick }: TableGridProps) {
  if (!tables || tables.length === 0) {
    return (
      <div className="text-center py-12 text-stone-gray">
        <p className="font-semibold text-lg text-deep-charcoal">No tables configured yet</p>
        <p className="text-sm mt-2">Tables will appear here after onboarding</p>
      </div>
    );
  }

  // Group tables by location for better organization
  const tablesByLocation = tables.reduce((acc, table) => {
    const location = table.location || 'Unassigned';
    if (!acc[location]) {
      acc[location] = [];
    }
    acc[location].push(table);
    return acc;
  }, {} as Record<string, Table[]>);

  const locationColors: Record<string, string> = {
    Indoor: '#6366f1',
    Patio: '#10b981',
    Bar: '#f59e0b',
    Main: '#8b5cf6',
  };

  return (
    <div className="space-y-6">
      {Object.entries(tablesByLocation).map(([location, locationTables]) => (
        <div key={location}>
          <div className="flex items-center gap-3 mb-4 mt-2">
            <div
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: locationColors[location] || '#6b7280' }}
            />
            <span className="text-sm font-semibold text-deep-charcoal">{location}</span>
            <span className="text-xs bg-soft-gray text-muted-stone px-2 py-0.5 rounded-full font-medium flex-shrink-0">
              {locationTables.length} {locationTables.length === 1 ? 'table' : 'tables'}
            </span>
            <div className="flex-1 h-px bg-border-gray" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {locationTables.map((table) => (
              <TableCard
                key={table.id}
                table={table}
                onClick={onTableClick ? () => onTableClick(table) : undefined}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

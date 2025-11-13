import type { Table } from '../../types/host.types';
import TableCard from './TableCard';

interface TableGridProps {
  tables: Table[];
  onTableClick?: (table: Table) => void;
}

export default function TableGrid({ tables, onTableClick }: TableGridProps) {
  if (!tables || tables.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="font-semibold text-lg">No tables configured yet</p>
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

  return (
    <div className="space-y-6">
      {Object.entries(tablesByLocation).map(([location, locationTables]) => (
        <div key={location}>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">{location}</h3>
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

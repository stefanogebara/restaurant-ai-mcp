import { useMemo } from 'react';
import type { Table } from '../../types/host.types';

interface FloorPlanViewProps {
  tables: Table[];
  onTableClick?: (table: Table) => void;
  compact?: boolean; // For smaller view in dashboard
}

// Grid cell size - smaller for compact view
const GRID_CELL_SIZE_NORMAL = 40;
const GRID_CELL_SIZE_COMPACT = 32;

export default function FloorPlanView({ tables, onTableClick, compact = false }: FloorPlanViewProps) {
  const GRID_CELL_SIZE = compact ? GRID_CELL_SIZE_COMPACT : GRID_CELL_SIZE_NORMAL;

  // Group tables by location
  const tablesByLocation = useMemo(() => {
    return tables.reduce((acc, table) => {
      const location = table.location || 'Main';
      if (!acc[location]) acc[location] = [];
      acc[location].push(table);
      return acc;
    }, {} as Record<string, Table[]>);
  }, [tables]);

  // Calculate grid bounds for each location
  const getGridBounds = (locationTables: Table[]) => {
    if (locationTables.length === 0) return { width: 10, height: 6 };

    let maxX = 0, maxY = 0;
    locationTables.forEach(t => {
      maxX = Math.max(maxX, (t.position_x || 0) + (t.width || 1));
      maxY = Math.max(maxY, (t.position_y || 0) + (t.height || 1));
    });
    return { width: Math.max(10, maxX + 1), height: Math.max(6, maxY + 1) };
  };

  // Get status color classes
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Available':
        return 'bg-green-100 border-green-500 text-green-700';
      case 'Occupied':
        return 'bg-red-100 border-red-500 text-red-700';
      case 'Reserved':
        return 'bg-purple-100 border-purple-500 text-purple-700';
      case 'Being Cleaned':
        return 'bg-amber-100 border-amber-500 text-amber-700';
      default:
        return 'bg-gray-100 border-gray-400 text-gray-700';
    }
  };

  // Render dotted lines between linked/joinable tables
  const renderLinks = (locationTables: Table[]) => {
    const links: JSX.Element[] = [];
    const processedPairs = new Set<string>();

    locationTables.forEach(table => {
      (table.joinable_with || []).forEach(linkedId => {
        const pairKey = [table.id, linkedId].sort().join('-');
        if (processedPairs.has(pairKey)) return;
        processedPairs.add(pairKey);

        const linkedTable = locationTables.find(t => t.id === linkedId);
        if (!linkedTable) return;

        const x1 = ((table.position_x || 0) + (table.width || 1) / 2) * GRID_CELL_SIZE;
        const y1 = ((table.position_y || 0) + (table.height || 1) / 2) * GRID_CELL_SIZE;
        const x2 = ((linkedTable.position_x || 0) + (linkedTable.width || 1) / 2) * GRID_CELL_SIZE;
        const y2 = ((linkedTable.position_y || 0) + (linkedTable.height || 1) / 2) * GRID_CELL_SIZE;

        links.push(
          <line
            key={pairKey}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="#9F1239"
            strokeWidth="1.5"
            strokeDasharray="4,4"
            opacity="0.4"
          />
        );
      });
    });

    return links;
  };

  // Empty state
  if (tables.length === 0) {
    return (
      <div className="text-center py-12 text-[#57534E]">
        <p className="font-semibold text-lg text-[#1C1917]">No tables configured yet</p>
        <p className="text-sm mt-2">Tables will appear here after onboarding</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {Object.entries(tablesByLocation).map(([location, locationTables]) => {
        const bounds = getGridBounds(locationTables);

        return (
          <div key={location}>
            <h3 className="text-sm font-semibold text-[#1C1917] mb-3">{location}</h3>
            <div
              className="relative bg-[#FAFAF9] rounded-xl p-2 overflow-auto border border-[#E7E5E4]"
              style={{
                width: '100%',
                minHeight: bounds.height * GRID_CELL_SIZE + 16
              }}
            >
              <div
                className="relative"
                style={{
                  width: bounds.width * GRID_CELL_SIZE,
                  height: bounds.height * GRID_CELL_SIZE,
                  backgroundImage: `
                    linear-gradient(to right, #E7E5E4 1px, transparent 1px),
                    linear-gradient(to bottom, #E7E5E4 1px, transparent 1px)
                  `,
                  backgroundSize: `${GRID_CELL_SIZE}px ${GRID_CELL_SIZE}px`,
                  backgroundPosition: '0 0'
                }}
              >
                {/* Joinable Links SVG Layer */}
                <svg
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    width: bounds.width * GRID_CELL_SIZE,
                    height: bounds.height * GRID_CELL_SIZE
                  }}
                >
                  {renderLinks(locationTables)}
                </svg>

                {/* Tables */}
                {locationTables.map(table => {
                  const shapeClass = table.shape === 'round' ? 'rounded-full' : 'rounded-lg';
                  const colorClass = getStatusColor(table.status);
                  const posX = (table.position_x || 0) * GRID_CELL_SIZE;
                  const posY = (table.position_y || 0) * GRID_CELL_SIZE;
                  const tableWidth = (table.width || 1) * GRID_CELL_SIZE - 4;
                  const tableHeight = (table.height || 1) * GRID_CELL_SIZE - 4;

                  return (
                    <button
                      key={table.id}
                      onClick={() => onTableClick?.(table)}
                      className={`
                        absolute flex flex-col items-center justify-center
                        border-2 ${shapeClass} ${colorClass}
                        hover:shadow-lg transition-all duration-200 cursor-pointer
                        text-xs font-medium
                        hover:scale-105 active:scale-95
                      `}
                      style={{
                        left: posX + 2,
                        top: posY + 2,
                        width: tableWidth,
                        height: tableHeight,
                        transform: table.rotation ? `rotate(${table.rotation}deg)` : undefined,
                      }}
                      title={`Table ${table.table_number} - ${table.capacity} seats - ${table.status}`}
                    >
                      <span className="font-bold leading-tight">{table.table_number}</span>
                      <span className={`${compact ? 'text-[9px]' : 'text-[10px]'} opacity-75 leading-tight`}>
                        {table.capacity}p
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}

      {/* Legend - only show if not in compact mode */}
      {!compact && (
        <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-[#57534E] pt-2">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-green-100 border-2 border-green-500"></div>
            <span>Available</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-red-100 border-2 border-red-500"></div>
            <span>Occupied</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-purple-100 border-2 border-purple-500"></div>
            <span>Reserved</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-amber-100 border-2 border-amber-500"></div>
            <span>Cleaning</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-0 border-t-2 border-dashed border-[#9F1239] opacity-60"></div>
            <span>Joinable</span>
          </div>
        </div>
      )}
    </div>
  );
}

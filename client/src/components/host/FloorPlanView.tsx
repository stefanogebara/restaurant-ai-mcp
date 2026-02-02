import React, { useMemo } from 'react';
import type { Table, ActiveParty } from '../../types/host.types';

interface FloorPlanViewProps {
  tables: Table[];
  activeParties?: ActiveParty[];  // For showing guest names on occupied tables
  onTableClick?: (table: Table) => void;
  compact?: boolean; // For smaller view in dashboard
  darkMode?: boolean;
}

// Grid cell size - smaller for compact view
const GRID_CELL_SIZE_NORMAL = 40;
const GRID_CELL_SIZE_COMPACT = 32;

// Outline-based status colors (matching TableRenderer)
const getStatusColor = (status: string, darkMode: boolean = false) => {
  if (darkMode) {
    switch (status) {
      case 'Available':
        return { bg: 'bg-[#292524]', border: 'border-green-400', text: 'text-white' };
      case 'Occupied':
        return { bg: 'bg-[#292524]', border: 'border-red-400', text: 'text-white' };
      case 'Reserved':
        return { bg: 'bg-[#292524]', border: 'border-purple-400', text: 'text-white' };
      case 'Being Cleaned':
        return { bg: 'bg-[#292524]', border: 'border-amber-400', text: 'text-white' };
      default:
        return { bg: 'bg-[#292524]', border: 'border-gray-500', text: 'text-white' };
    }
  }
  // Light mode - neutral fill with colored outline
  switch (status) {
    case 'Available':
      return { bg: 'bg-[#FAFAF9]', border: 'border-green-500', text: 'text-[#1C1917]' };
    case 'Occupied':
      return { bg: 'bg-[#FAFAF9]', border: 'border-red-500', text: 'text-[#1C1917]' };
    case 'Reserved':
      return { bg: 'bg-[#FAFAF9]', border: 'border-purple-500', text: 'text-[#1C1917]' };
    case 'Being Cleaned':
      return { bg: 'bg-[#FAFAF9]', border: 'border-amber-500', text: 'text-[#1C1917]' };
    default:
      return { bg: 'bg-[#FAFAF9]', border: 'border-gray-400', text: 'text-[#1C1917]' };
  }
};

export default function FloorPlanView({
  tables,
  activeParties = [],
  onTableClick,
  compact = false,
  darkMode = false
}: FloorPlanViewProps) {
  const GRID_CELL_SIZE = compact ? GRID_CELL_SIZE_COMPACT : GRID_CELL_SIZE_NORMAL;

  // Create lookup map: table_id -> party info
  const tablePartyMap = useMemo(() => {
    const map = new Map<string, {
      guestName: string;
      isVIP?: boolean;
      specialOccasion?: string
    }>();

    activeParties.forEach(party => {
      (party.tables || []).forEach(tableId => {
        map.set(tableId, {
          guestName: party.customer_name,
          isVIP: (party as any).is_vip,
          specialOccasion: (party as any).special_occasion,
        });
      });
    });

    return map;
  }, [activeParties]);

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

  // Render dotted lines between linked/joinable tables
  const renderLinks = (locationTables: Table[]) => {
    const links: React.ReactElement[] = [];
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
      <div className={`text-center py-12 ${darkMode ? 'text-[#A8A29E]' : 'text-[#57534E]'}`}>
        <p className={`font-semibold text-lg ${darkMode ? 'text-white' : 'text-[#1C1917]'}`}>No tables configured yet</p>
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
            <h3 className={`text-sm font-semibold mb-3 ${darkMode ? 'text-white' : 'text-[#1C1917]'}`}>{location}</h3>
            <div
              className={`relative rounded-xl p-2 overflow-auto border ${
                darkMode ? 'bg-[#1C1917] border-[#44403C]' : 'bg-[#FAFAF9] border-[#E7E5E4]'
              }`}
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
                  // No grid lines - clean plain background
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
                  const colors = getStatusColor(table.status, darkMode);
                  const posX = (table.position_x || 0) * GRID_CELL_SIZE;
                  const posY = (table.position_y || 0) * GRID_CELL_SIZE;
                  const tableWidth = (table.width || 1) * GRID_CELL_SIZE - 4;
                  const tableHeight = (table.height || 1) * GRID_CELL_SIZE - 4;

                  const partyInfo = tablePartyMap.get(table.id);
                  const showGuestName = table.status === 'Occupied' && partyInfo?.guestName;

                  return (
                    <button
                      key={table.id}
                      onClick={() => onTableClick?.(table)}
                      className={`
                        absolute flex flex-col items-center justify-center
                        border-[3px] ${shapeClass} ${colors.bg} ${colors.border} ${colors.text}
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
                      title={`Table ${table.table_number} - ${table.capacity} seats - ${table.status}${partyInfo?.guestName ? ` - ${partyInfo.guestName}` : ''}`}
                    >
                      {/* VIP indicator */}
                      {partyInfo?.isVIP && (
                        <span className="absolute -top-1 -right-1 w-4 h-4 bg-yellow-400 rounded-full flex items-center justify-center text-[8px]">
                          *
                        </span>
                      )}

                      {/* Special occasion indicator */}
                      {partyInfo?.specialOccasion && !partyInfo?.isVIP && (
                        <span className="absolute -top-1 -left-1 w-4 h-4 bg-pink-200 rounded-full flex items-center justify-center text-[8px]">
                          {partyInfo.specialOccasion === 'Birthday' ? '!' :
                           partyInfo.specialOccasion === 'Anniversary' ? '+' : '*'}
                        </span>
                      )}

                      {/* Show guest name for occupied tables */}
                      {showGuestName ? (
                        <>
                          <span className="font-semibold leading-tight truncate max-w-full px-1">
                            {partyInfo.guestName.split(' ')[0].substring(0, 6)}
                          </span>
                          <span className={`${compact ? 'text-[8px]' : 'text-[9px]'} opacity-60 leading-tight`}>
                            T{table.table_number}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="font-bold leading-tight">{table.table_number}</span>
                          <span className={`${compact ? 'text-[9px]' : 'text-[10px]'} opacity-75 leading-tight`}>
                            {table.capacity}p
                          </span>
                        </>
                      )}
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
        <div className={`flex flex-wrap items-center justify-center gap-4 text-xs pt-2 ${darkMode ? 'text-[#A8A29E]' : 'text-[#57534E]'}`}>
          <div className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded border-[3px] border-green-500 ${darkMode ? 'bg-[#292524]' : 'bg-[#FAFAF9]'}`}></div>
            <span>Available</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded border-[3px] border-red-500 ${darkMode ? 'bg-[#292524]' : 'bg-[#FAFAF9]'}`}></div>
            <span>Occupied</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded border-[3px] border-purple-500 ${darkMode ? 'bg-[#292524]' : 'bg-[#FAFAF9]'}`}></div>
            <span>Reserved</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded border-[3px] border-amber-500 ${darkMode ? 'bg-[#292524]' : 'bg-[#FAFAF9]'}`}></div>
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

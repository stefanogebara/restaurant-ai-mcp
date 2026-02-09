import React, { useMemo } from 'react';
import type { Table, ActiveParty } from '../../types/host.types';

interface FloorPlanViewProps {
  tables: Table[];
  activeParties?: ActiveParty[];
  onTableClick?: (table: Table) => void;
  compact?: boolean;
  darkMode?: boolean;
}

// Status colors - fills for visual clarity
const getStatusStyle = (status: string, darkMode: boolean = false) => {
  const normalized = status?.toLowerCase() || '';
  if (darkMode) {
    switch (normalized) {
      case 'available':
        return { bg: '#1a2e1a', border: '#22c55e', text: '#d1fae5', dot: '#22c55e' };
      case 'occupied':
        return { bg: '#2e1a1a', border: '#ef4444', text: '#fecaca', dot: '#ef4444' };
      case 'reserved':
        return { bg: '#2a1a3e', border: '#a855f7', text: '#e9d5ff', dot: '#a855f7' };
      case 'being cleaned':
        return { bg: '#2e2a1a', border: '#f59e0b', text: '#fef3c7', dot: '#f59e0b' };
      default:
        return { bg: '#292524', border: '#78716c', text: '#d6d3d1', dot: '#78716c' };
    }
  }
  switch (normalized) {
    case 'available':
      return { bg: '#f0fdf4', border: '#22c55e', text: '#14532d', dot: '#22c55e' };
    case 'occupied':
      return { bg: '#fef2f2', border: '#ef4444', text: '#7f1d1d', dot: '#ef4444' };
    case 'reserved':
      return { bg: '#faf5ff', border: '#a855f7', text: '#581c87', dot: '#a855f7' };
    case 'being cleaned':
      return { bg: '#fffbeb', border: '#f59e0b', text: '#78350f', dot: '#f59e0b' };
    default:
      return { bg: '#fafaf9', border: '#a8a29e', text: '#44403c', dot: '#a8a29e' };
  }
};

// Get table dimensions based on capacity and shape
const getTableSize = (table: Table) => {
  const cap = table.capacity || 2;
  const shape = table.shape?.toLowerCase() || 'round';

  if (shape === 'round' || shape === 'circle') {
    const size = cap <= 2 ? 72 : cap <= 4 ? 88 : 100;
    return { w: size, h: size };
  }
  if (shape === 'booth') {
    return { w: cap <= 4 ? 100 : 120, h: cap <= 4 ? 64 : 72 };
  }
  if (shape === 'rectangle' || shape === 'long') {
    return { w: cap <= 4 ? 110 : 140, h: 64 };
  }
  // square / default
  const size = cap <= 2 ? 72 : cap <= 4 ? 88 : 100;
  return { w: size, h: size };
};

// Check if tables have real position data
const hasPositionData = (tables: Table[]) => {
  return tables.some(t =>
    (t.position_x !== undefined && t.position_x !== null && t.position_x !== 0) ||
    (t.position_y !== undefined && t.position_y !== null && t.position_y !== 0)
  );
};

// Auto-layout: arrange tables in a natural restaurant floor pattern
const autoLayoutTables = (tables: Table[]) => {
  const GAP = 24;
  const sorted = [...tables].sort((a, b) => (Number(a.table_number) || 0) - (Number(b.table_number) || 0));
  const positions: { table: Table; x: number; y: number; w: number; h: number }[] = [];

  // Calculate available width (responsive, approx container width)
  const containerWidth = 800;
  let curX = GAP;
  let curY = GAP;
  let rowHeight = 0;

  sorted.forEach(table => {
    const size = getTableSize(table);

    // Wrap to next row if needed
    if (curX + size.w + GAP > containerWidth && curX > GAP) {
      curX = GAP;
      curY += rowHeight + GAP;
      rowHeight = 0;
    }

    positions.push({ table, x: curX, y: curY, w: size.w, h: size.h });
    curX += size.w + GAP;
    rowHeight = Math.max(rowHeight, size.h);
  });

  const totalWidth = containerWidth;
  const totalHeight = curY + rowHeight + GAP;
  return { positions, totalWidth, totalHeight };
};

// Render chair dots around a table
const renderChairs = (
  cx: number, cy: number, w: number, h: number,
  capacity: number, shape: string, color: string
) => {
  const chairs: React.ReactElement[] = [];
  const isRound = shape === 'round' || shape === 'circle';
  const chairSize = 8;
  const offset = 6; // distance from table edge

  if (isRound) {
    const radius = w / 2 + offset + chairSize / 2;
    for (let i = 0; i < capacity; i++) {
      const angle = (2 * Math.PI * i) / capacity - Math.PI / 2;
      chairs.push(
        <circle
          key={`chair-${i}`}
          cx={cx + radius * Math.cos(angle)}
          cy={cy + radius * Math.sin(angle)}
          r={chairSize / 2}
          fill={color}
          opacity={0.35}
        />
      );
    }
  } else {
    // Rectangular arrangement
    const halfH = h / 2 + offset + chairSize / 2;
    const perSideLong = Math.ceil(capacity / 2);
    const perSideShort = capacity - perSideLong;

    // Top and bottom (long sides)
    for (let i = 0; i < perSideLong; i++) {
      const xPos = cx - (w / 2) + (w / (perSideLong + 1)) * (i + 1);
      chairs.push(
        <circle key={`chair-t-${i}`} cx={xPos} cy={cy - halfH} r={chairSize / 2} fill={color} opacity={0.35} />
      );
    }
    for (let i = 0; i < perSideShort; i++) {
      const xPos = cx - (w / 2) + (w / (perSideShort + 1)) * (i + 1);
      chairs.push(
        <circle key={`chair-b-${i}`} cx={xPos} cy={cy + halfH} r={chairSize / 2} fill={color} opacity={0.35} />
      );
    }
  }
  return chairs;
};

export default function FloorPlanView({
  tables,
  activeParties = [],
  onTableClick,
  compact = false,
  darkMode = false
}: FloorPlanViewProps) {
  // Party lookup
  const tablePartyMap = useMemo(() => {
    const map = new Map<string, { guestName: string; isVIP?: boolean; specialOccasion?: string }>();
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

  // Group by location
  const tablesByLocation = useMemo(() => {
    return tables.reduce((acc, table) => {
      const location = table.location || 'Main';
      if (!acc[location]) acc[location] = [];
      acc[location].push(table);
      return acc;
    }, {} as Record<string, Table[]>);
  }, [tables]);

  if (tables.length === 0) {
    return (
      <div className={`text-center py-12 ${darkMode ? 'text-[#A8A29E]' : 'text-[#57534E]'}`}>
        <p className={`font-semibold text-lg ${darkMode ? 'text-white' : 'text-[#1C1917]'}`}>No tables configured yet</p>
        <p className="text-sm mt-2">Tables will appear here after onboarding</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {Object.entries(tablesByLocation).map(([location, locationTables]) => {
        const useAutoLayout = !hasPositionData(locationTables);
        const layout = useAutoLayout ? autoLayoutTables(locationTables) : null;

        // For manual positions, calculate bounds
        let manualBounds = { width: 0, height: 0 };
        let manualPositions: { table: Table; x: number; y: number; w: number; h: number }[] = [];
        if (!useAutoLayout) {
          const CELL = compact ? 32 : 40;
          let maxX = 0, maxY = 0;
          manualPositions = locationTables.map(t => {
            const size = getTableSize(t);
            const x = (t.position_x || 0) * CELL;
            const y = (t.position_y || 0) * CELL;
            maxX = Math.max(maxX, x + size.w);
            maxY = Math.max(maxY, y + size.h);
            return { table: t, x, y, w: size.w, h: size.h };
          });
          manualBounds = { width: maxX + 24, height: maxY + 24 };
        }

        const positions = useAutoLayout ? layout!.positions : manualPositions;
        const svgWidth = useAutoLayout ? layout!.totalWidth : manualBounds.width;
        const svgHeight = useAutoLayout ? layout!.totalHeight : manualBounds.height;

        return (
          <div key={location}>
            <h3 className={`text-sm font-semibold mb-3 flex items-center gap-2 ${darkMode ? 'text-white' : 'text-[#1C1917]'}`}>
              <span className={`w-2 h-2 rounded-full ${darkMode ? 'bg-[#A8A29E]' : 'bg-[#9F1239]'}`} />
              {location}
              <span className={`text-xs font-normal ${darkMode ? 'text-[#78716c]' : 'text-[#a8a29e]'}`}>
                {locationTables.length} tables
              </span>
            </h3>

            <div
              className={`rounded-xl overflow-auto border ${
                darkMode ? 'bg-[#1C1917] border-[#44403C]' : 'bg-white border-[#E7E5E4]'
              }`}
            >
              <svg
                width="100%"
                viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                className="block"
                style={{ minHeight: compact ? 160 : 200 }}
              >
                {/* Subtle floor pattern */}
                <defs>
                  <pattern id="floorPattern" patternUnits="userSpaceOnUse" width="40" height="40">
                    <circle cx="20" cy="20" r="0.8" fill={darkMode ? '#44403C' : '#e7e5e4'} opacity="0.5" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill={`url(#floorPattern)`} />

                {positions.map(({ table, x, y, w, h }) => {
                  const style = getStatusStyle(table.status, darkMode);
                  const shape = table.shape?.toLowerCase() || 'round';
                  const isRound = shape === 'round' || shape === 'circle';
                  const cx = x + w / 2;
                  const cy = y + h / 2;
                  const partyInfo = tablePartyMap.get(table.id);
                  const showGuest = table.status?.toLowerCase() === 'occupied' && partyInfo?.guestName;

                  return (
                    <g
                      key={table.id}
                      className="cursor-pointer"
                      onClick={() => onTableClick?.(table)}
                      style={{ transition: 'transform 0.15s' }}
                    >
                      {/* Chairs */}
                      {renderChairs(cx, cy, w, h, table.capacity || 2, shape, style.border)}

                      {/* Table shape */}
                      {isRound ? (
                        <circle
                          cx={cx}
                          cy={cy}
                          r={w / 2}
                          fill={style.bg}
                          stroke={style.border}
                          strokeWidth={3}
                        />
                      ) : shape === 'booth' ? (
                        <>
                          {/* Booth back */}
                          <rect
                            x={x}
                            y={y}
                            width={w}
                            height={h}
                            rx={12}
                            fill={style.bg}
                            stroke={style.border}
                            strokeWidth={3}
                          />
                          <rect
                            x={x + 2}
                            y={y + h - 8}
                            width={w - 4}
                            height={8}
                            rx={4}
                            fill={style.border}
                            opacity={0.15}
                          />
                        </>
                      ) : (
                        <rect
                          x={x}
                          y={y}
                          width={w}
                          height={h}
                          rx={shape === 'rectangle' || shape === 'long' ? 8 : 12}
                          fill={style.bg}
                          stroke={style.border}
                          strokeWidth={3}
                        />
                      )}

                      {/* Table number */}
                      <text
                        x={cx}
                        y={showGuest ? cy - 4 : cy + 1}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill={style.text}
                        fontSize={compact ? 14 : 16}
                        fontWeight={700}
                        fontFamily="system-ui, -apple-system, sans-serif"
                      >
                        {table.table_number}
                      </text>

                      {/* Capacity or guest name */}
                      <text
                        x={cx}
                        y={showGuest ? cy + 12 : cy + (compact ? 14 : 16)}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill={style.text}
                        fontSize={compact ? 9 : 10}
                        opacity={0.7}
                        fontFamily="system-ui, -apple-system, sans-serif"
                      >
                        {showGuest
                          ? partyInfo!.guestName.split(' ')[0].substring(0, 8)
                          : `${table.capacity}p`}
                      </text>

                      {/* VIP badge */}
                      {partyInfo?.isVIP && (
                        <g>
                          <circle cx={x + w - 4} cy={y + 4} r={7} fill="#eab308" />
                          <text x={x + w - 4} y={y + 5} textAnchor="middle" dominantBaseline="middle" fontSize={8} fontWeight={700} fill="#422006">
                            V
                          </text>
                        </g>
                      )}

                      {/* Status dot */}
                      <circle cx={x + w - 4} cy={cy} r={4} fill={style.dot} opacity={0.8} />

                      {/* Hover overlay (invisible, for larger hit area) */}
                      {isRound ? (
                        <circle cx={cx} cy={cy} r={w / 2 + 8} fill="transparent" />
                      ) : (
                        <rect x={x - 4} y={y - 4} width={w + 8} height={h + 8} rx={12} fill="transparent" />
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
        );
      })}
    </div>
  );
}

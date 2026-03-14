import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { Table, ActiveParty } from '../../types/host.types';
import ThiingsIcon from '../common/ThiingsIcon';
import FloorPlanProgressRing from './FloorPlanProgressRing';
import FloorPlanHoverCard from './FloorPlanHoverCard';
import {
  getStatusStyle,
  getTableSize,
  hasPositionData,
  autoLayoutTables,
  renderChairs,
  type PartyInfo,
} from './floorPlanHelpers';

interface FloorPlanViewProps {
  tables: Table[];
  activeParties?: ActiveParty[];
  onTableClick?: (table: Table) => void;
  compact?: boolean;
}

export default function FloorPlanView({
  tables,
  activeParties = [],
  onTableClick,
  compact = false,
}: FloorPlanViewProps) {
  const { t } = useTranslation();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(680);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const w = Math.floor(entry.contentRect.width);
        if (w > 0) setContainerWidth(w);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const tablePartyMap = useMemo(() => {
    const map = new Map<string, PartyInfo>();
    activeParties.forEach(party => {
      (party.tables || []).forEach(tid => {
        map.set(tid, {
          guestName: party.customer_name,
          partySize: party.party_size,
          isVIP: party.is_vip,
          specialOccasion: party.special_occasion,
          timeElapsed: party.time_elapsed_minutes || 0,
          timeRemaining: party.time_remaining_minutes || 0,
          isOverdue: party.is_overdue || false,
          seatedAt: party.seated_at || '',
        });
      });
    });
    return map;
  }, [activeParties]);

  const tablesByLocation = useMemo(() =>
    tables.reduce((acc, t) => {
      const loc = t.location || 'Main';
      (acc[loc] ??= []).push(t);
      return acc;
    }, {} as Record<string, Table[]>),
  [tables]);

  if (tables.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 mx-auto mb-4 bg-soft-gray rounded-2xl flex items-center justify-center">
          <ThiingsIcon name="layout-grid" pxSize={28} />
        </div>
        <p className="font-semibold text-deep-charcoal">{t('settings.noTablesTitle', 'No tables configured')}</p>
        <p className="text-sm text-stone-gray mt-1">
          {t('settings.noTablesDescription', 'Add tables to start receiving reservations and managing your floor.')}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5" ref={containerRef}>
      {Object.entries(tablesByLocation).map(([location, locTables]) => {
        const useAuto = !hasPositionData(locTables);
        const canvasWidth = Math.max(380, containerWidth - 32);
        const layout = useAuto ? autoLayoutTables(locTables, canvasWidth) : null;

        let manualPos: { table: Table; x: number; y: number; w: number; h: number }[] = [];
        let manualBounds = { width: 0, height: 0 };
        if (!useAuto) {
          const CELL = compact ? 32 : 40;
          let mx = 0, my = 0;
          manualPos = locTables.map(t => {
            const sz = getTableSize(t);
            const px = (t.position_x || 0) * CELL;
            const py = (t.position_y || 0) * CELL;
            mx = Math.max(mx, px + sz.w);
            my = Math.max(my, py + sz.h);
            return { table: t, x: px, y: py, w: sz.w, h: sz.h };
          });
          manualBounds = { width: mx + 40, height: my + 40 };
        }

        const positions = useAuto ? layout!.positions : manualPos;
        const svgW = useAuto ? layout!.totalWidth : manualBounds.width;
        const svgH = useAuto ? layout!.totalHeight : manualBounds.height;
        const hoveredPos = positions.find(p => p.table.id === hoveredId);

        const locationColors: Record<string, string> = {
          'Indoor': '#6366f1', 'Patio': '#10b981', 'Bar': '#f59e0b', 'Main': '#8b5cf6',
        };
        const dotColor = locationColors[location] || '#6b7280';

        return (
          <div key={location}>
            <div className="flex items-center gap-3 mb-4 mt-2">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: dotColor }} />
              <span className="text-sm font-semibold text-deep-charcoal">{location}</span>
              <span className="text-xs bg-soft-gray text-muted-stone px-2 py-0.5 rounded-full font-medium flex-shrink-0">
                {locTables.length} {locTables.length === 1 ? t('floorPlan.table', 'table') : t('floorPlan.tables', 'tables')}
              </span>
              <div className="flex-1 h-px bg-border-gray" />
            </div>

            <div
              className="rounded-2xl overflow-hidden border border-border-gray bg-white"
              style={{ maxWidth: '100%', overflowX: 'auto' }}
            >
              <svg
                width="100%"
                viewBox={`0 0 ${svgW} ${svgH}`}
                className="block"
                style={{ minHeight: compact ? 160 : 220, minWidth: 280, maxWidth: '100%' }}
              >
                <defs>
                  <pattern id={`fpDots-${location}`} patternUnits="userSpaceOnUse" width="20" height="20">
                    <circle cx="10" cy="10" r="0.75" fill="#B5ADA4" opacity="0.28" />
                  </pattern>
                  <pattern id={`fpGrid-${location}`} patternUnits="userSpaceOnUse" width="40" height="40">
                    <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#C8C0B6" strokeWidth="0.4" opacity="0.5" />
                  </pattern>
                  <filter id={`fpShad-${location}`} x="-8%" y="-8%" width="116%" height="124%">
                    <feDropShadow dx="0" dy="1.5" stdDeviation="3" floodColor="#7A6E65" floodOpacity="0.09" />
                  </filter>
                  <filter id={`fpShadHov-${location}`} x="-12%" y="-12%" width="124%" height="136%">
                    <feDropShadow dx="0" dy="3" stdDeviation="6" floodColor="#7A6E65" floodOpacity="0.15" />
                  </filter>
                  {positions.map(({ table }) => (
                    <radialGradient key={`rg-${table.id}`} id={`rg-${table.id}`} cx="40%" cy="35%" r="65%">
                      <stop offset="0%" stopColor="white" stopOpacity="0.35" />
                      <stop offset="100%" stopColor="white" stopOpacity="0" />
                    </radialGradient>
                  ))}
                </defs>

                <rect width="100%" height="100%" fill="#F8F5F0" />
                <rect width="100%" height="100%" fill={`url(#fpGrid-${location})`} />
                <rect width="100%" height="100%" fill={`url(#fpDots-${location})`} />

                {/* Joinable connector lines */}
                {(() => {
                  const links: React.ReactElement[] = [];
                  const processedPairs = new Set<string>();
                  const posMap = new Map(positions.map(p => [p.table.id, p]));
                  positions.forEach(pos => {
                    const t = pos.table;
                    if (!t.is_joinable || !t.joinable_with?.length) return;
                    t.joinable_with.forEach(linkedId => {
                      const pairKey = [t.id, linkedId].sort().join('-');
                      if (processedPairs.has(pairKey)) return;
                      processedPairs.add(pairKey);
                      const linkedPos = posMap.get(linkedId);
                      if (!linkedPos) return;
                      links.push(
                        <line key={pairKey}
                          x1={pos.x + pos.w / 2} y1={pos.y + pos.h / 2}
                          x2={linkedPos.x + linkedPos.w / 2} y2={linkedPos.y + linkedPos.h / 2}
                          stroke="#9F1239" strokeWidth="1.5" strokeDasharray="5,4" opacity="0.4" />,
                      );
                    });
                  });
                  return links;
                })()}

                {/* Tables */}
                {positions.map(({ table, x, y, w, h }) => {
                  const st = getStatusStyle(table.status);
                  const shape = table.shape?.toLowerCase() || 'round';
                  const isRound = shape === 'round' || shape === 'circle';
                  const cx = x + w / 2;
                  const cy = y + h / 2;
                  const party = tablePartyMap.get(table.id);
                  const isHovered = table.id === hoveredId;
                  const isOccupied = table.status?.toLowerCase() === 'occupied';
                  const ringR = Math.max(w, h) / 2 + 11;

                  return (
                    <g
                      key={table.id}
                      className="cursor-pointer"
                      onClick={() => onTableClick?.(table)}
                      onMouseEnter={() => setHoveredId(table.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      filter={isHovered ? `url(#fpShadHov-${location})` : `url(#fpShad-${location})`}
                    >
                      {isOccupied && party && (
                        <FloorPlanProgressRing cx={cx} cy={cy} radius={ringR} party={party} />
                      )}

                      {renderChairs(cx, cy, w, h, table.capacity || 2, shape, st.chairFill)}

                      {isRound ? (
                        <>
                          <circle cx={cx} cy={cy} r={w / 2} fill={st.fill} stroke={st.stroke} strokeWidth={2} />
                          <circle cx={cx} cy={cy} r={w / 2} fill={`url(#rg-${table.id})`} />
                          <circle cx={cx + w / 2 * 0.68} cy={cy + w / 2 * 0.68} r={5} fill={st.stroke} />
                        </>
                      ) : shape === 'booth' ? (
                        <>
                          <rect x={x} y={y} width={w} height={h} rx={13} fill={st.fill} stroke={st.stroke} strokeWidth={2} />
                          <rect x={x + 3} y={y + 3} width={w - 6} height={h / 3} rx={7} fill="white" opacity={0.25} />
                          <rect x={x + 4} y={y + h - 8} width={w - 8} height={7} rx={4} fill={st.stroke} opacity={0.08} />
                          <circle cx={x + w - 6} cy={y + h - 6} r={5} fill={st.stroke} />
                        </>
                      ) : (
                        <>
                          <rect x={x} y={y} width={w} height={h} rx={10} fill={st.fill} stroke={st.stroke} strokeWidth={2} />
                          <rect x={x + 3} y={y + 3} width={w - 6} height={h / 3} rx={7} fill="white" opacity={0.25} />
                          <circle cx={x + w - 6} cy={y + h - 6} r={5} fill={st.stroke} />
                        </>
                      )}

                      <text x={cx} y={isOccupied && party ? cy - 7 : cy - 2}
                        textAnchor="middle" dominantBaseline="middle"
                        fill={st.text} fontSize={19} fontWeight={700}
                        fontFamily="Inter,-apple-system,sans-serif">
                        {table.table_number}
                      </text>

                      <text x={cx} y={isOccupied && party ? cy + 11 : cy + 14}
                        textAnchor="middle" dominantBaseline="middle"
                        fill={st.text} fontSize={11} opacity={0.55}
                        fontFamily="Inter,-apple-system,sans-serif">
                        {isOccupied && party
                          ? party.guestName.split(' ')[0].substring(0, 9)
                          : `${table.capacity} ${t('floorPlan.seats', 'seats')}`}
                      </text>

                      {party?.isVIP && (
                        <g>
                          <circle cx={x + w - 1} cy={y + 1} r={9} fill="#CA8A04" />
                          <text x={x + w - 1} y={y + 2.5} textAnchor="middle" dominantBaseline="middle"
                            fontSize={9} fontWeight={800} fill="#fff">V</text>
                        </g>
                      )}

                      {table.is_joinable && table.joinable_with?.length > 0 && (
                        <g>
                          <circle cx={x + 1} cy={y + 1} r={9} fill="#9F1239" opacity={0.9} />
                          <text x={x + 1} y={y + 2.5} textAnchor="middle" dominantBaseline="middle"
                            fontSize={10} fill="#fff">&#x26D3;</text>
                        </g>
                      )}

                      {isRound ? (
                        <circle cx={cx} cy={cy} r={ringR + 6} fill="transparent" />
                      ) : (
                        <rect x={x - 14} y={y - 14} width={w + 28} height={h + 28} rx={16} fill="transparent" />
                      )}
                    </g>
                  );
                })}

                {hoveredPos && (
                  <FloorPlanHoverCard
                    table={hoveredPos.table}
                    party={tablePartyMap.get(hoveredPos.table.id)}
                    x={hoveredPos.x}
                    y={hoveredPos.y}
                    w={hoveredPos.w}
                    h={hoveredPos.h}
                    svgW={svgW}
                    allTables={locTables}
                  />
                )}
              </svg>
            </div>
          </div>
        );
      })}
    </div>
  );
}

import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { Table, ActiveParty } from '../../types/host.types';
import ThiingsIcon from '../common/ThiingsIcon';
import FloorPlanProgressRing from './FloorPlanProgressRing';
import FloorPlanHoverCard from './FloorPlanHoverCard';
import {
  getStatusStyle,
  statusLabel,
  getTableSize,
  hasPositionData,
  autoLayoutTables,
  type PartyInfo,
} from './floorPlanHelpers';

interface FloorPlanViewProps {
  tables: Table[];
  activeParties?: ActiveParty[];
  onTableClick?: (table: Table) => void;
  compact?: boolean;
  /** Modo Serviço — salão escuro com estados de mesa de alto contraste. */
  night?: boolean;
}

export default function FloorPlanView({
  tables,
  activeParties = [],
  onTableClick,
  compact = false,
  night = false,
}: FloorPlanViewProps) {
  const { t } = useTranslation();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
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
          // customer_name is typed string but the payload is untrusted — a
          // null name would crash `guestName.split(' ')` and white-screen the
          // whole SVG. Coerce here so PartyInfo.guestName stays an honest string.
          guestName: party.customer_name || '',
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
    <div className="space-y-4" ref={containerRef}>
      {Object.entries(tablesByLocation).map(([location, locTables]) => {
        // The narrow preview is a proportional overview of the saved plan.
        // Coordinates stay untouched; only restaurants without a plan get
        // an automatic layout. Reflowing a 4×2 room into a 2-column list
        // made the preview look like unrelated table cards.
        const narrowPreview = containerWidth < 540;
        const useAuto = !hasPositionData(locTables);
        const canvasWidth = narrowPreview
          ? 580
          : Math.max(380, Math.min(760, containerWidth - 32));
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
        // Preserve saved floor coordinates at a readable scale on desktop.
        // The old width="100%" enlarged a small plan to fill any wide card.
        const displayWidth = Math.min(svgW, narrowPreview ? containerWidth - 4 : 760);
        const hoveredPos = positions.find(p => p.table.id === hoveredId);

        return (
          <div key={location}>
            <div className="flex items-baseline gap-2 px-2 mb-2">
              <span className="text-[13px] font-medium text-deep-charcoal">{t(`floorPlan.location.${location.toLowerCase()}`, location)}</span>
              <span className="text-[11px] text-muted-stone">
                {locTables.length} {locTables.length === 1 ? t('floorPlan.table', 'table') : t('floorPlan.tables', 'tables')}
              </span>
            </div>

            <div
              className="overflow-hidden"
              style={{ maxWidth: '100%', overflowX: 'auto', backgroundColor: night ? '#221E1B' : undefined }}
            >
              <svg
                width={displayWidth}
                viewBox={`0 0 ${svgW} ${svgH}`}
                className="block mx-auto"
                style={{ minHeight: narrowPreview ? undefined : compact ? 160 : 220 }}
              >
                <defs>
                  <filter id={`fpShad-${location}`} x="-8%" y="-8%" width="116%" height="124%">
                    <feDropShadow dx="0" dy="1.5" stdDeviation="3" floodColor="#7A6E65" floodOpacity="0.09" />
                  </filter>
                  <filter id={`fpShadHov-${location}`} x="-12%" y="-12%" width="124%" height="136%">
                    <feDropShadow dx="0" dy="3" stdDeviation="6" floodColor="#7A6E65" floodOpacity="0.15" />
                  </filter>
                  <style>
                    {`
                      @keyframes fpLinkDash {
                        to {
                          stroke-dashoffset: -10;
                        }
                      }
                    `}
                  </style>
                </defs>

                {night && <rect width="100%" height="100%" fill="#221E1B" />}

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
                          stroke="#9F1239" strokeWidth="2" strokeDasharray="6,4" opacity="0.4"
                          strokeLinecap="round" style={{ animation: 'fpLinkDash 1.5s linear infinite' }} />,
                      );
                    });
                  });
                  return links;
                })()}

                {/* Tables */}
                {positions.map(({ table, x, y, w, h }) => {
                  const st = getStatusStyle(table.status, night);
                  const shape = table.shape?.toLowerCase() || 'round';
                  const isRound = shape === 'round' || shape === 'circle';
                  const cx = x + w / 2;
                  const cy = y + h / 2;
                  const party = tablePartyMap.get(table.id);
                  const isHovered = table.id === hoveredId;
                  const isOccupied = table.status?.toLowerCase() === 'occupied';
                  const ringR = Math.max(w, h) / 2 + 11;
                  const glassFilter = night
                    ? undefined
                    : (isHovered ? `url(#fpShadHov-${location})` : `url(#fpShad-${location})`);

                  return (
                    <g
                      key={table.id}
                      className="cursor-pointer"
                      role={onTableClick ? 'button' : undefined}
                      tabIndex={onTableClick ? 0 : undefined}
                      aria-label={`${t('tableLayout.table', 'Table')} ${table.table_number}, ${statusLabel(table.status, (key, fallback) => t(key, fallback ?? key))}, ${table.capacity} ${t('floorPlan.seats', 'seats')}`}
                      onClick={() => onTableClick?.(table)}
                      onKeyDown={(event) => {
                        if (onTableClick && (event.key === 'Enter' || event.key === ' ')) {
                          event.preventDefault();
                          onTableClick(table);
                        }
                      }}
                      onMouseEnter={() => setHoveredId(table.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      onFocus={() => setFocusedId(table.id)}
                      onBlur={() => setFocusedId(null)}
                      filter={glassFilter}
                    >
                      {focusedId === table.id && (isRound
                        ? <circle cx={cx} cy={cy} r={w / 2 + 7} fill="none" stroke={night ? '#FFFFFF' : '#1C1917'} strokeWidth={2} />
                        : <rect x={x - 7} y={y - 7} width={w + 14} height={h + 14} rx={18} fill="none" stroke={night ? '#FFFFFF' : '#1C1917'} strokeWidth={2} />)}
                      {isOccupied && party && !narrowPreview && (
                        <FloorPlanProgressRing cx={cx} cy={cy} radius={ringR} party={party} />
                      )}

                      {isRound ? (
                        <>
                          <circle cx={cx} cy={cy} r={w / 2} fill={st.fill} stroke={st.stroke} strokeWidth={2} strokeDasharray={st.dash} />
                        </>
                      ) : shape === 'booth' ? (
                        <>
                          <rect x={x} y={y} width={w} height={h} rx={13} fill={st.fill} stroke={st.stroke} strokeWidth={2} strokeDasharray={st.dash} />
                        </>
                      ) : (
                        <>
                          <rect x={x} y={y} width={w} height={h} rx={12} fill={st.fill} stroke={st.stroke} strokeWidth={2} strokeDasharray={st.dash} />
                        </>
                      )}

                      <text x={cx} y={narrowPreview ? cy - 8 : isOccupied && party ? cy - 6 : cy - 2}
                        textAnchor="middle" dominantBaseline="middle"
                        fill={st.text} fontSize={narrowPreview ? 28 : 20} fontWeight={400}
                        fontFamily="'Instrument Serif',Georgia,serif">
                        {table.table_number}
                      </text>

                      {narrowPreview && <text x={cx} y={cy + 22}
                        textAnchor="middle" dominantBaseline="middle"
                        fill={st.text} fontSize={18} opacity={isOccupied ? 0.88 : 0.72}
                        fontFamily="'DM Sans',Inter,-apple-system,sans-serif">
                        {table.capacity}p
                      </text>}

                      {!narrowPreview && <text x={cx} y={isOccupied && party ? cy + 12 : cy + 14}
                        textAnchor="middle" dominantBaseline="middle"
                        fill={st.text} fontSize={13} opacity={isOccupied ? 0.9 : 0.72}
                        fontFamily="'DM Sans',Inter,-apple-system,sans-serif">
                        {isOccupied && party
                          ? party.guestName.split(' ')[0].substring(0, 9)
                          : `${table.capacity} ${t('floorPlan.seats', 'seats')}`}
                      </text>}

                      {party?.isVIP && (
                        <g transform={`translate(${x + w - 1}, ${y + 1})`}>
                          <circle r={9} fill="#B45309" />
                          <path
                            transform="translate(-5.5, -5.5) scale(0.46)"
                            d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.3 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z"
                            fill="#fff"
                          />
                        </g>
                      )}

                      {table.is_joinable && table.joinable_with?.length > 0 && (
                        <g transform={`translate(${x + 1}, ${y + 1})`}>
                          <circle r={9} fill="#9F1239" opacity={0.9} />
                          <path
                            transform="translate(-5, -5) scale(0.42)"
                            d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71 M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
                            fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round"
                          />
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

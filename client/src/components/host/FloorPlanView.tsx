import React, { useMemo, useState } from 'react';
import type { Table, ActiveParty } from '../../types/host.types';

interface FloorPlanViewProps {
  tables: Table[];
  activeParties?: ActiveParty[];
  onTableClick?: (table: Table) => void;
  compact?: boolean;
}

interface PartyInfo {
  guestName: string;
  partySize: number;
  isVIP?: boolean;
  specialOccasion?: string;
  timeElapsed: number;
  timeRemaining: number;
  isOverdue: boolean;
  seatedAt: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const formatTime = (min: number): string => {
  if (min <= 0) return '0m';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const statusLabel = (s: string) => {
  switch (s?.toLowerCase()) {
    case 'available': return 'Available';
    case 'occupied':  return 'Occupied';
    case 'reserved':  return 'Reserved';
    case 'being cleaned': return 'Cleaning';
    default: return s || 'Unknown';
  }
};

// ── Light Status Palette ──────────────────────────────────────────────────────

interface StatusStyle {
  fill: string; stroke: string; text: string; chairFill: string; sublabel: string;
}

const getStatusStyle = (status: string): StatusStyle => {
  switch (status?.toLowerCase()) {
    case 'available':
      return { fill: '#ECFDF5', stroke: '#10B981', text: '#064E3B', chairFill: '#10B981', sublabel: '#34D399' };
    case 'occupied':
      return { fill: '#FFF1F2', stroke: '#E11D48', text: '#881337', chairFill: '#E11D48', sublabel: '#FB7185' };
    case 'reserved':
      return { fill: '#F5F3FF', stroke: '#7C3AED', text: '#3730A3', chairFill: '#7C3AED', sublabel: '#A78BFA' };
    case 'being cleaned':
      return { fill: '#FFFBEB', stroke: '#D97706', text: '#78350F', chairFill: '#D97706', sublabel: '#FCD34D' };
    default:
      return { fill: '#FAFAF9', stroke: '#A8A29E', text: '#57534E', chairFill: '#A8A29E', sublabel: '#D6D3D1' };
  }
};

// ── Table Sizing ──────────────────────────────────────────────────────────────

const getTableSize = (table: Table) => {
  const cap = table.capacity || 2;
  const shape = table.shape?.toLowerCase() || 'round';
  if (shape === 'round' || shape === 'circle') {
    const s = cap <= 2 ? 84 : cap <= 4 ? 100 : 116;
    return { w: s, h: s };
  }
  if (shape === 'booth') {
    return { w: cap <= 4 ? 120 : 144, h: cap <= 4 ? 72 : 84 };
  }
  if (shape === 'rectangle' || shape === 'long' || shape === 'oval') {
    return { w: cap <= 4 ? 128 : 160, h: 74 };
  }
  const s = cap <= 2 ? 84 : cap <= 4 ? 100 : 116;
  return { w: s, h: s };
};

// ── Layout ────────────────────────────────────────────────────────────────────

// Only use saved positions when ALL tables have been explicitly placed (non-zero x or y).
// If any table is still at default (0,0), fall back to auto-layout so nothing stacks in the corner.
const hasPositionData = (tables: Table[]) =>
  tables.length > 0 &&
  tables.every(t =>
    (t.position_x !== undefined && t.position_x !== null) &&
    (t.position_y !== undefined && t.position_y !== null) &&
    (t.position_x !== 0 || t.position_y !== 0),
  );

const autoLayoutTables = (tables: Table[]) => {
  // Use a narrower canvas (520px) so tables render at a comfortable size
  // in the dashboard panel (~400-600px wide container).
  const GAP = 28;
  const PAD = 20;
  const W = 520;
  const sorted = [...tables].sort(
    (a, b) => (Number(a.table_number) || 0) - (Number(b.table_number) || 0),
  );
  const out: { table: Table; x: number; y: number; w: number; h: number }[] = [];
  let curX = PAD, curY = PAD, rowH = 0;

  sorted.forEach(table => {
    const size = getTableSize(table);
    if (curX + size.w + PAD > W && curX > PAD) {
      curX = PAD; curY += rowH + GAP; rowH = 0;
    }
    out.push({ table, x: curX, y: curY, w: size.w, h: size.h });
    curX += size.w + GAP;
    rowH = Math.max(rowH, size.h);
  });

  const totalHeight = curY + rowH + PAD + 20;
  // Ensure a minimum useful height
  return { positions: out, totalWidth: W, totalHeight: Math.max(totalHeight, 180) };
};

// ── Chairs ────────────────────────────────────────────────────────────────────

const renderChairs = (
  cx: number, cy: number, w: number, h: number,
  capacity: number, shape: string, color: string,
) => {
  const chairs: React.ReactElement[] = [];
  const isRound = shape === 'round' || shape === 'circle';
  const r = 5.5;
  const gap = 8;

  if (isRound) {
    const orbit = w / 2 + gap + r;
    for (let i = 0; i < capacity; i++) {
      const a = (2 * Math.PI * i) / capacity - Math.PI / 2;
      chairs.push(
        <circle key={`c${i}`}
          cx={cx + orbit * Math.cos(a)} cy={cy + orbit * Math.sin(a)}
          r={r} fill={color} opacity={0.2} />,
      );
    }
  } else {
    const halfH = h / 2 + gap + r;
    const top = Math.ceil(capacity / 2);
    const bot = capacity - top;
    for (let i = 0; i < top; i++) {
      const xp = cx - w / 2 + (w / (top + 1)) * (i + 1);
      chairs.push(
        <circle key={`ct${i}`} cx={xp} cy={cy - halfH}
          r={r} fill={color} opacity={0.2} />,
      );
    }
    for (let i = 0; i < bot; i++) {
      const xp = cx - w / 2 + (w / (bot + 1)) * (i + 1);
      chairs.push(
        <circle key={`cb${i}`} cx={xp} cy={cy + halfH}
          r={r} fill={color} opacity={0.2} />,
      );
    }
  }
  return chairs;
};

// ── Progress Ring ─────────────────────────────────────────────────────────────

function ProgressRing({
  cx, cy, radius, party,
}: { cx: number; cy: number; radius: number; party: PartyInfo }) {
  const total = party.timeElapsed + party.timeRemaining;
  const progress = party.isOverdue ? 1 : (total > 0 ? Math.min(party.timeElapsed / total, 1) : 0);
  const circ = 2 * Math.PI * radius;
  const offset = circ * (1 - progress);

  let ringColor = '#10B981';
  if (party.isOverdue) ringColor = '#E11D48';
  else if (progress > 0.75) ringColor = '#D97706';
  else if (progress > 0.5)  ringColor = '#F59E0B';

  return (
    <g>
      <circle cx={cx} cy={cy} r={radius} fill="none"
        stroke={ringColor} strokeWidth={2} opacity={0.12} />
      <circle cx={cx} cy={cy} r={radius} fill="none"
        stroke={ringColor} strokeWidth={2} opacity={0.6}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`} />
      <text x={cx} y={cy - radius - 5} textAnchor="middle"
        fontSize={9} fontWeight={600} fill={ringColor}
        fontFamily="Inter,-apple-system,sans-serif">
        {party.isOverdue
          ? `+${formatTime(Math.abs(party.timeRemaining))} over`
          : formatTime(party.timeElapsed)}
      </text>
    </g>
  );
}

// ── Hover Card ────────────────────────────────────────────────────────────────

function HoverCard({
  table, party, x, y, w, h, svgW, allTables,
}: {
  table: Table; party?: PartyInfo;
  x: number; y: number; w: number; h: number;
  svgW: number; allTables?: Table[];
}) {
  const st = getStatusStyle(table.status);
  const isOccupied = table.status?.toLowerCase() === 'occupied' && party;

  const joinableNames = (table.is_joinable && table.joinable_with?.length > 0 && allTables)
    ? table.joinable_with
        .map(id => allTables.find(t => t.id === id))
        .filter(Boolean)
        .map(t => t!.table_number)
    : [];
  const combinedCapacity = joinableNames.length > 0 && allTables
    ? table.capacity + table.joinable_with
        .map(id => allTables.find(t => t.id === id))
        .filter(Boolean)
        .reduce((sum, t) => sum + (t!.capacity || 0), 0)
    : 0;
  const hasJoinable = joinableNames.length > 0;

  const cardW = 204;
  const cardH = isOccupied ? (hasJoinable ? 150 : 120) : (hasJoinable ? 108 : 78);
  const cx = x + w / 2;

  const showBelow = y < cardH + 24;
  const cardX = Math.max(6, Math.min(cx - cardW / 2, svgW - cardW - 6));
  const cardY = showBelow ? y + h + 18 : y - cardH - 18;

  const total = party ? party.timeElapsed + party.timeRemaining : 0;
  const pct = party ? (party.isOverdue ? 100 : (total > 0 ? Math.min((party.timeElapsed / total) * 100, 100) : 0)) : 0;
  let barColor = '#10B981';
  if (party?.isOverdue) barColor = '#E11D48';
  else if (pct > 75) barColor = '#D97706';

  return (
    <foreignObject
      x={cardX} y={cardY} width={cardW} height={cardH + 4}
      style={{ pointerEvents: 'none', overflow: 'visible' }}
    >
      <div style={{
        background: '#fff',
        border: '1px solid #E7E5E4',
        borderRadius: 14,
        padding: '10px 13px',
        boxShadow: '0 8px 28px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.05)',
        fontFamily: 'Inter,-apple-system,sans-serif',
        color: '#1C1917',
        fontSize: 12,
        lineHeight: 1.5,
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>
            Table {table.table_number}
          </span>
          <span style={{
            fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 6,
            background: st.fill, color: st.text, border: `1px solid ${st.stroke}`,
          }}>
            {statusLabel(table.status)}
          </span>
        </div>

        {/* Meta */}
        <div style={{ color: '#78716C', fontSize: 11, marginTop: 2 }}>
          {table.capacity} seats &middot;{' '}
          {(table.shape || 'Round').charAt(0).toUpperCase() + (table.shape || 'round').slice(1)}{' '}
          &middot; {table.location || 'Indoor'}
        </div>

        {/* Occupied details */}
        {isOccupied && party && (
          <>
            <div style={{ marginTop: 7, fontWeight: 600, fontSize: 12 }}>
              {party.guestName} &middot; {party.partySize} guest{party.partySize !== 1 ? 's' : ''}
            </div>
            <div style={{ marginTop: 5, display: 'flex', alignItems: 'center', gap: 7 }}>
              <div style={{
                flex: 1, height: 4, borderRadius: 2, background: '#E7E5E4', overflow: 'hidden',
              }}>
                <div style={{
                  width: `${pct}%`, height: '100%', borderRadius: 2,
                  background: barColor, transition: 'width 0.3s ease',
                }} />
              </div>
              <span style={{ fontSize: 10, color: '#78716C', whiteSpace: 'nowrap' }}>
                {party.isOverdue ? 'Overdue' : `${formatTime(party.timeRemaining)} left`}
              </span>
            </div>
          </>
        )}

        {/* Joinable info */}
        {hasJoinable && (
          <div style={{
            marginTop: 6, paddingTop: 6,
            borderTop: '1px solid #E7E5E4',
            display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 10, color: '#78716C',
          }}>
            <span style={{ fontSize: 12 }}>&#x1F517;</span>
            <span>
              Join w/ Table {joinableNames.join(', ')} &middot; {combinedCapacity} seats
            </span>
          </div>
        )}
      </div>
    </foreignObject>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function FloorPlanView({
  tables,
  activeParties = [],
  onTableClick,
  compact = false,
}: FloorPlanViewProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const tablePartyMap = useMemo(() => {
    const map = new Map<string, PartyInfo>();
    activeParties.forEach(party => {
      (party.tables || []).forEach(tid => {
        map.set(tid, {
          guestName: party.customer_name,
          partySize: party.party_size,
          isVIP: (party as any).is_vip,
          specialOccasion: (party as any).special_occasion,
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
      <div className="text-center py-12 text-muted-stone">
        <p className="font-semibold text-base text-deep-charcoal">No tables set up yet</p>
        <p className="text-sm mt-2">
          Complete your onboarding or add tables in Settings to see your floor plan
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {Object.entries(tablesByLocation).map(([location, locTables]) => {
        const useAuto = !hasPositionData(locTables);
        const layout = useAuto ? autoLayoutTables(locTables) : null;

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

        return (
          <div key={location}>
            {/* Section header */}
            <div className="flex items-center gap-2 mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-burgundy flex-shrink-0" />
              <span className="text-sm font-semibold text-deep-charcoal">{location}</span>
              <span className="text-xs text-muted-stone font-normal ml-0.5">
                {locTables.length} table{locTables.length !== 1 ? 's' : ''}
              </span>
            </div>

            <div
              className="rounded-xl overflow-hidden border border-border-gray bg-white"
              style={{ maxWidth: '100%', overflowX: 'auto' }}
            >
              <svg
                width="100%"
                viewBox={`0 0 ${svgW} ${svgH}`}
                className="block"
                style={{
                  minHeight: compact ? 160 : 220,
                  minWidth: 280,
                  maxWidth: '100%',
                }}
              >
                <defs>
                  {/* Warm dot texture */}
                  <pattern id={`fpDots-${location}`} patternUnits="userSpaceOnUse" width="20" height="20">
                    <circle cx="10" cy="10" r="0.75" fill="#B5ADA4" opacity="0.28" />
                  </pattern>

                  {/* Table shadow */}
                  <filter id={`fpShad-${location}`} x="-8%" y="-8%" width="116%" height="124%">
                    <feDropShadow dx="0" dy="1.5" stdDeviation="3" floodColor="#7A6E65" floodOpacity="0.09" />
                  </filter>

                  {/* Hover shadow */}
                  <filter id={`fpShadHov-${location}`} x="-12%" y="-12%" width="124%" height="136%">
                    <feDropShadow dx="0" dy="3" stdDeviation="6" floodColor="#7A6E65" floodOpacity="0.15" />
                  </filter>
                </defs>

                {/* Background */}
                <rect width="100%" height="100%" fill="#F8F5F0" />
                <rect width="100%" height="100%" fill={`url(#fpDots-${location})`} />

                {/* ── Joinable connector lines ── */}
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
                        <line
                          key={pairKey}
                          x1={pos.x + pos.w / 2} y1={pos.y + pos.h / 2}
                          x2={linkedPos.x + linkedPos.w / 2} y2={linkedPos.y + linkedPos.h / 2}
                          stroke="#9F1239" strokeWidth="1.5"
                          strokeDasharray="5,4" opacity="0.4"
                        />,
                      );
                    });
                  });
                  return links;
                })()}

                {/* ── Tables ── */}
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
                      filter={isHovered
                        ? `url(#fpShadHov-${location})`
                        : `url(#fpShad-${location})`}
                    >
                      {/* Progress ring (occupied) */}
                      {isOccupied && party && (
                        <ProgressRing cx={cx} cy={cy} radius={ringR} party={party} />
                      )}

                      {/* Chairs */}
                      {renderChairs(cx, cy, w, h, table.capacity || 2, shape, st.chairFill)}

                      {/* Table shape */}
                      {isRound ? (
                        <circle cx={cx} cy={cy} r={w / 2}
                          fill={st.fill} stroke={st.stroke} strokeWidth={2} />
                      ) : shape === 'booth' ? (
                        <>
                          <rect x={x} y={y} width={w} height={h} rx={13}
                            fill={st.fill} stroke={st.stroke} strokeWidth={2} />
                          <rect x={x + 4} y={y + h - 8} width={w - 8} height={7}
                            rx={4} fill={st.stroke} opacity={0.08} />
                        </>
                      ) : (
                        <rect x={x} y={y} width={w} height={h}
                          rx={shape === 'rectangle' || shape === 'long' ? 9 : 13}
                          fill={st.fill} stroke={st.stroke} strokeWidth={2} />
                      )}

                      {/* Table number */}
                      <text
                        x={cx}
                        y={isOccupied && party ? cy - 7 : cy - 2}
                        textAnchor="middle" dominantBaseline="middle"
                        fill={st.text} fontSize={19} fontWeight={700}
                        fontFamily="Inter,-apple-system,sans-serif"
                      >
                        {table.table_number}
                      </text>

                      {/* Sub-label */}
                      <text
                        x={cx}
                        y={isOccupied && party ? cy + 11 : cy + 14}
                        textAnchor="middle" dominantBaseline="middle"
                        fill={st.text} fontSize={11} opacity={0.55}
                        fontFamily="Inter,-apple-system,sans-serif"
                      >
                        {isOccupied && party
                          ? party.guestName.split(' ')[0].substring(0, 9)
                          : `${table.capacity} seats`}
                      </text>

                      {/* VIP badge */}
                      {party?.isVIP && (
                        <g>
                          <circle cx={x + w - 1} cy={y + 1} r={9} fill="#CA8A04" />
                          <text x={x + w - 1} y={y + 2.5}
                            textAnchor="middle" dominantBaseline="middle"
                            fontSize={9} fontWeight={800} fill="#fff">
                            V
                          </text>
                        </g>
                      )}

                      {/* Joinable badge */}
                      {table.is_joinable && table.joinable_with?.length > 0 && (
                        <g>
                          <circle cx={x + 1} cy={y + 1} r={9} fill="#9F1239" opacity={0.9} />
                          <text x={x + 1} y={y + 2.5}
                            textAnchor="middle" dominantBaseline="middle"
                            fontSize={10} fill="#fff">
                            &#x26D3;
                          </text>
                        </g>
                      )}

                      {/* Invisible hit area */}
                      {isRound ? (
                        <circle cx={cx} cy={cy} r={ringR + 6} fill="transparent" />
                      ) : (
                        <rect x={x - 14} y={y - 14} width={w + 28} height={h + 28}
                          rx={16} fill="transparent" />
                      )}
                    </g>
                  );
                })}

                {/* ── Hover card (rendered last, on top) ── */}
                {hoveredPos && (
                  <HoverCard
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

import React, { useMemo, useState } from 'react';
import { colors as tc } from '../../utils/colors';
import type { Table, ActiveParty } from '../../types/host.types';

interface FloorPlanViewProps {
  tables: Table[];
  activeParties?: ActiveParty[];
  onTableClick?: (table: Table) => void;
  compact?: boolean;
  darkMode?: boolean;
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
    case 'occupied': return 'Occupied';
    case 'reserved': return 'Reserved';
    case 'being cleaned': return 'Cleaning';
    default: return s || 'Unknown';
  }
};

// ── Status colors ────────────────────────────────────────────────────────────

const getStatusStyle = (status: string, darkMode = false) => {
  const n = status?.toLowerCase() || '';
  if (darkMode) {
    switch (n) {
      case 'available':      return { bg: '#1a2e1a', border: '#22c55e', text: '#d1fae5', glow: '#22c55e' };
      case 'occupied':       return { bg: '#2e1a1a', border: '#ef4444', text: '#fecaca', glow: '#ef4444' };
      case 'reserved':       return { bg: '#2a1a3e', border: '#a855f7', text: '#e9d5ff', glow: '#a855f7' };
      case 'being cleaned':  return { bg: '#2e2a1a', border: '#f59e0b', text: '#fef3c7', glow: '#f59e0b' };
      default:               return { bg: tc.charcoalDark, border: '#78716c', text: '#d6d3d1', glow: '#78716c' };
    }
  }
  switch (n) {
    case 'available':      return { bg: '#f0fdf4', border: '#22c55e', text: '#14532d', glow: '#22c55e' };
    case 'occupied':       return { bg: '#fef2f2', border: '#ef4444', text: '#7f1d1d', glow: '#ef4444' };
    case 'reserved':       return { bg: '#faf5ff', border: '#a855f7', text: '#581c87', glow: '#a855f7' };
    case 'being cleaned':  return { bg: '#fffbeb', border: '#f59e0b', text: '#78350f', glow: '#f59e0b' };
    default:               return { bg: '#fafaf9', border: '#a8a29e', text: '#44403c', glow: '#a8a29e' };
  }
};

// ── Table sizing ─────────────────────────────────────────────────────────────

const getTableSize = (table: Table) => {
  const cap = table.capacity || 2;
  const shape = table.shape?.toLowerCase() || 'round';
  if (shape === 'round' || shape === 'circle') {
    const s = cap <= 2 ? 78 : cap <= 4 ? 94 : 110;
    return { w: s, h: s };
  }
  if (shape === 'booth')
    return { w: cap <= 4 ? 110 : 130, h: cap <= 4 ? 70 : 78 };
  if (shape === 'rectangle' || shape === 'long')
    return { w: cap <= 4 ? 118 : 150, h: 70 };
  const s = cap <= 2 ? 78 : cap <= 4 ? 94 : 110;
  return { w: s, h: s };
};

// ── Layout ───────────────────────────────────────────────────────────────────

const hasPositionData = (tables: Table[]) =>
  tables.some(t =>
    (t.position_x !== undefined && t.position_x !== null && t.position_x !== 0) ||
    (t.position_y !== undefined && t.position_y !== null && t.position_y !== 0)
  );

const autoLayoutTables = (tables: Table[]) => {
  const GAP = 36;
  const PAD = 24;
  const W = 900;
  const sorted = [...tables].sort((a, b) => (Number(a.table_number) || 0) - (Number(b.table_number) || 0));
  const out: { table: Table; x: number; y: number; w: number; h: number }[] = [];
  let curX = PAD, curY = PAD, rowH = 0;

  sorted.forEach(table => {
    const size = getTableSize(table);
    if (curX + size.w + PAD > W && curX > PAD) {
      curX = PAD;
      curY += rowH + GAP;
      rowH = 0;
    }
    out.push({ table, x: curX, y: curY, w: size.w, h: size.h });
    curX += size.w + GAP;
    rowH = Math.max(rowH, size.h);
  });

  return { positions: out, totalWidth: W, totalHeight: curY + rowH + PAD + 30 };
};

// ── Chairs ───────────────────────────────────────────────────────────────────

const renderChairs = (
  cx: number, cy: number, w: number, h: number,
  capacity: number, shape: string, color: string
) => {
  const chairs: React.ReactElement[] = [];
  const isRound = shape === 'round' || shape === 'circle';
  const r = 4.5;
  const gap = 8;

  if (isRound) {
    const orbit = w / 2 + gap + r;
    for (let i = 0; i < capacity; i++) {
      const a = (2 * Math.PI * i) / capacity - Math.PI / 2;
      chairs.push(
        <circle key={`c${i}`} cx={cx + orbit * Math.cos(a)} cy={cy + orbit * Math.sin(a)}
          r={r} fill={color} opacity={0.28} />
      );
    }
  } else {
    const halfH = h / 2 + gap + r;
    const top = Math.ceil(capacity / 2);
    const bot = capacity - top;
    for (let i = 0; i < top; i++) {
      const xp = cx - w / 2 + (w / (top + 1)) * (i + 1);
      chairs.push(<circle key={`ct${i}`} cx={xp} cy={cy - halfH} r={r} fill={color} opacity={0.28} />);
    }
    for (let i = 0; i < bot; i++) {
      const xp = cx - w / 2 + (w / (bot + 1)) * (i + 1);
      chairs.push(<circle key={`cb${i}`} cx={xp} cy={cy + halfH} r={r} fill={color} opacity={0.28} />);
    }
  }
  return chairs;
};

// ── Animation CSS (injected into SVG <defs>) ────────────────────────────────

const ANIM_CSS = `
  @keyframes fpPulse   { 0%,100%{ opacity:0 }    50%{ opacity:0.22 } }
  @keyframes fpGlow    { 0%,100%{ opacity:0.1 }   50%{ opacity:0.28 } }
  @keyframes fpSweep   { 0%,100%{ opacity:0.12 }  50%{ opacity:0.35 } }
  @keyframes fpDash    { to { stroke-dashoffset: -24 } }
  @keyframes fpOverdue { 0%,100%{ opacity:0.35; stroke-width:2.5 } 50%{ opacity:1; stroke-width:3.5 } }
  @keyframes fpCardIn  { from { opacity:0 } to { opacity:1 } }
  @keyframes fpLinkDash { to { stroke-dashoffset: -20 } }
  .fp-avail  { animation: fpPulse 3s ease-in-out infinite }
  .fp-occup  { animation: fpGlow 2.5s ease-in-out infinite }
  .fp-clean  { animation: fpSweep 1.8s ease-in-out infinite }
  .fp-rsv    { stroke-dasharray:10 5; animation: fpDash 0.8s linear infinite }
  .fp-over   { animation: fpOverdue 1s ease-in-out infinite }
  .fp-card   { animation: fpCardIn 0.15s ease-out }
`;

// ── Progress Ring ────────────────────────────────────────────────────────────

function ProgressRing({ cx, cy, radius, party }: {
  cx: number; cy: number; radius: number; party: PartyInfo;
}) {
  const total = party.timeElapsed + party.timeRemaining;
  const progress = party.isOverdue ? 1 : (total > 0 ? Math.min(party.timeElapsed / total, 1) : 0);
  const circ = 2 * Math.PI * radius;
  const offset = circ * (1 - progress);

  let color = '#22c55e';
  if (party.isOverdue) color = '#ef4444';
  else if (progress > 0.75) color = '#f59e0b';
  else if (progress > 0.5) color = '#eab308';

  return (
    <g>
      {/* Track */}
      <circle cx={cx} cy={cy} r={radius} fill="none"
        stroke={color} strokeWidth={2.5} opacity={0.1} />
      {/* Arc */}
      <circle cx={cx} cy={cy} r={radius} fill="none"
        stroke={color} strokeWidth={2.5} opacity={0.65}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
        className={party.isOverdue ? 'fp-over' : ''} />
      {/* Time label */}
      <text x={cx} y={cy - radius - 5} textAnchor="middle"
        fontSize={9} fontWeight={600} fill={color}
        fontFamily="system-ui,-apple-system,sans-serif">
        {party.isOverdue
          ? `+${formatTime(party.timeElapsed - (party.timeElapsed + party.timeRemaining))} over`
          : formatTime(party.timeElapsed)}
      </text>
    </g>
  );
}

// ── Hover Card ───────────────────────────────────────────────────────────────

function HoverCard({ table, party, x, y, w, h, svgW, darkMode, allTables }: {
  table: Table; party?: PartyInfo;
  x: number; y: number; w: number; h: number;
  svgW: number; darkMode: boolean; allTables?: Table[];
}) {
  const style = getStatusStyle(table.status, darkMode);
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
  const cardW = 200;
  const cardH = isOccupied ? (hasJoinable ? 148 : 118) : (hasJoinable ? 106 : 76);
  const cx = x + w / 2;

  const showBelow = y < cardH + 24;
  const cardX = Math.max(6, Math.min(cx - cardW / 2, svgW - cardW - 6));
  const cardY = showBelow ? y + h + 20 : y - cardH - 20;

  // Progress percentage
  const total = party ? party.timeElapsed + party.timeRemaining : 0;
  const pct = party ? (party.isOverdue ? 100 : (total > 0 ? Math.min((party.timeElapsed / total) * 100, 100) : 0)) : 0;
  let barColor = '#22c55e';
  if (party?.isOverdue) barColor = '#ef4444';
  else if (pct > 75) barColor = '#f59e0b';

  return (
    <foreignObject x={cardX} y={cardY} width={cardW} height={cardH + 4}
      className="fp-card" style={{ pointerEvents: 'none', overflow: 'visible' }}>
      <div style={{
        background: darkMode ? tc.charcoalDark : '#fff',
        border: `1px solid ${darkMode ? '#44403C' : '#e7e5e4'}`,
        borderRadius: 12,
        padding: '10px 14px',
        boxShadow: '0 8px 30px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
        fontFamily: 'system-ui,-apple-system,sans-serif',
        color: darkMode ? '#fafaf9' : '#1c1917',
        fontSize: 12, lineHeight: 1.5,
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>Table {table.table_number}</span>
          <span style={{
            fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
            background: style.bg, color: style.text,
            border: `1px solid ${style.border}`,
          }}>
            {statusLabel(table.status)}
          </span>
        </div>

        {/* Meta */}
        <div style={{ color: darkMode ? '#a8a29e' : '#78716c', fontSize: 11, marginTop: 2 }}>
          {table.capacity} seats &middot; {(table.shape || 'Round').charAt(0).toUpperCase() + (table.shape || 'round').slice(1)} &middot; {table.location || 'Indoor'}
        </div>

        {/* Occupied details */}
        {isOccupied && party && (
          <>
            <div style={{ marginTop: 7, fontWeight: 600, fontSize: 12 }}>
              {party.guestName} &middot; {party.partySize} guest{party.partySize !== 1 ? 's' : ''}
            </div>
            {/* Progress bar */}
            <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                flex: 1, height: 5, borderRadius: 3,
                background: darkMode ? '#44403C' : '#e7e5e4',
                overflow: 'hidden',
              }}>
                <div style={{
                  width: `${pct}%`, height: '100%', borderRadius: 3,
                  background: barColor,
                  transition: 'width 0.3s ease',
                }} />
              </div>
              <span style={{ fontSize: 10, color: darkMode ? '#a8a29e' : '#78716c', whiteSpace: 'nowrap' }}>
                {party.isOverdue ? 'Overdue' : `${formatTime(party.timeRemaining)} left`}
              </span>
            </div>
          </>
        )}

        {/* Joinable info */}
        {hasJoinable && (
          <div style={{
            marginTop: 6, paddingTop: 6,
            borderTop: `1px solid ${darkMode ? '#44403C' : '#e7e5e4'}`,
            display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 10, color: darkMode ? '#a8a29e' : '#78716c',
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

// ── Main Component ───────────────────────────────────────────────────────────

export default function FloorPlanView({
  tables, activeParties = [], onTableClick, compact = false, darkMode = false,
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
      <div className={`text-center py-12 ${darkMode ? 'text-muted-stone' : 'text-stone-gray'}`}>
        <p className={`font-semibold text-lg ${darkMode ? 'text-white' : 'text-deep-charcoal'}`}>
          No tables set up yet
        </p>
        <p className="text-sm mt-2">Complete your restaurant onboarding or add tables in Settings to see your floor plan</p>
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
            <h3 className={`text-sm font-semibold mb-3 flex items-center gap-2 ${
              darkMode ? 'text-white' : 'text-deep-charcoal'
            }`}>
              <span className={`w-2 h-2 rounded-full ${darkMode ? 'bg-muted-stone' : 'bg-burgundy'}`} />
              {location}
              <span className={`text-xs font-normal ${darkMode ? 'text-warm-stone' : 'text-muted-stone'}`}>
                {locTables.length} tables
              </span>
            </h3>

            <div className={`rounded-xl overflow-hidden border ${
              darkMode ? 'bg-deep-charcoal border-[#44403C]' : 'bg-white border-border-gray'
            }`} style={{ maxWidth: '100%', overflowX: 'auto' }}>
              <svg
                width="100%"
                viewBox={`0 0 ${svgW} ${svgH}`}
                className="block"
                style={{ minHeight: compact ? 180 : 240, minWidth: 320, maxWidth: '100%' }}
              >
                <defs>
                  <style>{ANIM_CSS}</style>
                  <filter id="fpShad" x="-8%" y="-8%" width="116%" height="124%">
                    <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#000" floodOpacity="0.07" />
                  </filter>
                  <filter id="fpShadHov" x="-12%" y="-12%" width="124%" height="136%">
                    <feDropShadow dx="0" dy="4" stdDeviation="8" floodColor="#000" floodOpacity="0.13" />
                  </filter>
                  <pattern id="fpFloor" patternUnits="userSpaceOnUse" width="24" height="24">
                    <circle cx="12" cy="12" r="0.7"
                      fill={darkMode ? '#44403C' : '#d6d3d1'} opacity="0.35" />
                  </pattern>
                </defs>

                <rect width="100%" height="100%" fill="url(#fpFloor)" />

                {/* ── Joinable connector lines (behind tables) ── */}
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
                          stroke={tc.burgundy} strokeWidth="2"
                          strokeDasharray="6,4" opacity="0.5"
                          style={{ animation: 'fpLinkDash 1.2s linear infinite' }}
                        />
                      );
                    });
                  });
                  return links;
                })()}

                {/* ── Render each table ── */}
                {positions.map(({ table, x, y, w, h }) => {
                  const st = getStatusStyle(table.status, darkMode);
                  const shape = table.shape?.toLowerCase() || 'round';
                  const isRound = shape === 'round' || shape === 'circle';
                  const cx = x + w / 2;
                  const cy = y + h / 2;
                  const party = tablePartyMap.get(table.id);
                  const status = table.status?.toLowerCase() || '';
                  const isHovered = table.id === hoveredId;
                  const isOccupied = status === 'occupied';

                  const glowClass =
                    status === 'available' ? 'fp-avail' :
                    status === 'occupied' ? 'fp-occup' :
                    status === 'being cleaned' ? 'fp-clean' : '';

                  const ringR = Math.max(w, h) / 2 + 12;

                  return (
                    <g
                      key={table.id}
                      className="cursor-pointer"
                      onClick={() => onTableClick?.(table)}
                      onMouseEnter={() => setHoveredId(table.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      filter={isHovered ? 'url(#fpShadHov)' : 'url(#fpShad)'}
                    >
                      {/* ─ Animated glow aura ─ */}
                      {isRound ? (
                        <circle cx={cx} cy={cy} r={w / 2 + 8}
                          fill={st.glow} className={glowClass} />
                      ) : (
                        <rect x={x - 8} y={y - 8} width={w + 16} height={h + 16}
                          rx={18} fill={st.glow} className={glowClass} />
                      )}

                      {/* ─ Progress ring (occupied only) ─ */}
                      {isOccupied && party && (
                        <ProgressRing cx={cx} cy={cy} radius={ringR} party={party} />
                      )}

                      {/* ─ Chairs ─ */}
                      {renderChairs(cx, cy, w, h, table.capacity || 2, shape, st.border)}

                      {/* ─ Table shape ─ */}
                      {isRound ? (
                        <circle cx={cx} cy={cy} r={w / 2}
                          fill={st.bg} stroke={st.border} strokeWidth={2.5}
                          className={status === 'reserved' ? 'fp-rsv' : ''} />
                      ) : shape === 'booth' ? (
                        <>
                          <rect x={x} y={y} width={w} height={h} rx={14}
                            fill={st.bg} stroke={st.border} strokeWidth={2.5}
                            className={status === 'reserved' ? 'fp-rsv' : ''} />
                          <rect x={x + 3} y={y + h - 9} width={w - 6} height={8}
                            rx={4} fill={st.border} opacity={0.1} />
                        </>
                      ) : (
                        <rect x={x} y={y} width={w} height={h}
                          rx={shape === 'rectangle' || shape === 'long' ? 10 : 14}
                          fill={st.bg} stroke={st.border} strokeWidth={2.5}
                          className={status === 'reserved' ? 'fp-rsv' : ''} />
                      )}

                      {/* ─ Table number ─ */}
                      <text
                        x={cx}
                        y={isOccupied && party ? cy - 5 : cy}
                        textAnchor="middle" dominantBaseline="middle"
                        fill={st.text} fontSize={18} fontWeight={700}
                        fontFamily="system-ui,-apple-system,sans-serif"
                      >
                        {table.table_number}
                      </text>

                      {/* ─ Sub-label ─ */}
                      <text
                        x={cx}
                        y={isOccupied && party ? cy + 12 : cy + 17}
                        textAnchor="middle" dominantBaseline="middle"
                        fill={st.text} fontSize={10} opacity={0.55}
                        fontFamily="system-ui,-apple-system,sans-serif"
                      >
                        {isOccupied && party
                          ? party.guestName.split(' ')[0].substring(0, 9)
                          : `${table.capacity} seats`}
                      </text>

                      {/* ─ VIP badge ─ */}
                      {party?.isVIP && (
                        <g>
                          <circle cx={x + w - 2} cy={y + 2} r={9} fill="#eab308" />
                          <text x={x + w - 2} y={y + 3.5} textAnchor="middle"
                            dominantBaseline="middle" fontSize={10} fontWeight={800} fill="#422006">
                            V
                          </text>
                        </g>
                      )}

                      {/* ─ Joinable badge ─ */}
                      {table.is_joinable && table.joinable_with?.length > 0 && (
                        <g>
                          <circle cx={x + 2} cy={y + 2} r={9}
                            fill={darkMode ? '#7f1d1d' : tc.burgundy} opacity={0.9} />
                          <text x={x + 2} y={y + 3.5} textAnchor="middle"
                            dominantBaseline="middle" fontSize={11} fill="#fff">
                            &#x26D3;
                          </text>
                        </g>
                      )}

                      {/* ─ Invisible hit area ─ */}
                      {isRound ? (
                        <circle cx={cx} cy={cy} r={ringR + 4} fill="transparent" />
                      ) : (
                        <rect x={x - 16} y={y - 16} width={w + 32} height={h + 32}
                          rx={18} fill="transparent" />
                      )}
                    </g>
                  );
                })}

                {/* ── Hover card (rendered last so it's on top) ── */}
                {hoveredPos && (
                  <HoverCard
                    table={hoveredPos.table}
                    party={tablePartyMap.get(hoveredPos.table.id)}
                    x={hoveredPos.x} y={hoveredPos.y}
                    w={hoveredPos.w} h={hoveredPos.h}
                    svgW={svgW}
                    darkMode={darkMode}
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

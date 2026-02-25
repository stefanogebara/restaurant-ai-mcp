import type { RefObject } from 'react';
import ThiingsIcon from '../common/ThiingsIcon';
import type { Table } from '../../types/host.types';
import {
  CELL, SVG_W, SVG_H, TABLE_VISUAL_SCALE,
  EDITOR_CSS, getStatusStyle, getTablePxSize, snapToGrid,
} from './floorPlanConstants';

// ── Chair rendering ───────────────────────────────────────────────────────────

function renderChairs(
  cx: number, cy: number, w: number, h: number,
  capacity: number, shape: string, chairFill: string,
) {
  const chairs: React.ReactElement[] = [];
  const isRound = shape === 'round' || shape === 'circle' || shape === 'bar-stool';
  const r = 5, gap = 7;

  if (isRound) {
    const orbit = w / 2 + gap + r;
    for (let i = 0; i < capacity; i++) {
      const a = (2 * Math.PI * i) / capacity - Math.PI / 2;
      chairs.push(
        <circle key={`c${i}`}
          cx={cx + orbit * Math.cos(a)} cy={cy + orbit * Math.sin(a)}
          r={r} fill={chairFill} opacity={0.22} />,
      );
    }
  } else {
    const halfH = h / 2 + gap + r;
    const top = Math.ceil(capacity / 2);
    const bot = capacity - top;
    for (let i = 0; i < top; i++) {
      const xp = cx - w / 2 + (w / (top + 1)) * (i + 1);
      chairs.push(<circle key={`ct${i}`} cx={xp} cy={cy - halfH} r={r} fill={chairFill} opacity={0.22} />);
    }
    for (let i = 0; i < bot; i++) {
      const xp = cx - w / 2 + (w / (bot + 1)) * (i + 1);
      chairs.push(<circle key={`cb${i}`} cx={xp} cy={cy + halfH} r={r} fill={chairFill} opacity={0.22} />);
    }
  }
  return chairs;
}

// ── Canvas props ──────────────────────────────────────────────────────────────

interface Props {
  filteredTables: Table[];
  isLoading: boolean;
  activeLocation: string;
  draggingId: string | null;
  dragPos: { x: number; y: number } | null;
  autoPositions: Map<string, { gx: number; gy: number }>;
  posMap: Map<string, { cx: number; cy: number }>;
  linkMode: boolean;
  linkSource: string | null;
  selectedTableId: string | null;
  svgRef: RefObject<SVGSVGElement>;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: () => void;
  onPointerDown: (e: React.PointerEvent, table: Table) => void;
  onTableClick: (e: React.MouseEvent, table: Table) => void;
}

export default function FloorPlanCanvas({
  filteredTables, isLoading, activeLocation,
  draggingId, dragPos, autoPositions, posMap,
  linkMode, linkSource, selectedTableId,
  svgRef, onPointerMove, onPointerUp, onPointerDown, onTableClick,
}: Props) {
  return (
    <div
      className="rounded-2xl border border-border-gray overflow-hidden"
      style={{ background: '#F5F2EC' }}
    >
      {isLoading ? (
        <div role="status" aria-label="Loading floor plan" className="flex items-center justify-center" style={{ height: 420 }}>
          <div aria-hidden="true" className="animate-spin rounded-full h-7 w-7 border-2 border-border-gray border-t-burgundy" />
        </div>
      ) : filteredTables.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-20 px-6">
          <div className="w-16 h-16 rounded-2xl bg-white border border-border-gray flex items-center justify-center mb-5 shadow-sm">
            <span className="text-muted-stone"><ThiingsIcon name="map" pxSize={30} /></span>
          </div>
          <p className="font-semibold text-deep-charcoal text-base">No tables in {activeLocation}</p>
          <p className="text-sm text-warm-stone mt-1.5 max-w-[260px]">
            Click "Add Table" to start building your floor plan
          </p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <svg
            ref={svgRef}
            width="100%"
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            className="block select-none"
            style={{ minHeight: 380, minWidth: 400, maxWidth: '100%', touchAction: 'none' }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          >
            <defs>
              <style>{EDITOR_CSS}</style>
              <pattern id="edDots" patternUnits="userSpaceOnUse" width="20" height="20">
                <circle cx="10" cy="10" r="0.85" fill="#B5ADA4" opacity="0.32" />
              </pattern>
              <pattern id="edGrid" patternUnits="userSpaceOnUse" width={CELL} height={CELL}>
                <path d={`M ${CELL} 0 L 0 0 0 ${CELL}`} fill="none" stroke="rgba(155,145,136,0.15)" strokeWidth="0.5" />
              </pattern>
              <filter id="edShad" x="-12%" y="-12%" width="124%" height="134%">
                <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#7A6E65" floodOpacity="0.1" />
              </filter>
              <filter id="edShadDrag" x="-16%" y="-16%" width="132%" height="148%">
                <feDropShadow dx="0" dy="7" stdDeviation="10" floodColor="#7A6E65" floodOpacity="0.2" />
              </filter>
            </defs>

            {/* Canvas background */}
            <rect width="100%" height="100%" fill="#F5F2EC" />
            <rect width="100%" height="100%" fill="url(#edDots)" />
            <rect width="100%" height="100%" fill="url(#edGrid)" />

            {/* ── Joinable link lines (behind tables) ── */}
            {(() => {
              const lines: React.ReactElement[] = [];
              const processed = new Set<string>();
              filteredTables.forEach(t => {
                if (!t.is_joinable || !t.joinable_with?.length) return;
                t.joinable_with.forEach(linkedId => {
                  const key = [t.id, linkedId].sort().join('-');
                  if (processed.has(key)) return;
                  processed.add(key);
                  const a = posMap.get(t.id);
                  const b = posMap.get(linkedId);
                  if (!a || !b) return;
                  lines.push(
                    <line key={key}
                      x1={a.cx} y1={a.cy} x2={b.cx} y2={b.cy}
                      stroke="#9F1239" strokeWidth="1.5"
                      strokeDasharray="5,4" opacity="0.4"
                      style={{ animation: 'fpLinkDash 1.5s linear infinite' }}
                    />,
                  );
                });
              });
              return lines;
            })()}

            {/* ── Tables ── */}
            {filteredTables.map(table => {
              const isDragging = table.id === draggingId;
              const { w, h } = getTablePxSize(table);
              const vw = w * TABLE_VISUAL_SCALE;
              const vh = h * TABLE_VISUAL_SCALE;

              let x: number, y: number;
              if (isDragging && dragPos) {
                x = dragPos.x; y = dragPos.y;
              } else {
                const autoPos = autoPositions.get(table.id);
                const gx = autoPos ? autoPos.gx : (table.position_x || 0);
                const gy = autoPos ? autoPos.gy : (table.position_y || 0);
                x = gx * CELL; y = gy * CELL;
              }

              const cx = x + w / 2, cy = y + h / 2;
              const vx = cx - vw / 2, vy = cy - vh / 2;
              const st = getStatusStyle(table.status);
              const shape = table.shape?.toLowerCase() || 'round';
              const isRound = shape === 'round' || shape === 'circle' || shape === 'bar-stool';
              const isLinkSource = linkSource === table.id;
              const isSelected = selectedTableId === table.id;

              return (
                <g
                  key={table.id}
                  className={linkMode ? 'cursor-pointer' : 'cursor-grab'}
                  style={{ opacity: isDragging ? 0.8 : 1 }}
                  filter={isDragging ? 'url(#edShadDrag)' : 'url(#edShad)'}
                  onPointerDown={e => onPointerDown(e, table)}
                  onClick={e => onTableClick(e, table)}
                >
                  {/* Selection / link-source ring */}
                  {(isSelected || isLinkSource) && (
                    isRound ? (
                      <circle cx={cx} cy={cy} r={vw / 2 + 7}
                        fill="none" stroke="#9F1239"
                        strokeWidth={isLinkSource ? 2.5 : 1.5} opacity={0.65}
                        className={isLinkSource ? 'link-active' : ''} />
                    ) : (
                      <rect x={vx - 7} y={vy - 7} width={vw + 14} height={vh + 14}
                        rx={20} fill="none" stroke="#9F1239"
                        strokeWidth={isLinkSource ? 2.5 : 1.5} opacity={0.65}
                        className={isLinkSource ? 'link-active' : ''} />
                    )
                  )}

                  {/* Link mode hover ring */}
                  {linkMode && !isLinkSource && !isSelected && (
                    isRound ? (
                      <circle cx={cx} cy={cy} r={vw / 2 + 6}
                        fill="none" stroke="#9F1239" strokeWidth={1} opacity={0.18} />
                    ) : (
                      <rect x={vx - 6} y={vy - 6} width={vw + 12} height={vh + 12}
                        rx={18} fill="none" stroke="#9F1239" strokeWidth={1} opacity={0.18} />
                    )
                  )}

                  {/* Chairs */}
                  {renderChairs(cx, cy, vw, vh, table.capacity || 2, shape, st.chairFill)}

                  {/* Table body */}
                  {isRound ? (
                    <circle cx={cx} cy={cy} r={vw / 2} fill={st.fill} stroke={st.stroke} strokeWidth={1.75} />
                  ) : shape === 'booth' ? (
                    <>
                      <rect x={vx} y={vy} width={vw} height={vh} rx={14}
                        fill={st.fill} stroke={st.stroke} strokeWidth={1.75} />
                      <rect x={vx + 5} y={vy + vh - 9} width={vw - 10} height={7}
                        rx={4} fill={st.stroke} opacity={0.09} />
                    </>
                  ) : (
                    <rect x={vx} y={vy} width={vw} height={vh}
                      rx={shape === 'rectangle' || shape === 'oval' ? 10 : 12}
                      fill={st.fill} stroke={st.stroke} strokeWidth={1.75} />
                  )}

                  {/* Table number */}
                  <text x={cx} y={cy - 5} textAnchor="middle" dominantBaseline="middle"
                    fill={st.text} fontSize={15} fontWeight={700}
                    fontFamily="Inter,-apple-system,sans-serif" style={{ pointerEvents: 'none' }}>
                    {table.table_number}
                  </text>

                  {/* Capacity label */}
                  <text x={cx} y={cy + 12} textAnchor="middle" dominantBaseline="middle"
                    fill={st.text} fontSize={9} opacity={0.5}
                    fontFamily="Inter,-apple-system,sans-serif" style={{ pointerEvents: 'none' }}>
                    {table.capacity} seats
                  </text>

                  {/* Joinable badge */}
                  {table.is_joinable && table.joinable_with?.length > 0 && (
                    <g>
                      <circle cx={vx + 3} cy={vy + 3} r={9} fill="#9F1239" opacity={0.9} />
                      <text x={vx + 3} y={vy + 4.5} textAnchor="middle" dominantBaseline="middle"
                        fontSize={10} fill="#fff" style={{ pointerEvents: 'none' }}>
                        &#x26D3;
                      </text>
                    </g>
                  )}

                  {/* Invisible hit area */}
                  {isRound ? (
                    <circle cx={cx} cy={cy} r={vw / 2 + 14} fill="transparent" />
                  ) : (
                    <rect x={vx - 14} y={vy - 14} width={vw + 28} height={vh + 28}
                      rx={16} fill="transparent" />
                  )}
                </g>
              );
            })}

            {/* ── Snap indicator while dragging ── */}
            {draggingId && dragPos && (() => {
              const { gx, gy } = snapToGrid(dragPos.x, dragPos.y);
              return (
                <rect
                  x={gx * CELL} y={gy * CELL} width={CELL} height={CELL}
                  fill="rgba(159,18,57,0.04)" stroke="rgba(159,18,57,0.3)"
                  strokeWidth={1.5} rx={5} style={{ pointerEvents: 'none' }}
                />
              );
            })()}
          </svg>
        </div>
      )}
    </div>
  );
}

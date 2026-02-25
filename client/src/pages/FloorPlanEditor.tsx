import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { hostAPI } from '../services/api';
import DashboardLayout from '../components/layout/DashboardLayout';
import ThiingsIcon from '../components/common/ThiingsIcon';
import type { Table, TableShape } from '../types/host.types';
import { getTableSize as getTableGridSize } from '../types/host.types';

// ── Grid Constants ───────────────────────────────────────────────────────────

const CELL = 40;
const GRID_COLS = 24;
const GRID_ROWS = 20;
const SVG_W = CELL * GRID_COLS;
const SVG_H = CELL * GRID_ROWS;
const TABLE_VISUAL_SCALE = 1.3;

// ── Light Status Palette ─────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, {
  fill: string; stroke: string; text: string; chairFill: string;
}> = {
  available: { fill: '#ECFDF5', stroke: '#10B981', text: '#064E3B', chairFill: '#10B981' },
  occupied:  { fill: '#FFF1F2', stroke: '#E11D48', text: '#881337', chairFill: '#E11D48' },
  reserved:  { fill: '#F5F3FF', stroke: '#7C3AED', text: '#3730A3', chairFill: '#7C3AED' },
  cleaning:  { fill: '#FFFBEB', stroke: '#D97706', text: '#78350F', chairFill: '#D97706' },
  default:   { fill: '#FAFAF9', stroke: '#A8A29E', text: '#57534E', chairFill: '#A8A29E' },
};

const getStatusKey = (status: string): string => {
  const s = status?.toLowerCase() || '';
  if (s === 'being cleaned') return 'cleaning';
  if (STATUS_STYLES[s]) return s;
  return 'default';
};

const getStatusStyle = (status: string) =>
  STATUS_STYLES[getStatusKey(status)] ?? STATUS_STYLES.default;

// ── Table pixel size ─────────────────────────────────────────────────────────

function getTablePxSize(table: Table) {
  const shape = (table.shape?.toLowerCase() || 'round') as TableShape;
  const gridSize = getTableGridSize(shape, table.capacity || 2);
  return { w: gridSize.width * CELL, h: gridSize.height * CELL };
}

// ── Chair Rendering ──────────────────────────────────────────────────────────

function renderChairs(
  cx: number, cy: number, w: number, h: number,
  capacity: number, shape: string, chairFill: string,
) {
  const chairs: React.ReactElement[] = [];
  const isRound = shape === 'round' || shape === 'circle' || shape === 'bar-stool';
  const r = 5;
  const gap = 7;

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
      chairs.push(
        <circle key={`ct${i}`} cx={xp} cy={cy - halfH}
          r={r} fill={chairFill} opacity={0.22} />,
      );
    }
    for (let i = 0; i < bot; i++) {
      const xp = cx - w / 2 + (w / (bot + 1)) * (i + 1);
      chairs.push(
        <circle key={`cb${i}`} cx={xp} cy={cy + halfH}
          r={r} fill={chairFill} opacity={0.22} />,
      );
    }
  }
  return chairs;
}

// ── Editor CSS ───────────────────────────────────────────────────────────────

const EDITOR_CSS = `
  @keyframes fpLinkDash { to { stroke-dashoffset: -20 } }
  @keyframes linkPulse { 0%,100% { opacity:0.6 } 50% { opacity:1 } }
  .link-active { animation: linkPulse 1.2s ease-in-out infinite }
`;

// ── Shapes & Capacities ──────────────────────────────────────────────────────

const SHAPES: { value: TableShape; label: string }[] = [
  { value: 'round',     label: 'Round' },
  { value: 'square',    label: 'Square' },
  { value: 'rectangle', label: 'Rectangle' },
  { value: 'booth',     label: 'Booth' },
  { value: 'bar-stool', label: 'Bar Stool' },
];

const CAPACITIES = [2, 4, 6, 8, 10];

// ── Add Table Modal ──────────────────────────────────────────────────────────

interface AddTableModalProps {
  onClose: () => void;
  onAdd: (data: {
    table_number: number; capacity: number; shape: string;
    location: string; position_x: number; position_y: number;
  }) => void;
  nextNumber: number;
  locations: string[];
  activeLocation: string;
  tables: Table[];
}

function AddTableModal({
  onClose, onAdd, nextNumber, locations, activeLocation, tables,
}: AddTableModalProps) {
  const [tableNumber, setTableNumber] = useState(nextNumber);
  const [capacity, setCapacity] = useState(4);
  const [shape, setShape] = useState<TableShape>('round');
  const [location, setLocation] = useState(activeLocation);
  const [newLocation, setNewLocation] = useState('');
  const [showNewLoc, setShowNewLoc] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const loc = showNewLoc && newLocation.trim() ? newLocation.trim() : location;
    const occupied = new Set(
      tables.filter(t => (t.location || 'Main') === loc)
        .map(t => `${t.position_x},${t.position_y}`),
    );
    let px = 1, py = 1;
    for (let row = 1; row < GRID_ROWS - 1; row++) {
      for (let col = 1; col < GRID_COLS - 2; col++) {
        if (!occupied.has(`${col},${row}`)) {
          px = col; py = row; row = GRID_ROWS; break;
        }
      }
    }
    onAdd({ table_number: tableNumber, capacity, shape, location: loc, position_x: px, position_y: py });
  };

  return (
    <div
      className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-border-gray"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-border-gray flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-deep-charcoal">Add Table</h2>
            <p className="text-xs text-warm-stone mt-0.5">Configure the new table</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 hover:bg-soft-gray rounded-xl transition-colors text-muted-stone hover:text-stone-gray"
          >
            <ThiingsIcon name="close" pxSize={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Table Number */}
          <div>
            <label className="block text-[11px] font-semibold text-warm-stone mb-1.5 uppercase tracking-wider">
              Table Number
            </label>
            <input
              type="number"
              value={tableNumber}
              onChange={e => setTableNumber(Number(e.target.value))}
              min={1}
              className="w-full px-3 py-2.5 border border-border-gray rounded-xl text-sm text-deep-charcoal focus:outline-none focus:ring-2 focus:ring-burgundy/20 focus:border-burgundy transition-colors"
            />
          </div>

          {/* Capacity */}
          <div>
            <label className="block text-[11px] font-semibold text-warm-stone mb-2 uppercase tracking-wider">
              Capacity
            </label>
            <div className="flex gap-2">
              {CAPACITIES.map(c => (
                <button key={c} type="button" onClick={() => setCapacity(c)}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all ${
                    capacity === c
                      ? 'bg-burgundy text-white border-burgundy'
                      : 'bg-white text-stone-gray border-border-gray hover:border-burgundy/40'
                  }`}>
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Shape */}
          <div>
            <label className="block text-[11px] font-semibold text-warm-stone mb-2 uppercase tracking-wider">
              Shape
            </label>
            <div className="grid grid-cols-3 gap-2">
              {SHAPES.map(s => (
                <button key={s.value} type="button" onClick={() => setShape(s.value)}
                  className={`py-2 px-3 rounded-xl text-sm font-medium border transition-all ${
                    shape === s.value
                      ? 'bg-burgundy text-white border-burgundy'
                      : 'bg-white text-stone-gray border-border-gray hover:border-burgundy/40'
                  }`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="block text-[11px] font-semibold text-warm-stone mb-2 uppercase tracking-wider">
              Section
            </label>
            {!showNewLoc ? (
              <div className="flex gap-2">
                <select
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                  className="flex-1 px-3 py-2.5 border border-border-gray rounded-xl text-sm text-deep-charcoal focus:outline-none focus:ring-2 focus:ring-burgundy/20 focus:border-burgundy transition-colors"
                >
                  {locations.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
                <button
                  type="button"
                  onClick={() => setShowNewLoc(true)}
                  className="px-3 py-2.5 border border-border-gray rounded-xl text-sm text-stone-gray hover:border-burgundy/40 transition-colors"
                >
                  + New
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text" value={newLocation}
                  onChange={e => setNewLocation(e.target.value)}
                  placeholder="e.g. Terrace"
                  autoFocus
                  className="flex-1 px-3 py-2.5 border border-border-gray rounded-xl text-sm text-deep-charcoal focus:outline-none focus:ring-2 focus:ring-burgundy/20 focus:border-burgundy transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowNewLoc(false)}
                  className="px-3 py-2.5 border border-border-gray rounded-xl text-sm text-stone-gray hover:border-burgundy/40 transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          <button
            type="submit"
            className="w-full py-2.5 bg-deep-charcoal hover:bg-stone-mid text-white font-semibold rounded-xl transition-colors text-sm"
          >
            Add Table
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Table Properties Popover ─────────────────────────────────────────────────

interface TablePopoverProps {
  table: Table;
  position: { x: number; y: number };
  onClose: () => void;
  onDelete: (id: string) => void;
  onUpdateProps: (data: { table_id: string; shape?: string; capacity?: number }) => void;
}

function TablePopover({
  table, position, onClose, onDelete, onUpdateProps,
}: TablePopoverProps) {
  const [shape, setShape] = useState(table.shape || 'round');
  const [capacity, setCapacity] = useState(table.capacity || 2);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const hasChanges = shape !== table.shape || capacity !== table.capacity;
  const st = getStatusStyle(table.status);

  const statusLabel: Record<string, string> = {
    available: 'Available',
    occupied: 'Occupied',
    reserved: 'Reserved',
    cleaning: 'Cleaning',
    default: 'Unknown',
  };
  const statusKey = getStatusKey(table.status);

  return (
    <div
      ref={popoverRef}
      className="absolute z-30 w-60 rounded-2xl border border-border-gray shadow-xl bg-white"
      style={{ left: position.x, top: position.y }}
    >
      {/* Header */}
      <div className="px-4 py-3.5 border-b border-border-gray flex items-start justify-between">
        <div>
          <div className="font-semibold text-sm text-deep-charcoal">
            Table {table.table_number}
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ background: st.stroke }}
            />
            <span className="text-xs font-medium" style={{ color: st.text }}>
              {statusLabel[statusKey] ?? 'Unknown'}
            </span>
            <span className="text-xs text-muted-stone">
              &middot; {table.location || 'Main'}
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="p-1.5 hover:bg-soft-gray rounded-xl transition-colors text-muted-stone mt-0.5"
        >
          <ThiingsIcon name="close" pxSize={14} />
        </button>
      </div>

      {/* Controls */}
      <div className="p-4 space-y-3.5">
        <div>
          <label className="block text-[11px] font-semibold text-warm-stone mb-1.5 uppercase tracking-wider">
            Shape
          </label>
          <select
            value={shape}
            onChange={e => setShape(e.target.value as TableShape)}
            className="w-full px-3 py-2 bg-soft-gray border border-border-gray rounded-xl text-xs text-deep-charcoal focus:outline-none focus:ring-2 focus:ring-burgundy/20 focus:border-burgundy transition-colors"
          >
            {SHAPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-warm-stone mb-1.5 uppercase tracking-wider">
            Capacity
          </label>
          <div className="flex gap-1.5">
            {CAPACITIES.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setCapacity(c)}
                className={`flex-1 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                  capacity === c
                    ? 'bg-burgundy text-white border-burgundy'
                    : 'bg-white text-stone-gray border-border-gray hover:border-burgundy/40'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2 pt-1 border-t border-border-gray">
          {hasChanges && (
            <button
              onClick={() => {
                onUpdateProps({ table_id: table.id, shape, capacity });
                onClose();
              }}
              className="flex-1 py-1.5 bg-deep-charcoal text-white text-xs font-semibold rounded-xl hover:bg-stone-mid transition-colors"
            >
              Save Changes
            </button>
          )}
          <button
            onClick={() => {
              if (confirm(`Delete table ${table.table_number}?`)) {
                onDelete(table.id);
                onClose();
              }
            }}
            className="flex-1 py-1.5 border border-red-200 text-red-600 text-xs font-semibold rounded-xl hover:bg-red-50 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function FloorPlanEditor() {
  const queryClient = useQueryClient();

  // ── Data fetching ──
  const { data: tables = [], isLoading } = useQuery({
    queryKey: ['floorPlanTables'],
    queryFn: () => hostAPI.getDashboard(),
    select: (res) => (res.data.tables || []) as Table[],
  });

  // ── State ──
  const [activeLocation, setActiveLocation] = useState<string>('');
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [linkMode, setLinkMode] = useState(false);
  const [linkSource, setLinkSource] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [selectedTable, setSelectedTable] = useState<{
    table: Table; screenPos: { x: number; y: number };
  } | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);

  // ── Derived data ──
  const locations = useMemo(() => {
    const locs = new Set(tables.map(t => t.location || 'Main'));
    return Array.from(locs).sort();
  }, [tables]);

  useEffect(() => {
    if (!activeLocation && locations.length > 0) setActiveLocation(locations[0]);
  }, [locations, activeLocation]);

  const filteredTables = useMemo(() =>
    tables.filter(t => (t.location || 'Main') === activeLocation),
  [tables, activeLocation]);

  const needsAutoLayout = useMemo(() => {
    if (filteredTables.length <= 1) return false;
    return !filteredTables.some(t =>
      (t.position_x !== undefined && t.position_x !== null && t.position_x !== 0) ||
      (t.position_y !== undefined && t.position_y !== null && t.position_y !== 0),
    );
  }, [filteredTables]);

  const autoPositions = useMemo(() => {
    if (!needsAutoLayout) return new Map<string, { gx: number; gy: number }>();
    const map = new Map<string, { gx: number; gy: number }>();
    const sorted = [...filteredTables].sort(
      (a, b) => (Number(a.table_number) || 0) - (Number(b.table_number) || 0),
    );
    const GAP = 1;
    let curCol = 1, curRow = 1, rowMaxH = 0;
    sorted.forEach(t => {
      const shape = (t.shape?.toLowerCase() || 'round') as TableShape;
      const gridSize = getTableGridSize(shape, t.capacity || 2);
      const tw = gridSize.width;
      const th = gridSize.height;
      if (curCol + tw + GAP > GRID_COLS - 1 && curCol > 1) {
        curCol = 1; curRow += rowMaxH + GAP + 1; rowMaxH = 0;
      }
      map.set(t.id, { gx: curCol, gy: curRow });
      curCol += tw + GAP + 1;
      rowMaxH = Math.max(rowMaxH, th);
    });
    return map;
  }, [needsAutoLayout, filteredTables]);

  const nextTableNumber = useMemo(() =>
    Math.max(0, ...tables.map(t => Number(t.table_number) || 0)) + 1,
  [tables]);

  // ── Coordinate helpers ──
  const svgPoint = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const svgPt = pt.matrixTransform(ctm.inverse());
    return { x: svgPt.x, y: svgPt.y };
  }, []);

  const snapToGrid = useCallback((px: number, py: number) => ({
    gx: Math.max(0, Math.min(GRID_COLS - 1, Math.round(px / CELL))),
    gy: Math.max(0, Math.min(GRID_ROWS - 1, Math.round(py / CELL))),
  }), []);

  // ── Save status ──
  const showSaving = useCallback(() => setSaveStatus('saving'), []);
  const showSaved = useCallback(() => {
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus('idle'), 2000);
  }, []);

  // ── Drag handlers ──
  const handlePointerDown = useCallback((e: React.PointerEvent, table: Table) => {
    if (linkMode) return;
    e.preventDefault(); e.stopPropagation();
    (e.target as SVGElement).setPointerCapture?.(e.pointerId);
    const pt = svgPoint(e.clientX, e.clientY);
    const autoPos = autoPositions.get(table.id);
    const gx = autoPos ? autoPos.gx : (table.position_x || 0);
    const gy = autoPos ? autoPos.gy : (table.position_y || 0);
    setDragOffset({ x: pt.x - gx * CELL, y: pt.y - gy * CELL });
    setDraggingId(table.id);
    setDragPos({ x: gx * CELL, y: gy * CELL });
    setSelectedTable(null);
  }, [linkMode, svgPoint, autoPositions]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingId) return;
    e.preventDefault();
    const pt = svgPoint(e.clientX, e.clientY);
    setDragPos({
      x: Math.max(0, Math.min(SVG_W - CELL, pt.x - dragOffset.x)),
      y: Math.max(0, Math.min(SVG_H - CELL, pt.y - dragOffset.y)),
    });
  }, [draggingId, svgPoint, dragOffset]);

  const handlePointerUp = useCallback(async () => {
    if (!draggingId || !dragPos) return;
    const { gx, gy } = snapToGrid(dragPos.x, dragPos.y);
    setDraggingId(null); setDragPos(null);
    showSaving();
    try {
      await hostAPI.updateTablePosition(draggingId, gx, gy);
      queryClient.invalidateQueries({ queryKey: ['floorPlanTables'] });
      showSaved();
    } catch (err) {
      console.error('Failed to save position:', err);
      setSaveStatus('idle');
    }
  }, [draggingId, dragPos, snapToGrid, queryClient, showSaving, showSaved]);

  // ── Table click ──
  const handleTableClick = useCallback((e: React.MouseEvent, table: Table) => {
    if (draggingId) return;

    if (linkMode) {
      if (!linkSource) {
        setLinkSource(table.id);
      } else if (linkSource !== table.id) {
        const isLinked =
          table.joinable_with?.includes(linkSource) ||
          tables.find(t => t.id === linkSource)?.joinable_with?.includes(table.id);
        showSaving();
        const promise = isLinked
          ? hostAPI.unlinkTables(linkSource, table.id)
          : hostAPI.linkTables(linkSource, table.id);
        promise.then(() => {
          queryClient.invalidateQueries({ queryKey: ['floorPlanTables'] });
          showSaved();
        }).catch(() => setSaveStatus('idle'));
        setLinkSource(null);
      }
      return;
    }

    const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
    setSelectedTable({ table, screenPos: { x: rect.right + 10, y: rect.top } });
  }, [draggingId, linkMode, linkSource, tables, queryClient, showSaving, showSaved]);

  // ── CRUD operations ──
  const handleAddTable = useCallback(async (data: {
    table_number: number; capacity: number; shape: string;
    location: string; position_x: number; position_y: number;
  }) => {
    setShowAddModal(false); showSaving();
    try {
      await hostAPI.createTable(data);
      queryClient.invalidateQueries({ queryKey: ['floorPlanTables'] });
      if (!locations.includes(data.location)) setActiveLocation(data.location);
      showSaved();
    } catch (err) {
      console.error('Failed to create table:', err);
      setSaveStatus('idle');
    }
  }, [queryClient, locations, showSaving, showSaved]);

  const handleDeleteTable = useCallback(async (tableId: string) => {
    showSaving();
    try {
      await hostAPI.deleteTable(tableId);
      queryClient.invalidateQueries({ queryKey: ['floorPlanTables'] });
      showSaved();
    } catch (err) {
      console.error('Failed to delete table:', err);
      setSaveStatus('idle');
    }
  }, [queryClient, showSaving, showSaved]);

  const handleUpdateProps = useCallback(async (data: {
    table_id: string; shape?: string; capacity?: number;
  }) => {
    showSaving();
    try {
      await hostAPI.updateTableProperties(data);
      queryClient.invalidateQueries({ queryKey: ['floorPlanTables'] });
      showSaved();
    } catch (err) {
      console.error('Failed to update table:', err);
      setSaveStatus('idle');
    }
  }, [queryClient, showSaving, showSaved]);

  // ── Position map for link lines ──
  const posMap = useMemo(() => {
    const map = new Map<string, { cx: number; cy: number }>();
    filteredTables.forEach(t => {
      const { w, h } = getTablePxSize(t);
      const autoPos = autoPositions.get(t.id);
      const gx = autoPos ? autoPos.gx : (t.position_x || 0);
      const gy = autoPos ? autoPos.gy : (t.position_y || 0);
      map.set(t.id, { cx: gx * CELL + w / 2, cy: gy * CELL + h / 2 });
    });
    return map;
  }, [filteredTables, autoPositions]);

  // ── Render ──
  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-[1280px] mx-auto">

        {/* ── Page Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-xl font-bold text-deep-charcoal tracking-tight">Floor Plan</h1>
            <p className="text-sm text-warm-stone mt-0.5">
              Drag tables to rearrange · Click a table to edit its properties
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Save status indicator */}
            <span className={`text-xs font-medium transition-all px-2.5 py-1 rounded-full ${
              saveStatus === 'idle'
                ? 'opacity-0 pointer-events-none'
                : 'opacity-100'
            } ${saveStatus === 'saving'
              ? 'bg-soft-gray text-muted-stone'
              : 'bg-green-50 text-green-700 border border-green-200'
            }`}>
              {saveStatus === 'saving' ? 'Saving…' : '✓ Saved'}
            </span>

            {/* Link mode toggle */}
            <button
              onClick={() => {
                setLinkMode(!linkMode);
                setLinkSource(null);
                setSelectedTable(null);
              }}
              className={`min-h-[38px] px-4 py-2 rounded-xl text-sm font-medium border transition-all flex items-center gap-1.5 ${
                linkMode
                  ? 'bg-burgundy/8 text-burgundy border-burgundy/25'
                  : 'bg-white text-stone-gray border-border-gray hover:border-stone-gray/60 hover:text-deep-charcoal'
              }`}
            >
              <ThiingsIcon name="link" pxSize={15} />
              {linkMode ? 'Linking…' : 'Link Tables'}
            </button>

            {/* Add table */}
            <button
              onClick={() => { setShowAddModal(true); setSelectedTable(null); }}
              className="min-h-[38px] px-4 py-2 rounded-xl text-sm font-medium bg-deep-charcoal text-white hover:bg-stone-mid transition-colors flex items-center gap-1.5"
            >
              <ThiingsIcon name="plus" pxSize={15} />
              Add Table
            </button>
          </div>
        </div>

        {/* ── Location Tabs ── */}
        {locations.length > 0 && (
          <div className="flex items-center gap-1.5 mb-4 flex-wrap">
            {locations.map(loc => {
              const count = tables.filter(t => (t.location || 'Main') === loc).length;
              const isActive = activeLocation === loc;
              return (
                <button
                  key={loc}
                  onClick={() => {
                    setActiveLocation(loc);
                    setSelectedTable(null);
                    setLinkSource(null);
                  }}
                  className={`h-9 px-4 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
                    isActive
                      ? 'bg-deep-charcoal text-white shadow-sm'
                      : 'bg-white text-warm-stone border border-border-gray hover:text-deep-charcoal hover:border-stone-gray/50'
                  }`}
                >
                  {loc}
                  <span className={`text-xs font-semibold min-w-[18px] text-center ${
                    isActive ? 'text-white/70' : 'text-muted-stone'
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* ── Link mode banner ── */}
        {linkMode && (
          <div className="mb-4 px-4 py-3 bg-burgundy/[0.06] border border-burgundy/20 rounded-xl flex items-center gap-3">
            <span style={{ color: '#9F1239' }}>
              <ThiingsIcon name="link" pxSize={16} />
            </span>
            <span className="text-sm text-burgundy font-medium">
              {linkSource
                ? 'Click another table to link or unlink it'
                : 'Click the first table to start linking'}
            </span>
            <button
              onClick={() => { setLinkMode(false); setLinkSource(null); }}
              className="ml-auto text-xs text-burgundy/70 hover:text-burgundy font-medium hover:underline transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        {/* ── Canvas ── */}
        <div className="relative">
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
                  <span className="text-muted-stone">
                    <ThiingsIcon name="map" pxSize={30} />
                  </span>
                </div>
                <p className="font-semibold text-deep-charcoal text-base">
                  No tables in {activeLocation}
                </p>
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
                  style={{
                    minHeight: 380, minWidth: 400, maxWidth: '100%',
                    touchAction: 'none',
                  }}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerLeave={handlePointerUp}
                >
                  <defs>
                    <style>{EDITOR_CSS}</style>

                    {/* Warm linen dot texture */}
                    <pattern id="edDots" patternUnits="userSpaceOnUse" width="20" height="20">
                      <circle cx="10" cy="10" r="0.85" fill="#B5ADA4" opacity="0.32" />
                    </pattern>

                    {/* Architectural grid */}
                    <pattern id="edGrid" patternUnits="userSpaceOnUse" width={CELL} height={CELL}>
                      <path
                        d={`M ${CELL} 0 L 0 0 0 ${CELL}`}
                        fill="none"
                        stroke="rgba(155,145,136,0.15)"
                        strokeWidth="0.5"
                      />
                    </pattern>

                    {/* Table shadow */}
                    <filter id="edShad" x="-12%" y="-12%" width="124%" height="134%">
                      <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#7A6E65" floodOpacity="0.1" />
                    </filter>

                    {/* Drag shadow — elevated */}
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

                    const cx = x + w / 2;
                    const cy = y + h / 2;
                    const vx = cx - vw / 2;
                    const vy = cy - vh / 2;

                    const st = getStatusStyle(table.status);
                    const shape = table.shape?.toLowerCase() || 'round';
                    const isRound = shape === 'round' || shape === 'circle' || shape === 'bar-stool';
                    const isLinkSource = linkSource === table.id;
                    const isSelected = selectedTable?.table.id === table.id;

                    return (
                      <g
                        key={table.id}
                        className={linkMode ? 'cursor-pointer' : 'cursor-grab'}
                        style={{ opacity: isDragging ? 0.8 : 1 }}
                        filter={isDragging ? 'url(#edShadDrag)' : 'url(#edShad)'}
                        onPointerDown={e => handlePointerDown(e, table)}
                        onClick={e => handleTableClick(e, table)}
                      >
                        {/* Selection ring */}
                        {(isSelected || isLinkSource) && (
                          isRound ? (
                            <circle cx={cx} cy={cy} r={vw / 2 + 7}
                              fill="none" stroke="#9F1239"
                              strokeWidth={isLinkSource ? 2.5 : 1.5}
                              opacity={0.65}
                              className={isLinkSource ? 'link-active' : ''}
                            />
                          ) : (
                            <rect x={vx - 7} y={vy - 7} width={vw + 14} height={vh + 14}
                              rx={20} fill="none" stroke="#9F1239"
                              strokeWidth={isLinkSource ? 2.5 : 1.5}
                              opacity={0.65}
                              className={isLinkSource ? 'link-active' : ''}
                            />
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
                          <circle cx={cx} cy={cy} r={vw / 2}
                            fill={st.fill} stroke={st.stroke} strokeWidth={1.75} />
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
                        <text
                          x={cx} y={cy - 5}
                          textAnchor="middle" dominantBaseline="middle"
                          fill={st.text} fontSize={15} fontWeight={700}
                          fontFamily="Inter,-apple-system,sans-serif"
                          style={{ pointerEvents: 'none' }}
                        >
                          {table.table_number}
                        </text>

                        {/* Capacity label */}
                        <text
                          x={cx} y={cy + 12}
                          textAnchor="middle" dominantBaseline="middle"
                          fill={st.text} fontSize={9} opacity={0.5}
                          fontFamily="Inter,-apple-system,sans-serif"
                          style={{ pointerEvents: 'none' }}
                        >
                          {table.capacity} seats
                        </text>

                        {/* Joinable badge */}
                        {table.is_joinable && table.joinable_with?.length > 0 && (
                          <g>
                            <circle cx={vx + 3} cy={vy + 3} r={9}
                              fill="#9F1239" opacity={0.9} />
                            <text
                              x={vx + 3} y={vy + 4.5}
                              textAnchor="middle" dominantBaseline="middle"
                              fontSize={10} fill="#fff"
                              style={{ pointerEvents: 'none' }}
                            >
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
                        x={gx * CELL} y={gy * CELL}
                        width={CELL} height={CELL}
                        fill="rgba(159,18,57,0.04)"
                        stroke="rgba(159,18,57,0.3)"
                        strokeWidth={1.5} rx={5}
                        style={{ pointerEvents: 'none' }}
                      />
                    );
                  })()}
                </svg>
              </div>
            )}
          </div>

          {/* Table Popover */}
          {selectedTable && !linkMode && (
            <TablePopover
              table={selectedTable.table}
              position={selectedTable.screenPos}
              onClose={() => setSelectedTable(null)}
              onDelete={handleDeleteTable}
              onUpdateProps={handleUpdateProps}
            />
          )}
        </div>

        {/* ── Legend ── */}
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2.5">
          {[
            { label: 'Available', stroke: '#10B981', fill: '#ECFDF5' },
            { label: 'Occupied',  stroke: '#E11D48', fill: '#FFF1F2' },
            { label: 'Reserved',  stroke: '#7C3AED', fill: '#F5F3FF' },
            { label: 'Cleaning',  stroke: '#D97706', fill: '#FFFBEB' },
          ].map(({ label, stroke, fill }) => (
            <div key={label} className="flex items-center gap-2">
              <span
                className="w-4 h-4 rounded-lg border flex items-center justify-center"
                style={{ borderColor: stroke, background: fill }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: stroke }} />
              </span>
              <span className="text-xs text-warm-stone font-medium">{label}</span>
            </div>
          ))}

          <div className="flex items-center gap-2 ml-auto">
            <svg width="22" height="8" className="flex-shrink-0">
              <line
                x1="0" y1="4" x2="22" y2="4"
                stroke="#9F1239" strokeWidth="1.5" strokeDasharray="4,3" opacity="0.5"
              />
            </svg>
            <span className="text-xs text-warm-stone font-medium">Linked tables</span>
          </div>
        </div>

      </div>

      {/* Add Table Modal */}
      {showAddModal && (
        <AddTableModal
          onClose={() => setShowAddModal(false)}
          onAdd={handleAddTable}
          nextNumber={nextTableNumber}
          locations={locations.length > 0 ? locations : ['Main']}
          activeLocation={activeLocation || 'Main'}
          tables={tables}
        />
      )}
    </DashboardLayout>
  );
}

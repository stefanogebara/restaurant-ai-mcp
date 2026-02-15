import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { hostAPI } from '../services/api';
import DashboardLayout from '../components/layout/DashboardLayout';
import ThiingsIcon from '../components/common/ThiingsIcon';
import type { Table, TableShape } from '../types/host.types';
import { getTableSize as getTableGridSize } from '../types/host.types';

// ── Grid Constants ──────────────────────────────────────────────────────────

const CELL = 40;
const GRID_COLS = 24;
const GRID_ROWS = 16;
const SVG_W = CELL * GRID_COLS;
const SVG_H = CELL * GRID_ROWS;

// ── Status Colors (light mode only for editor) ─────────────────────────────

const getStatusStyle = (status: string) => {
  switch (status?.toLowerCase()) {
    case 'available':     return { bg: '#f0fdf4', border: '#22c55e', text: '#14532d' };
    case 'occupied':      return { bg: '#fef2f2', border: '#ef4444', text: '#7f1d1d' };
    case 'reserved':      return { bg: '#faf5ff', border: '#a855f7', text: '#581c87' };
    case 'being cleaned': return { bg: '#fffbeb', border: '#f59e0b', text: '#78350f' };
    default:              return { bg: '#fafaf9', border: '#a8a29e', text: '#44403c' };
  }
};

// ── Table pixel size from grid size ─────────────────────────────────────────

function getTablePxSize(table: Table) {
  const shape = (table.shape?.toLowerCase() || 'round') as TableShape;
  const gridSize = getTableGridSize(shape, table.capacity || 2);
  return {
    w: (table.width || gridSize.width) * CELL,
    h: (table.height || gridSize.height) * CELL,
  };
}

// ── Chair Rendering ─────────────────────────────────────────────────────────

function renderChairs(
  cx: number, cy: number, w: number, h: number,
  capacity: number, shape: string, color: string,
) {
  const chairs: React.ReactElement[] = [];
  const isRound = shape === 'round' || shape === 'circle';
  const r = 4;
  const gap = 7;

  if (isRound) {
    const orbit = w / 2 + gap + r;
    for (let i = 0; i < capacity; i++) {
      const a = (2 * Math.PI * i) / capacity - Math.PI / 2;
      chairs.push(
        <circle key={`c${i}`} cx={cx + orbit * Math.cos(a)} cy={cy + orbit * Math.sin(a)}
          r={r} fill={color} opacity={0.22} />,
      );
    }
  } else {
    const halfH = h / 2 + gap + r;
    const top = Math.ceil(capacity / 2);
    const bot = capacity - top;
    for (let i = 0; i < top; i++) {
      const xp = cx - w / 2 + (w / (top + 1)) * (i + 1);
      chairs.push(<circle key={`ct${i}`} cx={xp} cy={cy - halfH} r={r} fill={color} opacity={0.22} />);
    }
    for (let i = 0; i < bot; i++) {
      const xp = cx - w / 2 + (w / (bot + 1)) * (i + 1);
      chairs.push(<circle key={`cb${i}`} cx={xp} cy={cy + halfH} r={r} fill={color} opacity={0.22} />);
    }
  }
  return chairs;
}

// ── SVG Animation CSS ───────────────────────────────────────────────────────

const EDITOR_CSS = `
  @keyframes fpLinkDash { to { stroke-dashoffset: -20 } }
  @keyframes linkPulse { 0%,100% { opacity:0.7 } 50% { opacity:1 } }
  .link-active { animation: linkPulse 1.2s ease-in-out infinite }
`;

// ── Add Table Modal ─────────────────────────────────────────────────────────

const SHAPES: { value: TableShape; label: string }[] = [
  { value: 'round', label: 'Round' },
  { value: 'square', label: 'Square' },
  { value: 'rectangle', label: 'Rectangle' },
  { value: 'booth', label: 'Booth' },
  { value: 'bar-stool', label: 'Bar Stool' },
];

const CAPACITIES = [2, 4, 6, 8, 10];

interface AddTableModalProps {
  onClose: () => void;
  onAdd: (data: { table_number: number; capacity: number; shape: string; location: string; position_x: number; position_y: number }) => void;
  nextNumber: number;
  locations: string[];
  activeLocation: string;
  tables: Table[];
}

function AddTableModal({ onClose, onAdd, nextNumber, locations, activeLocation, tables }: AddTableModalProps) {
  const [tableNumber, setTableNumber] = useState(nextNumber);
  const [capacity, setCapacity] = useState(4);
  const [shape, setShape] = useState<TableShape>('round');
  const [location, setLocation] = useState(activeLocation);
  const [newLocation, setNewLocation] = useState('');
  const [showNewLoc, setShowNewLoc] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const loc = showNewLoc && newLocation.trim() ? newLocation.trim() : location;
    // Find next empty position
    const occupied = new Set(
      tables.filter(t => (t.location || 'Main') === loc)
        .map(t => `${t.position_x},${t.position_y}`),
    );
    let px = 1, py = 1;
    for (let row = 1; row < GRID_ROWS - 1; row++) {
      for (let col = 1; col < GRID_COLS - 2; col++) {
        if (!occupied.has(`${col},${row}`)) {
          px = col;
          py = row;
          row = GRID_ROWS; // break outer
          break;
        }
      }
    }
    onAdd({ table_number: tableNumber, capacity, shape, location: loc, position_x: px, position_y: py });
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-[#E7E5E4]"
        onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-[#E7E5E4] flex items-center justify-between">
          <h2 className="text-lg font-bold text-[#1C1917]">Add Table</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-[#F5F5F4] rounded-lg transition-colors">
            <ThiingsIcon name="close" pxSize={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Table Number */}
          <div>
            <label className="block text-sm font-medium text-[#1C1917] mb-1.5">Table Number</label>
            <input
              type="number"
              value={tableNumber}
              onChange={e => setTableNumber(Number(e.target.value))}
              min={1}
              className="w-full px-3 py-2 border border-[#E7E5E4] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#9F1239]/30 focus:border-[#9F1239]"
            />
          </div>

          {/* Capacity */}
          <div>
            <label className="block text-sm font-medium text-[#1C1917] mb-1.5">Capacity</label>
            <div className="flex gap-2">
              {CAPACITIES.map(c => (
                <button key={c} type="button" onClick={() => setCapacity(c)}
                  className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-all ${
                    capacity === c
                      ? 'bg-[#9F1239] text-white border-[#9F1239]'
                      : 'bg-white text-[#57534E] border-[#E7E5E4] hover:border-[#9F1239]'
                  }`}>
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Shape */}
          <div>
            <label className="block text-sm font-medium text-[#1C1917] mb-1.5">Shape</label>
            <div className="grid grid-cols-3 gap-2">
              {SHAPES.map(s => (
                <button key={s.value} type="button" onClick={() => setShape(s.value)}
                  className={`py-2 px-3 rounded-xl text-sm font-medium border transition-all ${
                    shape === s.value
                      ? 'bg-[#9F1239] text-white border-[#9F1239]'
                      : 'bg-white text-[#57534E] border-[#E7E5E4] hover:border-[#9F1239]'
                  }`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="block text-sm font-medium text-[#1C1917] mb-1.5">Location</label>
            {!showNewLoc ? (
              <div className="flex gap-2">
                <select value={location} onChange={e => setLocation(e.target.value)}
                  className="flex-1 px-3 py-2 border border-[#E7E5E4] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#9F1239]/30 focus:border-[#9F1239]">
                  {locations.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
                <button type="button" onClick={() => setShowNewLoc(true)}
                  className="px-3 py-2 border border-[#E7E5E4] rounded-xl text-sm text-[#57534E] hover:border-[#9F1239] transition-colors">
                  + New
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text" value={newLocation} onChange={e => setNewLocation(e.target.value)}
                  placeholder="e.g. Terrace"
                  autoFocus
                  className="flex-1 px-3 py-2 border border-[#E7E5E4] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#9F1239]/30 focus:border-[#9F1239]"
                />
                <button type="button" onClick={() => setShowNewLoc(false)}
                  className="px-3 py-2 border border-[#E7E5E4] rounded-xl text-sm text-[#57534E] hover:border-[#9F1239] transition-colors">
                  Cancel
                </button>
              </div>
            )}
          </div>

          <button type="submit"
            className="w-full py-2.5 bg-[#9F1239] hover:bg-[#881337] text-white font-semibold rounded-xl transition-colors text-sm">
            Add Table
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Table Properties Popover ────────────────────────────────────────────────

interface TablePopoverProps {
  table: Table;
  position: { x: number; y: number };
  onClose: () => void;
  onDelete: (id: string) => void;
  onUpdateProps: (data: { table_id: string; shape?: string; capacity?: number }) => void;
}

function TablePopover({ table, position, onClose, onDelete, onUpdateProps }: TablePopoverProps) {
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

  return (
    <div ref={popoverRef}
      className="absolute z-30 bg-white rounded-xl border border-[#E7E5E4] shadow-xl w-56"
      style={{ left: position.x, top: position.y }}>
      <div className="p-3 border-b border-[#E7E5E4] flex items-center justify-between">
        <span className="font-bold text-sm text-[#1C1917]">Table {table.table_number}</span>
        <button onClick={onClose} className="p-1 hover:bg-[#F5F5F4] rounded-lg">
          <ThiingsIcon name="close" pxSize={14} />
        </button>
      </div>
      <div className="p-3 space-y-3">
        <div>
          <label className="text-xs font-medium text-[#78716C] mb-1 block">Shape</label>
          <select value={shape} onChange={e => setShape(e.target.value as TableShape)}
            className="w-full px-2 py-1.5 border border-[#E7E5E4] rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-[#9F1239]/30">
            {SHAPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-[#78716C] mb-1 block">Capacity</label>
          <div className="flex gap-1">
            {CAPACITIES.map(c => (
              <button key={c} type="button" onClick={() => setCapacity(c)}
                className={`flex-1 py-1 rounded-lg text-xs font-semibold border transition-all ${
                  capacity === c
                    ? 'bg-[#9F1239] text-white border-[#9F1239]'
                    : 'border-[#E7E5E4] text-[#57534E] hover:border-[#9F1239]'
                }`}>
                {c}
              </button>
            ))}
          </div>
        </div>
        <div className="text-xs text-[#A8A29E]">
          {table.location || 'Main'} &middot; {table.status || 'Available'}
        </div>
        <div className="flex gap-2 pt-1">
          {hasChanges && (
            <button onClick={() => { onUpdateProps({ table_id: table.id, shape, capacity }); onClose(); }}
              className="flex-1 py-1.5 bg-[#9F1239] text-white text-xs font-semibold rounded-lg hover:bg-[#881337] transition-colors">
              Save
            </button>
          )}
          <button onClick={() => { if (confirm(`Delete table ${table.table_number}?`)) { onDelete(table.id); onClose(); } }}
            className="flex-1 py-1.5 border border-red-200 text-red-600 text-xs font-semibold rounded-lg hover:bg-red-50 transition-colors">
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

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
  const [selectedTable, setSelectedTable] = useState<{ table: Table; screenPos: { x: number; y: number } } | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);

  // ── Derived data ──
  const locations = useMemo(() => {
    const locs = new Set(tables.map(t => t.location || 'Main'));
    return Array.from(locs).sort();
  }, [tables]);

  // Set initial active location
  useEffect(() => {
    if (!activeLocation && locations.length > 0) {
      setActiveLocation(locations[0]);
    }
  }, [locations, activeLocation]);

  const filteredTables = useMemo(() =>
    tables.filter(t => (t.location || 'Main') === activeLocation),
  [tables, activeLocation]);

  // Detect if tables need auto-layout (all at 0,0)
  const needsAutoLayout = useMemo(() => {
    if (filteredTables.length <= 1) return false;
    return !filteredTables.some(t =>
      (t.position_x !== undefined && t.position_x !== null && t.position_x !== 0) ||
      (t.position_y !== undefined && t.position_y !== null && t.position_y !== 0),
    );
  }, [filteredTables]);

  // Compute auto-layout positions when tables are all stacked at 0,0
  const autoPositions = useMemo(() => {
    if (!needsAutoLayout) return new Map<string, { gx: number; gy: number }>();
    const map = new Map<string, { gx: number; gy: number }>();
    const sorted = [...filteredTables].sort((a, b) => (Number(a.table_number) || 0) - (Number(b.table_number) || 0));
    const GAP = 1; // 1 grid cell gap between tables
    let curCol = 1, curRow = 1, rowMaxH = 0;
    sorted.forEach(t => {
      const shape = (t.shape?.toLowerCase() || 'round') as TableShape;
      const gridSize = getTableGridSize(shape, t.capacity || 2);
      const tw = t.width || gridSize.width;
      const th = t.height || gridSize.height;
      if (curCol + tw + GAP > GRID_COLS - 1 && curCol > 1) {
        curCol = 1;
        curRow += rowMaxH + GAP + 1;
        rowMaxH = 0;
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
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const svgPt = pt.matrixTransform(ctm.inverse());
    return { x: svgPt.x, y: svgPt.y };
  }, []);

  const snapToGrid = useCallback((px: number, py: number) => ({
    gx: Math.max(0, Math.min(GRID_COLS - 1, Math.round(px / CELL))),
    gy: Math.max(0, Math.min(GRID_ROWS - 1, Math.round(py / CELL))),
  }), []);

  // ── Save indicator ──
  const showSaving = useCallback(() => {
    setSaveStatus('saving');
  }, []);

  const showSaved = useCallback(() => {
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus('idle'), 2000);
  }, []);

  // ── Drag handlers ──
  const handlePointerDown = useCallback((e: React.PointerEvent, table: Table) => {
    if (linkMode) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as SVGElement).setPointerCapture?.(e.pointerId);
    const pt = svgPoint(e.clientX, e.clientY);
    const autoPos = autoPositions.get(table.id);
    const gx = autoPos ? autoPos.gx : (table.position_x || 0);
    const gy = autoPos ? autoPos.gy : (table.position_y || 0);
    const tableX = gx * CELL;
    const tableY = gy * CELL;
    setDragOffset({ x: pt.x - tableX, y: pt.y - tableY });
    setDraggingId(table.id);
    setDragPos({ x: tableX, y: tableY });
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
    setDraggingId(null);
    setDragPos(null);
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

  // ── Table click (select or link) ──
  const handleTableClick = useCallback((e: React.MouseEvent, table: Table) => {
    if (draggingId) return;

    if (linkMode) {
      if (!linkSource) {
        setLinkSource(table.id);
      } else if (linkSource !== table.id) {
        const isLinked = table.joinable_with?.includes(linkSource) ||
          tables.find(t => t.id === linkSource)?.joinable_with?.includes(table.id);
        showSaving();
        const promise = isLinked
          ? hostAPI.unlinkTables(linkSource, table.id)
          : hostAPI.linkTables(linkSource, table.id);
        promise.then(() => {
          queryClient.invalidateQueries({ queryKey: ['floorPlanTables'] });
          showSaved();
        }).catch(() => {
          setSaveStatus('idle');
        });
        setLinkSource(null);
      }
      return;
    }

    // Select table for popover
    const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
    setSelectedTable({
      table,
      screenPos: { x: rect.right + 8, y: rect.top },
    });
  }, [draggingId, linkMode, linkSource, tables, queryClient, showSaving, showSaved]);

  // ── Add table ──
  const handleAddTable = useCallback(async (data: {
    table_number: number; capacity: number; shape: string; location: string;
    position_x: number; position_y: number;
  }) => {
    setShowAddModal(false);
    showSaving();
    try {
      await hostAPI.createTable(data);
      queryClient.invalidateQueries({ queryKey: ['floorPlanTables'] });
      if (!locations.includes(data.location)) {
        setActiveLocation(data.location);
      }
      showSaved();
    } catch (err) {
      console.error('Failed to create table:', err);
      setSaveStatus('idle');
    }
  }, [queryClient, locations, showSaving, showSaved]);

  // ── Delete table ──
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

  // ── Update table properties ──
  const handleUpdateProps = useCallback(async (data: { table_id: string; shape?: string; capacity?: number }) => {
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

  // ── Build position map for link lines ──
  const posMap = useMemo(() => {
    const map = new Map<string, { cx: number; cy: number }>();
    filteredTables.forEach(t => {
      const { w, h } = getTablePxSize(t);
      const autoPos = autoPositions.get(t.id);
      const gx = autoPos ? autoPos.gx : (t.position_x || 0);
      const gy = autoPos ? autoPos.gy : (t.position_y || 0);
      const x = gx * CELL;
      const y = gy * CELL;
      map.set(t.id, { cx: x + w / 2, cy: y + h / 2 });
    });
    return map;
  }, [filteredTables, autoPositions]);

  // ── Render ──
  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-[1200px] mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#1C1917]">Floor Plan</h1>
            <p className="text-sm text-[#78716C] mt-1">Drag tables to arrange your layout</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Save status */}
            <span className={`text-xs font-medium mr-2 transition-opacity ${saveStatus === 'idle' ? 'opacity-0' : 'opacity-100'} ${
              saveStatus === 'saving' ? 'text-[#A8A29E]' : 'text-green-600'
            }`}>
              {saveStatus === 'saving' ? 'Saving...' : 'Saved'}
            </span>
            {/* Link mode toggle */}
            <button
              onClick={() => { setLinkMode(!linkMode); setLinkSource(null); setSelectedTable(null); }}
              className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-all flex items-center gap-2 ${
                linkMode
                  ? 'bg-[#9F1239] text-white border-[#9F1239]'
                  : 'bg-white text-[#1C1917] border-[#E7E5E4] hover:border-[#9F1239]'
              }`}>
              <ThiingsIcon name="link" pxSize={16} />
              {linkMode ? 'Linking...' : 'Link Tables'}
            </button>
            {/* Add table */}
            <button
              onClick={() => { setShowAddModal(true); setSelectedTable(null); }}
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-[#9F1239] text-white hover:bg-[#881337] transition-colors flex items-center gap-2">
              <ThiingsIcon name="plus" pxSize={16} />
              Add Table
            </button>
          </div>
        </div>

        {/* Location Tabs */}
        {locations.length > 0 && (
          <div className="flex items-center gap-1 mb-4 overflow-x-auto pb-1">
            {locations.map(loc => (
              <button key={loc} onClick={() => { setActiveLocation(loc); setSelectedTable(null); setLinkSource(null); }}
                className={`px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all ${
                  activeLocation === loc
                    ? 'bg-[#1C1917] text-white'
                    : 'bg-white text-[#57534E] border border-[#E7E5E4] hover:border-[#1C1917]'
                }`}>
                {loc}
                <span className="ml-1.5 text-xs opacity-60">
                  {tables.filter(t => (t.location || 'Main') === loc).length}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Link mode banner */}
        {linkMode && (
          <div className="mb-4 px-4 py-2.5 bg-[#9F1239]/5 border border-[#9F1239]/20 rounded-xl flex items-center gap-3">
            <ThiingsIcon name="link" pxSize={18} />
            <span className="text-sm text-[#9F1239] font-medium">
              {linkSource
                ? `Click another table to ${tables.find(t => t.id === linkSource)?.joinable_with?.length ? 'link or unlink' : 'link'}`
                : 'Click the first table to start linking'}
            </span>
            <button onClick={() => { setLinkMode(false); setLinkSource(null); }}
              className="ml-auto text-xs text-[#9F1239] hover:underline font-medium">Cancel</button>
          </div>
        )}

        {/* SVG Canvas */}
        <div className="relative">
          <div className="rounded-xl border border-[#E7E5E4] bg-white overflow-hidden"
            style={{ maxWidth: '100%', overflowX: 'auto' }}>
            {isLoading ? (
              <div className="flex items-center justify-center" style={{ height: 400 }}>
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#E7E5E4] border-t-[#9F1239]" />
              </div>
            ) : filteredTables.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center py-16 px-6">
                <ThiingsIcon name="map" pxSize={48} />
                <p className="mt-4 font-semibold text-[#1C1917]">No tables in {activeLocation}</p>
                <p className="text-sm text-[#78716C] mt-1">Click "Add Table" to get started</p>
              </div>
            ) : (
              <svg
                ref={svgRef}
                width="100%"
                viewBox={`0 0 ${SVG_W} ${SVG_H}`}
                className="block select-none"
                style={{ minHeight: 320, minWidth: 400, maxWidth: '100%', touchAction: 'none' }}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
              >
                <defs>
                  <style>{EDITOR_CSS}</style>
                  <filter id="edShad" x="-8%" y="-8%" width="116%" height="124%">
                    <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000" floodOpacity="0.06" />
                  </filter>
                  <filter id="edShadDrag" x="-12%" y="-12%" width="124%" height="136%">
                    <feDropShadow dx="0" dy="6" stdDeviation="10" floodColor="#000" floodOpacity="0.15" />
                  </filter>
                  <pattern id="edFloor" patternUnits="userSpaceOnUse" width="24" height="24">
                    <circle cx="12" cy="12" r="0.6" fill="#d6d3d1" opacity="0.4" />
                  </pattern>
                  <pattern id="edGrid" patternUnits="userSpaceOnUse" width={CELL} height={CELL}>
                    <path d={`M ${CELL} 0 L 0 0 0 ${CELL}`} fill="none" stroke="#E7E5E4" strokeWidth="0.5" opacity="0.5" />
                  </pattern>
                </defs>

                {/* Background */}
                <rect width="100%" height="100%" fill="url(#edFloor)" />
                <rect width="100%" height="100%" fill="url(#edGrid)" />

                {/* Link lines (behind tables) */}
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
                          stroke="#9F1239" strokeWidth="2.5"
                          strokeDasharray="6,4" opacity="0.45"
                          style={{ animation: 'fpLinkDash 1.2s linear infinite' }}
                        />,
                      );
                    });
                  });
                  return lines;
                })()}

                {/* Tables */}
                {filteredTables.map(table => {
                  const isDragging = table.id === draggingId;
                  const pxSize = getTablePxSize(table);
                  const w = pxSize.w;
                  const h = pxSize.h;

                  let x: number, y: number;
                  if (isDragging && dragPos) {
                    x = dragPos.x;
                    y = dragPos.y;
                  } else {
                    const autoPos = autoPositions.get(table.id);
                    const gx = autoPos ? autoPos.gx : (table.position_x || 0);
                    const gy = autoPos ? autoPos.gy : (table.position_y || 0);
                    x = gx * CELL;
                    y = gy * CELL;
                  }

                  const cx = x + w / 2;
                  const cy = y + h / 2;
                  const st = getStatusStyle(table.status);
                  const shape = table.shape?.toLowerCase() || 'round';
                  const isRound = shape === 'round' || shape === 'circle';
                  const isLinkSource = linkSource === table.id;

                  return (
                    <g key={table.id}
                      className={linkMode ? 'cursor-pointer' : 'cursor-grab'}
                      style={{
                        opacity: isDragging ? 0.85 : 1,
                        transition: isDragging ? 'none' : 'transform 0.15s ease',
                      }}
                      filter={isDragging ? 'url(#edShadDrag)' : 'url(#edShad)'}
                      onPointerDown={e => handlePointerDown(e, table)}
                      onClick={e => handleTableClick(e, table)}
                    >
                      {/* Link mode highlight */}
                      {linkMode && (
                        isRound ? (
                          <circle cx={cx} cy={cy} r={w / 2 + 6}
                            fill="none" stroke="#9F1239" strokeWidth={isLinkSource ? 3 : 1.5}
                            opacity={isLinkSource ? 0.9 : 0.3}
                            className={isLinkSource ? 'link-active' : ''} />
                        ) : (
                          <rect x={x - 6} y={y - 6} width={w + 12} height={h + 12}
                            rx={16} fill="none" stroke="#9F1239" strokeWidth={isLinkSource ? 3 : 1.5}
                            opacity={isLinkSource ? 0.9 : 0.3}
                            className={isLinkSource ? 'link-active' : ''} />
                        )
                      )}

                      {/* Chairs */}
                      {renderChairs(cx, cy, w, h, table.capacity || 2, shape, st.border)}

                      {/* Table shape */}
                      {isRound ? (
                        <circle cx={cx} cy={cy} r={w / 2}
                          fill={st.bg} stroke={st.border} strokeWidth={2} />
                      ) : shape === 'booth' ? (
                        <>
                          <rect x={x} y={y} width={w} height={h} rx={12}
                            fill={st.bg} stroke={st.border} strokeWidth={2} />
                          <rect x={x + 3} y={y + h - 8} width={w - 6} height={7}
                            rx={3.5} fill={st.border} opacity={0.1} />
                        </>
                      ) : shape === 'bar-stool' ? (
                        <circle cx={cx} cy={cy} r={w / 2 - 2}
                          fill={st.bg} stroke={st.border} strokeWidth={2} />
                      ) : (
                        <rect x={x} y={y} width={w} height={h}
                          rx={shape === 'rectangle' || shape === 'oval' ? 10 : 12}
                          fill={st.bg} stroke={st.border} strokeWidth={2} />
                      )}

                      {/* Table number */}
                      <text x={cx} y={cy - 3} textAnchor="middle" dominantBaseline="middle"
                        fill={st.text} fontSize={16} fontWeight={700}
                        fontFamily="system-ui,-apple-system,sans-serif"
                        style={{ pointerEvents: 'none' }}>
                        {table.table_number}
                      </text>

                      {/* Capacity label */}
                      <text x={cx} y={cy + 13} textAnchor="middle" dominantBaseline="middle"
                        fill={st.text} fontSize={9} opacity={0.5}
                        fontFamily="system-ui,-apple-system,sans-serif"
                        style={{ pointerEvents: 'none' }}>
                        {table.capacity} seats
                      </text>

                      {/* Joinable badge */}
                      {table.is_joinable && table.joinable_with?.length > 0 && (
                        <g>
                          <circle cx={x + 2} cy={y + 2} r={8}
                            fill="#9F1239" opacity={0.9} />
                          <text x={x + 2} y={y + 3.5} textAnchor="middle"
                            dominantBaseline="middle" fontSize={9} fill="#fff"
                            style={{ pointerEvents: 'none' }}>
                            &#x26D3;
                          </text>
                        </g>
                      )}

                      {/* Invisible hit area */}
                      {isRound ? (
                        <circle cx={cx} cy={cy} r={Math.max(w, h) / 2 + 10} fill="transparent" />
                      ) : (
                        <rect x={x - 10} y={y - 10} width={w + 20} height={h + 20}
                          rx={14} fill="transparent" />
                      )}
                    </g>
                  );
                })}

                {/* Snap indicator while dragging */}
                {draggingId && dragPos && (() => {
                  const { gx, gy } = snapToGrid(dragPos.x, dragPos.y);
                  return (
                    <rect x={gx * CELL} y={gy * CELL} width={CELL} height={CELL}
                      fill="#9F1239" opacity={0.08} rx={6}
                      style={{ pointerEvents: 'none' }} />
                  );
                })()}
              </svg>
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

        {/* Legend */}
        <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-[#78716C]">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full border-2 border-[#22c55e] bg-[#f0fdf4]" />
            Available
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full border-2 border-[#ef4444] bg-[#fef2f2]" />
            Occupied
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full border-2 border-[#a855f7] bg-[#faf5ff]" />
            Reserved
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full border-2 border-[#f59e0b] bg-[#fffbeb]" />
            Cleaning
          </div>
          <div className="flex items-center gap-1.5 ml-auto text-[#A8A29E]">
            <ThiingsIcon name="link" pxSize={12} />
            Dashed line = linked tables
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

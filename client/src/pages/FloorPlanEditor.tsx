/**
 * Floor Plan Editor
 *
 * Orchestrator page — manages state, data fetching, and event handlers.
 * UI is delegated to focused subcomponents in components/floor-plan/.
 */

import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { hostAPI } from '../services/api';
import DashboardLayout from '../components/layout/DashboardLayout';
import type { Table, TableShape } from '../types/host.types';
import { getTableSize as getTableGridSize } from '../types/host.types';

import FloorPlanHeader from '../components/floor-plan/FloorPlanHeader';
import FloorPlanLocationTabs from '../components/floor-plan/FloorPlanLocationTabs';
import FloorPlanLinkBanner from '../components/floor-plan/FloorPlanLinkBanner';
import FloorPlanCanvas from '../components/floor-plan/FloorPlanCanvas';
import FloorPlanLegend from '../components/floor-plan/FloorPlanLegend';
import TablePopover from '../components/floor-plan/TablePopover';
import AddTableModal from '../components/floor-plan/AddTableModal';
import { CELL, GRID_COLS, SVG_W, SVG_H, snapToGrid, getTablePxSize } from '../components/floor-plan/floorPlanConstants';

export default function FloorPlanEditor() {
  const queryClient = useQueryClient();

  // ─── Data fetching ────────────────────────────────────────────────────────────

  const { data: tables = [], isLoading } = useQuery({
    queryKey: ['floorPlanTables'],
    queryFn: () => hostAPI.getDashboard(),
    select: (res) => (res.data.tables || []) as Table[],
  });

  // ─── State ────────────────────────────────────────────────────────────────────

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

  // ─── Derived state ────────────────────────────────────────────────────────────

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
    let curCol = 0, curRow = 0, rowMaxH = 0;
    sorted.forEach(t => {
      const shape = (t.shape?.toLowerCase() || 'round') as TableShape;
      const gridSize = getTableGridSize(shape, t.capacity || 2);
      if (curCol + gridSize.width + GAP > GRID_COLS - 1 && curCol > 0) {
        curCol = 0; curRow += rowMaxH + GAP + 1; rowMaxH = 0;
      }
      map.set(t.id, { gx: curCol, gy: curRow });
      curCol += gridSize.width + GAP + 1;
      rowMaxH = Math.max(rowMaxH, gridSize.height);
    });

    // Center the layout in the grid
    if (map.size > 0) {
      let minGx = Infinity, minGy = Infinity, maxGx = 0, maxGy = 0;
      sorted.forEach(t => {
        const pos = map.get(t.id);
        if (!pos) return;
        const shape = (t.shape?.toLowerCase() || 'round') as TableShape;
        const gridSize = getTableGridSize(shape, t.capacity || 2);
        minGx = Math.min(minGx, pos.gx);
        minGy = Math.min(minGy, pos.gy);
        maxGx = Math.max(maxGx, pos.gx + gridSize.width);
        maxGy = Math.max(maxGy, pos.gy + gridSize.height);
      });
      const GRID_ROWS_COUNT = 20;
      const offsetX = Math.max(0, Math.floor((GRID_COLS - (maxGx - minGx)) / 2) - minGx);
      const offsetY = Math.max(0, Math.floor((GRID_ROWS_COUNT - (maxGy - minGy)) / 2) - minGy);
      if (offsetX > 0 || offsetY > 0) {
        map.forEach((pos, id) => {
          map.set(id, { gx: pos.gx + offsetX, gy: pos.gy + offsetY });
        });
      }
    }

    return map;
  }, [needsAutoLayout, filteredTables]);

  const nextTableNumber = useMemo(() =>
    Math.max(0, ...tables.map(t => Number(t.table_number) || 0)) + 1,
  [tables]);

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

  // ─── Save status helpers ──────────────────────────────────────────────────────

  const showSaving = useCallback(() => setSaveStatus('saving'), []);
  const showSaved = useCallback(() => {
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus('idle'), 2000);
  }, []);

  // ─── Coordinate helper ────────────────────────────────────────────────────────

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

  // ─── Drag handlers ────────────────────────────────────────────────────────────

  const handlePointerDown = useCallback((e: React.PointerEvent, table: Table) => {
    if (linkMode) {
      e.preventDefault(); e.stopPropagation();
      // Handle link mode click via pointerdown — more reliable than onClick on SVG
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
        promise
          .then(() => { queryClient.invalidateQueries({ queryKey: ['floorPlanTables'] }); showSaved(); })
          .catch(() => setSaveStatus('idle'));
        setLinkSource(null);
      }
      return;
    }
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
  }, [linkMode, linkSource, tables, svgPoint, autoPositions, queryClient, showSaving, showSaved]);

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
  }, [draggingId, dragPos, queryClient, showSaving, showSaved]);

  // ─── Table click ──────────────────────────────────────────────────────────────

  const handleTableClick = useCallback((e: React.MouseEvent, table: Table) => {
    if (draggingId || linkMode) return; // link mode handled in handlePointerDown
    const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
    setSelectedTable({ table, screenPos: { x: rect.right + 10, y: rect.top } });
  }, [draggingId, linkMode]);

  // ─── CRUD ─────────────────────────────────────────────────────────────────────

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

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <DashboardLayout>
      <div className="bg-white p-3 sm:p-6 lg:p-8 max-w-[1280px] mx-auto mt-14 sm:mt-0 pb-20 sm:pb-8">

        <FloorPlanHeader
          saveStatus={saveStatus}
          linkMode={linkMode}
          onToggleLinkMode={() => { setLinkMode(!linkMode); setLinkSource(null); setSelectedTable(null); }}
          onAddTable={() => { setShowAddModal(true); setSelectedTable(null); }}
        />

        <FloorPlanLocationTabs
          tables={tables}
          locations={locations}
          activeLocation={activeLocation}
          onLocationChange={(loc) => { setActiveLocation(loc); setSelectedTable(null); setLinkSource(null); }}
        />

        {linkMode && (
          <FloorPlanLinkBanner
            linkSource={linkSource}
            onCancel={() => { setLinkMode(false); setLinkSource(null); }}
          />
        )}

        <div className="relative overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0 pb-2 sm:pb-0">
          <FloorPlanCanvas
            filteredTables={filteredTables}
            isLoading={isLoading}
            activeLocation={activeLocation}
            draggingId={draggingId}
            dragPos={dragPos}
            autoPositions={autoPositions}
            posMap={posMap}
            linkMode={linkMode}
            linkSource={linkSource}
            selectedTableId={selectedTable?.table.id ?? null}
            svgRef={svgRef}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerDown={handlePointerDown}
            onTableClick={handleTableClick}
          />

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

        <FloorPlanLegend />

      </div>

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

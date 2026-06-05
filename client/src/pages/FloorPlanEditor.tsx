/**
 * Floor Plan Editor
 *
 * Orchestrator page — manages state, data fetching, and event handlers.
 * UI is delegated to focused subcomponents in components/floor-plan/.
 */

import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { hostAPI } from '../services/api';
import { useToast } from '../contexts/ToastContext';
import DashboardLayout from '../components/layout/DashboardLayout';
import ThiingsIcon from '../components/common/ThiingsIcon';
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
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export default function FloorPlanEditor() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  useDocumentTitle(t('pageTitles.floorPlan', 'Floor Plan | seatable'));
  const { error: toastError } = useToast();

  // ─── Data fetching ────────────────────────────────────────────────────────────

  const { data: tables = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['dashboard'],
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

  const savedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showSaving = useCallback(() => setSaveStatus('saving'), []);
  const showSaved = useCallback(() => {
    setSaveStatus('saved');
    if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
    savedTimeoutRef.current = setTimeout(() => setSaveStatus('idle'), 2000);
  }, []);

  // Clear pending "saved" timeout on unmount — prevents setState-on-unmounted warning
  useEffect(() => {
    return () => {
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
    };
  }, []);

  // ─── Cache patching ───────────────────────────────────────────────────────────

  // Immutably patch a single table inside the raw ['dashboard'] cache shape.
  // Note: setQueryData operates on the *un-selected* cache (res.data.tables),
  // not the Table[] the `select` produces.
  type DashboardCache = { data?: { tables?: Table[] } } | undefined;
  const patchTableInCache = useCallback((tableId: string, patch: Partial<Table>) => {
    queryClient.setQueryData<DashboardCache>(['dashboard'], (old) => {
      if (!old?.data?.tables) return old;
      return {
        ...old,
        data: {
          ...old.data,
          tables: old.data.tables.map((tbl) =>
            tbl.id === tableId ? { ...tbl, ...patch } : tbl,
          ),
        },
      };
    });
  }, [queryClient]);

  // ─── Mutations ────────────────────────────────────────────────────────────────

  // Drag-save as a proper optimistic mutation. onMutate cancels any in-flight
  // ['dashboard'] refetch (closing the race where a stale refetch resolving
  // after our save snapped the table back to its old cell), patches the cache
  // optimistically, and snapshots the previous state for rollback on error.
  const positionMutation = useMutation({
    mutationFn: ({ id, gx, gy }: { id: string; gx: number; gy: number }) =>
      hostAPI.updateTablePosition(id, gx, gy),
    onMutate: async ({ id, gx, gy }) => {
      await queryClient.cancelQueries({ queryKey: ['dashboard'] });
      const previous = queryClient.getQueryData<DashboardCache>(['dashboard']);
      patchTableInCache(id, { position_x: gx, position_y: gy });
      return { previous };
    },
    onError: (err, _vars, context) => {
      console.error('Failed to save position:', err);
      if (context?.previous) queryClient.setQueryData(['dashboard'], context.previous);
      setSaveStatus('idle');
      toastError(t('errors.serverError'));
    },
    onSuccess: () => showSaved(),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
  });

  // Link/unlink as a proper mutation — the previous fire-and-forget
  // promise.then().catch() had no cache reconciliation and swallowed which
  // pair failed. onSettled re-syncs joinable_with from the server.
  const linkMutation = useMutation({
    mutationFn: ({ sourceId, targetId, isLinked }: { sourceId: string; targetId: string; isLinked: boolean }) =>
      isLinked ? hostAPI.unlinkTables(sourceId, targetId) : hostAPI.linkTables(sourceId, targetId),
    onError: (err) => {
      console.error('Failed to link/unlink tables:', err);
      setSaveStatus('idle');
      toastError(t('errors.serverError'));
    },
    onSuccess: () => showSaved(),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
  });

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
        const isLinked = Boolean(
          table.joinable_with?.includes(linkSource) ||
          tables.find(t => t.id === linkSource)?.joinable_with?.includes(table.id),
        );
        showSaving();
        linkMutation.mutate({ sourceId: linkSource, targetId: table.id, isLinked });
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
  }, [linkMode, linkSource, tables, svgPoint, autoPositions, showSaving, linkMutation]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingId) return;
    e.preventDefault();
    const pt = svgPoint(e.clientX, e.clientY);
    // Clamp using the dragged table's actual footprint — multi-cell tables
    // (e.g. rectangle, booth) must not hang off the right or bottom edge.
    const dragging = filteredTables.find(t => t.id === draggingId);
    const { w, h } = dragging ? getTablePxSize(dragging) : { w: CELL, h: CELL };
    setDragPos({
      x: Math.max(0, Math.min(SVG_W - w, pt.x - dragOffset.x)),
      y: Math.max(0, Math.min(SVG_H - h, pt.y - dragOffset.y)),
    });
  }, [draggingId, filteredTables, svgPoint, dragOffset]);

  const handlePointerUp = useCallback(() => {
    if (!draggingId || !dragPos) return;
    // Clamp the snap to the table's grid footprint so a multi-cell table
    // can't be saved hanging off the right/bottom edge of the grid.
    const dragging = filteredTables.find(tbl => tbl.id === draggingId);
    const { w, h } = dragging ? getTablePxSize(dragging) : { w: CELL, h: CELL };
    const { gx, gy } = snapToGrid(
      dragPos.x, dragPos.y, Math.round(w / CELL), Math.round(h / CELL),
    );
    const id = draggingId;
    setDraggingId(null); setDragPos(null);
    showSaving();
    // Optimistic mutation: onMutate cancels in-flight refetches + patches the
    // cache, onError rolls back, onSettled re-syncs. No drag-save ↔ refetch race.
    positionMutation.mutate({ id, gx, gy });
  }, [draggingId, dragPos, filteredTables, showSaving, positionMutation]);

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
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      if (!locations.includes(data.location)) setActiveLocation(data.location);
      showSaved();
    } catch (err) {
      console.error('Failed to create table:', err);
      setSaveStatus('idle');
      toastError(t('errors.serverError'));
    }
  }, [queryClient, locations, showSaving, showSaved, toastError, t]);

  const handleDeleteTable = useCallback(async (tableId: string) => {
    showSaving();
    try {
      await hostAPI.deleteTable(tableId);
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      showSaved();
    } catch (err) {
      console.error('Failed to delete table:', err);
      setSaveStatus('idle');
      toastError(t('errors.serverError'));
    }
  }, [queryClient, showSaving, showSaved, toastError, t]);

  const handleUpdateProps = useCallback(async (data: {
    table_id: string; shape?: string; capacity?: number;
  }) => {
    showSaving();
    try {
      await hostAPI.updateTableProperties(data);
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      showSaved();
    } catch (err) {
      console.error('Failed to update table:', err);
      setSaveStatus('idle');
      toastError(t('errors.serverError'));
    }
  }, [queryClient, showSaving, showSaved, toastError, t]);

  // ─── Render ───────────────────────────────────────────────────────────────────

  if (isError && !isLoading) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] p-6">
          <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-8 max-w-md text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <ThiingsIcon name="alert-circle" pxSize={32} className="text-red-600" />
            </div>
            <h3 className="text-lg font-bold text-red-900 mb-2">{t('floorPlan.errorTitle')}</h3>
            <p className="text-sm text-red-700 mb-4">{t('errors.serverError')}</p>
            <button
              onClick={() => refetch()}
              className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition-colors"
            >
              {t('common.retry')}
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-3 sm:p-6 lg:p-8 max-w-[1280px] mx-auto mt-14 sm:mt-0 pb-20 sm:pb-8">

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

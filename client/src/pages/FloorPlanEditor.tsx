import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { DndContext, useDraggable, useSensor, useSensors, PointerSensor } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { hostAPI } from '../services/api';
import type { Table, TableShape, TableStatus, ActiveParty } from '../types/host.types';
import { getTableSize } from '../types/host.types';
import DashboardLayout from '../components/layout/DashboardLayout';
import { TableRenderer, TablePreview } from '../components/host/TableRenderer';

const GRID_SIZE = 20; // 20 columns
const GRID_HEIGHT = 15; // 15 rows
const GRID_CELL_SIZE = 55; // pixels per grid cell (larger for better visibility)

/**
 * Auto-arrange tables that don't have saved positions.
 * Distributes them evenly across the grid, grouped by capacity.
 */
function autoArrangeTables(tables: Table[]): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();

  // Find tables that need positioning (position is 0,0 or null/undefined)
  const unpositionedTables = tables.filter(t =>
    (t.position_x === null || t.position_x === undefined || t.position_x === 0) &&
    (t.position_y === null || t.position_y === undefined || t.position_y === 0)
  );

  if (unpositionedTables.length === 0) return positions;

  // Sort by capacity for better grouping
  const sorted = [...unpositionedTables].sort((a, b) => (a.capacity || 2) - (b.capacity || 2));

  // Calculate grid layout - leave margins
  const startX = 2;
  const startY = 2;
  const spacingX = 4; // 4 cells between tables horizontally (to accommodate larger tables)
  const spacingY = 3; // 3 cells between tables vertically
  const maxCols = Math.floor((GRID_SIZE - startX * 2) / spacingX);

  sorted.forEach((table, index) => {
    const col = index % maxCols;
    const row = Math.floor(index / maxCols);

    const x = startX + col * spacingX;
    const y = startY + row * spacingY;

    // Get proportional size for boundary check
    const tableSize = getTableSize(table.shape || 'square', table.capacity || 4);

    // Ensure we don't go off the grid
    const safeX = Math.min(x, GRID_SIZE - tableSize.width - 1);
    const safeY = Math.min(y, GRID_HEIGHT - tableSize.height - 1);

    positions.set(table.id, { x: safeX, y: safeY });
  });

  return positions;
}

// SVG Icons
const SaveIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
  </svg>
);

const RotateIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

const TrashIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

const ArrowLeftIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
  </svg>
);

const UnlinkIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
  </svg>
);

const SunIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
  </svg>
);

const MoonIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
  </svg>
);

interface DraggableTableProps {
  table: Table;
  isSelected: boolean;
  onSelect: () => void;
  linkMode: boolean;
  linkSource: string | null;
  darkMode?: boolean;
  guestName?: string;
  isVIP?: boolean;
  specialOccasion?: string;
  onStatusChange?: (tableId: string, status: TableStatus) => void;
}

// Status cycle order for double-click
const STATUS_ORDER: TableStatus[] = ['Available', 'Occupied', 'Reserved', 'Being Cleaned'];

function DraggableTable({
  table,
  isSelected,
  onSelect,
  linkMode,
  linkSource,
  darkMode = false,
  guestName,
  isVIP,
  specialOccasion,
  onStatusChange
}: DraggableTableProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: table.id,
    data: { table }
  });
  const [lastClickTime, setLastClickTime] = useState(0);

  // Get proportional size based on shape and capacity
  const tableSize = getTableSize(table.shape || 'square', table.capacity || 4);
  const pixelWidth = tableSize.width * GRID_CELL_SIZE;
  const pixelHeight = tableSize.height * GRID_CELL_SIZE;

  const style = {
    left: table.position_x * GRID_CELL_SIZE,
    top: table.position_y * GRID_CELL_SIZE,
    width: pixelWidth,
    height: pixelHeight,
    transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
    zIndex: isDragging ? 100 : isSelected ? 50 : 1,
  };

  const isLinkTarget = linkMode && linkSource && linkSource !== table.id;
  const isLinkSource = linkSource === table.id;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const now = Date.now();

    if (now - lastClickTime < 300) {
      // Double-click detected: cycle status
      if (onStatusChange) {
        const currentIndex = STATUS_ORDER.indexOf(table.status);
        const nextStatus = STATUS_ORDER[(currentIndex + 1) % STATUS_ORDER.length];
        onStatusChange(table.id, nextStatus);
      }
    } else {
      // Single click: select table
      onSelect();
    }

    setLastClickTime(now);
  };

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={style}
      onClick={handleClick}
      className={`
        absolute cursor-grab active:cursor-grabbing overflow-visible
        ${isDragging ? 'opacity-50' : ''}
        ${isLinkTarget ? 'ring-2 ring-blue-500 ring-dashed animate-pulse rounded-lg' : ''}
        ${isLinkSource ? 'ring-4 ring-[#9F1239] rounded-lg' : ''}
        transition-shadow hover:shadow-lg
      `}
    >
      <TableRenderer
        shape={table.shape || 'square'}
        capacity={table.capacity || 4}
        width={pixelWidth}
        height={pixelHeight}
        status={table.status}
        tableNumber={table.table_number}
        isSelected={isSelected}
        darkMode={darkMode}
        guestName={guestName}
        isVIP={isVIP}
        specialOccasion={specialOccasion}
      />
    </div>
  );
}

// Palette items configuration
const PALETTE_ITEMS: { shape: TableShape; capacity: number; label: string }[] = [
  { shape: 'round', capacity: 2, label: '2-Top Round' },
  { shape: 'round', capacity: 4, label: '4-Top Round' },
  { shape: 'square', capacity: 4, label: '4-Top Square' },
  { shape: 'rectangle', capacity: 6, label: '6-Top Long' },
  { shape: 'rectangle', capacity: 8, label: '8-Top Long' },
  { shape: 'oval', capacity: 6, label: '6-Top Oval' },
  { shape: 'booth', capacity: 4, label: '4-Top Booth' },
  { shape: 'booth', capacity: 6, label: '6-Top Booth' },
  { shape: 'bar-stool', capacity: 1, label: 'Bar Stool' },
];

interface TablePaletteItemProps {
  shape: TableShape;
  capacity: number;
  label: string;
}

function TablePaletteItem({ shape, capacity, label }: TablePaletteItemProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${shape}-${capacity}`,
    data: { type: 'new-table', shape, capacity }
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`
        flex flex-col items-center gap-1 p-2 rounded-lg border border-[#E7E5E4] bg-white cursor-grab
        ${isDragging ? 'opacity-50' : ''}
        hover:bg-[#F5F5F4] hover:border-[#9F1239] transition-colors
      `}
    >
      <TablePreview shape={shape} capacity={capacity} width={44} height={44} />
      <span className="text-[10px] text-[#57534E] text-center leading-tight">{label}</span>
    </div>
  );
}

interface TablePropertiesPanelProps {
  table: Table;
  tables: Table[];
  onUpdate: (updates: Partial<Table>) => void;
  onUnlink: (linkedTableId: string) => void;
  onClose: () => void;
}

function TablePropertiesPanel({ table, tables, onUpdate, onUnlink, onClose }: TablePropertiesPanelProps) {
  const linkedTables = (table.joinable_with || [])
    .map(id => tables.find(t => t.id === id))
    .filter(Boolean) as Table[];

  return (
    <div className="w-72 bg-white rounded-xl border border-[#E7E5E4] p-4 shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-[#1C1917]">Table {table.table_number}</h3>
        <button
          onClick={onClose}
          className="text-[#A8A29E] hover:text-[#57534E]"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="space-y-4">
        {/* Shape */}
        <div>
          <label className="block text-xs font-medium text-[#57534E] mb-2">Shape</label>
          <div className="grid grid-cols-2 gap-2">
            {(['round', 'square', 'rectangle', 'oval', 'booth', 'bar-stool'] as TableShape[]).map(shape => (
              <button
                key={shape}
                onClick={() => onUpdate({ shape })}
                className={`py-2 px-2 rounded-lg border-2 text-xs font-medium transition-colors ${
                  table.shape === shape
                    ? 'border-[#9F1239] bg-[#9F1239]/10 text-[#9F1239]'
                    : 'border-[#E7E5E4] text-[#57534E] hover:bg-[#F5F5F4]'
                }`}
              >
                <div className="flex items-center justify-center gap-1">
                  {shape === 'round' && <div className="w-3 h-3 rounded-full border-2 border-current" />}
                  {shape === 'square' && <div className="w-3 h-3 rounded-sm border-2 border-current" />}
                  {shape === 'rectangle' && <div className="w-4 h-2 rounded-sm border-2 border-current" />}
                  {shape === 'oval' && <div className="w-4 h-2 rounded-full border-2 border-current" />}
                  {shape === 'booth' && (
                    <svg width="12" height="8" viewBox="0 0 12 8" className="stroke-current fill-none" strokeWidth="1.5">
                      <path d="M1,7 L1,3 Q1,1 3,1 L9,1 Q11,1 11,3 L11,7" />
                    </svg>
                  )}
                  {shape === 'bar-stool' && <div className="w-2 h-2 rounded-full border-2 border-current" />}
                  <span className="capitalize">{shape.replace('-', ' ')}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Capacity */}
        <div>
          <label className="block text-xs font-medium text-[#57534E] mb-2">Capacity</label>
          <input
            type="number"
            min="1"
            max="20"
            value={table.capacity}
            onChange={(e) => onUpdate({ capacity: parseInt(e.target.value) || 1 })}
            className="w-full px-3 py-2 border border-[#E7E5E4] rounded-lg text-[#1C1917] focus:outline-none focus:ring-2 focus:ring-[#9F1239]"
          />
        </div>

        {/* Joinable Toggle */}
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-[#57534E]">Can be joined</label>
          <button
            onClick={() => onUpdate({ is_joinable: !table.is_joinable })}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              table.is_joinable ? 'bg-[#9F1239]' : 'bg-[#E7E5E4]'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                table.is_joinable ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* Fixed Seating Toggle */}
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-[#57534E]">Fixed seating (booth)</label>
          <button
            onClick={() => onUpdate({ is_fixed_seating: !table.is_fixed_seating })}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              table.is_fixed_seating ? 'bg-[#9F1239]' : 'bg-[#E7E5E4]'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                table.is_fixed_seating ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* Linked Tables */}
        {linkedTables.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-[#57534E] mb-2">Linked Tables</label>
            <div className="space-y-2">
              {linkedTables.map(lt => (
                <div
                  key={lt.id}
                  className="flex items-center justify-between p-2 bg-[#F5F5F4] rounded-lg"
                >
                  <span className="text-sm text-[#1C1917]">Table {lt.table_number}</span>
                  <button
                    onClick={() => onUnlink(lt.id)}
                    className="p-1 text-red-500 hover:bg-red-100 rounded"
                    title="Unlink table"
                  >
                    <UnlinkIcon className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Position Info */}
        <div className="pt-3 border-t border-[#E7E5E4]">
          <p className="text-xs text-[#A8A29E]">
            Position: ({table.position_x}, {table.position_y})
          </p>
          <p className="text-xs text-[#A8A29E]">
            Size: {table.width || 1} x {table.height || 1}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function FloorPlanEditor() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [linkMode, setLinkMode] = useState(false);
  const [linkSource, setLinkSource] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [localPositions, setLocalPositions] = useState<Record<string, { x: number; y: number }>>({});

  // Dark mode state with localStorage persistence
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('floor-plan-dark-mode') === 'true';
  });

  // Toggle dark mode handler
  const toggleDarkMode = () => {
    const newValue = !darkMode;
    setDarkMode(newValue);
    localStorage.setItem('floor-plan-dark-mode', String(newValue));
  };

  // Configure sensors for smoother dragging
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  // Fetch tables
  const { data: dashboardData, isLoading } = useQuery({
    queryKey: ['tables-floor-plan'],
    queryFn: hostAPI.getDashboard,
  });

  const rawTables: Table[] = dashboardData?.data?.tables || (dashboardData as any)?.tables || [];

  // Calculate auto-arranged positions for tables without saved positions
  const autoArrangedPositions = React.useMemo(
    () => autoArrangeTables(rawTables),
    [rawTables]
  );

  // Apply local position changes to tables, using auto-arranged positions as fallback
  const tables = rawTables.map(t => {
    // Priority: 1) local positions (user dragged), 2) saved positions, 3) auto-arranged
    const autoPos = autoArrangedPositions.get(t.id);
    const hasNoSavedPosition =
      (t.position_x === null || t.position_x === undefined || t.position_x === 0) &&
      (t.position_y === null || t.position_y === undefined || t.position_y === 0);

    return {
      ...t,
      position_x: localPositions[t.id]?.x ?? (hasNoSavedPosition ? (autoPos?.x ?? 0) : t.position_x),
      position_y: localPositions[t.id]?.y ?? (hasNoSavedPosition ? (autoPos?.y ?? 0) : t.position_y),
      width: t.width || 1,
      height: t.height || 1,
      shape: t.shape || 'square',
    };
  });

  const selectedTable = tables.find(t => t.id === selectedTableId);

  // Update table position mutation (batch save)
  const updatePositionMutation = useMutation({
    mutationFn: async (updates: Array<{ tableId: string; position_x: number; position_y: number }>) => {
      // Update each table position using authenticated API
      const promises = updates.map(({ tableId, position_x, position_y }) =>
        hostAPI.updateTablePosition(tableId, position_x, position_y)
      );
      await Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables-floor-plan'] });
      setLocalPositions({});
      setHasUnsavedChanges(false);
    }
  });

  // Update table config mutation
  const updateTableMutation = useMutation({
    mutationFn: async ({ tableId, updates }: { tableId: string; updates: Partial<Table> }) => {
      const response = await hostAPI.updateTableProperties({
        table_id: tableId,
        shape: updates.shape,
        capacity: updates.capacity,
        is_joinable: updates.is_joinable,
        is_fixed_seating: updates.is_fixed_seating
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables-floor-plan'] });
    }
  });

  // Link tables mutation
  const linkTablesMutation = useMutation({
    mutationFn: async ({ tableId, linkWithId }: { tableId: string; linkWithId: string }) => {
      const response = await hostAPI.linkTables(tableId, linkWithId);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables-floor-plan'] });
      setLinkMode(false);
      setLinkSource(null);
    }
  });

  // Unlink tables mutation
  const unlinkTablesMutation = useMutation({
    mutationFn: async ({ tableId, linkedTableId }: { tableId: string; linkedTableId: string }) => {
      const response = await hostAPI.unlinkTables(tableId, linkedTableId);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables-floor-plan'] });
    }
  });

  // Delete table mutation
  const deleteTableMutation = useMutation({
    mutationFn: async (tableId: string) => {
      const response = await hostAPI.deleteTable(tableId);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables-floor-plan'] });
      setSelectedTableId(null);
    }
  });

  // Create new table mutation (for dragging from palette)
  const createTableMutation = useMutation({
    mutationFn: async (data: { shape: TableShape; capacity: number; position_x: number; position_y: number }) => {
      // Find the next available table number
      const existingNumbers = tables.map(t => t.table_number).filter(n => typeof n === 'number');
      const maxNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers.map(n => parseInt(String(n), 10))) : 0;
      const newTableNumber = maxNumber + 1;

      const response = await hostAPI.createTable({
        table_number: newTableNumber,
        capacity: data.capacity,
        shape: data.shape,
        position_x: data.position_x,
        position_y: data.position_y,
        location: 'Main'
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables-floor-plan'] });
    }
  });

  // Update table status mutation (for double-click quick status change)
  const updateStatusMutation = useMutation({
    mutationFn: async ({ tableId, status }: { tableId: string; status: TableStatus }) => {
      const response = await hostAPI.updateTableStatus(tableId, status);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables-floor-plan'] });
    }
  });

  // Auto-assign shapes mutation
  const autoAssignShapesMutation = useMutation({
    mutationFn: async () => {
      const response = await hostAPI.autoAssignShapes();
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables-floor-plan'] });
    }
  });

  // Extract active parties from dashboard data
  const activeParties: ActiveParty[] = dashboardData?.data?.active_parties ||
                                        (dashboardData as any)?.active_parties || [];

  // Create lookup map: table_id -> party info
  const tablePartyMap = React.useMemo(() => {
    const map = new Map<string, {
      guestName: string;
      isVIP?: boolean;
      specialOccasion?: string
    }>();

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

  // Handler for status change
  const handleStatusChange = useCallback((tableId: string, status: TableStatus) => {
    updateStatusMutation.mutate({ tableId, status });
  }, [updateStatusMutation]);

  const handleDeleteTable = useCallback(() => {
    if (!selectedTableId) return;
    const table = tables.find(t => t.id === selectedTableId);
    if (!table) return;

    if (table.status === 'Occupied') {
      alert('Cannot delete an occupied table. Please clear the table first.');
      return;
    }

    if (confirm(`Are you sure you want to delete Table ${table.table_number}?`)) {
      deleteTableMutation.mutate(selectedTableId);
    }
  }, [selectedTableId, tables, deleteTableMutation]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, delta, over } = event;

    if (!active.data.current) return;

    // Check if this is a new table being dragged from the palette
    if (active.data.current.type === 'new-table') {
      const { shape, capacity } = active.data.current as { shape: TableShape; capacity: number };
      const tableSize = getTableSize(shape, capacity);

      // Calculate drop position - use a default position if not dropped on canvas
      // The delta is relative to the original position of the palette item
      // We need to convert this to canvas coordinates
      const dropX = Math.max(0, Math.min(GRID_SIZE - tableSize.width,
        Math.round(delta.x / GRID_CELL_SIZE) + 2 // Start at position 2 as default
      ));
      const dropY = Math.max(0, Math.min(GRID_HEIGHT - tableSize.height,
        Math.round(delta.y / GRID_CELL_SIZE) + 2
      ));

      // Create the new table
      createTableMutation.mutate({
        shape,
        capacity,
        position_x: dropX,
        position_y: dropY
      });
      return;
    }

    // Handle moving existing table
    const table = tables.find(t => t.id === active.id);
    if (!table) return;

    // Get proportional size for boundary calculations
    const tableSize = getTableSize(table.shape || 'square', table.capacity || 4);

    // Calculate new grid position
    const currentX = localPositions[table.id]?.x ?? table.position_x;
    const currentY = localPositions[table.id]?.y ?? table.position_y;

    const newX = Math.max(0, Math.min(GRID_SIZE - tableSize.width,
      Math.round((currentX * GRID_CELL_SIZE + delta.x) / GRID_CELL_SIZE)
    ));
    const newY = Math.max(0, Math.min(GRID_HEIGHT - tableSize.height,
      Math.round((currentY * GRID_CELL_SIZE + delta.y) / GRID_CELL_SIZE)
    ));

    if (newX !== currentX || newY !== currentY) {
      setLocalPositions(prev => ({
        ...prev,
        [table.id]: { x: newX, y: newY }
      }));
      setHasUnsavedChanges(true);
    }
  }, [tables, localPositions, createTableMutation]);

  const handleTableClick = useCallback((tableId: string) => {
    if (linkMode) {
      if (linkSource === null) {
        setLinkSource(tableId);
      } else if (linkSource !== tableId) {
        linkTablesMutation.mutate({ tableId: linkSource, linkWithId: tableId });
      }
    } else {
      setSelectedTableId(tableId === selectedTableId ? null : tableId);
    }
  }, [linkMode, linkSource, selectedTableId, linkTablesMutation]);

  const handleSavePositions = useCallback(() => {
    const updates = Object.entries(localPositions).map(([tableId, pos]) => ({
      tableId,
      position_x: pos.x,
      position_y: pos.y
    }));
    if (updates.length > 0) {
      updatePositionMutation.mutate(updates);
    }
  }, [localPositions, updatePositionMutation]);

  const handleUpdateTable = useCallback((updates: Partial<Table>) => {
    if (selectedTableId) {
      updateTableMutation.mutate({ tableId: selectedTableId, updates });
    }
  }, [selectedTableId, updateTableMutation]);

  const handleUnlinkTable = useCallback((linkedTableId: string) => {
    if (selectedTableId) {
      unlinkTablesMutation.mutate({ tableId: selectedTableId, linkedTableId });
    }
  }, [selectedTableId, unlinkTablesMutation]);

  // Draw dotted lines between linked tables
  const renderLinks = () => {
    const links: React.ReactElement[] = [];
    const processedPairs = new Set<string>();

    tables.forEach(table => {
      (table.joinable_with || []).forEach(linkedId => {
        const pairKey = [table.id, linkedId].sort().join('-');
        if (processedPairs.has(pairKey)) return;
        processedPairs.add(pairKey);

        const linkedTable = tables.find(t => t.id === linkedId);
        if (!linkedTable) return;

        // Get proportional sizes for center calculation
        const tableSize = getTableSize(table.shape || 'square', table.capacity || 4);
        const linkedTableSize = getTableSize(linkedTable.shape || 'square', linkedTable.capacity || 4);

        const x1 = (table.position_x + tableSize.width / 2) * GRID_CELL_SIZE;
        const y1 = (table.position_y + tableSize.height / 2) * GRID_CELL_SIZE;
        const x2 = (linkedTable.position_x + linkedTableSize.width / 2) * GRID_CELL_SIZE;
        const y2 = (linkedTable.position_y + linkedTableSize.height / 2) * GRID_CELL_SIZE;

        links.push(
          <line
            key={pairKey}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="#9F1239"
            strokeWidth="2"
            strokeDasharray="6,4"
            opacity="0.6"
          />
        );
      });
    });

    return links;
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-screen bg-[#F5F5F4]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#E7E5E4] border-t-[#9F1239] mb-4 mx-auto"></div>
            <p className="text-[#57534E]">Loading floor plan...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className={`min-h-screen p-6 transition-colors ${darkMode ? 'bg-[#1C1917]' : 'bg-[#F5F5F4]'}`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/host-dashboard/simple')}
              className={`p-2 rounded-lg transition-colors ${darkMode ? 'hover:bg-[#292524]' : 'hover:bg-white'}`}
              title="Back to Dashboard"
            >
              <ArrowLeftIcon className={`w-5 h-5 ${darkMode ? 'text-[#A8A29E]' : 'text-[#57534E]'}`} />
            </button>
            <h1 className={`text-2xl font-serif font-bold ${darkMode ? 'text-white' : 'text-[#1C1917]'}`}>Floor Plan Editor</h1>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => autoAssignShapesMutation.mutate()}
              disabled={autoAssignShapesMutation.isPending}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                darkMode
                  ? 'bg-[#44403C] text-white border border-[#57534E] hover:bg-[#57534E]'
                  : 'bg-white border border-[#E7E5E4] text-[#1C1917] hover:bg-[#F5F5F4]'
              }`}
              title="Automatically assign different shapes based on table capacity"
            >
              {autoAssignShapesMutation.isPending ? 'Assigning...' : 'Auto Shapes'}
            </button>
            <button
              onClick={handleSavePositions}
              disabled={!hasUnsavedChanges || updatePositionMutation.isPending}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                hasUnsavedChanges
                  ? 'bg-[#9F1239] text-white hover:bg-[#881337]'
                  : 'bg-[#E7E5E4] text-[#A8A29E] cursor-not-allowed'
              }`}
            >
              <SaveIcon className="w-4 h-4" />
              {updatePositionMutation.isPending ? 'Saving...' : 'Save Positions'}
            </button>
            {/* Dark Mode Toggle */}
            <button
              onClick={toggleDarkMode}
              className={`p-2 rounded-lg transition-colors ${
                darkMode
                  ? 'bg-[#44403C] text-yellow-400 hover:bg-[#57534E]'
                  : 'bg-white text-[#57534E] border border-[#E7E5E4] hover:bg-[#F5F5F4]'
              }`}
              title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {darkMode ? <SunIcon className="w-5 h-5" /> : <MoonIcon className="w-5 h-5" />}
            </button>
            <button
              onClick={() => navigate('/host-dashboard/simple')}
              className={`px-4 py-2 rounded-lg font-medium ${
                darkMode
                  ? 'bg-[#44403C] text-white border border-[#57534E] hover:bg-[#57534E]'
                  : 'bg-white border border-[#E7E5E4] text-[#1C1917] hover:bg-[#F5F5F4]'
              }`}
            >
              Done
            </button>
          </div>
        </div>

        {/* Unsaved Changes Banner */}
        {hasUnsavedChanges && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between">
            <p className="text-sm text-amber-800 font-medium">
              You have unsaved position changes
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setLocalPositions({});
                  setHasUnsavedChanges(false);
                }}
                className="px-3 py-1 text-sm text-amber-800 hover:bg-amber-100 rounded"
              >
                Discard
              </button>
              <button
                onClick={handleSavePositions}
                className="px-3 py-1 text-sm bg-amber-600 text-white rounded hover:bg-amber-700"
              >
                Save Now
              </button>
            </div>
          </div>
        )}

        <div className="flex gap-6">
          {/* Sidebar - Table Palette */}
          <div className="w-48 flex-shrink-0">
            <div className={`rounded-xl border p-4 sticky top-6 ${darkMode ? 'bg-[#292524] border-[#44403C]' : 'bg-white border-[#E7E5E4]'}`}>
              <h3 className={`font-semibold mb-3 ${darkMode ? 'text-white' : 'text-[#1C1917]'}`}>Add Tables</h3>
              <p className={`text-xs mb-4 ${darkMode ? 'text-[#A8A29E]' : 'text-[#A8A29E]'}`}>
                Drag tables onto the canvas
              </p>

              <div className="grid grid-cols-2 gap-2">
                {PALETTE_ITEMS.map(item => (
                  <TablePaletteItem
                    key={`${item.shape}-${item.capacity}`}
                    shape={item.shape}
                    capacity={item.capacity}
                    label={item.label}
                  />
                ))}
              </div>

              <hr className={`my-4 ${darkMode ? 'border-[#44403C]' : 'border-[#E7E5E4]'}`} />

              <h3 className={`font-semibold mb-3 ${darkMode ? 'text-white' : 'text-[#1C1917]'}`}>Quick Actions</h3>
              <div className="space-y-2">
                <button
                  onClick={() => {
                    if (selectedTable) {
                      const newRotation = ((selectedTable.rotation || 0) + 90) % 360;
                      handleUpdateTable({ rotation: newRotation });
                    }
                  }}
                  disabled={!selectedTableId}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm rounded-lg transition-colors ${
                    selectedTableId
                      ? darkMode ? 'hover:bg-[#44403C] text-white' : 'hover:bg-[#F5F5F4] text-[#1C1917]'
                      : 'text-[#A8A29E] cursor-not-allowed'
                  }`}
                >
                  <RotateIcon className="w-4 h-4" />
                  Rotate 90
                </button>
                <button
                  onClick={handleDeleteTable}
                  disabled={!selectedTableId || deleteTableMutation.isPending}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm rounded-lg transition-colors ${
                    selectedTableId && !deleteTableMutation.isPending
                      ? darkMode ? 'text-red-400 hover:bg-red-900/30' : 'text-red-600 hover:bg-red-50'
                      : 'text-[#A8A29E] cursor-not-allowed'
                  }`}
                >
                  <TrashIcon className="w-4 h-4" />
                  {deleteTableMutation.isPending ? 'Deleting...' : 'Delete Table'}
                </button>
              </div>

            </div>
          </div>

          {/* Canvas */}
          <div className="flex-1 flex flex-col">
            <div className={`flex-1 rounded-xl border overflow-auto shadow-sm ${darkMode ? 'bg-[#292524] border-[#44403C]' : 'bg-white border-[#E7E5E4]'}`}>
            <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
              <div
                className="relative"
                style={{
                  width: GRID_SIZE * GRID_CELL_SIZE,
                  height: GRID_HEIGHT * GRID_CELL_SIZE,
                  backgroundColor: darkMode ? '#1C1917' : '#FAFAF9'
                }}
                onClick={() => {
                  if (!linkMode) {
                    setSelectedTableId(null);
                  }
                }}
              >
                {/* Linked table lines */}
                <svg
                  className="absolute inset-0 pointer-events-none"
                  style={{ width: GRID_SIZE * GRID_CELL_SIZE, height: GRID_HEIGHT * GRID_CELL_SIZE }}
                >
                  {renderLinks()}
                </svg>

                {/* Tables */}
                {tables.map(table => {
                  const partyInfo = tablePartyMap.get(table.id);
                  return (
                    <DraggableTable
                      key={table.id}
                      table={table}
                      isSelected={selectedTableId === table.id}
                      onSelect={() => handleTableClick(table.id)}
                      linkMode={linkMode}
                      linkSource={linkSource}
                      darkMode={darkMode}
                      guestName={partyInfo?.guestName}
                      isVIP={partyInfo?.isVIP}
                      specialOccasion={partyInfo?.specialOccasion}
                      onStatusChange={handleStatusChange}
                    />
                  );
                })}
              </div>
            </DndContext>
            </div>
          </div>

          {/* Properties Panel (when table selected) */}
          {selectedTable && !linkMode && (
            <TablePropertiesPanel
              table={selectedTable}
              tables={tables}
              onUpdate={handleUpdateTable}
              onUnlink={handleUnlinkTable}
              onClose={() => setSelectedTableId(null)}
            />
          )}
        </div>

        {/* Help Text */}
        <div className={`mt-6 text-center text-sm ${darkMode ? 'text-[#78716C]' : 'text-[#A8A29E]'}`}>
          <p>Drag tables to position them. Click to edit, double-click to change status.</p>
        </div>
      </div>
    </DashboardLayout>
  );
}

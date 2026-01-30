# Table Floor Plan Editor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable restaurant managers to configure table shapes (round/square), position tables on a visual floor plan with snap-to-grid, and manually link joinable tables.

**Architecture:**
- Phase 1 updates the data model and onboarding to capture shape and fixed-seating info
- Phase 2 creates a new Floor Plan Editor page with drag-and-drop canvas
- Phase 3 updates the dashboard to render tables at their configured positions
- Phase 4 adds table joining logic during seating

**Tech Stack:** React, TypeScript, Tailwind CSS, @dnd-kit (already installed), Supabase PostgreSQL

---

## Phase 1: Data Model & Onboarding Updates

### Task 1.1: Update TypeScript Types

**Files:**
- Modify: `client/src/types/host.types.ts:3-16`
- Modify: `client/src/types/onboarding.types.ts:21-31`

**Step 1: Update Table interface in host.types.ts**

Add new shape and position fields to the existing Table interface:

```typescript
export type TableStatus = 'Available' | 'Occupied' | 'Being Cleaned' | 'Reserved';
export type TableShape = 'round' | 'square';

export interface Table {
  id: string;
  table_number: string;
  capacity: number;
  location: string;
  status: TableStatus;
  current_service_id?: string;

  // Shape configuration
  shape: TableShape;
  is_fixed_seating: boolean;      // Booths, sofas - can't move chairs

  // Joinable table configuration
  is_joinable: boolean;           // Can this table be combined?
  joinable_with: string[];        // IDs of tables it can link with

  // Floor plan positioning (grid units)
  position_x: number;
  position_y: number;
  width: number;                  // Grid units wide (default 1)
  height: number;                 // Grid units tall (default 1)
  rotation: number;               // 0, 90, 180, 270 degrees

  // Legacy fields (keep for backwards compatibility)
  is_fixed?: boolean;
  min_capacity?: number;
  max_capacity?: number;
  adjacent_tables?: string[];
  combination_group?: string;
}
```

**Step 2: Update TableConfiguration in onboarding.types.ts**

Update to support shape selection in onboarding:

```typescript
export type TableShape = 'round' | 'square';

export interface TableConfiguration {
  capacity: number;
  count: number;
  shape: TableShape;
  is_fixed_seating: boolean;  // For booths/sofas
  is_joinable: boolean;       // Can be combined with other tables
}

export interface RestaurantArea {
  name: string;
  is_active: boolean;
  tables: TableConfiguration[];
}
```

**Step 3: Verify types compile**

Run: `cd client && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add client/src/types/host.types.ts client/src/types/onboarding.types.ts
git commit -m "feat(types): add table shape, position, and joinable fields"
```

---

### Task 1.2: Update Onboarding Step3Tables UI

**Files:**
- Modify: `client/src/components/onboarding/Step3Tables.tsx`

**Step 1: Update TABLE_CAPACITIES to include shapes**

Replace the constant and add shape options:

```typescript
const TABLE_CAPACITIES = [2, 4, 6, 8];
const TABLE_SHAPES: TableShape[] = ['round', 'square'];
```

**Step 2: Update the table configuration grid**

Replace the existing grid (around line 337-378) with split round/square inputs. Find:

```typescript
<div className="grid grid-cols-2 gap-3">
  {area.tables.map((tableConfig, tableIndex) => (
```

Replace the entire grid with:

```typescript
<div className="space-y-4">
  {TABLE_CAPACITIES.map((capacity) => (
    <div key={capacity} className="bg-white rounded-xl p-4 border border-[#E7E5E4]">
      <h4 className="text-sm font-semibold text-[#1C1917] mb-3">
        {capacity}-Person Tables
      </h4>
      <div className="grid grid-cols-2 gap-3">
        {/* Round Tables */}
        <div className="p-3 bg-[#F5F5F4] rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-full border-2 border-[#9F1239]" />
            <span className="text-sm font-medium text-[#1C1917]">Round</span>
          </div>
          <input
            type="number"
            min="0"
            value={getTableCount(areaIndex, capacity, 'round') || ''}
            placeholder="0"
            onChange={(e) => updateTableConfig(areaIndex, capacity, 'round', 'count', parseInt(e.target.value) || 0)}
            className="w-full px-3 py-2 bg-white border border-[#E7E5E4] rounded-lg text-[#1C1917] placeholder-[#A8A29E] focus:outline-none focus:ring-2 focus:ring-[#9F1239] text-sm"
          />
          <div className="flex items-center gap-2 mt-2">
            <input
              type="checkbox"
              checked={getTableConfig(areaIndex, capacity, 'round')?.is_fixed_seating || false}
              onChange={(e) => updateTableConfig(areaIndex, capacity, 'round', 'is_fixed_seating', e.target.checked)}
              className="w-4 h-4 rounded border-[#E7E5E4] text-[#9F1239] focus:ring-[#9F1239]"
            />
            <span className="text-xs text-[#57534E]">Fixed seating</span>
          </div>
        </div>

        {/* Square Tables */}
        <div className="p-3 bg-[#F5F5F4] rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded border-2 border-[#9F1239]" />
            <span className="text-sm font-medium text-[#1C1917]">Square</span>
          </div>
          <input
            type="number"
            min="0"
            value={getTableCount(areaIndex, capacity, 'square') || ''}
            placeholder="0"
            onChange={(e) => updateTableConfig(areaIndex, capacity, 'square', 'count', parseInt(e.target.value) || 0)}
            className="w-full px-3 py-2 bg-white border border-[#E7E5E4] rounded-lg text-[#1C1917] placeholder-[#A8A29E] focus:outline-none focus:ring-2 focus:ring-[#9F1239] text-sm"
          />
          <div className="flex items-center gap-2 mt-2">
            <input
              type="checkbox"
              checked={getTableConfig(areaIndex, capacity, 'square')?.is_fixed_seating || false}
              onChange={(e) => updateTableConfig(areaIndex, capacity, 'square', 'is_fixed_seating', e.target.checked)}
              className="w-4 h-4 rounded border-[#E7E5E4] text-[#9F1239] focus:ring-[#9F1239]"
            />
            <span className="text-xs text-[#57534E]">Fixed seating</span>
          </div>
        </div>
      </div>
    </div>
  ))}
</div>
```

**Step 3: Add helper functions for the new data structure**

Add these functions after the existing helper functions (around line 145):

```typescript
// Get table config for specific capacity and shape
const getTableConfig = (areaIndex: number, capacity: number, shape: TableShape): TableConfiguration | undefined => {
  return data.areas[areaIndex]?.tables.find(
    t => t.capacity === capacity && t.shape === shape
  );
};

// Get table count for specific capacity and shape
const getTableCount = (areaIndex: number, capacity: number, shape: TableShape): number => {
  return getTableConfig(areaIndex, capacity, shape)?.count || 0;
};

// Update table configuration
const updateTableConfig = (
  areaIndex: number,
  capacity: number,
  shape: TableShape,
  field: 'count' | 'is_fixed_seating' | 'is_joinable',
  value: number | boolean
) => {
  const updatedAreas = [...data.areas];
  const area = updatedAreas[areaIndex];

  // Find existing config or create new one
  let configIndex = area.tables.findIndex(t => t.capacity === capacity && t.shape === shape);

  if (configIndex === -1) {
    // Create new config
    area.tables.push({
      capacity,
      count: 0,
      shape,
      is_fixed_seating: false,
      is_joinable: true
    });
    configIndex = area.tables.length - 1;
  }

  // Update the field
  (area.tables[configIndex] as any)[field] = value;

  updateData({ areas: updatedAreas });
};
```

**Step 4: Update addArea to use new table structure**

Find the `addArea` function and update:

```typescript
const addArea = (template: string) => {
  const areaName = template === 'Custom' ? `Area ${data.areas.length + 1}` : template;
  const newArea: RestaurantArea = {
    name: areaName,
    is_active: true,
    tables: [], // Start empty, user adds what they need
  };
  updateData({ areas: [...data.areas, newArea] });
};
```

**Step 5: Update calculateTotals to handle new structure**

```typescript
const calculateTotals = () => {
  let totalTables = 0;
  let totalCapacity = 0;

  data.areas.forEach((area) => {
    area.tables.forEach((config) => {
      totalTables += config.count;
      totalCapacity += config.capacity * config.count;
    });
  });

  return { totalTables, totalCapacity };
};
```

**Step 6: Verify the UI renders**

Run: `cd client && npm run dev`
Navigate to: http://localhost:5173/onboarding (skip to step 3)
Expected: See round/square split inputs for each capacity

**Step 7: Commit**

```bash
git add client/src/components/onboarding/Step3Tables.tsx
git commit -m "feat(onboarding): add round/square shape selection for tables"
```

---

### Task 1.3: Update Supabase Database Schema

**Files:**
- Create: `database/migrations/add_table_shape_position.sql`

**Step 1: Create migration file**

```sql
-- Add shape and position columns to tables
ALTER TABLE tables
ADD COLUMN IF NOT EXISTS shape VARCHAR(10) DEFAULT 'square',
ADD COLUMN IF NOT EXISTS is_fixed_seating BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS is_joinable BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS joinable_with TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS position_x INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS position_y INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS width INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS height INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS rotation INTEGER DEFAULT 0;

-- Add check constraint for shape values
ALTER TABLE tables
ADD CONSTRAINT check_shape CHECK (shape IN ('round', 'square'));

-- Add check constraint for rotation values
ALTER TABLE tables
ADD CONSTRAINT check_rotation CHECK (rotation IN (0, 90, 180, 270));

-- Create index for floor plan queries
CREATE INDEX IF NOT EXISTS idx_tables_position ON tables (position_x, position_y);
```

**Step 2: Run migration in Supabase**

Run this SQL in Supabase SQL Editor (Dashboard > SQL Editor)

**Step 3: Commit migration file**

```bash
git add database/migrations/add_table_shape_position.sql
git commit -m "feat(db): add table shape and position columns"
```

---

### Task 1.4: Update Backend API for Table Shape/Position

**Files:**
- Modify: `api/_lib/supabase.js:330-350` (createTable function)
- Modify: `api/_lib/supabase.js:373-418` (updateTableConfig function)

**Step 1: Update createTable function**

Find the createTable function and update the insert:

```javascript
const createTable = async (fields) => {
  const { data, error } = await supabase
    .from('tables')
    .insert({
      table_number: fields.table_number,
      capacity: fields.capacity,
      location: fields.location || 'Main',
      status: 'available',
      is_active: true,
      // Shape configuration
      shape: fields.shape || 'square',
      is_fixed_seating: fields.is_fixed_seating || false,
      // Joinable configuration
      is_joinable: fields.is_joinable !== false, // Default true
      joinable_with: fields.joinable_with || [],
      // Position configuration
      position_x: fields.position_x || 0,
      position_y: fields.position_y || 0,
      width: fields.width || 1,
      height: fields.height || 1,
      rotation: fields.rotation || 0,
      // Legacy fields
      is_fixed: fields.is_fixed || false,
      min_capacity: fields.min_capacity || 1,
      max_capacity: fields.max_capacity || null,
      adjacent_tables: fields.adjacent_tables || [],
      combination_group: fields.combination_group || null
    })
    .select()
    .single();

  if (error) return handleSupabaseResponse(null, error, 'CREATE table');

  return {
    success: true,
    table: {
      id: data.id,
      table_number: data.table_number,
      capacity: data.capacity,
      location: data.location,
      status: data.status,
      shape: data.shape,
      is_fixed_seating: data.is_fixed_seating,
      is_joinable: data.is_joinable,
      joinable_with: data.joinable_with,
      position_x: data.position_x,
      position_y: data.position_y,
      width: data.width,
      height: data.height,
      rotation: data.rotation
    }
  };
};
```

**Step 2: Update updateTableConfig function**

Add the new fields to the updates object:

```javascript
const updateTableConfig = async (tableId, fields) => {
  const updates = {};

  // Basic fields
  if (fields.table_number !== undefined) updates.table_number = fields.table_number;
  if (fields.capacity !== undefined) updates.capacity = fields.capacity;
  if (fields.location !== undefined) updates.location = fields.location;
  if (fields.status !== undefined) updates.status = fields.status;

  // Shape configuration
  if (fields.shape !== undefined) updates.shape = fields.shape;
  if (fields.is_fixed_seating !== undefined) updates.is_fixed_seating = fields.is_fixed_seating;

  // Joinable configuration
  if (fields.is_joinable !== undefined) updates.is_joinable = fields.is_joinable;
  if (fields.joinable_with !== undefined) updates.joinable_with = fields.joinable_with;

  // Position configuration
  if (fields.position_x !== undefined) updates.position_x = fields.position_x;
  if (fields.position_y !== undefined) updates.position_y = fields.position_y;
  if (fields.width !== undefined) updates.width = fields.width;
  if (fields.height !== undefined) updates.height = fields.height;
  if (fields.rotation !== undefined) updates.rotation = fields.rotation;

  // Legacy fields
  if (fields.is_fixed !== undefined) updates.is_fixed = fields.is_fixed;
  if (fields.min_capacity !== undefined) updates.min_capacity = fields.min_capacity;
  if (fields.max_capacity !== undefined) updates.max_capacity = fields.max_capacity;
  if (fields.adjacent_tables !== undefined) updates.adjacent_tables = fields.adjacent_tables;
  if (fields.combination_group !== undefined) updates.combination_group = fields.combination_group;

  console.log(`[updateTableConfig] Updating table ${tableId} with:`, updates);

  const { data, error } = await supabase
    .from('tables')
    .update(updates)
    .eq('id', tableId)
    .select()
    .single();

  if (error) {
    console.error(`[updateTableConfig] Error:`, error);
    return handleSupabaseResponse(null, error, 'UPDATE table config');
  }

  return {
    success: true,
    table: {
      id: data.id,
      table_number: data.table_number,
      capacity: data.capacity,
      location: data.location,
      status: data.status,
      shape: data.shape,
      is_fixed_seating: data.is_fixed_seating,
      is_joinable: data.is_joinable,
      joinable_with: data.joinable_with,
      position_x: data.position_x,
      position_y: data.position_y,
      width: data.width,
      height: data.height,
      rotation: data.rotation
    }
  };
};
```

**Step 3: Update getTables to return new fields**

Find the getTables function and update the field mapping:

```javascript
const getTables = async (filter = {}) => {
  let query = supabase.from('tables').select('*').eq('is_active', true);

  if (filter.status) {
    query = query.eq('status', filter.status);
  }
  if (filter.location) {
    query = query.eq('location', filter.location);
  }

  const { data, error } = await query.order('table_number', { ascending: true });

  if (error) return handleSupabaseResponse(null, error, 'GET tables');

  return {
    success: true,
    data: {
      records: data.map(t => ({
        id: t.id,
        fields: {
          'Table Number': t.table_number,
          'Capacity': t.capacity,
          'Location': t.location,
          'Status': t.status,
          'Shape': t.shape || 'square',
          'Is Fixed Seating': t.is_fixed_seating || false,
          'Is Joinable': t.is_joinable !== false,
          'Joinable With': t.joinable_with || [],
          'Position X': t.position_x || 0,
          'Position Y': t.position_y || 0,
          'Width': t.width || 1,
          'Height': t.height || 1,
          'Rotation': t.rotation || 0,
          // Legacy
          'Is Fixed': t.is_fixed,
          'Current Service ID': t.current_service_id
        }
      }))
    }
  };
};
```

**Step 4: Commit**

```bash
git add api/_lib/supabase.js
git commit -m "feat(api): support table shape and position in CRUD operations"
```

---

## Phase 2: Floor Plan Editor

### Task 2.1: Create Floor Plan Editor Page

**Files:**
- Create: `client/src/pages/FloorPlanEditor.tsx`
- Modify: `client/src/App.tsx`

**Step 1: Create the basic page structure**

```typescript
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { DndContext, DragEndEvent, DragStartEvent, useDraggable, useDroppable } from '@dnd-kit/core';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Table, TableShape } from '../types/host.types';

const GRID_SIZE = 20; // 20x15 grid
const GRID_CELL_SIZE = 40; // pixels per grid cell

interface DraggableTableProps {
  table: Table;
  isSelected: boolean;
  onSelect: () => void;
}

function DraggableTable({ table, isSelected, onSelect }: DraggableTableProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: table.id,
    data: { table }
  });

  const style = {
    left: table.position_x * GRID_CELL_SIZE,
    top: table.position_y * GRID_CELL_SIZE,
    width: table.width * GRID_CELL_SIZE - 4,
    height: table.height * GRID_CELL_SIZE - 4,
    transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
    zIndex: isDragging ? 100 : 1,
  };

  const shapeClass = table.shape === 'round' ? 'rounded-full' : 'rounded-lg';

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={style}
      onClick={onSelect}
      className={`
        absolute flex items-center justify-center cursor-grab active:cursor-grabbing
        ${shapeClass}
        ${isSelected ? 'ring-2 ring-[#9F1239] ring-offset-2' : ''}
        ${isDragging ? 'opacity-50' : ''}
        ${table.status === 'Available' ? 'bg-green-100 border-2 border-green-500' : 'bg-gray-100 border-2 border-gray-400'}
        transition-shadow hover:shadow-lg
      `}
    >
      <div className="text-center">
        <div className="font-bold text-sm">{table.table_number}</div>
        <div className="text-xs text-gray-600">{table.capacity}p</div>
      </div>
    </div>
  );
}

interface TablePaletteItemProps {
  shape: TableShape;
  capacity: number;
}

function TablePaletteItem({ shape, capacity }: TablePaletteItemProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${shape}-${capacity}`,
    data: { type: 'new-table', shape, capacity }
  });

  const shapeClass = shape === 'round' ? 'rounded-full' : 'rounded';

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`
        w-12 h-12 flex items-center justify-center cursor-grab
        ${shapeClass} border-2 border-[#9F1239] bg-white
        ${isDragging ? 'opacity-50' : ''}
        hover:bg-[#9F1239]/10
      `}
    >
      <span className="text-xs font-medium">{capacity}</span>
    </div>
  );
}

export default function FloorPlanEditor() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [linkMode, setLinkMode] = useState(false);
  const [linkSource, setLinkSource] = useState<string | null>(null);

  // Fetch tables
  const { data: tablesData, isLoading } = useQuery({
    queryKey: ['tables-floor-plan'],
    queryFn: async () => {
      const response = await fetch('/api/host-dashboard/tables');
      if (!response.ok) throw new Error('Failed to fetch tables');
      return response.json();
    }
  });

  const tables: Table[] = tablesData?.tables || [];

  // Update table position mutation
  const updatePositionMutation = useMutation({
    mutationFn: async ({ tableId, position_x, position_y }: { tableId: string; position_x: number; position_y: number }) => {
      const response = await fetch(`/api/tables/${tableId}/position`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position_x, position_y })
      });
      if (!response.ok) throw new Error('Failed to update position');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables-floor-plan'] });
    }
  });

  // Link tables mutation
  const linkTablesMutation = useMutation({
    mutationFn: async ({ tableId, linkWithId }: { tableId: string; linkWithId: string }) => {
      const response = await fetch(`/api/tables/${tableId}/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link_with: linkWithId })
      });
      if (!response.ok) throw new Error('Failed to link tables');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables-floor-plan'] });
      setLinkMode(false);
      setLinkSource(null);
    }
  });

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, delta } = event;

    if (!active.data.current) return;

    // Calculate new grid position
    const table = tables.find(t => t.id === active.id);
    if (!table) return;

    const newX = Math.max(0, Math.min(GRID_SIZE - table.width,
      Math.round((table.position_x * GRID_CELL_SIZE + delta.x) / GRID_CELL_SIZE)
    ));
    const newY = Math.max(0, Math.min(15 - table.height,
      Math.round((table.position_y * GRID_CELL_SIZE + delta.y) / GRID_CELL_SIZE)
    ));

    if (newX !== table.position_x || newY !== table.position_y) {
      updatePositionMutation.mutate({
        tableId: table.id,
        position_x: newX,
        position_y: newY
      });
    }
  };

  const handleTableClick = (tableId: string) => {
    if (linkMode) {
      if (linkSource === null) {
        setLinkSource(tableId);
      } else if (linkSource !== tableId) {
        linkTablesMutation.mutate({ tableId: linkSource, linkWithId: tableId });
      }
    } else {
      setSelectedTableId(tableId === selectedTableId ? null : tableId);
    }
  };

  // Draw dotted lines between linked tables
  const renderLinks = () => {
    const links: JSX.Element[] = [];
    const processedPairs = new Set<string>();

    tables.forEach(table => {
      (table.joinable_with || []).forEach(linkedId => {
        const pairKey = [table.id, linkedId].sort().join('-');
        if (processedPairs.has(pairKey)) return;
        processedPairs.add(pairKey);

        const linkedTable = tables.find(t => t.id === linkedId);
        if (!linkedTable) return;

        const x1 = (table.position_x + table.width / 2) * GRID_CELL_SIZE;
        const y1 = (table.position_y + table.height / 2) * GRID_CELL_SIZE;
        const x2 = (linkedTable.position_x + linkedTable.width / 2) * GRID_CELL_SIZE;
        const y2 = (linkedTable.position_y + linkedTable.height / 2) * GRID_CELL_SIZE;

        links.push(
          <line
            key={pairKey}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="#9F1239"
            strokeWidth="2"
            strokeDasharray="5,5"
            opacity="0.5"
          />
        );
      });
    });

    return links;
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-[#F5F5F4] p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-serif font-bold text-[#1C1917]">Floor Plan Editor</h1>
        <div className="flex gap-3">
          <button
            onClick={() => setLinkMode(!linkMode)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              linkMode
                ? 'bg-[#9F1239] text-white'
                : 'bg-white border border-[#E7E5E4] text-[#1C1917] hover:bg-[#F5F5F4]'
            }`}
          >
            {linkMode ? 'Cancel Link' : '🔗 Link Tables'}
          </button>
          <button
            onClick={() => navigate('/host-dashboard/simple')}
            className="px-4 py-2 bg-[#9F1239] text-white rounded-lg font-medium hover:bg-[#881337]"
          >
            Done
          </button>
        </div>
      </div>

      {linkMode && (
        <div className="mb-4 p-3 bg-[#9F1239]/10 border border-[#9F1239]/20 rounded-lg">
          <p className="text-sm text-[#9F1239]">
            {linkSource
              ? `Click another table to link with Table ${tables.find(t => t.id === linkSource)?.table_number}`
              : 'Click the first table to start linking'
            }
          </p>
        </div>
      )}

      <div className="flex gap-6">
        {/* Sidebar - Table Palette */}
        <div className="w-48 bg-white rounded-xl border border-[#E7E5E4] p-4">
          <h3 className="font-semibold text-[#1C1917] mb-3">Tables</h3>

          <div className="space-y-4">
            <div>
              <p className="text-xs text-[#57534E] mb-2">Round</p>
              <div className="flex flex-wrap gap-2">
                {[2, 4, 6].map(cap => (
                  <TablePaletteItem key={`round-${cap}`} shape="round" capacity={cap} />
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs text-[#57534E] mb-2">Square</p>
              <div className="flex flex-wrap gap-2">
                {[2, 4, 6, 8].map(cap => (
                  <TablePaletteItem key={`square-${cap}`} shape="square" capacity={cap} />
                ))}
              </div>
            </div>
          </div>

          <hr className="my-4 border-[#E7E5E4]" />

          <h3 className="font-semibold text-[#1C1917] mb-3">Actions</h3>
          <div className="space-y-2">
            <button className="w-full px-3 py-2 text-left text-sm hover:bg-[#F5F5F4] rounded-lg">
              ↻ Rotate
            </button>
            <button className="w-full px-3 py-2 text-left text-sm hover:bg-[#F5F5F4] rounded-lg">
              ↔ Resize
            </button>
            <button className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 rounded-lg">
              🗑 Delete
            </button>
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 bg-white rounded-xl border border-[#E7E5E4] overflow-hidden">
          <DndContext onDragEnd={handleDragEnd}>
            <div
              className="relative"
              style={{
                width: GRID_SIZE * GRID_CELL_SIZE,
                height: 15 * GRID_CELL_SIZE,
                backgroundImage: `
                  linear-gradient(to right, #E7E5E4 1px, transparent 1px),
                  linear-gradient(to bottom, #E7E5E4 1px, transparent 1px)
                `,
                backgroundSize: `${GRID_CELL_SIZE}px ${GRID_CELL_SIZE}px`
              }}
            >
              {/* Linked table lines */}
              <svg className="absolute inset-0 pointer-events-none" style={{ width: '100%', height: '100%' }}>
                {renderLinks()}
              </svg>

              {/* Tables */}
              {tables.map(table => (
                <DraggableTable
                  key={table.id}
                  table={table}
                  isSelected={selectedTableId === table.id}
                  onSelect={() => handleTableClick(table.id)}
                />
              ))}
            </div>
          </DndContext>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Add route in App.tsx**

Find the routes section and add:

```typescript
import FloorPlanEditor from './pages/FloorPlanEditor';

// In the Routes section, add:
<Route path="/host-dashboard/floor-plan" element={<FloorPlanEditor />} />
```

**Step 3: Verify page loads**

Run: `cd client && npm run dev`
Navigate to: http://localhost:5173/host-dashboard/floor-plan
Expected: See grid canvas with sidebar

**Step 4: Commit**

```bash
git add client/src/pages/FloorPlanEditor.tsx client/src/App.tsx
git commit -m "feat: add floor plan editor page with drag-and-drop canvas"
```

---

### Task 2.2: Add API Endpoints for Position Updates

**Files:**
- Modify: `api/routes/host-dashboard.js`

**Step 1: Add position update endpoint**

Add this endpoint to the host-dashboard routes:

```javascript
// Update table position (for floor plan editor)
router.patch('/tables/:tableId/position', async (req, res) => {
  try {
    const { tableId } = req.params;
    const { position_x, position_y } = req.body;

    const result = await supabase.updateTableConfig(tableId, {
      position_x: parseInt(position_x),
      position_y: parseInt(position_y)
    });

    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    res.json({ success: true, table: result.table });
  } catch (error) {
    console.error('[PATCH /tables/:tableId/position] Error:', error);
    res.status(500).json({ error: 'Failed to update table position' });
  }
});

// Link two tables together
router.post('/tables/:tableId/link', async (req, res) => {
  try {
    const { tableId } = req.params;
    const { link_with } = req.body;

    // Get both tables
    const table1Result = await supabase.getTableById(tableId);
    const table2Result = await supabase.getTableById(link_with);

    if (!table1Result.success || !table2Result.success) {
      return res.status(404).json({ error: 'Table not found' });
    }

    const table1 = table1Result.table;
    const table2 = table2Result.table;

    // Add each table to the other's joinable_with array
    const newJoinable1 = [...new Set([...(table1.joinable_with || []), link_with])];
    const newJoinable2 = [...new Set([...(table2.joinable_with || []), tableId])];

    await supabase.updateTableConfig(tableId, { joinable_with: newJoinable1 });
    await supabase.updateTableConfig(link_with, { joinable_with: newJoinable2 });

    res.json({ success: true, message: 'Tables linked successfully' });
  } catch (error) {
    console.error('[POST /tables/:tableId/link] Error:', error);
    res.status(500).json({ error: 'Failed to link tables' });
  }
});

// Unlink two tables
router.delete('/tables/:tableId/link/:linkedTableId', async (req, res) => {
  try {
    const { tableId, linkedTableId } = req.params;

    // Get both tables
    const table1Result = await supabase.getTableById(tableId);
    const table2Result = await supabase.getTableById(linkedTableId);

    if (!table1Result.success || !table2Result.success) {
      return res.status(404).json({ error: 'Table not found' });
    }

    const table1 = table1Result.table;
    const table2 = table2Result.table;

    // Remove each table from the other's joinable_with array
    const newJoinable1 = (table1.joinable_with || []).filter(id => id !== linkedTableId);
    const newJoinable2 = (table2.joinable_with || []).filter(id => id !== tableId);

    await supabase.updateTableConfig(tableId, { joinable_with: newJoinable1 });
    await supabase.updateTableConfig(linkedTableId, { joinable_with: newJoinable2 });

    res.json({ success: true, message: 'Tables unlinked successfully' });
  } catch (error) {
    console.error('[DELETE /tables/:tableId/link/:linkedTableId] Error:', error);
    res.status(500).json({ error: 'Failed to unlink tables' });
  }
});
```

**Step 2: Commit**

```bash
git add api/routes/host-dashboard.js
git commit -m "feat(api): add endpoints for table position and linking"
```

---

## Phase 3: Dashboard Integration

### Task 3.1: Create Visual Floor Plan Component for Dashboard

**Files:**
- Create: `client/src/components/host/FloorPlanView.tsx`
- Modify: `client/src/pages/SimpleDashboard.tsx`

**Step 1: Create FloorPlanView component**

```typescript
import { useMemo } from 'react';
import type { Table } from '../../types/host.types';

interface FloorPlanViewProps {
  tables: Table[];
  onTableClick?: (table: Table) => void;
}

const GRID_CELL_SIZE = 32; // Smaller for dashboard view

export default function FloorPlanView({ tables, onTableClick }: FloorPlanViewProps) {
  // Group tables by location
  const tablesByLocation = useMemo(() => {
    return tables.reduce((acc, table) => {
      const location = table.location || 'Main';
      if (!acc[location]) acc[location] = [];
      acc[location].push(table);
      return acc;
    }, {} as Record<string, Table[]>);
  }, [tables]);

  // Calculate grid bounds for each location
  const getGridBounds = (locationTables: Table[]) => {
    if (locationTables.length === 0) return { width: 10, height: 6 };

    let maxX = 0, maxY = 0;
    locationTables.forEach(t => {
      maxX = Math.max(maxX, t.position_x + t.width);
      maxY = Math.max(maxY, t.position_y + t.height);
    });
    return { width: Math.max(10, maxX + 1), height: Math.max(6, maxY + 1) };
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Available': return 'bg-green-100 border-green-500 text-green-700';
      case 'Occupied': return 'bg-red-100 border-red-500 text-red-700';
      case 'Reserved': return 'bg-purple-100 border-purple-500 text-purple-700';
      case 'Being Cleaned': return 'bg-amber-100 border-amber-500 text-amber-700';
      default: return 'bg-gray-100 border-gray-400 text-gray-700';
    }
  };

  // Render links between joinable tables
  const renderLinks = (locationTables: Table[]) => {
    const links: JSX.Element[] = [];
    const processedPairs = new Set<string>();

    locationTables.forEach(table => {
      (table.joinable_with || []).forEach(linkedId => {
        const pairKey = [table.id, linkedId].sort().join('-');
        if (processedPairs.has(pairKey)) return;
        processedPairs.add(pairKey);

        const linkedTable = locationTables.find(t => t.id === linkedId);
        if (!linkedTable) return;

        const x1 = (table.position_x + table.width / 2) * GRID_CELL_SIZE;
        const y1 = (table.position_y + table.height / 2) * GRID_CELL_SIZE;
        const x2 = (linkedTable.position_x + linkedTable.width / 2) * GRID_CELL_SIZE;
        const y2 = (linkedTable.position_y + linkedTable.height / 2) * GRID_CELL_SIZE;

        links.push(
          <line
            key={pairKey}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="#9F1239"
            strokeWidth="1.5"
            strokeDasharray="4,4"
            opacity="0.4"
          />
        );
      });
    });

    return links;
  };

  if (tables.length === 0) {
    return (
      <div className="text-center py-12 text-[#57534E]">
        <p className="font-semibold text-lg text-[#1C1917]">No tables configured yet</p>
        <p className="text-sm mt-2">Tables will appear here after onboarding</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {Object.entries(tablesByLocation).map(([location, locationTables]) => {
        const bounds = getGridBounds(locationTables);

        return (
          <div key={location}>
            <h3 className="text-sm font-semibold text-[#1C1917] mb-3">{location}</h3>
            <div
              className="relative bg-[#F5F5F4] rounded-xl p-2 overflow-auto"
              style={{
                width: '100%',
                minHeight: bounds.height * GRID_CELL_SIZE + 16
              }}
            >
              <div
                className="relative"
                style={{
                  width: bounds.width * GRID_CELL_SIZE,
                  height: bounds.height * GRID_CELL_SIZE,
                }}
              >
                {/* Links */}
                <svg className="absolute inset-0 pointer-events-none">
                  {renderLinks(locationTables)}
                </svg>

                {/* Tables */}
                {locationTables.map(table => {
                  const shapeClass = table.shape === 'round' ? 'rounded-full' : 'rounded-lg';
                  const colorClass = getStatusColor(table.status);

                  return (
                    <button
                      key={table.id}
                      onClick={() => onTableClick?.(table)}
                      className={`
                        absolute flex flex-col items-center justify-center
                        border-2 ${shapeClass} ${colorClass}
                        hover:shadow-lg transition-shadow cursor-pointer
                        text-xs font-medium
                      `}
                      style={{
                        left: table.position_x * GRID_CELL_SIZE,
                        top: table.position_y * GRID_CELL_SIZE,
                        width: table.width * GRID_CELL_SIZE - 4,
                        height: table.height * GRID_CELL_SIZE - 4,
                      }}
                    >
                      <span className="font-bold">{table.table_number}</span>
                      <span className="text-[10px] opacity-75">{table.capacity}p</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

**Step 2: Update SimpleDashboard to use FloorPlanView**

In SimpleDashboard.tsx, replace the TableGrid usage with a toggle between grid and floor plan view:

Find the Table Layout section and update:

```typescript
import FloorPlanView from '../components/host/FloorPlanView';

// Add state for view toggle
const [tableViewMode, setTableViewMode] = useState<'grid' | 'floorplan'>('floorplan');

// In the Table Layout section, replace TableGrid with:
<div className="bg-white border border-[#E7E5E4] rounded-xl shadow-md p-5 md:p-6">
  <div className="flex items-center justify-between mb-5">
    <div className="flex items-center gap-3">
      <div className="p-2 bg-[#9F1239]/10 rounded-lg">
        <svg className="w-5 h-5 text-[#9F1239]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
        </svg>
      </div>
      <h2 className="text-lg md:text-xl font-serif font-bold text-[#1C1917]">
        {language === 'es' ? 'Disposición de Mesas' : 'Table Layout'}
      </h2>
    </div>
    <div className="flex items-center gap-2">
      <button
        onClick={() => navigate('/host-dashboard/floor-plan')}
        className="px-3 py-1.5 text-sm text-[#9F1239] hover:bg-[#9F1239]/10 rounded-lg transition-colors"
      >
        Edit Floor Plan
      </button>
      <TableStatusLegend />
    </div>
  </div>

  <FloorPlanView
    tables={tables}
    onTableClick={handleTableClick}
  />

  <div className="mt-4 flex items-center justify-center gap-2 text-xs text-[#57534E] bg-[#F5F5F4] p-3 rounded-lg">
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
    <span>
      {language === 'es'
        ? 'Toca cualquier mesa para gestionar su estado'
        : 'Tap any table to manage its status'}
    </span>
  </div>
</div>
```

**Step 3: Verify dashboard displays floor plan**

Run: `cd client && npm run dev`
Navigate to: http://localhost:5173/host-dashboard/simple
Expected: See tables positioned according to their floor plan coordinates

**Step 4: Commit**

```bash
git add client/src/components/host/FloorPlanView.tsx client/src/pages/SimpleDashboard.tsx
git commit -m "feat: add floor plan view to dashboard with visual table shapes"
```

---

## Phase 4: Table Joining Logic (Future)

> **Note:** This phase handles the runtime behavior when hosts actually combine tables during service. It can be implemented after the basic floor plan functionality is working.

### Task 4.1: Suggest Table Combinations When Seating

**Files:**
- Modify: `api/_lib/supabase.js` (findBestTableCombination function)
- Modify: `client/src/components/host/SeatPartyModal.tsx`

This task will:
1. When seating a party larger than any single table, suggest linked table combinations
2. Show visual indication of which tables will be combined
3. Create a combined service record spanning multiple tables

---

## Summary

**Phase 1** (Tasks 1.1-1.4): Data model updates - ~2 hours
**Phase 2** (Tasks 2.1-2.2): Floor plan editor - ~3 hours
**Phase 3** (Task 3.1): Dashboard integration - ~1 hour
**Phase 4** (Task 4.1): Joining logic - ~2 hours (future)

**Total estimated effort:** 6-8 hours

**Testing checklist:**
- [ ] Onboarding shows round/square split inputs
- [ ] Fixed seating checkbox works
- [ ] Floor plan editor loads with grid
- [ ] Tables can be dragged and snap to grid
- [ ] Tables can be linked with dotted lines
- [ ] Dashboard shows tables at correct positions
- [ ] Dashboard shows correct shapes (round/square)
- [ ] Links visible on dashboard

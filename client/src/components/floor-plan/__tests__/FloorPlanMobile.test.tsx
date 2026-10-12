import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../test/renderWithProviders';
import type { Table } from '../../../types/host.types';
import FloorPlanCanvas from '../FloorPlanCanvas';
import FloorPlanHeader from '../FloorPlanHeader';

const table = {
  id: 'table-1',
  table_number: 1,
  capacity: 4,
  location: 'Main',
  status: 'Available',
  shape: 'round',
  is_fixed_seating: false,
  is_joinable: false,
  joinable_with: [],
  position_x: 2,
  position_y: 3,
  width: 1,
  height: 1,
  rotation: 0,
} satisfies Table;

describe('mobile floor plan', () => {
  it('keeps the canvas wide enough to touch tables and allows swiping the empty area', () => {
    const { container } = renderWithProviders(
      <FloorPlanCanvas
        filteredTables={[table]}
        isLoading={false}
        activeLocation="Main"
        draggingId={null}
        dragPos={null}
        autoPositions={new Map()}
        posMap={new Map()}
        linkMode={false}
        linkSource={null}
        selectedTableId={null}
        svgRef={createRef<SVGSVGElement>()}
        onPointerMove={vi.fn()}
        onPointerUp={vi.fn()}
        onPointerDown={vi.fn()}
        onTableClick={vi.fn()}
      />,
    );

    const svg = container.querySelector('svg');
    expect(svg?.parentElement?.parentElement).toHaveClass('min-w-[720px]');
    expect(svg).toHaveStyle({ touchAction: 'auto' });
    expect(container.querySelector('g.cursor-grab')).toHaveStyle({ touchAction: 'none' });
  });

  it('uses a status color for saved, not the action color', () => {
    const { getByText } = renderWithProviders(
      <FloorPlanHeader
        saveStatus="saved"
        linkMode={false}
        onToggleLinkMode={vi.fn()}
        onAddTable={vi.fn()}
      />,
    );

    expect(getByText('Saved')).toHaveClass('bg-emerald-50');
  });
});

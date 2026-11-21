import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import FloorPlanView from '../FloorPlanView';
import type { Table, TableShape } from '../../../types/host.types';
import { getTableSize as getTableGridSize } from '../../../types/host.types';

// Audit 2026-11-16: on the dashboard, Brasa & Alma's tables overlapped
// (13 over 6, 4 over 8, 12 over 7) while the Mesas editor showed the same
// positions cleanly. This view drew fixed sizes up to 2.5x the grid footprint
// the editor gives each table. The layout below is the owner's real one.
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }) }));
globalThis.ResizeObserver ??= class { observe() {} disconnect() {} unobserve() {} } as unknown as typeof ResizeObserver;

function table(id: string, x: number, y: number, capacity: number, shape: string): Table {
  return { id, table_number: id, capacity, shape, position_x: x, position_y: y, status: 'Available', location: 'Interior' } as unknown as Table;
}

// Brasa & Alma's real layout (database, 2026-11-21), area "Indoor" and "Outdoor".
const indoor = [
  table('1', 4, 0, 2, 'square'), table('2', 1, 1, 2, 'square'), table('3', 6, 2, 4, 'square'),
  table('4', 2, 4, 4, 'square'), table('5', 12, 1, 4, 'square'), table('6', 8, 4, 6, 'square'),
  table('8', 4, 5, 8, 'square'), table('9', 14, 4, 10, 'square'), table('13', 8, 6, 4, 'round'),
];
const outdoor = [
  table('7', 9, 3, 6, 'square'), table('10', 6, 2, 2, 'square'), table('11', 4, 6, 4, 'square'),
  table('12', 7, 5, 4, 'square'), table('14', 13, 6, 4, 'square'),
].map((t) => ({ ...t, location: 'Outdoor' }));

/** Editor footprint in cells (same function the editor uses). */
function footprint(t: Table) {
  const g = getTableGridSize((t.shape as TableShape) || 'round', t.capacity || 2);
  return { x: t.position_x ?? 0, y: t.position_y ?? 0, w: g.width, h: g.height };
}
/** Empty cells between two footprints (0 when they touch or overlap). */
function gap(a: ReturnType<typeof footprint>, b: ReturnType<typeof footprint>) {
  const gx = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w), 0);
  const gy = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h), 0);
  return Math.max(gx, gy);
}

function boxes(container: HTMLElement) {
  return [...container.querySelectorAll('[data-table-box]')].map((g) => {
    const [x, y, w, h] = g.getAttribute('data-table-box')!.split(',').map(Number);
    return { x, y, w, h };
  });
}

function overlaps(a: { x: number; y: number; w: number; h: number }, b: typeof a) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

describe('dashboard floor plan geometry', () => {
  it.each([['Indoor', indoor], ['Outdoor', outdoor]])('%s: tables with a free cell between them in the editor do not touch', (_area, area) => {
    const { container } = render(<FloorPlanView tables={area} />);
    const all = boxes(container);
    expect(all).toHaveLength(area.length);
    const clashes: string[] = [];
    all.forEach((a, i) => all.slice(i + 1).forEach((b, j) => {
      const ta = area[i]; const tb = area[i + 1 + j];
      if (gap(footprint(ta), footprint(tb)) >= 1 && overlaps(a, b)) clashes.push(`${ta.table_number}/${tb.table_number}`);
    }));
    expect(clashes).toEqual([]);
  });

  it('keeps tiles readable and the arrangement the editor saved', () => {
    const { container } = render(<FloorPlanView tables={indoor} />);
    const all = boxes(container);
    expect(Math.min(...all.map((b) => b.w))).toBeGreaterThanOrEqual(80);
    // Table 5 is to the right of table 1, and table 4 below table 2, as saved.
    expect(all[4].x).toBeGreaterThan(all[0].x);
    expect(all[3].y).toBeGreaterThan(all[1].y);
  });
});

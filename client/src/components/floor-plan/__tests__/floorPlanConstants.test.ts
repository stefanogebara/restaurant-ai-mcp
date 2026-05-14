import { describe, it, expect } from 'vitest';
import { snapToGrid, getShapeLabelKey, GRID_COLS, GRID_ROWS, CELL } from '../floorPlanConstants';

describe('snapToGrid', () => {
  it('snaps a pixel position to the nearest grid cell', () => {
    // CELL = 40 — a point at 88px rounds to column 2.
    expect(snapToGrid(88, 152)).toEqual({ gx: 2, gy: 4 });
  });

  it('clamps a single-cell table to the last grid cell', () => {
    const far = snapToGrid(99999, 99999);
    expect(far).toEqual({ gx: GRID_COLS - 1, gy: GRID_ROWS - 1 });
  });

  it('clamps a multi-cell table by its footprint, not 1 cell', () => {
    // A 3-wide × 2-tall table dragged off the right/bottom edge must stop
    // far enough in that all of its cells stay on the grid.
    const snapped = snapToGrid(99999, 99999, 3, 2);
    expect(snapped.gx).toBe(GRID_COLS - 3);
    expect(snapped.gy).toBe(GRID_ROWS - 2);
    // Every occupied cell is within the grid.
    expect(snapped.gx + 3).toBeLessThanOrEqual(GRID_COLS);
    expect(snapped.gy + 2).toBeLessThanOrEqual(GRID_ROWS);
  });

  it('never returns a negative cell', () => {
    expect(snapToGrid(-500, -500)).toEqual({ gx: 0, gy: 0 });
    expect(snapToGrid(-500, -500, 3, 2)).toEqual({ gx: 0, gy: 0 });
  });

  it('defaults footprint to 1×1 when omitted (backward compatible)', () => {
    expect(snapToGrid(CELL * 2, CELL * 2)).toEqual({ gx: 2, gy: 2 });
  });
});

describe('getShapeLabelKey', () => {
  it('maps known shapes to their floorPlan.shape.* key', () => {
    expect(getShapeLabelKey('round')).toBe('floorPlan.shape.round');
    expect(getShapeLabelKey('square')).toBe('floorPlan.shape.square');
    expect(getShapeLabelKey('rectangle')).toBe('floorPlan.shape.rectangle');
    expect(getShapeLabelKey('booth')).toBe('floorPlan.shape.booth');
  });

  it('maps the hyphenated bar-stool value to the barStool key', () => {
    expect(getShapeLabelKey('bar-stool')).toBe('floorPlan.shape.barStool');
  });

  it('aliases legacy shapes (circle → round, oval → rectangle)', () => {
    expect(getShapeLabelKey('circle')).toBe('floorPlan.shape.round');
    expect(getShapeLabelKey('oval')).toBe('floorPlan.shape.rectangle');
  });

  it('is case-insensitive', () => {
    expect(getShapeLabelKey('ROUND')).toBe('floorPlan.shape.round');
    expect(getShapeLabelKey('Booth')).toBe('floorPlan.shape.booth');
  });

  it('falls back to round for null/undefined/unknown shapes', () => {
    expect(getShapeLabelKey(null)).toBe('floorPlan.shape.round');
    expect(getShapeLabelKey(undefined)).toBe('floorPlan.shape.round');
    expect(getShapeLabelKey('hexagon')).toBe('floorPlan.shape.round');
  });
});

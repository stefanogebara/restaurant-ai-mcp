import { describe, it, expect } from 'vitest';
import { hasPositionData } from '../floorPlanHelpers';
import type { Table } from '../../../types/host.types';

// Minimal Table factory — only the position fields matter for hasPositionData.
const mkTable = (position_x: number | null | undefined, position_y: number | null | undefined): Table =>
  ({ id: Math.random().toString(36), position_x, position_y } as unknown as Table);

describe('hasPositionData', () => {
  it('returns false for an empty list', () => {
    expect(hasPositionData([])).toBe(false);
  });

  it('returns false when every table is at the (0,0) origin', () => {
    expect(hasPositionData([mkTable(0, 0), mkTable(0, 0)])).toBe(false);
  });

  it('returns false when positions are null/undefined', () => {
    expect(hasPositionData([mkTable(null, null), mkTable(undefined, undefined)])).toBe(false);
  });

  it('returns true when ANY table has a deliberate position', () => {
    // The .some() (not .every()) behaviour: one freshly-added table at the
    // origin must NOT flip a hand-arranged room back to auto-layout.
    expect(hasPositionData([mkTable(5, 3), mkTable(0, 0)])).toBe(true);
    expect(hasPositionData([mkTable(0, 0), mkTable(0, 0), mkTable(8, 1)])).toBe(true);
  });

  it('treats a non-zero position on either axis as deliberate', () => {
    expect(hasPositionData([mkTable(4, 0)])).toBe(true);
    expect(hasPositionData([mkTable(0, 7)])).toBe(true);
  });
});

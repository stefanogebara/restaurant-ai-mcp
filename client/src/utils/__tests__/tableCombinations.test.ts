import { describe, it, expect } from 'vitest';
import {
  suggestTableCombinations,
  formatTableNumbers,
  getCombinationColorClass,
} from '../tableCombinations';
import type { Table } from '../../types/host.types';

// ---- Test data factory ----

function makeTable(overrides: Partial<Table> = {}): Table {
  return {
    id: 'table-1',
    table_number: 1,
    capacity: 4,
    location: 'Indoor',
    status: 'Available',
    shape: 'square',
    is_fixed_seating: false,
    is_joinable: true,
    joinable_with: [],
    position_x: 0,
    position_y: 0,
    width: 1,
    height: 1,
    rotation: 0,
    ...overrides,
  };
}

describe('suggestTableCombinations', () => {
  it('returns empty array when no tables are available', () => {
    const tables = [makeTable({ status: 'Occupied' })];
    expect(suggestTableCombinations(tables, 2)).toEqual([]);
  });

  it('returns empty array when no tables exist', () => {
    expect(suggestTableCombinations([], 2)).toEqual([]);
  });

  it('finds a single table with perfect fit', () => {
    const tables = [
      makeTable({ id: 't1', table_number: 1, capacity: 4 }),
      makeTable({ id: 't2', table_number: 2, capacity: 6 }),
    ];

    const result = suggestTableCombinations(tables, 4);
    expect(result.length).toBeGreaterThanOrEqual(1);

    // The perfect fit (capacity 4 for party of 4) should be ranked first
    const best = result[0];
    expect(best.tables).toHaveLength(1);
    expect(best.tables[0].capacity).toBe(4);
    expect(best.totalCapacity).toBe(4);
    expect(best.reason).toContain('Perfect');
  });

  it('prefers minimal waste over larger tables', () => {
    const tables = [
      makeTable({ id: 't1', table_number: 1, capacity: 4 }),
      makeTable({ id: 't2', table_number: 2, capacity: 8 }),
    ];

    const result = suggestTableCombinations(tables, 4);
    // Table with capacity 4 (0 wasted seats) should rank higher than capacity 8 (4 wasted)
    expect(result[0].tables[0].id).toBe('t1');
  });

  it('returns up to maxCombinations results', () => {
    const tables = Array.from({ length: 10 }, (_, i) =>
      makeTable({ id: `t${i}`, table_number: i, capacity: 4 + i })
    );

    const result = suggestTableCombinations(tables, 4, 2);
    expect(result.length).toBeLessThanOrEqual(2);
  });

  it('suggests two-table combinations for large parties', () => {
    const tables = [
      makeTable({ id: 't1', table_number: 1, capacity: 4, location: 'Indoor' }),
      makeTable({ id: 't2', table_number: 2, capacity: 4, location: 'Indoor' }),
    ];

    // Party of 7 exceeds any single table (max 4)
    const result = suggestTableCombinations(tables, 7);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].tables).toHaveLength(2);
    expect(result[0].totalCapacity).toBe(8);
  });

  it('gives bonus for same-section two-table combos', () => {
    const tables = [
      makeTable({ id: 't1', table_number: 1, capacity: 4, location: 'Indoor' }),
      makeTable({ id: 't2', table_number: 2, capacity: 4, location: 'Indoor' }),
      makeTable({ id: 't3', table_number: 3, capacity: 4, location: 'Patio' }),
    ];

    const result = suggestTableCombinations(tables, 7);
    // Two Indoor tables should score higher than Indoor+Patio
    const sameSection = result.find(
      r => r.tables.length === 2 && r.tables.every(t => t.location === 'Indoor')
    );
    const diffSection = result.find(
      r => r.tables.length === 2 && r.tables.some(t => t.location === 'Patio')
    );

    if (sameSection && diffSection) {
      expect(sameSection.score).toBeGreaterThan(diffSection.score);
    }
  });

  it('only considers Available tables', () => {
    const tables = [
      makeTable({ id: 't1', capacity: 10, status: 'Occupied' }),
      makeTable({ id: 't2', capacity: 2, status: 'Available' }),
    ];

    const result = suggestTableCombinations(tables, 2);
    expect(result.length).toBe(1);
    expect(result[0].tables[0].id).toBe('t2');
  });

  it('suggests three-table combinations for very large parties', () => {
    const tables = [
      makeTable({ id: 't1', table_number: 1, capacity: 4, location: 'Indoor' }),
      makeTable({ id: 't2', table_number: 2, capacity: 4, location: 'Indoor' }),
      makeTable({ id: 't3', table_number: 3, capacity: 4, location: 'Indoor' }),
    ];

    // Party of 10 with max single table = 4
    const result = suggestTableCombinations(tables, 10);
    const threeTable = result.find(r => r.tables.length === 3);
    expect(threeTable).toBeDefined();
    expect(threeTable!.totalCapacity).toBe(12);
  });
});

describe('formatTableNumbers', () => {
  it('formats single table', () => {
    const tables = [makeTable({ table_number: 5 })];
    expect(formatTableNumbers(tables)).toBe('Table 5');
  });

  it('formats multiple tables with plus separator', () => {
    const tables = [
      makeTable({ table_number: 1 }),
      makeTable({ table_number: 2 }),
      makeTable({ table_number: 3 }),
    ];
    expect(formatTableNumbers(tables)).toBe('Table 1 + Table 2 + Table 3');
  });
});

describe('getCombinationColorClass', () => {
  it('returns rose for high scores', () => {
    expect(getCombinationColorClass(150)).toContain('rose');
  });

  it('returns yellow for medium scores', () => {
    expect(getCombinationColorClass(110)).toContain('yellow');
  });

  it('returns orange for low scores', () => {
    expect(getCombinationColorClass(50)).toContain('orange');
  });
});

/**
 * Tests for api/_lib/table-assignment.js
 * Pure function tests — no mocking needed
 */

const {
  assignTables,
  getAllTableOptions,
  validateAssignment,
  findExactMatch,
  findSizeUp,
  findLargerTable,
  findTableCombination,
  isFlexibleTable,
  canCombine,
} = require('../_lib/table-assignment');

// Helper to create table objects matching expected format
const makeTable = (id, capacity, opts = {}) => ({
  id,
  fields: {
    'Table Number': opts.tableNumber || id,
    Capacity: capacity,
    'Is Active': opts.isActive !== false,
    'Is Fixed': opts.isFixed || false,
    Location: opts.location || 'Main Dining',
    Status: opts.status || 'Available',
    'Adjacent Tables': opts.adjacentTables || [],
    'Combination Group': opts.combinationGroup || null,
  },
});

// ============================================================
// isFlexibleTable
// ============================================================
describe('isFlexibleTable', () => {
  test('returns true for non-fixed tables', () => {
    expect(isFlexibleTable(makeTable('t1', 4))).toBe(true);
  });

  test('returns false for fixed tables', () => {
    expect(isFlexibleTable(makeTable('t1', 4, { isFixed: true }))).toBe(false);
  });

  test('defaults to flexible when Is Fixed is undefined', () => {
    const table = { fields: { Capacity: 4 } };
    expect(isFlexibleTable(table)).toBe(true);
  });
});

// ============================================================
// canCombine
// ============================================================
describe('canCombine', () => {
  test('returns false if either table is fixed', () => {
    const t1 = makeTable('t1', 4);
    const t2 = makeTable('t2', 4, { isFixed: true });
    expect(canCombine(t1, t2)).toBe(false);
    expect(canCombine(t2, t1)).toBe(false);
  });

  test('uses explicit adjacency when defined', () => {
    const t1 = makeTable('t1', 4, { adjacentTables: ['t2'] });
    const t2 = makeTable('t2', 4, { adjacentTables: [] });
    expect(canCombine(t1, t2)).toBe(true);
  });

  test('rejects non-adjacent tables when adjacency is defined', () => {
    const t1 = makeTable('t1', 4, { adjacentTables: ['t3'] });
    const t2 = makeTable('t2', 4, { adjacentTables: [] });
    expect(canCombine(t1, t2)).toBe(false);
  });

  test('uses combination group', () => {
    const t1 = makeTable('t1', 4, { combinationGroup: 'A' });
    const t2 = makeTable('t2', 4, { combinationGroup: 'A' });
    const t3 = makeTable('t3', 4, { combinationGroup: 'B' });
    expect(canCombine(t1, t2)).toBe(true);
    expect(canCombine(t1, t3)).toBe(false);
  });

  test('falls back to same location (MVP)', () => {
    const t1 = makeTable('t1', 4, { location: 'Patio' });
    const t2 = makeTable('t2', 4, { location: 'Patio' });
    const t3 = makeTable('t3', 4, { location: 'Indoor' });
    expect(canCombine(t1, t2)).toBe(true);
    expect(canCombine(t1, t3)).toBe(false);
  });
});

// ============================================================
// findExactMatch
// ============================================================
describe('findExactMatch', () => {
  test('finds table with exact capacity', () => {
    const tables = [makeTable('t1', 2), makeTable('t2', 4), makeTable('t3', 6)];
    const result = findExactMatch(4, tables);
    expect(result).toBeTruthy();
    expect(result.fields.Capacity).toBe(4);
  });

  test('returns undefined when no exact match', () => {
    const tables = [makeTable('t1', 2), makeTable('t3', 6)];
    expect(findExactMatch(4, tables)).toBeUndefined();
  });

  test('ignores inactive tables', () => {
    const tables = [makeTable('t1', 4, { isActive: false })];
    expect(findExactMatch(4, tables)).toBeUndefined();
  });
});

// ============================================================
// findSizeUp
// ============================================================
describe('findSizeUp', () => {
  test('finds table within maxExtra seats', () => {
    const tables = [makeTable('t1', 2), makeTable('t2', 5), makeTable('t3', 8)];
    const result = findSizeUp(4, tables, 2);
    expect(result).toBeTruthy();
    expect(result.fields.Capacity).toBe(5);
  });

  test('returns undefined when no table within maxExtra', () => {
    const tables = [makeTable('t1', 2), makeTable('t2', 8)];
    expect(findSizeUp(4, tables, 2)).toBeUndefined();
  });

  test('ignores inactive tables', () => {
    const tables = [makeTable('t1', 5, { isActive: false })];
    expect(findSizeUp(4, tables, 2)).toBeUndefined();
  });
});

// ============================================================
// findLargerTable
// ============================================================
describe('findLargerTable', () => {
  test('finds smallest table >= partySize', () => {
    const tables = [makeTable('t1', 2), makeTable('t2', 8), makeTable('t3', 6)];
    const result = findLargerTable(5, tables);
    expect(result).toBeTruthy();
    expect(result.fields.Capacity).toBe(6);
  });

  test('returns null when no table big enough', () => {
    const tables = [makeTable('t1', 2), makeTable('t2', 4)];
    expect(findLargerTable(6, tables)).toBeNull();
  });
});

// ============================================================
// findTableCombination
// ============================================================
describe('findTableCombination', () => {
  test('finds 2-table combination', () => {
    const tables = [
      makeTable('t1', 4, { location: 'Main' }),
      makeTable('t2', 4, { location: 'Main' }),
    ];
    const result = findTableCombination(7, tables);
    expect(result.length).toBe(2);
  });

  test('returns empty array when no combination works', () => {
    const tables = [
      makeTable('t1', 2, { location: 'A' }),
      makeTable('t2', 2, { location: 'B' }),
    ];
    const result = findTableCombination(10, tables);
    expect(result).toEqual([]);
  });

  test('does not combine fixed tables', () => {
    const tables = [
      makeTable('t1', 4, { isFixed: true, location: 'Main' }),
      makeTable('t2', 4, { isFixed: true, location: 'Main' }),
    ];
    const result = findTableCombination(7, tables);
    expect(result).toEqual([]);
  });

  test('finds 3-table combination for large parties', () => {
    const tables = [
      makeTable('t1', 4, { location: 'Main' }),
      makeTable('t2', 4, { location: 'Main' }),
      makeTable('t3', 4, { location: 'Main' }),
    ];
    const result = findTableCombination(11, tables);
    expect(result.length).toBe(3);
  });
});

// ============================================================
// assignTables
// ============================================================
describe('assignTables', () => {
  test('returns failure for no tables', () => {
    const result = assignTables(4, []);
    expect(result.success).toBe(false);
    expect(result.match).toBe('none');
  });

  test('returns failure for null tables', () => {
    const result = assignTables(4, null);
    expect(result.success).toBe(false);
  });

  test('finds perfect match (Strategy 1)', () => {
    const tables = [makeTable('t1', 4, { tableNumber: '1' })];
    const result = assignTables(4, tables);
    expect(result.success).toBe(true);
    expect(result.match).toBe('perfect');
    expect(result.tables.length).toBe(1);
  });

  test('finds good match (Strategy 2)', () => {
    const tables = [makeTable('t1', 6, { tableNumber: '1' })];
    const result = assignTables(5, tables);
    expect(result.success).toBe(true);
    expect(result.match).toBe('good');
  });

  test('finds combination match (Strategy 3)', () => {
    const tables = [
      makeTable('t1', 4, { location: 'Patio', tableNumber: '1' }),
      makeTable('t2', 4, { location: 'Patio', tableNumber: '2' }),
    ];
    const result = assignTables(7, tables);
    expect(result.success).toBe(true);
    expect(result.match).toBe('acceptable');
    expect(result.tables.length).toBe(2);
  });

  test('finds larger table (Strategy 4)', () => {
    const tables = [makeTable('t1', 10, { tableNumber: '1' })];
    const result = assignTables(4, tables);
    // Could be perfect, good, or acceptable depending on waste
    expect(result.success).toBe(true);
  });

  test('prefers preferred location', () => {
    const tables = [
      makeTable('t1', 4, { location: 'Indoor', tableNumber: '1' }),
      makeTable('t2', 4, { location: 'Patio', tableNumber: '2' }),
    ];
    const result = assignTables(4, tables, 'Patio');
    expect(result.success).toBe(true);
    expect(result.location).toBe('Patio');
  });

  test('falls back to any location when preferred empty', () => {
    const tables = [makeTable('t1', 4, { location: 'Indoor', tableNumber: '1' })];
    const result = assignTables(4, tables, 'Patio');
    expect(result.success).toBe(true);
    expect(result.location).toBe('Indoor');
  });
});

// ============================================================
// getAllTableOptions
// ============================================================
describe('getAllTableOptions', () => {
  test('returns empty for no suitable tables', () => {
    const tables = [makeTable('t1', 2)];
    const options = getAllTableOptions(6, tables);
    expect(options.length).toBe(0);
  });

  test('returns options sorted by score', () => {
    const tables = [
      makeTable('t1', 4, { tableNumber: '1' }),
      makeTable('t2', 6, { tableNumber: '2' }),
      makeTable('t3', 8, { tableNumber: '3' }),
    ];
    const options = getAllTableOptions(4, tables);
    expect(options.length).toBeGreaterThan(0);
    // First should be perfect match (score 100)
    expect(options[0].match).toBe('Perfect');
  });

  test('includes combination options for flexible tables', () => {
    const tables = [
      makeTable('t1', 3, { location: 'Main', tableNumber: '1' }),
      makeTable('t2', 3, { location: 'Main', tableNumber: '2' }),
    ];
    const options = getAllTableOptions(5, tables);
    const combinations = options.filter(o => o.isCombination);
    expect(combinations.length).toBeGreaterThan(0);
  });

  test('filters by preferred location', () => {
    const tables = [
      makeTable('t1', 4, { location: 'Patio', tableNumber: '1' }),
      makeTable('t2', 4, { location: 'Indoor', tableNumber: '2' }),
    ];
    const options = getAllTableOptions(4, tables, 'Patio');
    expect(options.every(o => o.location === 'Patio')).toBe(true);
  });
});

// ============================================================
// validateAssignment
// ============================================================
describe('validateAssignment', () => {
  test('rejects null/empty tables', () => {
    expect(validateAssignment(null, 4).valid).toBe(false);
    expect(validateAssignment([], 4).valid).toBe(false);
  });

  test('rejects inactive tables', () => {
    const tables = [makeTable('t1', 4, { isActive: false, tableNumber: '1' })];
    const result = validateAssignment(tables, 4);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('not active');
  });

  test('rejects occupied tables', () => {
    const tables = [makeTable('t1', 4, { status: 'Occupied', tableNumber: '1' })];
    const result = validateAssignment(tables, 4);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('not available');
  });

  test('rejects insufficient capacity', () => {
    const tables = [makeTable('t1', 2, { tableNumber: '1' })];
    const result = validateAssignment(tables, 4);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Insufficient');
  });

  test('validates correct assignment', () => {
    const tables = [makeTable('t1', 4, { tableNumber: '1' })];
    const result = validateAssignment(tables, 4);
    expect(result.valid).toBe(true);
    expect(result.totalCapacity).toBe(4);
  });

  test('validates multi-table assignment', () => {
    const tables = [
      makeTable('t1', 4, { tableNumber: '1' }),
      makeTable('t2', 4, { tableNumber: '2' }),
    ];
    const result = validateAssignment(tables, 7);
    expect(result.valid).toBe(true);
    expect(result.totalCapacity).toBe(8);
  });
});

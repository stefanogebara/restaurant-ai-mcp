const { suggestTable, scoreTable } = require('../tableAssignmentService');

describe('scoreTable', () => {
  const emptyOccupied = [];

  test('returns null when table capacity < party size', () => {
    const table = { id: 't1', table_number: '1', capacity: 2, status: 'available' };
    expect(scoreTable(table, 4, emptyOccupied)).toBeNull();
  });

  test('returns highest size fit score for perfect capacity match', () => {
    const table = { id: 't1', table_number: '1', capacity: 4, status: 'available' };
    const result = scoreTable(table, 4, emptyOccupied);
    expect(result).not.toBeNull();
    expect(result.score).toBeGreaterThanOrEqual(70); // 50 size + 30 spread (no occupied)
    expect(result.reasoning).toContain('perfect fit');
  });

  test('prefers smaller table over larger for same party', () => {
    const small = { id: 't1', table_number: '1', capacity: 4, status: 'available' };
    const large = { id: 't2', table_number: '2', capacity: 8, status: 'available' };
    const scoreSmall = scoreTable(small, 3, emptyOccupied);
    const scoreLarge = scoreTable(large, 3, emptyOccupied);
    expect(scoreSmall.score).toBeGreaterThan(scoreLarge.score);
  });

  test('spread score increases with distance from occupied tables', () => {
    const occupied = [{ position_x: 0, position_y: 0 }];
    const near = { id: 't1', table_number: '1', capacity: 4, position_x: 1, position_y: 0, status: 'available' };
    const far = { id: 't2', table_number: '2', capacity: 4, position_x: 15, position_y: 0, status: 'available' };
    const scoreNear = scoreTable(near, 4, occupied);
    const scoreFar = scoreTable(far, 4, occupied);
    expect(scoreFar.score).toBeGreaterThan(scoreNear.score);
  });
});

describe('suggestTable', () => {
  test('returns null when no tables are available', () => {
    const tables = [
      { id: 't1', table_number: '1', capacity: 4, status: 'Occupied' },
    ];
    expect(suggestTable(tables, 2)).toBeNull();
  });

  test('returns null when no table can fit party size', () => {
    const tables = [
      { id: 't1', table_number: '1', capacity: 2, status: 'Available' },
    ];
    expect(suggestTable(tables, 4)).toBeNull();
  });

  test('returns best table for party of 3', () => {
    const tables = [
      { id: 't1', table_number: '1', capacity: 2, status: 'Available', position_x: 0, position_y: 0 },
      { id: 't2', table_number: '4', capacity: 4, status: 'Available', position_x: 5, position_y: 0 },
      { id: 't3', table_number: '8', capacity: 8, status: 'Available', position_x: 10, position_y: 0 },
    ];
    const result = suggestTable(tables, 3);
    expect(result).not.toBeNull();
    expect(result.suggested_table_id).toBe('t2'); // 4-top is smallest that fits 3
    expect(result.table_name).toBe('Table 4');
    expect(result.reasoning).toBeTruthy();
    expect(result.score).toBeGreaterThan(0);
  });

  test('suggestion includes reasoning text', () => {
    const tables = [
      { id: 't1', table_number: '5', capacity: 4, status: 'Available', location: 'Terrace' },
    ];
    const result = suggestTable(tables, 4);
    expect(result.reasoning).toContain('Seats 4');
    expect(result.reasoning).toContain('Terrace');
  });
});

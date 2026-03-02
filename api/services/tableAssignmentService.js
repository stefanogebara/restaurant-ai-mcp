const { createSecureLogger } = require('../_lib/secure-logger');
const logger = createSecureLogger('TableAssignment');

/**
 * Score a single table for a reservation.
 *
 * Scoring criteria:
 *   1. Party size fit  — capacity >= partySize; prefer smallest that fits (0-50 pts)
 *   2. Floor spread    — prefer tables far from occupied ones (0-30 pts)
 *   3. Status          — must be 'available' (filter, not score)
 *
 * @param {object} table        - { id, table_number, capacity, location, status, position_x, position_y }
 * @param {number} partySize    - Guest count
 * @param {object[]} occupiedTables - Tables currently occupied (for spread calc)
 * @returns {{ score: number, reasoning: string } | null} null if table cannot fit
 */
function scoreTable(table, partySize, occupiedTables) {
  // Filter: must fit the party
  if (table.capacity < partySize) return null;

  // 1. Size fit score (50 pts max) — smaller waste = higher score
  const waste = table.capacity - partySize;
  const maxCapacity = 20; // largest possible table
  const sizeFitScore = Math.max(0, 50 - (waste / maxCapacity) * 50);

  // 2. Floor spread score (30 pts max) — average distance to occupied tables
  let spreadScore = 30; // default if no occupied tables
  if (occupiedTables.length > 0) {
    const avgDistance = occupiedTables.reduce((sum, ot) => {
      const dx = (table.position_x || 0) - (ot.position_x || 0);
      const dy = (table.position_y || 0) - (ot.position_y || 0);
      return sum + Math.sqrt(dx * dx + dy * dy);
    }, 0) / occupiedTables.length;
    // Normalize: assume max useful distance is 20 grid units
    spreadScore = Math.min(30, (avgDistance / 20) * 30);
  }

  const totalScore = Math.round(sizeFitScore + spreadScore);

  // Build reasoning string
  const parts = [];
  parts.push(`Seats ${table.capacity}`);
  if (waste === 0) {
    parts.push(`perfect fit for party of ${partySize}`);
  } else {
    parts.push(`closest fit for party of ${partySize}`);
  }
  if (table.location) {
    parts.push(`${table.location} area`);
  }
  if (occupiedTables.length > 0 && spreadScore > 20) {
    parts.push('area currently free');
  }

  return {
    score: totalScore,
    reasoning: parts.join(', '),
  };
}

/**
 * Suggest the best table for a reservation.
 *
 * @param {object[]} allTables   - All restaurant tables (with status, position, capacity)
 * @param {number}   partySize   - Guest count
 * @returns {{ suggested_table_id: string, table_name: string, reasoning: string, score: number } | null}
 */
function suggestTable(allTables, partySize) {
  const availableTables = allTables.filter(t => {
    const status = (t.status || '').toLowerCase().replace(/\s+/g, '_');
    return status === 'available';
  });

  const occupiedTables = allTables.filter(t => {
    const status = (t.status || '').toLowerCase().replace(/\s+/g, '_');
    return status === 'occupied';
  });

  if (availableTables.length === 0) {
    logger.info('No available tables for suggestion');
    return null;
  }

  const scored = availableTables
    .map(table => {
      const result = scoreTable(table, partySize, occupiedTables);
      if (!result) return null;
      return {
        suggested_table_id: table.id,
        table_name: `Table ${table.table_number}`,
        reasoning: result.reasoning,
        score: result.score,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    logger.info(`No tables can fit party of ${partySize}`);
    return null;
  }

  return scored[0];
}

module.exports = { suggestTable, scoreTable };

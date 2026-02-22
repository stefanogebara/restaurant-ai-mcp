import type { Table } from '../types/host.types';

export interface TableCombination {
  tables: Table[];
  totalCapacity: number;
  score: number;
  reason: string;
}

/**
 * Find the best table combinations for a given party size
 * @param tables Available tables
 * @param partySize Number of guests
 * @param maxCombinations Maximum combinations to suggest (default: 3)
 * @returns Array of table combinations, sorted by score (best first)
 */
export function suggestTableCombinations(
  tables: Table[],
  partySize: number,
  maxCombinations: number = 3
): TableCombination[] {
  // Only consider available tables
  const availableTables = tables.filter(t => t.status === 'Available');

  if (availableTables.length === 0) {
    return [];
  }

  const combinations: TableCombination[] = [];

  // Strategy 1: Single table (perfect fit or slightly larger)
  for (const table of availableTables) {
    if (table.capacity >= partySize) {
      const wastedSeats = table.capacity - partySize;
      const score = calculateScore({
        perfectFit: wastedSeats === 0,
        wastedSeats,
        tableCount: 1,
        sameSectionBonus: true
      });

      combinations.push({
        tables: [table],
        totalCapacity: table.capacity,
        score,
        reason: wastedSeats === 0
          ? 'Perfect fit!'
          : `Single table with ${wastedSeats} extra seat${wastedSeats > 1 ? 's' : ''}`
      });
    }
  }

  // Strategy 2: Two tables
  if (partySize > Math.max(...availableTables.map(t => t.capacity))) {
    for (let i = 0; i < availableTables.length; i++) {
      for (let j = i + 1; j < availableTables.length; j++) {
        const table1 = availableTables[i];
        const table2 = availableTables[j];
        const totalCapacity = table1.capacity + table2.capacity;

        if (totalCapacity >= partySize) {
          const wastedSeats = totalCapacity - partySize;
          const sameSection = table1.location === table2.location;

          // Prefer adjacent table numbers
          const adjacentBonus = Math.abs(
            parseInt(table1.table_number.toString()) -
            parseInt(table2.table_number.toString())
          ) === 1;

          const score = calculateScore({
            perfectFit: wastedSeats === 0,
            wastedSeats,
            tableCount: 2,
            sameSectionBonus: sameSection,
            adjacentBonus
          });

          let reason = `2 tables in ${sameSection ? 'same section' : 'different sections'}`;
          if (adjacentBonus) {
            reason += ' (adjacent)';
          }
          if (wastedSeats === 0) {
            reason = 'Perfect 2-table combo!';
          }

          combinations.push({
            tables: [table1, table2],
            totalCapacity,
            score,
            reason
          });
        }
      }
    }
  }

  // Strategy 3: Three tables (for very large parties)
  if (partySize > 8 && availableTables.length >= 3) {
    for (let i = 0; i < availableTables.length; i++) {
      for (let j = i + 1; j < availableTables.length; j++) {
        for (let k = j + 1; k < availableTables.length; k++) {
          const table1 = availableTables[i];
          const table2 = availableTables[j];
          const table3 = availableTables[k];
          const totalCapacity = table1.capacity + table2.capacity + table3.capacity;

          if (totalCapacity >= partySize && totalCapacity <= partySize + 4) {
            const wastedSeats = totalCapacity - partySize;
            const allSameSection =
              table1.location === table2.location &&
              table2.location === table3.location;

            const score = calculateScore({
              perfectFit: wastedSeats === 0,
              wastedSeats,
              tableCount: 3,
              sameSectionBonus: allSameSection,
              adjacentBonus: false
            });

            combinations.push({
              tables: [table1, table2, table3],
              totalCapacity,
              score,
              reason: allSameSection
                ? '3 tables (same section)'
                : '3 tables (multiple sections)'
            });
          }
        }
      }
    }
  }

  // Sort by score (descending) and return top combinations
  return combinations
    .sort((a, b) => b.score - a.score)
    .slice(0, maxCombinations);
}

/**
 * Calculate a score for a table combination
 * Higher score = better match
 */
function calculateScore(params: {
  perfectFit: boolean;
  wastedSeats: number;
  tableCount: number;
  sameSectionBonus: boolean;
  adjacentBonus?: boolean;
}): number {
  let score = 100;

  // Perfect fit is highly valued
  if (params.perfectFit) {
    score += 50;
  } else {
    // Penalize wasted seats (prefer minimal waste)
    score -= params.wastedSeats * 5;
  }

  // Prefer fewer tables
  score -= params.tableCount * 10;

  // Bonus for same section (easier for staff)
  if (params.sameSectionBonus) {
    score += 20;
  }

  // Bonus for adjacent tables
  if (params.adjacentBonus) {
    score += 15;
  }

  // Ensure score doesn't go negative
  return Math.max(score, 0);
}

/**
 * Format table numbers for display
 */
export function formatTableNumbers(tables: Table[]): string {
  return tables.map(t => `Table ${t.table_number}`).join(' + ');
}

/**
 * Get a color class based on combination score
 */
export function getCombinationColorClass(score: number): string {
  if (score >= 140) return 'bg-green-500/20 border-green-500/40 text-green-400';
  if (score >= 100) return 'bg-yellow-500/20 border-yellow-500/40 text-yellow-400';
  return 'bg-orange-500/20 border-orange-500/40 text-orange-400';
}

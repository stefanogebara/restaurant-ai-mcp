/**
 * Table Assignment Algorithm
 *
 * Intelligently assigns tables to parties based on:
 * - Party size
 * - Table capacity
 * - Table combinations
 * - Location preferences
 */

/**
 * Find the best table or combination of tables for a party
 * @param {number} partySize - Number of guests
 * @param {Array} availableTables - Array of available table objects
 * @param {string} preferredLocation - Preferred location (optional)
 * @returns {Object} { tables: Array, match: string, reason: string }
 */
function assignTables(partySize, availableTables, preferredLocation = null) {
  if (!availableTables || availableTables.length === 0) {
    return {
      success: false,
      tables: [],
      match: 'none',
      reason: 'No tables available'
    };
  }

  // Filter by preferred location if specified
  let tablesToCheck = preferredLocation
    ? availableTables.filter(t => t.fields.Location === preferredLocation)
    : availableTables;

  // If no tables in preferred location, use all available
  if (tablesToCheck.length === 0 && preferredLocation) {
    tablesToCheck = availableTables;
  }

  // Strategy 1: Exact match (best option)
  const exactMatch = findExactMatch(partySize, tablesToCheck);
  if (exactMatch) {
    return {
      success: true,
      tables: [exactMatch],
      match: 'perfect',
      reason: `Perfect match: Table ${exactMatch.fields['Table Number']} seats exactly ${partySize} guests`,
      total_capacity: exactMatch.fields.Capacity,
      location: exactMatch.fields.Location
    };
  }

  // Strategy 2: One size up (within 2 seats)
  const sizeUp = findSizeUp(partySize, tablesToCheck, 2);
  if (sizeUp) {
    return {
      success: true,
      tables: [sizeUp],
      match: 'good',
      reason: `Good match: Table ${sizeUp.fields['Table Number']} seats ${sizeUp.fields.Capacity} (${sizeUp.fields.Capacity - partySize} extra seats)`,
      total_capacity: sizeUp.fields.Capacity,
      location: sizeUp.fields.Location
    };
  }

  // Strategy 3: Table combinations (e.g., two 4-tops for party of 8)
  const combination = findTableCombination(partySize, tablesToCheck);
  if (combination.length > 0) {
    const totalCapacity = combination.reduce((sum, t) => sum + t.fields.Capacity, 0);
    const tableNumbers = combination.map(t => t.fields['Table Number']).join(' + ');
    return {
      success: true,
      tables: combination,
      match: 'acceptable',
      reason: `Combining tables: ${tableNumbers} (${totalCapacity} seats total)`,
      total_capacity: totalCapacity,
      location: combination[0].fields.Location
    };
  }

  // Strategy 4: Larger table (waste seats, but acceptable)
  const largerTable = findLargerTable(partySize, tablesToCheck);
  if (largerTable) {
    return {
      success: true,
      tables: [largerTable],
      match: 'acceptable',
      reason: `Using larger table: ${largerTable.fields['Table Number']} seats ${largerTable.fields.Capacity} (${largerTable.fields.Capacity - partySize} extra)`,
      total_capacity: largerTable.fields.Capacity,
      location: largerTable.fields.Location
    };
  }

  // No suitable tables found
  return {
    success: false,
    tables: [],
    match: 'none',
    reason: `Cannot accommodate party of ${partySize} with available tables`
  };
}

/**
 * Find table with exact capacity match
 */
function findExactMatch(partySize, tables) {
  return tables.find(t => t.fields.Capacity === partySize && t.fields['Is Active']);
}

/**
 * Find table one size up (within maxExtra seats)
 */
function findSizeUp(partySize, tables, maxExtra = 2) {
  return tables.find(t =>
    t.fields.Capacity > partySize &&
    t.fields.Capacity <= partySize + maxExtra &&
    t.fields['Is Active']
  );
}

/**
 * Find larger table (any size bigger than party)
 */
function findLargerTable(partySize, tables) {
  const largerTables = tables
    .filter(t => t.fields.Capacity >= partySize && t.fields['Is Active'])
    .sort((a, b) => a.fields.Capacity - b.fields.Capacity); // Smallest first

  return largerTables[0] || null;
}

/**
 * Check if a table can be combined with others
 * Fixed tables (round tables, booths) cannot be combined
 */
function isFlexibleTable(table) {
  // is_fixed = true means it CANNOT be combined (round table, booth)
  // Default to flexible (can combine) if not specified
  return table.fields['Is Fixed'] !== true;
}

/**
 * Check if two tables can be combined based on adjacency rules
 * MVP: Same location = can combine (implicit adjacency)
 * Advanced: Explicit adjacent_tables array
 */
function canCombine(table1, table2) {
  // Both tables must be flexible (not fixed)
  if (!isFlexibleTable(table1) || !isFlexibleTable(table2)) {
    return false;
  }

  // Check explicit adjacency first (if defined)
  const adjacent1 = table1.fields['Adjacent Tables'] || [];
  const adjacent2 = table2.fields['Adjacent Tables'] || [];

  if (adjacent1.length > 0 || adjacent2.length > 0) {
    // If adjacency is explicitly defined, use it
    return adjacent1.includes(table2.id) || adjacent2.includes(table1.id);
  }

  // Check combination group (if defined)
  const group1 = table1.fields['Combination Group'];
  const group2 = table2.fields['Combination Group'];

  if (group1 && group2) {
    return group1 === group2;
  }

  // MVP fallback: Same location means can combine
  return table1.fields.Location === table2.fields.Location;
}

/**
 * Find combination of tables that can accommodate party
 * Respects is_fixed flag and adjacency rules
 */
function findTableCombination(partySize, tables) {
  const activeTables = tables.filter(t => t.fields['Is Active']);
  const flexibleTables = activeTables.filter(t => isFlexibleTable(t));

  // Try combinations of 2 tables (most common case)
  for (let i = 0; i < flexibleTables.length; i++) {
    for (let j = i + 1; j < flexibleTables.length; j++) {
      const table1 = flexibleTables[i];
      const table2 = flexibleTables[j];

      // Check if tables can be combined
      if (!canCombine(table1, table2)) {
        continue;
      }

      const combinedCapacity = table1.fields.Capacity + table2.fields.Capacity;

      // Check if combination works (exact match or up to 2 extra seats)
      if (combinedCapacity >= partySize && combinedCapacity <= partySize + 2) {
        return [table1, table2];
      }
    }
  }

  // Try combinations of 3 tables (for very large parties)
  for (let i = 0; i < flexibleTables.length; i++) {
    for (let j = i + 1; j < flexibleTables.length; j++) {
      for (let k = j + 1; k < flexibleTables.length; k++) {
        const table1 = flexibleTables[i];
        const table2 = flexibleTables[j];
        const table3 = flexibleTables[k];

        // All three must be able to combine
        if (!canCombine(table1, table2) || !canCombine(table2, table3)) {
          continue;
        }

        const combinedCapacity = table1.fields.Capacity + table2.fields.Capacity + table3.fields.Capacity;

        if (combinedCapacity >= partySize && combinedCapacity <= partySize + 3) {
          return [table1, table2, table3];
        }
      }
    }
  }

  // Fallback: Try any 2-table combination with more seat tolerance
  for (let i = 0; i < flexibleTables.length; i++) {
    for (let j = i + 1; j < flexibleTables.length; j++) {
      const table1 = flexibleTables[i];
      const table2 = flexibleTables[j];

      if (!canCombine(table1, table2)) {
        continue;
      }

      const combinedCapacity = table1.fields.Capacity + table2.fields.Capacity;

      if (combinedCapacity >= partySize && combinedCapacity <= partySize + 4) {
        return [table1, table2];
      }
    }
  }

  return [];
}

/**
 * Get all available table combinations with rankings
 * Useful for showing options to host
 */
function getAllTableOptions(partySize, availableTables, preferredLocation = null) {
  const options = [];

  // Filter by preferred location if specified
  let tablesToCheck = preferredLocation
    ? availableTables.filter(t => t.fields.Location === preferredLocation)
    : availableTables;

  if (tablesToCheck.length === 0 && preferredLocation) {
    tablesToCheck = availableTables;
  }

  const activeTables = tablesToCheck.filter(t => t.fields['Is Active']);

  // Option 1: Single tables
  activeTables.forEach(table => {
    if (table.fields.Capacity >= partySize) {
      const wasteSeats = table.fields.Capacity - partySize;
      const score = wasteSeats === 0 ? 100 : (wasteSeats <= 2 ? 90 : 70);

      options.push({
        tables: [table],
        tableNumbers: [table.fields['Table Number']],
        totalCapacity: table.fields.Capacity,
        wasteSeats,
        location: table.fields.Location,
        match: wasteSeats === 0 ? 'Perfect' : wasteSeats <= 2 ? 'Good' : 'Acceptable',
        score
      });
    }
  });

  // Option 2: Two-table combinations (only flexible tables that can combine)
  const flexibleTables = activeTables.filter(t => isFlexibleTable(t));
  for (let i = 0; i < flexibleTables.length; i++) {
    for (let j = i + 1; j < flexibleTables.length; j++) {
      const table1 = flexibleTables[i];
      const table2 = flexibleTables[j];

      // Only include if tables can actually be combined
      if (!canCombine(table1, table2)) {
        continue;
      }

      const combinedCapacity = table1.fields.Capacity + table2.fields.Capacity;
      const wasteSeats = combinedCapacity - partySize;

      if (combinedCapacity >= partySize && wasteSeats <= 4) {
        const sameLocation = table1.fields.Location === table2.fields.Location;
        const score = sameLocation ? (wasteSeats <= 2 ? 85 : 75) : (wasteSeats <= 2 ? 75 : 65);

        options.push({
          tables: [table1, table2],
          tableNumbers: [table1.fields['Table Number'], table2.fields['Table Number']],
          totalCapacity: combinedCapacity,
          wasteSeats,
          location: sameLocation ? table1.fields.Location : 'Mixed',
          match: wasteSeats <= 2 ? 'Good' : 'Acceptable',
          score,
          isCombination: true
        });
      }
    }
  }

  // Sort by score (best options first)
  options.sort((a, b) => b.score - a.score);

  return options;
}

/**
 * Validate table assignment before seating
 */
function validateAssignment(tables, partySize) {
  if (!tables || tables.length === 0) {
    return { valid: false, reason: 'No tables provided' };
  }

  // Check all tables are active
  const inactiveTables = tables.filter(t => !t.fields['Is Active']);
  if (inactiveTables.length > 0) {
    const numbers = inactiveTables.map(t => t.fields['Table Number']).join(', ');
    return { valid: false, reason: `Tables not active: ${numbers}` };
  }

  // Check all tables are available
  const occupiedTables = tables.filter(t => t.fields.Status !== 'Available');
  if (occupiedTables.length > 0) {
    const numbers = occupiedTables.map(t => t.fields['Table Number']).join(', ');
    return { valid: false, reason: `Tables not available: ${numbers}` };
  }

  // Check capacity is sufficient
  const totalCapacity = tables.reduce((sum, t) => sum + t.fields.Capacity, 0);
  if (totalCapacity < partySize) {
    return { valid: false, reason: `Insufficient capacity: ${totalCapacity} seats for ${partySize} guests` };
  }

  return { valid: true, totalCapacity };
}

module.exports = {
  assignTables,
  getAllTableOptions,
  validateAssignment,
  findExactMatch,
  findSizeUp,
  findLargerTable,
  findTableCombination,
  // New flexible table helpers
  isFlexibleTable,
  canCombine
};

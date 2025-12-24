/**
 * Restaurant Availability Calculator
 *
 * Calculates table availability considering:
 * - Dining duration based on party size
 * - Overlapping reservations
 * - Restaurant capacity
 * - Time slot management
 */

/**
 * Get expected dining duration in minutes based on party size
 * @param {number} partySize - Number of guests
 * @returns {number} Duration in minutes
 */
function getDiningDuration(partySize) {
  if (partySize <= 2) return 90;  // 1.5 hours
  if (partySize <= 4) return 120; // 2 hours
  if (partySize <= 6) return 120; // 2 hours
  return 150; // 2.5 hours for large groups
}

/**
 * Parse time string (HH:MM) and add minutes
 * @param {string} time - Time in HH:MM format
 * @param {number} minutesToAdd - Minutes to add
 * @returns {string} New time in HH:MM format
 */
function addMinutesToTime(time, minutesToAdd) {
  const [hours, minutes] = time.split(':').map(Number);
  const date = new Date(2000, 0, 1, hours, minutes);
  date.setMinutes(date.getMinutes() + minutesToAdd);

  const newHours = String(date.getHours()).padStart(2, '0');
  const newMinutes = String(date.getMinutes()).padStart(2, '0');
  return `${newHours}:${newMinutes}`;
}

/**
 * Check if two time ranges overlap
 * @param {string} start1 - Start time 1 (HH:MM)
 * @param {string} end1 - End time 1 (HH:MM)
 * @param {string} start2 - Start time 2 (HH:MM)
 * @param {string} end2 - End time 2 (HH:MM)
 * @returns {boolean} True if ranges overlap
 */
function timeRangesOverlap(start1, end1, start2, end2) {
  const toMinutes = (time) => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  };

  const s1 = toMinutes(start1);
  const e1 = toMinutes(end1);
  const s2 = toMinutes(start2);
  const e2 = toMinutes(end2);

  // Ranges overlap if: start1 < end2 AND start2 < end1
  return s1 < e2 && s2 < e1;
}

/**
 * Calculate how many seats are occupied at a given time
 * @param {Array} reservations - Array of reservation objects
 * @param {string} checkTime - Time to check (HH:MM)
 * @returns {number} Number of occupied seats
 */
function getOccupiedSeatsAtTime(reservations, checkTime) {
  let occupiedSeats = 0;

  reservations.forEach(reservation => {
    const resTime = reservation.fields.Time;
    const partySize = reservation.fields['Party Size'] || 0;
    const duration = getDiningDuration(partySize);
    const endTime = addMinutesToTime(resTime, duration);

    // Check if this reservation overlaps with our check time
    // We add 1 minute to checkTime to make it a range
    const checkEndTime = addMinutesToTime(checkTime, 1);

    if (timeRangesOverlap(resTime, endTime, checkTime, checkEndTime)) {
      occupiedSeats += partySize;
    }
  });

  return occupiedSeats;
}

/**
 * Check if a time slot is available for a party
 * @param {string} requestedTime - Requested reservation time (HH:MM)
 * @param {number} partySize - Number of guests
 * @param {Array} existingReservations - Array of existing reservations for that date
 * @param {number} restaurantCapacity - Total restaurant capacity
 * @returns {Object} { available: boolean, reason: string, occupiedSeats: number }
 */
function checkTimeSlotAvailability(requestedTime, partySize, existingReservations, restaurantCapacity) {
  const duration = getDiningDuration(partySize);
  const endTime = addMinutesToTime(requestedTime, duration);

  // Check every 15 minutes during the dining period
  const checkInterval = 15; // minutes
  const timeChecks = Math.ceil(duration / checkInterval);

  let maxOccupied = 0;
  let problematicTime = null;

  for (let i = 0; i <= timeChecks; i++) {
    const checkTime = addMinutesToTime(requestedTime, i * checkInterval);
    const occupied = getOccupiedSeatsAtTime(existingReservations, checkTime);

    if (occupied > maxOccupied) {
      maxOccupied = occupied;
      problematicTime = checkTime;
    }

    // Check if adding this party would exceed capacity
    if (occupied + partySize > restaurantCapacity) {
      return {
        available: false,
        reason: `Restaurant will be at capacity around ${problematicTime}`,
        occupiedSeats: occupied,
        availableSeats: restaurantCapacity - occupied,
        wouldNeedSeats: partySize
      };
    }
  }

  return {
    available: true,
    reason: 'Time slot is available',
    occupiedSeats: maxOccupied,
    availableSeats: restaurantCapacity - maxOccupied,
    estimatedDuration: duration
  };
}

/**
 * Get suggested alternative times if requested time is not available
 * @param {string} requestedTime - Requested time (HH:MM)
 * @param {number} partySize - Party size
 * @param {Array} existingReservations - Existing reservations
 * @param {number} restaurantCapacity - Restaurant capacity
 * @param {string} openTime - Restaurant opening time (HH:MM)
 * @param {string} closeTime - Restaurant closing time (HH:MM)
 * @returns {Array} Array of available time suggestions
 */
function getSuggestedTimes(requestedTime, partySize, existingReservations, restaurantCapacity, openTime = '17:00', closeTime = '22:00') {
  const suggestions = [];
  const timeSlotInterval = 30; // Check every 30 minutes

  // Try earlier times (up to 2 hours before)
  for (let i = 1; i <= 4; i++) {
    const checkTime = addMinutesToTime(requestedTime, -i * timeSlotInterval);
    const result = checkTimeSlotAvailability(checkTime, partySize, existingReservations, restaurantCapacity);

    if (result.available && checkTime >= openTime) {
      suggestions.push({
        time: checkTime,
        availableSeats: result.availableSeats
      });
    }
  }

  // Try later times (up to 2 hours after)
  for (let i = 1; i <= 4; i++) {
    const checkTime = addMinutesToTime(requestedTime, i * timeSlotInterval);
    const duration = getDiningDuration(partySize);
    const endTime = addMinutesToTime(checkTime, duration);

    const result = checkTimeSlotAvailability(checkTime, partySize, existingReservations, restaurantCapacity);

    if (result.available && endTime <= closeTime) {
      suggestions.push({
        time: checkTime,
        availableSeats: result.availableSeats
      });
    }
  }

  // Sort by how close to original time
  suggestions.sort((a, b) => {
    const toMinutes = (time) => {
      const [hours, minutes] = time.split(':').map(Number);
      return hours * 60 + minutes;
    };

    const requested = toMinutes(requestedTime);
    const diffA = Math.abs(toMinutes(a.time) - requested);
    const diffB = Math.abs(toMinutes(b.time) - requested);

    return diffA - diffB;
  });

  // Return top 3 suggestions
  return suggestions.slice(0, 3);
}

/**
 * Calculate the maximum party size that can be accommodated
 * Considers table combinations for flexible tables
 * @param {Array} availableTables - Array of available table objects
 * @returns {Object} { maxSingleTable, maxWithCombinations, flexibleTableCount }
 */
function getMaxPartyCapacity(availableTables) {
  if (!availableTables || availableTables.length === 0) {
    return { maxSingleTable: 0, maxWithCombinations: 0, flexibleTableCount: 0 };
  }

  // Helper: check if a table can be combined
  const isFlexible = (table) => table.fields['Is Fixed'] !== true;

  // Helper: check if two tables can combine (same location for MVP)
  const canCombine = (t1, t2) => {
    if (!isFlexible(t1) || !isFlexible(t2)) return false;

    // Check explicit adjacency
    const adj1 = t1.fields['Adjacent Tables'] || [];
    const adj2 = t2.fields['Adjacent Tables'] || [];
    if (adj1.length > 0 || adj2.length > 0) {
      return adj1.includes(t2.id) || adj2.includes(t1.id);
    }

    // Check combination group
    const g1 = t1.fields['Combination Group'];
    const g2 = t2.fields['Combination Group'];
    if (g1 && g2) return g1 === g2;

    // MVP: same location can combine
    return t1.fields.Location === t2.fields.Location;
  };

  const activeTables = availableTables.filter(t => t.fields['Is Active']);
  const flexibleTables = activeTables.filter(isFlexible);

  // Find largest single table
  const maxSingleTable = activeTables.reduce(
    (max, t) => Math.max(max, t.fields.Capacity || 0),
    0
  );

  // Find largest possible 2-table combination
  let maxWithCombinations = maxSingleTable;
  for (let i = 0; i < flexibleTables.length; i++) {
    for (let j = i + 1; j < flexibleTables.length; j++) {
      if (canCombine(flexibleTables[i], flexibleTables[j])) {
        const combined = flexibleTables[i].fields.Capacity + flexibleTables[j].fields.Capacity;
        maxWithCombinations = Math.max(maxWithCombinations, combined);
      }
    }
  }

  return {
    maxSingleTable,
    maxWithCombinations,
    flexibleTableCount: flexibleTables.length
  };
}

/**
 * Check if a party size can be accommodated with available tables
 * Considers table combinations
 * @param {number} partySize - Number of guests
 * @param {Array} availableTables - Array of available table objects
 * @returns {Object} { canAccommodate, method, tables }
 */
function canAccommodateParty(partySize, availableTables) {
  if (!availableTables || availableTables.length === 0) {
    return { canAccommodate: false, method: 'none', tables: [] };
  }

  const isFlexible = (table) => table.fields['Is Fixed'] !== true;
  const canCombine = (t1, t2) => {
    if (!isFlexible(t1) || !isFlexible(t2)) return false;
    const adj1 = t1.fields['Adjacent Tables'] || [];
    const adj2 = t2.fields['Adjacent Tables'] || [];
    if (adj1.length > 0 || adj2.length > 0) {
      return adj1.includes(t2.id) || adj2.includes(t1.id);
    }
    const g1 = t1.fields['Combination Group'];
    const g2 = t2.fields['Combination Group'];
    if (g1 && g2) return g1 === g2;
    return t1.fields.Location === t2.fields.Location;
  };

  const activeTables = availableTables.filter(t => t.fields['Is Active']);

  // Try single table first
  const singleTable = activeTables.find(t => t.fields.Capacity >= partySize);
  if (singleTable) {
    return {
      canAccommodate: true,
      method: 'single',
      tables: [singleTable],
      totalCapacity: singleTable.fields.Capacity
    };
  }

  // Try 2-table combinations
  const flexibleTables = activeTables.filter(isFlexible);
  for (let i = 0; i < flexibleTables.length; i++) {
    for (let j = i + 1; j < flexibleTables.length; j++) {
      if (canCombine(flexibleTables[i], flexibleTables[j])) {
        const combined = flexibleTables[i].fields.Capacity + flexibleTables[j].fields.Capacity;
        if (combined >= partySize) {
          return {
            canAccommodate: true,
            method: 'combination',
            tables: [flexibleTables[i], flexibleTables[j]],
            totalCapacity: combined
          };
        }
      }
    }
  }

  return { canAccommodate: false, method: 'none', tables: [] };
}

module.exports = {
  getDiningDuration,
  addMinutesToTime,
  timeRangesOverlap,
  getOccupiedSeatsAtTime,
  checkTimeSlotAvailability,
  getSuggestedTimes,
  // New flexible table functions
  getMaxPartyCapacity,
  canAccommodateParty
};

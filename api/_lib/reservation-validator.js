/**
 * Reservation Validator
 *
 * Validates reservation requests against restaurant configuration:
 * - Business hours
 * - Holidays
 * - Party size limits
 * - Advance booking limits
 */

/**
 * Validate a reservation request against restaurant configuration
 * @param {object} params - Reservation parameters
 * @param {object} restaurant - Restaurant configuration from registry
 * @returns {object} Validation result with success/error
 */
function validateReservation(params, restaurant) {
  const { date, time, party_size } = params;
  const errors = [];

  // Get restaurant config with defaults
  const config = {
    business_hours: restaurant.business_hours || getDefaultBusinessHours(),
    holidays: restaurant.holidays || [],
    timezone: restaurant.timezone || 'America/Sao_Paulo',
    // max_party_size is only enforced when explicitly set by the restaurant.
    // Physical capacity limits are enforced by canAccommodateParty() using real table data.
    max_party_size: restaurant.max_party_size || null,
    min_advance_hours: restaurant.min_advance_hours || 1,
    max_advance_days: restaurant.max_advance_days || 90
  };

  // Parse the requested date and time
  const requestedDateTime = new Date(`${date}T${time}:00`);
  const now = new Date();

  // 1. Check if date is in the past
  if (requestedDateTime < now) {
    errors.push({
      code: 'PAST_DATE',
      message: 'The requested date and time is in the past. Please choose a future date.'
    });
  }

  // 2. Check minimum advance booking time
  const hoursUntilReservation = (requestedDateTime - now) / (1000 * 60 * 60);
  if (hoursUntilReservation < config.min_advance_hours && hoursUntilReservation > 0) {
    errors.push({
      code: 'TOO_SOON',
      message: `Reservations must be made at least ${config.min_advance_hours} hour(s) in advance.`
    });
  }

  // 3. Check maximum advance booking days
  const daysUntilReservation = (requestedDateTime - now) / (1000 * 60 * 60 * 24);
  if (daysUntilReservation > config.max_advance_days) {
    errors.push({
      code: 'TOO_FAR',
      message: `Reservations can only be made up to ${config.max_advance_days} days in advance.`
    });
  }

  // 4. Check party size — only enforce if restaurant has set an explicit cap.
  // Physical table capacity is checked separately via canAccommodateParty().
  const partySize = parseInt(party_size);
  if (config.max_party_size && partySize > config.max_party_size) {
    errors.push({
      code: 'PARTY_TOO_LARGE',
      message: `We can accommodate parties up to ${config.max_party_size} guests. For larger groups, please call us directly.`
    });
  }

  if (partySize < 1) {
    errors.push({
      code: 'INVALID_PARTY_SIZE',
      message: 'Party size must be at least 1 person.'
    });
  }

  // 5. Check if restaurant is open on this day
  const dayOfWeek = requestedDateTime.toLocaleDateString('en-US', {
    weekday: 'long',
    timeZone: config.timezone
  }).toLowerCase();

  // business_hours can be an array of {day, is_open, ...} or an object keyed by day name
  const dayHours = Array.isArray(config.business_hours)
    ? config.business_hours.find(d => d.day && d.day.toLowerCase() === dayOfWeek)
    : config.business_hours[dayOfWeek];

  if (!dayHours || dayHours.is_open === false) {
    errors.push({
      code: 'CLOSED_DAY',
      message: `Sorry, the restaurant is closed on ${dayOfWeek}s.`
    });
  } else {
    // 6. Check if time is within business hours
    const requestedTime = time;
    const openTime = dayHours.open || dayHours.open_time || (dayHours.periods?.[0]?.open) || '11:00';
    const closeTime = dayHours.close || dayHours.close_time || (dayHours.periods?.[dayHours.periods.length - 1]?.close) || '22:00';

    if (requestedTime < openTime) {
      errors.push({
        code: 'BEFORE_OPEN',
        message: `The restaurant opens at ${formatTime(openTime)} on ${dayOfWeek}s. Please choose a later time.`
      });
    }

    // Allow reservations up to 1.5 hours before closing
    const lastReservationTime = subtractTime(closeTime, 90);
    if (requestedTime > lastReservationTime) {
      errors.push({
        code: 'TOO_LATE',
        message: `Last reservations are accepted at ${formatTime(lastReservationTime)} on ${dayOfWeek}s (we close at ${formatTime(closeTime)}).`
      });
    }
  }

  // 7. Check for holidays
  const dateStr = date; // Already in YYYY-MM-DD format
  const holiday = config.holidays.find(h => h.date === dateStr);

  if (holiday) {
    errors.push({
      code: 'HOLIDAY',
      message: `Sorry, the restaurant is closed on ${holiday.name} (${formatDate(date)}).`
    });
  }

  // Return validation result
  if (errors.length > 0) {
    return {
      valid: false,
      errors,
      message: errors[0].message // Primary error message for the user
    };
  }

  return {
    valid: true,
    config,
    message: null
  };
}

/**
 * Get default business hours
 */
function getDefaultBusinessHours() {
  return {
    monday: { open: '11:00', close: '22:00', is_open: true },
    tuesday: { open: '11:00', close: '22:00', is_open: true },
    wednesday: { open: '11:00', close: '22:00', is_open: true },
    thursday: { open: '11:00', close: '22:00', is_open: true },
    friday: { open: '11:00', close: '23:00', is_open: true },
    saturday: { open: '11:00', close: '23:00', is_open: true },
    sunday: { open: '12:00', close: '21:00', is_open: true }
  };
}

/**
 * Subtract minutes from a time string
 */
function subtractTime(timeStr, minutes) {
  let [hours, mins] = timeStr.split(':').map(Number);
  // Treat 00:00 as 24:00 (midnight closing = end of day, not start)
  if (hours === 0 && mins === 0) hours = 24;
  const totalMins = hours * 60 + mins - minutes;
  const newHours = Math.floor(totalMins / 60);
  const newMins = totalMins % 60;
  return `${String(newHours).padStart(2, '0')}:${String(newMins).padStart(2, '0')}`;
}

/**
 * Format time for display (24h to 12h)
 */
function formatTime(timeStr) {
  const [hours, mins] = timeStr.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${String(mins).padStart(2, '0')} ${period}`;
}

/**
 * Format date for display
 */
function formatDate(dateStr) {
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
}

/**
 * Build confirmation message with restaurant details
 */
function buildConfirmationMessage(params, restaurant, reservationId) {
  const { customer_name, party_size, date, time, special_requests } = params;
  const restaurantName = restaurant.restaurant_name || 'the restaurant';

  const formattedDate = formatDate(date);
  const formattedTime = formatTime(time);

  let message = `Your reservation at ${restaurantName} is confirmed!\n\n`;
  message += `Confirmation Number: ${reservationId}\n`;
  message += `Name: ${customer_name}\n`;
  message += `Party Size: ${party_size} guests\n`;
  message += `Date: ${formattedDate}\n`;
  message += `Time: ${formattedTime}\n`;

  if (special_requests) {
    message += `Special Requests: ${special_requests}\n`;
  }

  message += `\nWe look forward to seeing you!`;

  return message;
}

/**
 * Build short confirmation for voice response
 */
function buildVoiceConfirmation(params, restaurant, reservationId) {
  const { customer_name, party_size, date, time } = params;
  const restaurantName = restaurant.restaurant_name || 'the restaurant';

  const formattedDate = formatDate(date);
  const formattedTime = formatTime(time);

  return `Perfect! Your reservation at ${restaurantName} is confirmed for ${customer_name}, ` +
    `party of ${party_size}, on ${formattedDate} at ${formattedTime}. ` +
    `Your confirmation number is ${reservationId}. We look forward to seeing you!`;
}

module.exports = {
  validateReservation,
  buildConfirmationMessage,
  buildVoiceConfirmation,
  formatTime,
  formatDate,
  getDefaultBusinessHours
};

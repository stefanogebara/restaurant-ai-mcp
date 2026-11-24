/**
 * Date and time parsing/formatting utilities for WhatsApp reservation flows.
 * Extracted from twilio-whatsapp-webhook.js (M-23).
 */

const { createSecureLogger } = require('../secure-logger');
const logger = createSecureLogger('WhatsApp:DateTime');

/**
 * Parse natural language date into YYYY-MM-DD format
 * Handles: "today", "tomorrow", "2026-01-19", "January 19", "19/01/2026", etc.
 */
function parseDate(dateStr) {
  if (!dateStr) return null;

  const today = new Date();
  const normalizedDate = dateStr.toLowerCase().trim();

  // Handle "today"
  if (normalizedDate === 'today') {
    return today.toISOString().slice(0, 10);
  }

  // Handle "tomorrow"
  if (normalizedDate === 'tomorrow') {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().slice(0, 10);
  }

  // Handle day names (next Monday, this Friday, etc.)
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  for (let i = 0; i < dayNames.length; i++) {
    if (normalizedDate.includes(dayNames[i])) {
      const targetDay = i;
      const currentDay = today.getDay();
      let daysUntil = targetDay - currentDay;
      if (daysUntil <= 0) daysUntil += 7; // Next week if today or past
      const targetDate = new Date(today);
      targetDate.setDate(targetDate.getDate() + daysUntil);
      return targetDate.toISOString().slice(0, 10);
    }
  }

  // Handle ISO format (already correct)
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }

  // Handle "January 19" or "Jan 19" format
  const monthNames = ['january', 'february', 'march', 'april', 'may', 'june',
                      'july', 'august', 'september', 'october', 'november', 'december'];
  const monthAbbrev = ['jan', 'feb', 'mar', 'apr', 'may', 'jun',
                       'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

  for (let i = 0; i < monthNames.length; i++) {
    const monthMatch = normalizedDate.match(new RegExp(`(${monthNames[i]}|${monthAbbrev[i]})\\s*(\\d{1,2})`));
    if (monthMatch) {
      const day = parseInt(monthMatch[2]);
      const year = today.getFullYear();
      const month = (i + 1).toString().padStart(2, '0');
      return `${year}-${month}-${day.toString().padStart(2, '0')}`;
    }
  }

  // Try to parse as a date directly
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  // Default to tomorrow if we can't parse
  logger.warn(` Could not parse date: "${dateStr}", defaulting to tomorrow`);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.toISOString().slice(0, 10);
}

/**
 * Parse natural language time into HH:MM format (24-hour)
 * Handles: "7pm", "7:30pm", "19:00", "7 PM", "seven o'clock", etc.
 */
function parseTime(timeStr) {
  if (!timeStr) return null;

  const normalized = timeStr.toLowerCase().trim().replace(/\s+/g, '');

  // Handle 24-hour format (19:00, 19:30)
  const time24Match = normalized.match(/^(\d{1,2}):(\d{2})$/);
  if (time24Match) {
    const hours = parseInt(time24Match[1]).toString().padStart(2, '0');
    const minutes = time24Match[2];
    return `${hours}:${minutes}`;
  }

  // Handle 12-hour format (7pm, 7:30pm, 7:30 pm)
  const time12Match = normalized.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (time12Match) {
    let hours = parseInt(time12Match[1]);
    const minutes = time12Match[2] || '00';
    const period = time12Match[3];

    if (period === 'pm' && hours !== 12) hours += 12;
    if (period === 'am' && hours === 12) hours = 0;

    return `${hours.toString().padStart(2, '0')}:${minutes}`;
  }

  // Handle just a number (assume PM for restaurant context, 1-11 = PM, 12 = noon)
  const justNumber = normalized.match(/^(\d{1,2})$/);
  if (justNumber) {
    let hours = parseInt(justNumber[1]);
    if (hours >= 1 && hours <= 11) hours += 12; // Assume PM for restaurant hours
    return `${hours.toString().padStart(2, '0')}:00`;
  }

  // Default to 19:00 (7pm) if we can't parse
  logger.warn(` Could not parse time: "${timeStr}", defaulting to 19:00`);
  return '19:00';
}

/**
 * Format a date for display with relative context (Today, Tomorrow, etc.)
 * @param {string} dateStr - Date in YYYY-MM-DD format
 * @returns {string} - Formatted date like "Today (Monday, January 19th)"
 */
function formatDateForDisplay(dateStr) {
  const date = new Date(dateStr + 'T12:00:00'); // Use noon to avoid timezone issues
  const today = new Date();
  today.setHours(12, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const dayAfterTomorrow = new Date(today);
  dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);

  // Format the full date
  const options = { weekday: 'long', month: 'long', day: 'numeric' };
  const fullDate = date.toLocaleDateString('en-US', options);

  // Add ordinal suffix to day
  const day = date.getDate();
  const ordinal = day === 1 || day === 21 || day === 31 ? 'st'
                : day === 2 || day === 22 ? 'nd'
                : day === 3 || day === 23 ? 'rd' : 'th';
  const formattedDate = fullDate.replace(/(\d+)/, `$1${ordinal}`);

  // Check for relative dates
  if (date.toDateString() === today.toDateString()) {
    return `Today (${formattedDate})`;
  }
  if (date.toDateString() === tomorrow.toDateString()) {
    return `Tomorrow (${formattedDate})`;
  }

  // For dates within the next week, just show the day name and date
  const daysUntil = Math.floor((date - today) / (1000 * 60 * 60 * 24));
  if (daysUntil >= 2 && daysUntil <= 7) {
    return `This ${formattedDate}`;
  }

  // For dates further out, include the year
  if (daysUntil > 7) {
    return date.toLocaleDateString('en-US', { ...options, year: 'numeric' }).replace(/(\d+),/, `$1${ordinal},`);
  }

  return formattedDate;
}

/**
 * Format time for display (12-hour format with AM/PM)
 * @param {string} timeStr - Time in HH:MM format (24-hour)
 * @returns {string} - Formatted time like "7:00 PM"
 */
function formatTimeForDisplay(timeStr) {
  try {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 || 12;
    return `${hour12}:${minutes.toString().padStart(2, '0')} ${period}`;
  } catch {
    return timeStr;
  }
}

module.exports = {
  parseDate,
  parseTime,
  formatDateForDisplay,
  formatTimeForDisplay,
};

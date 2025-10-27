/**
 * Time Formatting Utilities
 *
 * Provides consistent time formatting across the application
 */

/**
 * Format a date as "X time ago" with smart unit selection
 *
 * @param date - The date to format
 * @returns Formatted string like "5m ago", "2h 15m ago", "1d 3h ago"
 *
 * @example
 * formatTimeAgo(new Date(Date.now() - 300000)) // "5m ago"
 * formatTimeAgo(new Date(Date.now() - 7200000)) // "2h ago"
 * formatTimeAgo(new Date(Date.now() - 90000000)) // "1d 1h ago"
 */
export function formatTimeAgo(date: Date | string): string {
  const timestamp = typeof date === 'string' ? new Date(date) : date;

  // Validate date
  if (isNaN(timestamp.getTime())) {
    return 'Invalid date';
  }

  const now = new Date();
  const diffMs = now.getTime() - timestamp.getTime();

  // Handle future dates
  if (diffMs < 0) {
    return 'Just now';
  }

  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  // Less than 1 hour: show minutes
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  // Less than 24 hours: show hours and minutes
  if (hours < 24) {
    const remainingMins = minutes % 60;
    if (remainingMins === 0) {
      return `${hours}h ago`;
    }
    return `${hours}h ${remainingMins}m ago`;
  }

  // 24+ hours: show days and hours
  const remainingHours = hours % 24;
  if (remainingHours === 0) {
    return `${days}d ago`;
  }
  return `${days}d ${remainingHours}h ago`;
}

/**
 * Format estimated time remaining with smart unit selection
 *
 * @param estimatedDeparture - The estimated departure time
 * @param seatedAt - When the party was seated
 * @returns Formatted string like "45m left", "OVERDUE by 30m", or null if invalid
 *
 * @example
 * formatTimeRemaining(new Date(Date.now() + 2700000), new Date()) // "45m left"
 * formatTimeRemaining(new Date(Date.now() - 1800000), new Date()) // "⚠️ 30m OVERDUE"
 */
export function formatTimeRemaining(
  estimatedDeparture: Date | string,
  seatedAt: Date | string
): string | null {
  const departure = typeof estimatedDeparture === 'string' ? new Date(estimatedDeparture) : estimatedDeparture;
  const seated = typeof seatedAt === 'string' ? new Date(seatedAt) : seatedAt;

  // Validate dates
  if (isNaN(departure.getTime()) || isNaN(seated.getTime())) {
    return null;
  }

  const now = new Date();
  const remainingMs = departure.getTime() - now.getTime();
  const remainingMinutes = Math.floor(remainingMs / 60000);

  // Party is overdue
  if (remainingMinutes < 0) {
    const overdueMinutes = Math.abs(remainingMinutes);
    const overdueHours = Math.floor(overdueMinutes / 60);

    if (overdueHours >= 1) {
      const mins = overdueMinutes % 60;
      return `⚠️ ${overdueHours}h ${mins}m OVERDUE`;
    }
    return `⚠️ ${overdueMinutes}m OVERDUE`;
  }

  // Party still has time
  const hours = Math.floor(remainingMinutes / 60);
  const mins = remainingMinutes % 60;

  if (hours >= 1) {
    return `${hours}h ${mins}m left`;
  }
  return `${mins}m left`;
}

/**
 * Format wait time estimate for waitlist entries
 *
 * @param estimatedMinutes - Estimated wait time in minutes
 * @returns Formatted string like "~15 min wait" or "~1h 30m wait"
 */
export function formatWaitTime(estimatedMinutes: number | null | undefined): string {
  if (estimatedMinutes == null || isNaN(estimatedMinutes)) {
    return '~? min wait';
  }

  if (estimatedMinutes < 60) {
    return `~${estimatedMinutes} min wait`;
  }

  const hours = Math.floor(estimatedMinutes / 60);
  const mins = estimatedMinutes % 60;

  if (mins === 0) {
    return `~${hours}h wait`;
  }
  return `~${hours}h ${mins}m wait`;
}

/**
 * Format absolute time for display (e.g., "7:30 PM" or "Tomorrow at 7:30 PM")
 *
 * @param date - The date to format
 * @param includeDate - Whether to include the date portion
 * @returns Formatted time string
 */
export function formatAbsoluteTime(date: Date | string, includeDate = false): string {
  const timestamp = typeof date === 'string' ? new Date(date) : date;

  if (isNaN(timestamp.getTime())) {
    return 'Invalid time';
  }

  const timeStr = timestamp.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  if (!includeDate) {
    return timeStr;
  }

  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Check if it's today
  if (timestamp.toDateString() === today.toDateString()) {
    return `Today at ${timeStr}`;
  }

  // Check if it's tomorrow
  if (timestamp.toDateString() === tomorrow.toDateString()) {
    return `Tomorrow at ${timeStr}`;
  }

  // Otherwise show full date
  const dateStr = timestamp.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  });

  return `${dateStr} at ${timeStr}`;
}

/**
 * Get time ago with update frequency hint
 * Useful for showing when data was last refreshed
 *
 * @param date - The date to format
 * @returns Object with formatted string and whether it should update frequently
 */
export function getTimeAgoWithFrequency(date: Date | string): {
  text: string;
  shouldUpdateFrequently: boolean;
} {
  const formatted = formatTimeAgo(date);
  const timestamp = typeof date === 'string' ? new Date(date) : date;
  const diffMinutes = Math.floor((Date.now() - timestamp.getTime()) / 60000);

  return {
    text: formatted,
    shouldUpdateFrequently: diffMinutes < 60 // Update every second if < 1h old
  };
}

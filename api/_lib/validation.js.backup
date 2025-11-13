/**
 * Data Validation Utilities
 *
 * Centralized validation logic to prevent NULL values and ensure data quality.
 * Following 2025 best practices for API input validation.
 */

/**
 * Validate phone number format
 *
 * @param {string} phone - Phone number to validate
 * @returns {{valid: boolean, error?: string}}
 */
function validatePhoneNumber(phone) {
  if (!phone || typeof phone !== 'string') {
    return { valid: false, error: 'Phone number is required' };
  }

  // Remove all non-digit characters
  const digitsOnly = phone.replace(/\D/g, '');

  // Check if it has at least 10 digits
  if (digitsOnly.length < 10) {
    return { valid: false, error: 'Phone number must have at least 10 digits' };
  }

  // Check if it's a valid phone pattern (allows international formats)
  const phonePattern = /^[\+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,9}$/;
  if (!phonePattern.test(phone)) {
    return { valid: false, error: 'Invalid phone number format' };
  }

  return { valid: true };
}

/**
 * Validate email format
 *
 * @param {string} email - Email to validate
 * @param {boolean} required - Whether email is required
 * @returns {{valid: boolean, error?: string}}
 */
function validateEmail(email, required = false) {
  if (!email || email.trim() === '') {
    if (required) {
      return { valid: false, error: 'Email is required' };
    }
    return { valid: true }; // Optional email, empty is OK
  }

  const emailPattern = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailPattern.test(email)) {
    return { valid: false, error: 'Invalid email format' };
  }

  return { valid: true };
}

/**
 * Validate customer name
 *
 * @param {string} name - Customer name
 * @returns {{valid: boolean, error?: string}}
 */
function validateCustomerName(name) {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Customer name is required' };
  }

  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'Customer name cannot be empty' };
  }

  if (trimmed.length < 2) {
    return { valid: false, error: 'Customer name must be at least 2 characters' };
  }

  if (trimmed.length > 100) {
    return { valid: false, error: 'Customer name must be less than 100 characters' };
  }

  // Warn about test data (but don't reject)
  if (/test/i.test(trimmed)) {
    console.warn('[VALIDATION] Customer name contains "test":', trimmed);
  }

  return { valid: true };
}

/**
 * Validate party size
 *
 * @param {number|string} partySize - Number of guests
 * @returns {{valid: boolean, error?: string, value?: number}}
 */
function validatePartySize(partySize) {
  if (partySize == null) {
    return { valid: false, error: 'Party size is required' };
  }

  const size = parseInt(partySize);

  if (isNaN(size)) {
    return { valid: false, error: 'Party size must be a number' };
  }

  if (size < 1) {
    return { valid: false, error: 'Party size must be at least 1' };
  }

  if (size > 20) {
    return { valid: false, error: 'Party size cannot exceed 20 guests' };
  }

  return { valid: true, value: size };
}

/**
 * Validate reservation date
 *
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {{valid: boolean, error?: string, value?: Date}}
 */
function validateReservationDate(date) {
  if (!date || typeof date !== 'string') {
    return { valid: false, error: 'Reservation date is required' };
  }

  try {
    const parsedDate = new Date(date);

    if (isNaN(parsedDate.getTime())) {
      return { valid: false, error: 'Invalid date format' };
    }

    // Check if date is in the past
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (parsedDate < today) {
      return { valid: false, error: 'Cannot make reservations for past dates' };
    }

    // Check if date is more than 90 days in the future
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 90);

    if (parsedDate > maxDate) {
      return { valid: false, error: 'Cannot make reservations more than 90 days in advance' };
    }

    return { valid: true, value: parsedDate };
  } catch (error) {
    return { valid: false, error: 'Invalid date format' };
  }
}

/**
 * Validate reservation time
 *
 * @param {string} time - Time in HH:MM format
 * @returns {{valid: boolean, error?: string}}
 */
function validateReservationTime(time) {
  if (!time || typeof time !== 'string') {
    return { valid: false, error: 'Reservation time is required' };
  }

  const timePattern = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
  if (!timePattern.test(time)) {
    return { valid: false, error: 'Invalid time format (use HH:MM)' };
  }

  // Check if time is within business hours (11:00 AM - 10:00 PM)
  const [hours, minutes] = time.split(':').map(Number);
  const totalMinutes = hours * 60 + minutes;

  const openingTime = 11 * 60; // 11:00 AM
  const closingTime = 22 * 60; // 10:00 PM

  if (totalMinutes < openingTime || totalMinutes > closingTime) {
    return { valid: false, error: 'Reservations only available between 11:00 AM and 10:00 PM' };
  }

  return { valid: true };
}

/**
 * Validate table IDs
 *
 * @param {string[]|string} tableIds - Array of table IDs or comma-separated string
 * @returns {{valid: boolean, error?: string, value?: string[]}}
 */
function validateTableIds(tableIds) {
  if (!tableIds) {
    return { valid: false, error: 'Table IDs are required' };
  }

  let ids = tableIds;

  // Convert comma-separated string to array
  if (typeof tableIds === 'string') {
    ids = tableIds.split(',').map(id => id.trim()).filter(id => id);
  }

  if (!Array.isArray(ids) || ids.length === 0) {
    return { valid: false, error: 'At least one table must be selected' };
  }

  if (ids.length > 4) {
    return { valid: false, error: 'Cannot assign more than 4 tables to a single party' };
  }

  return { valid: true, value: ids };
}

/**
 * Validate waitlist entry data
 *
 * @param {Object} data - Waitlist entry data
 * @returns {{valid: boolean, errors?: string[]}}
 */
function validateWaitlistEntry(data) {
  const errors = [];

  // Validate required fields
  const nameValidation = validateCustomerName(data.customer_name);
  if (!nameValidation.valid) {
    errors.push(nameValidation.error);
  }

  const phoneValidation = validatePhoneNumber(data.customer_phone);
  if (!phoneValidation.valid) {
    errors.push(phoneValidation.error);
  }

  const partySizeValidation = validatePartySize(data.party_size);
  if (!partySizeValidation.valid) {
    errors.push(partySizeValidation.error);
  }

  // Validate optional email if provided
  if (data.customer_email) {
    const emailValidation = validateEmail(data.customer_email, false);
    if (!emailValidation.valid) {
      errors.push(emailValidation.error);
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined
  };
}

/**
 * Validate service record data
 *
 * @param {Object} data - Service record data
 * @returns {{valid: boolean, errors?: string[]}}
 */
function validateServiceRecord(data) {
  const errors = [];

  // Validate required fields
  const nameValidation = validateCustomerName(data.customer_name);
  if (!nameValidation.valid) {
    errors.push(nameValidation.error);
  }

  const phoneValidation = validatePhoneNumber(data.customer_phone);
  if (!phoneValidation.valid) {
    errors.push(phoneValidation.error);
  }

  const partySizeValidation = validatePartySize(data.party_size);
  if (!partySizeValidation.valid) {
    errors.push(partySizeValidation.error);
  }

  const tableIdsValidation = validateTableIds(data.table_ids);
  if (!tableIdsValidation.valid) {
    errors.push(tableIdsValidation.error);
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined
  };
}

/**
 * Validate reservation data
 *
 * @param {Object} data - Reservation data
 * @returns {{valid: boolean, errors?: string[]}}
 */
function validateReservation(data) {
  const errors = [];

  // Validate required fields
  const nameValidation = validateCustomerName(data.customer_name);
  if (!nameValidation.valid) {
    errors.push(nameValidation.error);
  }

  const phoneValidation = validatePhoneNumber(data.customer_phone);
  if (!phoneValidation.valid) {
    errors.push(phoneValidation.error);
  }

  const emailValidation = validateEmail(data.customer_email, false);
  if (!emailValidation.valid) {
    errors.push(emailValidation.error);
  }

  const partySizeValidation = validatePartySize(data.party_size);
  if (!partySizeValidation.valid) {
    errors.push(partySizeValidation.error);
  }

  const dateValidation = validateReservationDate(data.date);
  if (!dateValidation.valid) {
    errors.push(dateValidation.error);
  }

  const timeValidation = validateReservationTime(data.time);
  if (!timeValidation.valid) {
    errors.push(timeValidation.error);
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined
  };
}

/**
 * Sanitize input string to prevent injection attacks
 *
 * @param {string} input - Input string to sanitize
 * @returns {string} - Sanitized string
 */
function sanitizeInput(input) {
  if (typeof input !== 'string') {
    return input;
  }

  return input
    .trim()
    .replace(/[<>\"']/g, '') // Remove HTML/JS injection characters
    .substring(0, 500); // Limit length
}

module.exports = {
  validatePhoneNumber,
  validateEmail,
  validateCustomerName,
  validatePartySize,
  validateReservationDate,
  validateReservationTime,
  validateTableIds,
  validateWaitlistEntry,
  validateServiceRecord,
  validateReservation,
  sanitizeInput
};

function normalizeTrimmedString(value) {
  if (value === undefined || value === null) return undefined;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeInteger(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const normalized = Number.parseInt(String(value), 10);
  return Number.isFinite(normalized) ? normalized : undefined;
}

function normalizeNumber(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const normalized = Number.parseFloat(String(value));
  return Number.isFinite(normalized) ? normalized : undefined;
}

export function isValidReservationDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function isValidReservationTime(value) {
  return typeof value === 'string' && /^\d{2}:\d{2}$/.test(value);
}

export function normalizeReservationCreateInput(input = {}, options = {}) {
  const requireRestaurantId = options.requireRestaurantId === true;
  const normalized = {
    date: normalizeTrimmedString(input.date),
    time: normalizeTrimmedString(input.time),
    party_size: normalizeInteger(input.party_size),
    customer_name: normalizeTrimmedString(input.customer_name),
    customer_phone: normalizeTrimmedString(input.customer_phone),
    customer_email: normalizeTrimmedString(input.customer_email),
    special_requests: normalizeTrimmedString(input.special_requests),
    source: normalizeTrimmedString(input.source),
  };

  if (requireRestaurantId || input.restaurant_id !== undefined) {
    normalized.restaurant_id = normalizeTrimmedString(input.restaurant_id);
  }

  if (input.deposit_payment_intent_id !== undefined) {
    normalized.deposit_payment_intent_id = normalizeTrimmedString(input.deposit_payment_intent_id);
  }

  if (input.deposit_amount !== undefined) {
    normalized.deposit_amount = normalizeNumber(input.deposit_amount);
  }

  return normalized;
}

export function getMissingReservationCreateFields(input = {}, options = {}) {
  const normalized = normalizeReservationCreateInput(input, options);
  const missing = [];

  if (options.requireRestaurantId && !normalized.restaurant_id) missing.push('restaurant_id');
  if (!normalized.customer_name) missing.push('customer_name');
  if (!normalized.customer_phone) missing.push('customer_phone');
  if (!normalized.party_size) missing.push('party_size');
  if (!normalized.date) missing.push('date');
  if (!normalized.time) missing.push('time');

  return missing;
}

export function normalizeReservationModifyInput(input = {}) {
  const normalized = {
    reservation_id: normalizeTrimmedString(input.reservation_id),
  };

  const date = normalizeTrimmedString(input.date);
  if (date !== undefined) normalized.date = date;

  const time = normalizeTrimmedString(input.time);
  if (time !== undefined) normalized.time = time;

  const partySize = normalizeInteger(input.party_size);
  if (partySize !== undefined) normalized.party_size = partySize;

  if (Object.prototype.hasOwnProperty.call(input, 'special_requests')) {
    normalized.special_requests = typeof input.special_requests === 'string'
      ? input.special_requests.trim()
      : input.special_requests;
  }

  return normalized;
}

export function mapReservationSummary(record = {}, extras = {}) {
  return {
    id: record.reservation_id || record.id || '',
    name: record.customer_name || record.name || '',
    party_size: typeof record.party_size === 'number' ? record.party_size : normalizeInteger(record.party_size) || 0,
    date: record.date || '',
    time: record.time || '',
    status: record.status || 'confirmed',
    restaurant_name: extras.restaurant_name || record.restaurant_name || 'Restaurant',
  };
}

const reservationContract = {
  getMissingReservationCreateFields,
  isValidReservationDate,
  isValidReservationTime,
  mapReservationSummary,
  normalizeReservationCreateInput,
  normalizeReservationModifyInput,
};

export default reservationContract;

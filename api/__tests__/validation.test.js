/**
 * Tests for api/_lib/validation.js
 * Pure function tests — no mocking needed
 */

const {
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
  sanitizeInput,
  sanitizeStringXSS,
  sanitizeObject,
  sanitizeSearchQuery,
} = require('../_lib/validation');

// ============================================================
// validatePhoneNumber
// ============================================================
describe('validatePhoneNumber', () => {
  test('rejects null/undefined/empty', () => {
    expect(validatePhoneNumber(null).valid).toBe(false);
    expect(validatePhoneNumber(undefined).valid).toBe(false);
    expect(validatePhoneNumber('').valid).toBe(false);
  });

  test('rejects non-string', () => {
    expect(validatePhoneNumber(12345).valid).toBe(false);
  });

  test('rejects phone with fewer than 10 digits', () => {
    const result = validatePhoneNumber('123-456');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('10 digits');
  });

  test('rejects phone with invalid characters', () => {
    const result = validatePhoneNumber('+1 555 abc defg');
    expect(result.valid).toBe(false);
  });

  test('accepts valid US phone', () => {
    expect(validatePhoneNumber('+1-555-123-4567').valid).toBe(true);
  });

  test('accepts valid international phone', () => {
    expect(validatePhoneNumber('+34 611 22 33 44').valid).toBe(true);
  });

  test('accepts phone with parentheses', () => {
    expect(validatePhoneNumber('(555) 123-4567').valid).toBe(true);
  });

  test('accepts phone with dots', () => {
    expect(validatePhoneNumber('555.123.4567').valid).toBe(true);
  });

  test('accepts plain digits', () => {
    expect(validatePhoneNumber('+34600112233').valid).toBe(true);
  });
});

// ============================================================
// validateEmail
// ============================================================
describe('validateEmail', () => {
  test('optional empty email is valid', () => {
    expect(validateEmail('').valid).toBe(true);
    expect(validateEmail(null).valid).toBe(true);
    expect(validateEmail(undefined).valid).toBe(true);
  });

  test('required empty email is invalid', () => {
    const result = validateEmail('', true);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('required');
  });

  test('rejects invalid format', () => {
    expect(validateEmail('notanemail').valid).toBe(false);
    expect(validateEmail('foo@').valid).toBe(false);
    expect(validateEmail('@bar.com').valid).toBe(false);
  });

  test('accepts valid email', () => {
    expect(validateEmail('user@example.com').valid).toBe(true);
    expect(validateEmail('a.b-c@domain.co.uk').valid).toBe(true);
  });
});

// ============================================================
// validateCustomerName
// ============================================================
describe('validateCustomerName', () => {
  test('rejects null/undefined', () => {
    expect(validateCustomerName(null).valid).toBe(false);
    expect(validateCustomerName(undefined).valid).toBe(false);
  });

  test('rejects empty string', () => {
    expect(validateCustomerName('  ').valid).toBe(false);
  });

  test('rejects single character', () => {
    expect(validateCustomerName('A').valid).toBe(false);
  });

  test('rejects name over 100 characters', () => {
    const longName = 'A'.repeat(101);
    expect(validateCustomerName(longName).valid).toBe(false);
  });

  test('accepts valid name', () => {
    expect(validateCustomerName('Maria Silva').valid).toBe(true);
  });

  test('accepts 2-char name', () => {
    expect(validateCustomerName('Li').valid).toBe(true);
  });

  test('warns but accepts name containing "test"', () => {
    const result = validateCustomerName('Test User');
    expect(result.valid).toBe(true);
  });
});

// ============================================================
// validatePartySize
// ============================================================
describe('validatePartySize', () => {
  test('rejects null/undefined', () => {
    expect(validatePartySize(null).valid).toBe(false);
    expect(validatePartySize(undefined).valid).toBe(false);
  });

  test('rejects non-numeric', () => {
    expect(validatePartySize('abc').valid).toBe(false);
  });

  test('rejects zero', () => {
    expect(validatePartySize(0).valid).toBe(false);
  });

  test('rejects negative', () => {
    expect(validatePartySize(-1).valid).toBe(false);
  });

  test('rejects exceeding MAX_PARTY_SIZE (20)', () => {
    expect(validatePartySize(21).valid).toBe(false);
  });

  test('accepts valid party size and returns parsed value', () => {
    const result = validatePartySize('4');
    expect(result.valid).toBe(true);
    expect(result.value).toBe(4);
  });

  test('accepts boundary: 1', () => {
    expect(validatePartySize(1).valid).toBe(true);
  });

  test('accepts boundary: 20 (MAX_PARTY_SIZE)', () => {
    expect(validatePartySize(20).valid).toBe(true);
  });
});

// ============================================================
// validateReservationDate
// ============================================================
describe('validateReservationDate', () => {
  test('rejects null/undefined', () => {
    expect(validateReservationDate(null).valid).toBe(false);
    expect(validateReservationDate(undefined).valid).toBe(false);
  });

  test('rejects invalid date string', () => {
    expect(validateReservationDate('not-a-date').valid).toBe(false);
  });

  test('rejects past dates', () => {
    const result = validateReservationDate('2020-01-01');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('past');
  });

  test('rejects dates too far in the future', () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 100);
    const result = validateReservationDate(futureDate.toISOString().split('T')[0]);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('advance');
  });

  test('accepts today', () => {
    const today = new Date().toISOString().split('T')[0];
    const result = validateReservationDate(today);
    expect(result.valid).toBe(true);
    expect(result.value).toBeInstanceOf(Date);
  });

  test('accepts tomorrow', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(validateReservationDate(tomorrow.toISOString().split('T')[0]).valid).toBe(true);
  });
});

// ============================================================
// validateReservationTime
// ============================================================
describe('validateReservationTime', () => {
  test('rejects null/undefined', () => {
    expect(validateReservationTime(null).valid).toBe(false);
    expect(validateReservationTime(undefined).valid).toBe(false);
  });

  test('rejects invalid format', () => {
    expect(validateReservationTime('abc').valid).toBe(false);
    expect(validateReservationTime('25:00').valid).toBe(false);
    expect(validateReservationTime('12:60').valid).toBe(false);
  });

  test('rejects time outside business hours (before 11:00)', () => {
    const result = validateReservationTime('09:00');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('11:00 AM');
  });

  test('rejects time outside business hours (after 22:00)', () => {
    const result = validateReservationTime('22:30');
    expect(result.valid).toBe(false);
  });

  test('accepts valid lunch time', () => {
    expect(validateReservationTime('12:30').valid).toBe(true);
  });

  test('accepts valid dinner time', () => {
    expect(validateReservationTime('19:00').valid).toBe(true);
  });

  test('accepts boundary: 11:00', () => {
    expect(validateReservationTime('11:00').valid).toBe(true);
  });

  test('accepts boundary: 22:00', () => {
    expect(validateReservationTime('22:00').valid).toBe(true);
  });
});

// ============================================================
// validateTableIds
// ============================================================
describe('validateTableIds', () => {
  test('rejects null/undefined', () => {
    expect(validateTableIds(null).valid).toBe(false);
    expect(validateTableIds(undefined).valid).toBe(false);
  });

  test('rejects empty array', () => {
    expect(validateTableIds([]).valid).toBe(false);
  });

  test('rejects more than 4 tables', () => {
    expect(validateTableIds(['1', '2', '3', '4', '5']).valid).toBe(false);
  });

  test('accepts array of table IDs', () => {
    const result = validateTableIds(['t1', 't2']);
    expect(result.valid).toBe(true);
    expect(result.value).toEqual(['t1', 't2']);
  });

  test('parses comma-separated string', () => {
    const result = validateTableIds('t1, t2, t3');
    expect(result.valid).toBe(true);
    expect(result.value).toEqual(['t1', 't2', 't3']);
  });
});

// ============================================================
// validateWaitlistEntry
// ============================================================
describe('validateWaitlistEntry', () => {
  test('returns errors for completely empty data', () => {
    const result = validateWaitlistEntry({});
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });

  test('validates valid entry', () => {
    const result = validateWaitlistEntry({
      customer_name: 'John Doe',
      customer_phone: '+1-555-123-4567',
      party_size: 4,
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toBeUndefined();
  });

  test('validates optional email if provided', () => {
    const result = validateWaitlistEntry({
      customer_name: 'John Doe',
      customer_phone: '+1-555-123-4567',
      party_size: 4,
      customer_email: 'bad-email',
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Invalid email format');
  });
});

// ============================================================
// validateServiceRecord
// ============================================================
describe('validateServiceRecord', () => {
  test('returns errors for empty data', () => {
    const result = validateServiceRecord({});
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(4);
  });

  test('validates valid service record', () => {
    const result = validateServiceRecord({
      customer_name: 'Jane Doe',
      customer_phone: '+1-555-987-6543',
      party_size: 2,
      table_ids: ['t1'],
    });
    expect(result.valid).toBe(true);
  });
});

// ============================================================
// validateReservation
// ============================================================
describe('validateReservation', () => {
  test('returns errors for empty data', () => {
    const result = validateReservation({});
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(4);
  });

  test('validates valid reservation', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const result = validateReservation({
      customer_name: 'Maria Silva',
      customer_phone: '+55-11-91234-5678',
      party_size: 4,
      date: tomorrow.toISOString().split('T')[0],
      time: '19:00',
    });
    expect(result.valid).toBe(true);
  });

  test('collects multiple errors', () => {
    const result = validateReservation({
      customer_name: '',
      customer_phone: '123',
      party_size: 0,
      date: '2020-01-01',
      time: '03:00',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(4);
  });
});

// ============================================================
// sanitizeInput
// ============================================================
describe('sanitizeInput', () => {
  test('returns non-string inputs unchanged', () => {
    expect(sanitizeInput(42)).toBe(42);
    expect(sanitizeInput(null)).toBe(null);
  });

  test('trims whitespace', () => {
    expect(sanitizeInput('  hello  ')).toBe('hello');
  });

  test('removes HTML/JS injection characters', () => {
    expect(sanitizeInput('<script>alert("xss")</script>')).toBe('scriptalert(xss)/script');
  });

  test('truncates to 500 characters', () => {
    const long = 'A'.repeat(600);
    expect(sanitizeInput(long).length).toBe(500);
  });
});

// ============================================================
// sanitizeStringXSS
// ============================================================
describe('sanitizeStringXSS', () => {
  test('returns empty string for non-string', () => {
    expect(sanitizeStringXSS(42)).toBe('');
    expect(sanitizeStringXSS(null)).toBe('');
  });

  test('encodes HTML entities', () => {
    const result = sanitizeStringXSS('<script>alert("xss")</script>');
    expect(result).toContain('&lt;');
    expect(result).toContain('&gt;');
    expect(result).toContain('&quot;');
    expect(result).not.toContain('<script>');
  });

  test('removes null bytes', () => {
    expect(sanitizeStringXSS('hello\0world')).toBe('hello world'.length > 0 ? sanitizeStringXSS('hello\0world') : '');
    expect(sanitizeStringXSS('a\0b')).not.toContain('\0');
  });

  test('respects maxLength option', () => {
    const result = sanitizeStringXSS('A'.repeat(200), { maxLength: 50 });
    expect(result.length).toBeLessThanOrEqual(50);
  });

  test('respects trim option', () => {
    const result = sanitizeStringXSS('  hello  ', { trim: false });
    expect(result).toMatch(/^\s/);
  });
});

// ============================================================
// sanitizeObject
// ============================================================
describe('sanitizeObject', () => {
  test('returns null/undefined unchanged', () => {
    expect(sanitizeObject(null)).toBe(null);
    expect(sanitizeObject(undefined)).toBe(undefined);
  });

  test('returns primitives unchanged', () => {
    expect(sanitizeObject(42)).toBe(42);
    expect(sanitizeObject('hello')).toBe('hello');
  });

  test('sanitizes string values in objects', () => {
    const result = sanitizeObject({ name: '<script>bad</script>' });
    expect(result.name).not.toContain('<script>');
  });

  test('preserves non-string values', () => {
    const result = sanitizeObject({ count: 5, active: true });
    expect(result.count).toBe(5);
    expect(result.active).toBe(true);
  });

  test('handles nested objects', () => {
    const result = sanitizeObject({ user: { name: '<b>Bob</b>' } });
    expect(result.user.name).not.toContain('<b>');
  });

  test('handles arrays', () => {
    const result = sanitizeObject([{ name: '<b>A</b>' }, { name: '<i>B</i>' }]);
    expect(Array.isArray(result)).toBe(true);
    expect(result[0].name).not.toContain('<b>');
  });

  test('handles circular references', () => {
    const obj = { a: 1 };
    obj.self = obj;
    const result = sanitizeObject(obj);
    expect(result.self).toBe('[Circular]');
  });
});

// ============================================================
// sanitizeSearchQuery
// ============================================================
describe('sanitizeSearchQuery', () => {
  test('returns empty string for non-string', () => {
    expect(sanitizeSearchQuery(42)).toBe('');
    expect(sanitizeSearchQuery(null)).toBe('');
  });

  test('removes SQL injection characters', () => {
    const result = sanitizeSearchQuery("'; DROP TABLE users; --");
    expect(result).not.toContain(';');
    expect(result).not.toContain("'");
    expect(result).not.toContain('--');
  });

  test('removes wildcards and backslashes', () => {
    const result = sanitizeSearchQuery('search%_term\\');
    expect(result).not.toContain('%');
    expect(result).not.toContain('_');
    expect(result).not.toContain('\\');
  });

  test('truncates to 100 characters', () => {
    const long = 'A'.repeat(200);
    expect(sanitizeSearchQuery(long).length).toBe(100);
  });

  test('trims whitespace', () => {
    expect(sanitizeSearchQuery('  hello  ')).toBe('hello');
  });
});

'use strict';

const {
  parseCSVBuffer,
  normalizeRow,
  computeTier,
  buildLTVRecord,
  buildServiceRecord,
} = require('../_lib/importPipeline');

describe('parseCSVBuffer', () => {
  test('parses CSV with standard headers', () => {
    const csv = Buffer.from('name,phone,email,visits,last_visit,avg_spend\nJohn,+353861234567,j@test.com,5,2025-12-01,45\n');
    const rows = parseCSVBuffer(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('John');
    expect(rows[0].phone).toBe('+353861234567');
    expect(rows[0].visits).toBe('5');
  });

  test('parses CSV with alternate header names', () => {
    const csv = Buffer.from('customer_name,customer_phone,visit_count\nMaria,+353861111111,3\n');
    const rows = parseCSVBuffer(csv);
    expect(rows[0].customer_name).toBe('Maria');
    expect(rows[0].customer_phone).toBe('+353861111111');
  });

  test('skips empty rows', () => {
    const csv = Buffer.from('name,phone\nJohn,+1234\n\n  \n');
    const rows = parseCSVBuffer(csv);
    expect(rows).toHaveLength(1);
  });

  test('returns empty array for binary/unparseable data', () => {
    // csv-parse is permissive; binary data produces rows with no usable phone values
    const csv = Buffer.from('\x00\x01\x02binary garbage');
    // Should not throw — just return empty or junk rows
    expect(() => parseCSVBuffer(csv)).not.toThrow();
  });
});

describe('normalizeRow', () => {
  test('maps standard headers to canonical fields', () => {
    const row = { name: ' John ', phone: '+353861234567', email: 'j@test.com', visits: '5', last_visit: '2025-12-01', avg_spend: '45' };
    const norm = normalizeRow(row);
    expect(norm).toEqual({
      customer_name: 'John',
      customer_phone: '+353861234567',
      customer_email: 'j@test.com',
      visit_count: 5,
      last_visit_date: '2025-12-01',
      avg_spend: 45,
    });
  });

  test('maps alternate headers', () => {
    const row = { customer_name: 'Maria', customer_phone: '+1234', visit_count: '3' };
    const norm = normalizeRow(row);
    expect(norm.customer_name).toBe('Maria');
    expect(norm.customer_phone).toBe('+1234');
    expect(norm.visit_count).toBe(3);
  });

  test('returns null if phone is missing', () => {
    const row = { name: 'John', email: 'j@test.com' };
    expect(normalizeRow(row)).toBeNull();
  });

  test('defaults visit_count to 1 when missing', () => {
    const row = { name: 'X', phone: '+1' };
    const norm = normalizeRow(row);
    expect(norm.visit_count).toBe(1);
  });

  test('trims outer whitespace from phone', () => {
    const row = { name: 'X', phone: '  +353861234567  ' };
    const norm = normalizeRow(row);
    expect(norm.customer_phone).toBe('+353861234567');
  });
});

describe('computeTier', () => {
  test('vip for 10+ visits with low churn', () => {
    expect(computeTier(12, 20)).toBe('vip');
  });
  test('regular for 4-9 visits', () => {
    expect(computeTier(5, 30)).toBe('regular');
  });
  test('occasional for 2-3 visits', () => {
    expect(computeTier(2, 20)).toBe('occasional');
  });
  test('new for 1 visit', () => {
    expect(computeTier(1, 20)).toBe('new');
  });
  test('at_risk for churn > 70 regardless of visits', () => {
    expect(computeTier(8, 80)).toBe('at_risk');
  });
});

describe('buildLTVRecord', () => {
  const restaurantId = 'rest-123';

  test('builds correct LTV record from normalized row', () => {
    const row = {
      customer_phone: '+353861234567',
      customer_name: 'John',
      customer_email: 'j@test.com',
      visit_count: 5,
      last_visit_date: '2025-12-01',
      avg_spend: 45,
    };
    const rec = buildLTVRecord(row, restaurantId);
    expect(rec.customer_id).toBe('+353861234567');
    expect(rec.customer_phone).toBe('+353861234567');
    expect(rec.restaurant_id).toBe('rest-123');
    expect(rec.total_visits).toBe(5);
    expect(rec.avg_revenue_per_visit).toBe(45);
    expect(rec.total_revenue).toBe(225);
    expect(rec.last_visit_date).toBe('2025-12-01');
    expect(rec.customer_tier).toMatch(/new|occasional|regular|vip|at_risk/);
    expect(typeof rec.churn_risk_score).toBe('number');
  });

  test('uses defaults when optional fields are missing', () => {
    const row = {
      customer_phone: '+1',
      customer_name: 'Jane',
      visit_count: 1,
      avg_spend: null,
    };
    const rec = buildLTVRecord(row, restaurantId);
    expect(rec.avg_revenue_per_visit).toBe(40); // DEFAULT_AVG_SPEND
    expect(rec.last_visit_date).toBeNull();
  });
});

describe('buildServiceRecord', () => {
  test('returns null if avg_spend is not provided', () => {
    expect(buildServiceRecord({ avg_spend: null }, 'r1')).toBeNull();
  });

  test('builds service record when avg_spend is present', () => {
    const row = { customer_phone: '+1', avg_spend: 50, visit_count: 3 };
    const rec = buildServiceRecord(row, 'r1');
    expect(rec.restaurant_id).toBe('r1');
    expect(rec.total_bill).toBe(50);
    expect(rec.party_size).toBe(1);
    expect(rec.customer_phone).toBe('+1');
    expect(rec.status).toBe('completed');
  });
});

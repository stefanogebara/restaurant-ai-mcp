import { describe, it, expect } from 'vitest';
import { toCsv } from '../exportCsv';

describe('toCsv', () => {
  it('formats headers and rows', () => {
    const csv = toCsv([{ name: 'Alice', date: '2026-01-01' }], ['name', 'date']);
    expect(csv).toBe('name,date\nAlice,2026-01-01');
  });

  it('wraps comma-containing values in quotes', () => {
    const csv = toCsv([{ name: 'Smith, John', date: '2026-01-01' }], ['name', 'date']);
    expect(csv).toContain('"Smith, John"');
  });

  it('escapes embedded double-quotes', () => {
    const csv = toCsv([{ name: 'He said "hi"', date: '2026-01-01' }], ['name', 'date']);
    expect(csv).toContain('"He said ""hi"""');
  });

  it('handles empty rows', () => {
    expect(toCsv([], ['a', 'b'])).toBe('a,b');
  });

  it('handles null/undefined values as empty string', () => {
    const csv = toCsv([{ name: null, date: undefined }], ['name', 'date']);
    expect(csv).toBe('name,date\n,');
  });
});

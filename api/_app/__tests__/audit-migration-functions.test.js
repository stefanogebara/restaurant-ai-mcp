'use strict';

// The migration check only proved tables exist. Since 2026-11-14 it also
// compares every SQL function in supabase/migrations with production
// (scripts/lib/migration-functions.js). Measured that day: 19 of 23 functions
// identical byte for byte; 3 differed only in comments or line endings
// (copies applied by hand); 1 (confirm_event_booking) lost two unused
// variables in production and is frozen in migration-functions.divida.json.

const path = require('path');
const {
  maskComments, normalizeSource, fingerprint, extractFunctions, readMigrations, compareFunctions,
} = require('../../../scripts/lib/migration-functions');

const fn = (name, body, extra = '') =>
  `create or replace function ${name}(p int) returns int language plpgsql ${extra} as $$${body}$$;`;

describe('normalizing a function body', () => {
  test('comments are removed, but "--" inside a string is kept', () => {
    expect(maskComments("select '--x' -- note\n/* block */ from t").replace(/\s+/g, ' ').trim())
      .toBe("select '--x' from t");
    expect(maskComments("select 'it''s -- fine'")).toBe("select 'it''s -- fine'");
  });

  test('comments, indentation and Windows line endings do not change the fingerprint', () => {
    const repo = '\nBEGIN\n  -- touch\n  NEW.updated_at = NOW();\n  RETURN NEW;\nEND;\n';
    const production = '\r\n  BEGIN\r\n    NEW.updated_at = NOW();\r\n    RETURN NEW;\r\n  END;\r\n  ';
    expect(normalizeSource(repo)).toBe('BEGIN NEW.updated_at = NOW(); RETURN NEW; END;');
    expect(fingerprint(repo)).toBe(fingerprint(production));
  });

  test('a code change does change it', () => {
    expect(fingerprint('BEGIN RETURN 1; END;')).not.toBe(fingerprint('BEGIN RETURN 2; END;'));
  });
});

describe('extracting functions from migrations', () => {
  test('the latest file wins, a drop removes, the schema defaults to public', () => {
    const map = extractFunctions([
      { file: '20260102_b.sql', sql: fn('public.book', ' select 2 ') + fn('restaurant.touch', ' x ') },
      { file: '20260101_a.sql', sql: fn('book', ' select 1 ') + fn('public.gone', ' y ') },
      { file: '20260103_c.sql', sql: 'drop function if exists public.gone(int);' },
    ]);
    expect(map.get('public.book')).toEqual({ file: '20260102_b.sql', source: ' select 2 ' });
    expect(map.get('restaurant.touch').source).toBe(' x ');
    expect(map.get('public.gone')).toMatchObject({ dropped: true });
  });

  test('named dollar quotes, quoted names and commented-out definitions', () => {
    const map = extractFunctions([{ file: '1.sql', sql:
      '-- create or replace function public.old(p int) as $$ x $$;\n'
      + 'create function "public"."Quoted"(p int) returns int language sql as $body$ select $$inner$$ $body$;' }]);
    expect(map.has('public.old')).toBe(false);
    expect(map.get('public.quoted').source).toBe(' select $$inner$$ ');
  });

  test('every function in the real migrations yields a body', () => {
    const map = extractFunctions(readMigrations(path.join(__dirname, '..', '..', '..', 'supabase', 'migrations')));
    expect(map.size).toBeGreaterThanOrEqual(24);
    const noBody = [...map].filter(([, def]) => !def.dropped && !def.source).map(([key]) => key);
    expect(noBody).toEqual([]);
    expect(map.get('public.audit_function_sources').file).toBe('20261114120000_audit_function_sources.sql');
  });
});

describe('comparing with production', () => {
  const expected = extractFunctions([{ file: '1.sql', sql:
    fn('public.same', ' BEGIN RETURN 1; END; ') + fn('public.changed', ' BEGIN RETURN 2; END; ')
    + fn('public.absent', ' BEGIN RETURN 3; END; ') + fn('public.overloaded', ' BEGIN RETURN 4; END; ')
    + fn('public.frozen', ' BEGIN RETURN 5; END; ') }]);
  const production = [
    { key: 'public.same', source: '\n  -- applied by hand\n  BEGIN RETURN 1; END;' },
    { key: 'public.changed', source: 'BEGIN RETURN 99; END;' },
    { key: 'public.overloaded', source: 'BEGIN RETURN 0; END;' },
    { key: 'public.overloaded', source: 'BEGIN RETURN 4; END;' },
    { key: 'public.frozen', source: 'BEGIN RETURN 50; END;' },
  ];

  test('same, missing, differs, overloads and a frozen difference', () => {
    const known = { 'public.frozen': {
      repo: fingerprint(' BEGIN RETURN 5; END; '), producao: fingerprint('BEGIN RETURN 50; END;'), motivo: 'test' } };
    const result = compareFunctions(expected, production, known);
    expect(result.ok.sort()).toEqual(['public.overloaded', 'public.same']);
    expect(result.known).toEqual(['public.frozen']);
    expect(result.missing).toEqual([{ key: 'public.absent', file: '1.sql' }]);
    expect(result.differs.map(d => d.key)).toEqual(['public.changed']);
    expect(result.staleKnown).toEqual([]);
  });

  test('a frozen entry fails again when either side changes, and is reported as stale', () => {
    const known = { 'public.frozen': { repo: fingerprint(' BEGIN RETURN 5; END; '), producao: 'other', motivo: 'test' } };
    const result = compareFunctions(expected, production, known);
    expect(result.differs.map(d => d.key)).toContain('public.frozen');
    expect(result.staleKnown).toEqual(['public.frozen']);
  });
});

test('the frozen list names real functions and still matches the repository text', () => {
  const known = require('../../../scripts/migration-functions.divida.json');
  const map = extractFunctions(readMigrations(path.join(__dirname, '..', '..', '..', 'supabase', 'migrations')));
  for (const [key, entry] of Object.entries(known)) {
    expect(map.has(key)).toBe(true);
    expect(fingerprint(map.get(key).source)).toBe(entry.repo);
    expect(entry.motivo.length).toBeGreaterThan(20);
  }
});

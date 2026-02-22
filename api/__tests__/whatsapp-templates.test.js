/**
 * WhatsApp Templates Tests
 *
 * Tests message template rendering, language fallback, and variable interpolation.
 */

// Mock secure-logger before requiring module
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

const { getTemplate, getTemplateNames, hasTemplate, TEMPLATES } = require('../_lib/whatsapp-templates');

const TEST_VARS = {
  name: 'João',
  restaurant: 'Boteco do Samba',
  date: '2026-03-15',
  time: '19:00',
  partySize: 4,
  reservationId: 'RES-20260315-ABC123',
  estimatedWait: 20,
};

describe('getTemplate - English (en)', () => {
  test('reservation_confirmed returns English message', () => {
    const msg = getTemplate('reservation_confirmed', 'en', TEST_VARS);
    expect(msg).toContain('Hi João');
    expect(msg).toContain('Boteco do Samba');
    expect(msg).toContain('confirmed');
    expect(msg).toContain('2026-03-15');
    expect(msg).toContain('19:00');
    expect(msg).toContain('4');
    expect(msg).toContain('RES-20260315-ABC123');
  });

  test('reservation_modified returns English message', () => {
    const msg = getTemplate('reservation_modified', 'en', TEST_VARS);
    expect(msg).toContain('updated');
    expect(msg).toContain('João');
  });

  test('reservation_cancelled returns English message', () => {
    const msg = getTemplate('reservation_cancelled', 'en', TEST_VARS);
    expect(msg).toContain('cancelled');
    expect(msg).toContain('BOOK');
  });

  test('reservation_reminder returns English message', () => {
    const msg = getTemplate('reservation_reminder', 'en', TEST_VARS);
    expect(msg).toContain('reminder');
    expect(msg).toContain('CANCEL');
  });

  test('welcome returns English message', () => {
    const msg = getTemplate('welcome', 'en', TEST_VARS);
    expect(msg).toContain('Welcome');
    expect(msg).toContain('Boteco do Samba');
    expect(msg).toContain('Book a table');
  });

  test('waitlist_added returns English message', () => {
    const msg = getTemplate('waitlist_added', 'en', TEST_VARS);
    expect(msg).toContain('waitlist');
    expect(msg).toContain('20 minutes');
  });

  test('table_ready returns English message', () => {
    const msg = getTemplate('table_ready', 'en', TEST_VARS);
    expect(msg).toContain('ready');
    expect(msg).toContain('10 minutes');
  });
});

describe('getTemplate - Portuguese (pt-BR normalization)', () => {
  test('pt-BR normalizes to pt and returns Portuguese', () => {
    const msg = getTemplate('reservation_confirmed', 'pt-BR', TEST_VARS);
    expect(msg).toContain('Oi João');
    expect(msg).toContain('confirmada');
    expect(msg).toContain('Horário');
  });

  test('pt returns Portuguese directly', () => {
    const msg = getTemplate('reservation_confirmed', 'pt', TEST_VARS);
    expect(msg).toContain('Oi João');
    expect(msg).toContain('confirmada');
  });

  test('pt-PT normalizes to pt', () => {
    const msg = getTemplate('welcome', 'pt-PT', TEST_VARS);
    expect(msg).toContain('Bem-vindo');
    expect(msg).toContain('Boteco do Samba');
  });

  test('reservation_cancelled in Portuguese', () => {
    const msg = getTemplate('reservation_cancelled', 'pt-BR', TEST_VARS);
    expect(msg).toContain('cancelada');
    expect(msg).toContain('RESERVAR');
  });

  test('waitlist_added in Portuguese', () => {
    const msg = getTemplate('waitlist_added', 'pt', TEST_VARS);
    expect(msg).toContain('lista de espera');
    expect(msg).toContain('20 minutos');
  });

  test('table_ready in Portuguese', () => {
    const msg = getTemplate('table_ready', 'pt', TEST_VARS);
    expect(msg).toContain('pronta');
    expect(msg).toContain('10 minutos');
  });
});

describe('getTemplate - Spanish (es)', () => {
  test('reservation_confirmed in Spanish', () => {
    const msg = getTemplate('reservation_confirmed', 'es', TEST_VARS);
    expect(msg).toContain('Hola João');
    expect(msg).toContain('confirmada');
    expect(msg).toContain('Hora');
  });

  test('welcome in Spanish', () => {
    const msg = getTemplate('welcome', 'es', TEST_VARS);
    expect(msg).toContain('Bienvenido');
    expect(msg).toContain('Boteco do Samba');
  });

  test('reservation_reminder in Spanish', () => {
    const msg = getTemplate('reservation_reminder', 'es', TEST_VARS);
    expect(msg).toContain('recordamos');
    expect(msg).toContain('CANCELAR');
  });
});

describe('getTemplate - unknown locale falls back to English', () => {
  test('unknown locale ja falls back to English', () => {
    const msg = getTemplate('reservation_confirmed', 'ja', TEST_VARS);
    expect(msg).toContain('Hi João');
    expect(msg).toContain('confirmed');
  });

  test('unknown locale zh falls back to English', () => {
    const msg = getTemplate('welcome', 'zh', TEST_VARS);
    expect(msg).toContain('Welcome');
  });

  test('empty locale defaults to English', () => {
    const msg = getTemplate('reservation_confirmed', '', TEST_VARS);
    // Empty string falls through to en fallback
    expect(msg).toContain('confirmed');
  });

  test('undefined locale defaults to English', () => {
    const msg = getTemplate('reservation_confirmed', undefined, TEST_VARS);
    expect(msg).toContain('confirmed');
  });
});

describe('getTemplate - template interpolation with variables', () => {
  test('interpolates all variables in reservation_confirmed', () => {
    const vars = {
      name: 'Maria',
      restaurant: 'Casa Bonita',
      date: '2026-04-01',
      time: '20:30',
      partySize: 6,
      reservationId: 'RES-CUSTOM-001',
    };
    const msg = getTemplate('reservation_confirmed', 'en', vars);
    expect(msg).toContain('Maria');
    expect(msg).toContain('Casa Bonita');
    expect(msg).toContain('2026-04-01');
    expect(msg).toContain('20:30');
    expect(msg).toContain('6');
    expect(msg).toContain('RES-CUSTOM-001');
  });

  test('handles missing variables gracefully (undefined)', () => {
    const msg = getTemplate('reservation_confirmed', 'en', {});
    expect(msg).toContain('undefined');
    // Template still renders, just with undefined placeholders
    expect(msg).toBeTruthy();
  });
});

describe('getTemplate - edge cases', () => {
  test('returns null for non-existent template', () => {
    const msg = getTemplate('nonexistent_template', 'en', TEST_VARS);
    expect(msg).toBeNull();
  });
});

describe('getTemplateNames', () => {
  test('returns array of all 8 template names', () => {
    const names = getTemplateNames();
    expect(names).toHaveLength(8);
    expect(names).toContain('reservation_confirmed');
    expect(names).toContain('reservation_modified');
    expect(names).toContain('reservation_cancelled');
    expect(names).toContain('reservation_reminder');
    expect(names).toContain('welcome');
    expect(names).toContain('waitlist_added');
    expect(names).toContain('table_ready');
    expect(names).toContain('new_booking_alert');
  });
});

describe('hasTemplate', () => {
  test('returns true for existing templates', () => {
    expect(hasTemplate('reservation_confirmed')).toBe(true);
    expect(hasTemplate('welcome')).toBe(true);
    expect(hasTemplate('table_ready')).toBe(true);
  });

  test('returns false for non-existent template', () => {
    expect(hasTemplate('nonexistent')).toBe(false);
  });
});

describe('TEMPLATES structure', () => {
  test('all templates have en, es, and pt variants', () => {
    const names = Object.keys(TEMPLATES);
    for (const name of names) {
      expect(TEMPLATES[name].en).toBeDefined();
      expect(TEMPLATES[name].es).toBeDefined();
      expect(TEMPLATES[name].pt).toBeDefined();
      expect(typeof TEMPLATES[name].en).toBe('function');
      expect(typeof TEMPLATES[name].es).toBe('function');
      expect(typeof TEMPLATES[name].pt).toBe('function');
    }
  });
});

// ---------------------------------------------------------------------------
// Missing Spanish (es) variants – cover lines 55-62, 75, 140, 158
// ---------------------------------------------------------------------------
describe('getTemplate - Spanish missing variants', () => {
  test('reservation_modified in Spanish (line 55)', () => {
    const msg = getTemplate('reservation_modified', 'es', TEST_VARS);
    expect(msg).toContain('Hola João');
    expect(msg).toContain('actualizada');
    expect(msg).toContain('CANCELAR');
    expect(msg).toContain('RES-20260315-ABC123');
  });

  test('reservation_cancelled in Spanish (line 75)', () => {
    const msg = getTemplate('reservation_cancelled', 'es', TEST_VARS);
    expect(msg).toContain('Hola João');
    expect(msg).toContain('cancelada');
    expect(msg).toContain('RESERVAR');
    expect(msg).toContain('Boteco do Samba');
  });

  test('waitlist_added in Spanish (line 140)', () => {
    const msg = getTemplate('waitlist_added', 'es', TEST_VARS);
    expect(msg).toContain('Hola João');
    expect(msg).toContain('lista de espera');
    expect(msg).toContain('20 minutos');
    expect(msg).toContain('Boteco do Samba');
  });

  test('table_ready in Spanish (line 158)', () => {
    const msg = getTemplate('table_ready', 'es', TEST_VARS);
    expect(msg).toContain('Hola João');
    expect(msg).toContain('lista');
    expect(msg).toContain('10 minutos');
    expect(msg).toContain('Boteco do Samba');
  });
});

// ---------------------------------------------------------------------------
// Missing Portuguese (pt) variants – cover lines 61-66, 99
// ---------------------------------------------------------------------------
describe('getTemplate - Portuguese missing variants', () => {
  test('reservation_modified in Portuguese (lines 61-66)', () => {
    const msg = getTemplate('reservation_modified', 'pt', TEST_VARS);
    expect(msg).toContain('Oi João');
    expect(msg).toContain('atualizada');
    expect(msg).toContain('CANCELAR');
    expect(msg).toContain('RES-20260315-ABC123');
  });

  test('reservation_reminder in Portuguese (line 99)', () => {
    const msg = getTemplate('reservation_reminder', 'pt', TEST_VARS);
    expect(msg).toContain('Oi João');
    expect(msg).toContain('lembrando');
    expect(msg).toContain('CANCELAR');
    expect(msg).toContain('Boteco do Samba');
  });
});

// ---------------------------------------------------------------------------
// Edge cases in getTemplate (lines 189-198)
// ---------------------------------------------------------------------------
describe('getTemplate - error edge cases', () => {
  test('returns null and warns when language not found and no en fallback (lines 190-191)', () => {
    // Inject a test template that only has 'de', no 'en' or 'fr'
    TEMPLATES['__test_no_en__'] = { de: (vars) => `Hallo ${vars.name}` };
    try {
      const result = getTemplate('__test_no_en__', 'fr', TEST_VARS);
      expect(result).toBeNull();
    } finally {
      delete TEMPLATES['__test_no_en__'];
    }
  });

  test('returns null and logs error when template function throws (lines 197-198)', () => {
    // Inject a test template whose render function throws
    TEMPLATES['__test_throws__'] = {
      en: () => { throw new Error('Template render failed'); },
    };
    try {
      const result = getTemplate('__test_throws__', 'en', TEST_VARS);
      expect(result).toBeNull();
    } finally {
      delete TEMPLATES['__test_throws__'];
    }
  });
});

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { detectCurrency, formatPrice, currencyFromLanguage, formatPriceLocale } from '../currency';

describe('detectCurrency', () => {
  const originalNavigator = globalThis.navigator;
  const originalIntl = globalThis.Intl;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    // Restore originals
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'Intl', {
      value: originalIntl,
      writable: true,
      configurable: true,
    });
  });

  test('returns BRL for pt-BR language', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { languages: ['pt-BR'], language: 'pt-BR' },
      writable: true,
      configurable: true,
    });
    expect(detectCurrency()).toBe('BRL');
  });

  test('returns BRL for pt language', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { languages: ['pt'], language: 'pt' },
      writable: true,
      configurable: true,
    });
    expect(detectCurrency()).toBe('BRL');
  });

  test('returns USD for en language', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { languages: ['en-US'], language: 'en-US' },
      writable: true,
      configurable: true,
    });
    // Also mock Intl to return a non-Brazil timezone
    Object.defineProperty(globalThis, 'Intl', {
      value: {
        DateTimeFormat: () => ({
          resolvedOptions: () => ({ timeZone: 'Europe/London' }),
        }),
      },
      writable: true,
      configurable: true,
    });
    expect(detectCurrency()).toBe('USD');
  });

  test('returns EUR for es language', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { languages: ['es'], language: 'es' },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'Intl', {
      value: {
        DateTimeFormat: () => ({
          resolvedOptions: () => ({ timeZone: 'Europe/Madrid' }),
        }),
      },
      writable: true,
      configurable: true,
    });
    expect(detectCurrency()).toBe('EUR');
  });

  test('returns EUR for es-ES language', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { languages: ['es-ES'], language: 'es-ES' },
      writable: true,
      configurable: true,
    });
    expect(detectCurrency()).toBe('EUR');
  });

  test('returns USD for fr language', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { languages: ['fr'], language: 'fr' },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'Intl', {
      value: {
        DateTimeFormat: () => ({
          resolvedOptions: () => ({ timeZone: 'Europe/Paris' }),
        }),
      },
      writable: true,
      configurable: true,
    });
    expect(detectCurrency()).toBe('USD');
  });

  test('returns USD for de language', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { languages: ['de'], language: 'de' },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'Intl', {
      value: {
        DateTimeFormat: () => ({
          resolvedOptions: () => ({ timeZone: 'Europe/Berlin' }),
        }),
      },
      writable: true,
      configurable: true,
    });
    expect(detectCurrency()).toBe('USD');
  });

  test('returns BRL for Brazil timezone (America/Sao_Paulo)', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { languages: ['en'], language: 'en' },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'Intl', {
      value: {
        DateTimeFormat: () => ({
          resolvedOptions: () => ({ timeZone: 'America/Sao_Paulo' }),
        }),
      },
      writable: true,
      configurable: true,
    });
    expect(detectCurrency()).toBe('BRL');
  });

  test('returns BRL for Brazil timezone (America/Fortaleza)', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { languages: ['en'], language: 'en' },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'Intl', {
      value: {
        DateTimeFormat: () => ({
          resolvedOptions: () => ({ timeZone: 'America/Fortaleza' }),
        }),
      },
      writable: true,
      configurable: true,
    });
    expect(detectCurrency()).toBe('BRL');
  });

  test('returns BRL for Brazil timezone (America/Manaus)', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { languages: ['en'], language: 'en' },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'Intl', {
      value: {
        DateTimeFormat: () => ({
          resolvedOptions: () => ({ timeZone: 'America/Manaus' }),
        }),
      },
      writable: true,
      configurable: true,
    });
    expect(detectCurrency()).toBe('BRL');
  });

  test('returns EUR for Spain timezone (Europe/Madrid)', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { languages: ['en'], language: 'en' },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'Intl', {
      value: {
        DateTimeFormat: () => ({
          resolvedOptions: () => ({ timeZone: 'Europe/Madrid' }),
        }),
      },
      writable: true,
      configurable: true,
    });
    expect(detectCurrency()).toBe('EUR');
  });

  test('returns USD when detection throws', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        get languages() {
          throw new Error('navigator not available');
        },
        get language() {
          throw new Error('navigator not available');
        },
      },
      writable: true,
      configurable: true,
    });
    expect(detectCurrency()).toBe('USD');
  });

  test('returns BRL when pt-br is in secondary language', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { languages: ['en', 'pt-br'], language: 'en' },
      writable: true,
      configurable: true,
    });
    expect(detectCurrency()).toBe('BRL');
  });
});

describe('currencyFromLanguage', () => {
  test('returns BRL for pt-BR', () => {
    expect(currencyFromLanguage('pt-BR')).toBe('BRL');
  });

  test('returns BRL for pt', () => {
    expect(currencyFromLanguage('pt')).toBe('BRL');
  });

  test('returns EUR for es', () => {
    expect(currencyFromLanguage('es')).toBe('EUR');
  });

  test('returns EUR for es-ES', () => {
    expect(currencyFromLanguage('es-ES')).toBe('EUR');
  });

  test('returns USD for en', () => {
    expect(currencyFromLanguage('en')).toBe('USD');
  });

  test('returns USD for unknown language', () => {
    expect(currencyFromLanguage('ja')).toBe('USD');
  });
});

describe('formatPrice', () => {
  test('returns R$ prefix for BRL', () => {
    expect(formatPrice(149, 'BRL')).toBe('R$149');
  });

  test('returns $ symbol for USD', () => {
    expect(formatPrice(29, 'USD')).toBe('$29');
  });

  test('returns EUR symbol for EUR', () => {
    expect(formatPrice(89, 'EUR')).toBe('€89');
  });

  test('formats zero price for BRL', () => {
    expect(formatPrice(0, 'BRL')).toBe('R$0');
  });

  test('formats larger amounts for USD', () => {
    expect(formatPrice(199, 'USD')).toBe('$199');
  });
});

describe('formatPriceLocale', () => {
  test('formats BRL with dot separator', () => {
    expect(formatPriceLocale(1497, 'BRL')).toBe('R$1.497');
  });

  test('formats USD with comma separator', () => {
    expect(formatPriceLocale(1497, 'USD')).toBe('$1,497');
  });

  test('formats EUR correctly', () => {
    expect(formatPriceLocale(269, 'EUR')).toBe('€269');
  });

  test('formats small amounts without separator', () => {
    expect(formatPriceLocale(97, 'USD')).toBe('$97');
  });
});

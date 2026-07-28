import { describe, it, expect } from 'vitest';
import { applyScrapedData, estimarPerfilPeloPorte, type ScrapedRestaurant } from '../applyScrapedData';

describe('estimarPerfilPeloPorte — o passo de mesas chega proposto, não em branco', () => {
  // Plano zero-toque: quem converte do demo nunca respondeu o questionário de
  // perfil, então o Passo 3 abria um salão em branco. A estimativa infere
  // porte pelas avaliações e ajusta lugares pela faixa de preço; a semeadura
  // de mesas do Passo 3 (que já existia) faz o resto.

  it('caso de calibração real: Mocotó (18k avaliações, moderate) → large, 90 lugares', () => {
    expect(estimarPerfilPeloPorte({ review_count: 18036, price_level: 'PRICE_LEVEL_MODERATE' }))
      .toEqual({ size: 'large', seat_count: 90 });
  });

  it('pouca avaliação → small; faixa intermediária → medium', () => {
    expect(estimarPerfilPeloPorte({ review_count: 120 })?.size).toBe('small');
    expect(estimarPerfilPeloPorte({ review_count: 2000 })?.size).toBe('medium');
  });

  it('caro espaça o salão (menos lugares); barato aperta (mais lugares)', () => {
    const caro = estimarPerfilPeloPorte({ review_count: 2000, price_level: 'PRICE_LEVEL_EXPENSIVE' });
    const barato = estimarPerfilPeloPorte({ review_count: 2000, price_level: 'PRICE_LEVEL_INEXPENSIVE' });
    const medio = estimarPerfilPeloPorte({ review_count: 2000 });
    expect(caro!.seat_count).toBeLessThan(medio!.seat_count);
    expect(barato!.seat_count).toBeGreaterThan(medio!.seat_count);
  });

  it('lugares sempre em múltiplo de 5 — "72 lugares" leria como medição falsa', () => {
    for (const rc of [600, 5001, 499]) {
      const e = estimarPerfilPeloPorte({ review_count: rc, price_level: 'PRICE_LEVEL_EXPENSIVE' });
      expect(e!.seat_count % 5).toBe(0);
    }
  });

  it('sem avaliações não estima nada — proposta sem base vira chute', () => {
    expect(estimarPerfilPeloPorte({ review_count: 0 })).toBeNull();
    expect(estimarPerfilPeloPorte({})).toBeNull();
    expect(estimarPerfilPeloPorte(null)).toBeNull();
  });

  it('nível de preço legado numérico (0–4) também funciona', () => {
    expect(estimarPerfilPeloPorte({ review_count: 2000, price_level: 3 })!.seat_count).toBe(50);
  });
});

describe('applyScrapedData', () => {
  it('returns empty object for null/undefined input', () => {
    expect(applyScrapedData(null)).toEqual({});
    expect(applyScrapedData(undefined)).toEqual({});
  });

  it('only sets keys that were actually populated by the scraper', () => {
    const result = applyScrapedData({
      name: 'Cantina Bella',
      // cuisine_type, phone, website, business_hours all absent
    });
    expect(result).toEqual({ restaurant_name: 'Cantina Bella' });
  });

  it('maps all scalar fields when present', () => {
    const scraped: ScrapedRestaurant = {
      name: 'Pizzeria Roma',
      cuisine_type: 'Italian',
      phone: '+34 91 555 1234',
      website: 'https://roma.example',
    };
    expect(applyScrapedData(scraped)).toEqual({
      restaurant_name: 'Pizzeria Roma',
      restaurant_type: 'Italian',
      phone_number: '+34 91 555 1234',
      website: 'https://roma.example',
    });
  });

  it('converts keyed-object business_hours to ordered array with capitalised day names', () => {
    const scraped: ScrapedRestaurant = {
      name: 'X',
      business_hours: {
        monday:    { open_time: '12:00', close_time: '23:00', is_open: true  },
        tuesday:   { open_time: '12:00', close_time: '23:00', is_open: true  },
        wednesday: { open_time: null,    close_time: null,    is_open: false },
        thursday:  { open_time: '12:00', close_time: '23:00', is_open: true  },
        friday:    { open_time: '12:00', close_time: '23:30', is_open: true  },
        saturday:  { open_time: '13:00', close_time: '23:30', is_open: true  },
        sunday:    { open_time: '13:00', close_time: '17:00', is_open: true  },
      },
    };
    const result = applyScrapedData(scraped);
    expect(result.business_hours).toHaveLength(7);
    expect(result.business_hours?.[0]).toEqual({ day: 'Monday', is_open: true, open_time: '12:00', close_time: '23:00' });
    // Wednesday closed in scrape → is_open false, default times so the form
    // still has valid strings to render.
    expect(result.business_hours?.[2]).toEqual({ day: 'Wednesday', is_open: false, open_time: '12:00', close_time: '23:00' });
    expect(result.business_hours?.[6]).toEqual({ day: 'Sunday', is_open: true, open_time: '13:00', close_time: '17:00' });
  });

  it('tolerates capitalised day keys from older callers', () => {
    const scraped = {
      name: 'X',
      business_hours: {
        Monday: { open_time: '09:00', close_time: '18:00', is_open: true },
      } as Record<string, { open_time: string; close_time: string; is_open: boolean }>,
    };
    const result = applyScrapedData(scraped);
    expect(result.business_hours?.[0]).toMatchObject({ day: 'Monday', open_time: '09:00', close_time: '18:00', is_open: true });
  });

  it('emits all 7 days even if scraper only returned a partial week', () => {
    const result = applyScrapedData({
      business_hours: {
        friday: { open_time: '18:00', close_time: '23:30', is_open: true },
      },
    });
    expect(result.business_hours).toHaveLength(7);
    // Missing days should be closed with default placeholders
    expect(result.business_hours?.[0]).toMatchObject({ day: 'Monday', is_open: false });
    expect(result.business_hours?.[4]).toMatchObject({ day: 'Friday', is_open: true, open_time: '18:00' });
  });

  it('marks a day closed when is_open=true but times are null (Google has it open but with no period)', () => {
    const result = applyScrapedData({
      business_hours: {
        monday: { open_time: null, close_time: null, is_open: true },
      },
    });
    expect(result.business_hours?.[0]).toMatchObject({ day: 'Monday', is_open: false });
  });
});

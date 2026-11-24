'use strict';

const { getCurrentDateTime, executeTool } = require('../_services/whatsapp/reservation-tools');

describe('WhatsApp restaurant-local clock', () => {
  const instant = new Date('2026-10-16T00:30:00.000Z');

  test('same instant resolves to different local dates without server TZ leakage', () => {
    const madrid = getCurrentDateTime('es', 'Europe/Madrid', instant);
    const saoPaulo = getCurrentDateTime('pt-BR', 'America/Sao_Paulo', instant);

    expect(madrid).toMatchObject({
      date: '2026-10-16', time: '02:30', dayOfWeek: 'viernes', timezone: 'Europe/Madrid',
    });
    expect(saoPaulo).toMatchObject({
      date: '2026-10-15', time: '21:30', dayOfWeek: 'quinta-feira', timezone: 'America/Sao_Paulo',
    });
    expect(madrid.formatted).toContain('2:30');
    expect(saoPaulo.formatted).toContain('21:30');
  });

  test('handles midnight and daylight-saving transitions with one instant', () => {
    expect(getCurrentDateTime('en', 'Europe/Madrid', new Date('2026-10-25T00:30:00Z')))
      .toMatchObject({ date: '2026-10-25', time: '02:30' });
    expect(getCurrentDateTime('en', 'Europe/Madrid', new Date('2026-10-25T01:30:00Z')))
      .toMatchObject({ date: '2026-10-25', time: '02:30' });
    expect(getCurrentDateTime('pt', 'America/Sao_Paulo', new Date('2026-10-16T03:00:00Z')))
      .toMatchObject({ date: '2026-10-16', time: '00:00' });
  });

  test('tool fails closed without a timezone instead of inventing a local date', async () => {
    expect(await executeTool('get_current_datetime', {}, { restaurant: { id: 'restaurant-a' } }))
      .toEqual({ success: false, error: 'Restaurant timezone unavailable' });
    expect(await executeTool('get_current_datetime', {}, { restaurant: { id: 'restaurant-a' } }, {
      timezone: 'not-a-timezone',
    })).toEqual({ success: false, error: 'Restaurant timezone unavailable' });
  });

  test('tool uses the configured timezone passed from the fetched restaurant', async () => {
    const result = await executeTool('get_current_datetime', {}, { restaurant: { id: 'restaurant-a' } }, {
      timezone: 'Europe/Madrid', language: 'es',
    });
    expect(result.timezone).toBe('Europe/Madrid');
    expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.time).toMatch(/^\d{2}:\d{2}$/);
  });
});

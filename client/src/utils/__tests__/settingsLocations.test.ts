import { describe, expect, it } from 'vitest';
import { currentTimezoneLabel, localizedCountryName } from '../settingsLocations';

describe('settings locations', () => {
  it('shows the offset currently in force, including daylight-saving changes', () => {
    expect(currentTimezoneLabel('Europe/Madrid', 'Madrid', 'now', new Date('2026-01-12T12:00:00Z')))
      .toBe('Madrid (GMT+1 now)');
    expect(currentTimezoneLabel('Europe/Madrid', 'Madrid', 'now', new Date('2026-07-12T12:00:00Z')))
      .toBe('Madrid (GMT+2 now)');
  });

  it('does not invent an offset for an invalid legacy timezone', () => {
    expect(currentTimezoneLabel('Invalid/Legacy', 'Legacy', 'now')).toBe('Legacy');
  });

  it('localizes ISO country labels but preserves unknown legacy values', () => {
    expect(localizedCountryName('BR', 'Brasil', 'en')).toBe('Brazil');
    expect(localizedCountryName('BR', 'Brasil', 'pt-BR')).toBe('Brasil');
    expect(localizedCountryName('BRAZIL', 'Brazil', 'en')).toBe('Brazil');
  });
});

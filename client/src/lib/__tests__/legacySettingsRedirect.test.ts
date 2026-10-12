import { describe, expect, it } from 'vitest';
import { legacyVoiceSettingsRedirect } from '../legacySettingsRedirect';

describe('legacy voice settings links', () => {
  it('sends the old WhatsApp tab to the restaurant-specific page', () => {
    expect(legacyVoiceSettingsRedirect('#voice-settings:whatsapp', '')).toBe('/host-dashboard/whatsapp');
  });

  it.each([
    ['#voice-settings:widget', '', '/host-dashboard/integrations#integrations:booking'],
    ['#voice-settings:instagram', '', '/host-dashboard/integrations#integrations:instagram'],
    ['#voice-settings:pos', '', '/host-dashboard/integrations#integrations:pos'],
    ['#tab=pos', '', '/host-dashboard/integrations#integrations:pos'],
    ['#tab=instagram', '?instagram_connect=ok', '/host-dashboard/integrations?instagram_connect=ok#integrations:instagram'],
    ['', '?stripe_connect=refresh', '/host-dashboard/integrations?stripe_connect=refresh#integrations:pos'],
    ['', '?pos_error=denied', '/host-dashboard/integrations?pos_error=denied#integrations:pos'],
  ])('preserves %s %s as %s', (hash, search, destination) => {
    expect(legacyVoiceSettingsRedirect(hash, search)).toBe(destination);
  });

  it('does not redirect ordinary voice and phone settings', () => {
    expect(legacyVoiceSettingsRedirect('', '')).toBeNull();
    expect(legacyVoiceSettingsRedirect('#voice-settings:voice', '')).toBeNull();
    expect(legacyVoiceSettingsRedirect('#voice-settings:phone', '')).toBeNull();
  });

  it('does not forward unrelated query parameters', () => {
    expect(legacyVoiceSettingsRedirect('#voice-settings:pos', '?token=secret&pos_connected=1'))
      .toBe('/host-dashboard/integrations?pos_connected=1#integrations:pos');
  });
});

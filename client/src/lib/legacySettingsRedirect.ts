/**
 * Preserve links and OAuth return URLs created before integrations had their
 * own page. Only known callback parameters cross the redirect boundary.
 */
export function legacyVoiceSettingsRedirect(hash: string, search: string): string | null {
  const params = new URLSearchParams(search);
  const legacyTab = hash.replace(/^#(?:voice-settings:|tab=)/, '');

  if (legacyTab === 'whatsapp') return '/host-dashboard/whatsapp';

  let target: 'booking' | 'instagram' | 'pos' | null = null;
  const next = new URLSearchParams();

  if (params.has('instagram_connect')) {
    target = 'instagram';
    next.set('instagram_connect', params.get('instagram_connect') ?? '');
  } else if (params.has('pos_connected')) {
    target = 'pos';
    next.set('pos_connected', params.get('pos_connected') ?? '');
  } else if (params.has('pos_error')) {
    target = 'pos';
    next.set('pos_error', params.get('pos_error') ?? '');
  } else if (params.has('stripe_connect')) {
    target = 'pos';
    next.set('stripe_connect', params.get('stripe_connect') ?? '');
  } else if (legacyTab === 'widget') {
    target = 'booking';
  } else if (legacyTab === 'instagram') {
    target = 'instagram';
  } else if (legacyTab === 'pos') {
    target = 'pos';
  }

  if (!target) return null;
  const query = next.size > 0 ? `?${next.toString()}` : '';
  return `/host-dashboard/integrations${query}#integrations:${target}`;
}

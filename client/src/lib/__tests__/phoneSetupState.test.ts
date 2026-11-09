import { describe, expect, it } from 'vitest';
import { resolvePhoneSetupState } from '../phoneSetupState';

describe('shared phone setup is configuration evidence, not live route verification', () => {
  it.each(['not_configured', 'needs_review', 'active'] as const)('uses a neutral shared state instead of legacy %s', status => {
    expect(resolvePhoneSetupState(status, { sharedRoutingEnabled: true })).toBe('shared_configured');
  });

  it.each(['pending', 'error'] as const)('preserves a saved %s setup state', status => {
    expect(resolvePhoneSetupState(status, { sharedRoutingEnabled: true })).toBe(status);
  });

  it('preserves request failures, loading and missing status over saved shared setup', () => {
    expect(resolvePhoneSetupState('not_configured', { sharedRoutingEnabled: true, failed: true })).toBe('unavailable');
    expect(resolvePhoneSetupState('not_configured', { sharedRoutingEnabled: true, loading: true })).toBe('loading');
    expect(resolvePhoneSetupState(undefined, { sharedRoutingEnabled: true })).toBe('unavailable');
  });

  it('requires a strict shared opt-in and keeps old active flags unverified', () => {
    expect(resolvePhoneSetupState('not_configured')).toBe('not_configured');
    expect(resolvePhoneSetupState('not_configured', { sharedRoutingEnabled: 'true' as unknown as boolean })).toBe('not_configured');
    expect(resolvePhoneSetupState('active')).toBe('needs_review');
  });
});

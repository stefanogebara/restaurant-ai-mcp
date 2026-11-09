export type PhoneSetupStatus = 'not_configured' | 'pending' | 'active' | 'needs_review' | 'error';
export type PhoneSetupState = Exclude<PhoneSetupStatus, 'active'> | 'shared_configured' | 'loading' | 'unavailable';

/** A saved active flag does not prove the shared number reaches this restaurant. */
export function resolvePhoneSetupState(
  status: PhoneSetupStatus | null | undefined,
  { loading = false, failed = false, sharedRoutingEnabled = false }: { loading?: boolean; failed?: boolean; sharedRoutingEnabled?: boolean } = {},
): PhoneSetupState {
  if (failed) return 'unavailable';
  if (loading) return 'loading';
  if (!status) return 'unavailable';
  if (sharedRoutingEnabled === true && status !== 'pending' && status !== 'error') return 'shared_configured';
  return status === 'active' ? 'needs_review' : status;
}

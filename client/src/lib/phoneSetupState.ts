export type PhoneSetupStatus = 'not_configured' | 'pending' | 'active' | 'needs_review' | 'error';
export type PhoneSetupState = Exclude<PhoneSetupStatus, 'active'> | 'loading' | 'unavailable';

/** A saved active flag does not prove the shared number reaches this restaurant. */
export function resolvePhoneSetupState(
  status: PhoneSetupStatus | null | undefined,
  { loading = false, failed = false }: { loading?: boolean; failed?: boolean } = {},
): PhoneSetupState {
  if (failed) return 'unavailable';
  if (loading) return 'loading';
  if (!status) return 'unavailable';
  return status === 'active' ? 'needs_review' : status;
}

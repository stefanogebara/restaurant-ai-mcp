import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import ThiingsIcon from '../common/ThiingsIcon';
import type { PhoneStatusData } from './callTrackingTypes';

interface Props {
  phoneStatus: PhoneStatusData | null;
  phoneStatusLoading: boolean;
  phoneStatusError: boolean;
  onRefreshStatus: () => void;
}

export default function CallPhoneStatusCard({ phoneStatus, phoneStatusLoading, phoneStatusError, onRefreshStatus }: Props) {
  const { t } = useTranslation();
  const needsReview = phoneStatus?.status === 'needs_review';

  return (
    <section className="border-b border-glass-border-dark py-3 sm:py-5" aria-labelledby="call-phone-title">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="min-w-0">
          <p className="mb-1 hidden text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-stone sm:block">
            {t('callTracking.phoneStatus')}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="call-phone-title" className="font-serif text-xl text-deep-charcoal sm:text-2xl">
              {t('callTracking.phoneSetupTitle')}
            </h2>
            {needsReview && (
              <span className="inline-flex items-center gap-1 rounded-[100px] bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                <ThiingsIcon name="alert-triangle" size="xs" />
                {t('callTracking.routingNeedsReview')}
              </span>
            )}
          </div>
          <p className="mt-1 max-w-2xl text-sm text-muted-stone">
            {needsReview ? t('phoneIntegration.routingUnverified') : t('callTracking.phoneSetupSummary')}
          </p>
          {phoneStatusLoading && <p role="status" className="mt-1 text-sm text-muted-stone">{t('phoneIntegration.loadingStatus')}</p>}
          {phoneStatusError && <p role="alert" className="mt-1 text-sm text-red-700">{t('phoneIntegration.statusUnavailable')}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-4 text-sm">
          <Link to="/host-dashboard/voice-settings#voice-settings:phone" className="text-burgundy underline underline-offset-2 hover:text-burgundy-dark">
            {t('callTracking.openPhoneSettings')}
          </Link>
          <button type="button" onClick={onRefreshStatus} className="hidden text-muted-stone underline underline-offset-2 hover:text-deep-charcoal sm:inline">
            {t('callTracking.refreshStatus')}
          </button>
        </div>
      </div>
    </section>
  );
}

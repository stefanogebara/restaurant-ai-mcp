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
    <section className="space-y-4 py-5 border-b border-glass-border-dark" aria-labelledby="call-phone-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-stone mb-2">
            {t('callTracking.phoneStatus')}
          </p>
          <h2 id="call-phone-title" className="font-serif text-2xl text-deep-charcoal">
            {t('phoneIntegration.assistedTitle')}
          </h2>
        </div>
        {needsReview && (
          <span className="inline-flex items-center gap-2 rounded-[100px] bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900">
            <ThiingsIcon name="alert-triangle" size="xs" />
            {t('callTracking.routingNeedsReview')}
          </span>
        )}
      </div>
      <p className="max-w-2xl text-[15px] text-muted-stone">
        {needsReview ? t('phoneIntegration.routingUnverified') : t('phoneIntegration.assistedDescription')}
      </p>
      {phoneStatusLoading && <p role="status" className="text-sm text-muted-stone">{t('phoneIntegration.loadingStatus')}</p>}
      {phoneStatusError && <p role="alert" className="text-sm text-red-700">{t('phoneIntegration.statusUnavailable')}</p>}
      <div className="flex flex-wrap items-center gap-5 text-sm">
        <Link to="/host-dashboard/voice-settings#voice-settings:phone" className="text-burgundy underline underline-offset-2 hover:text-burgundy-dark">
          {t('callTracking.openPhoneSettings')}
        </Link>
        <button type="button" onClick={onRefreshStatus} className="text-muted-stone underline underline-offset-2 hover:text-deep-charcoal">
          {t('callTracking.refreshStatus')}
        </button>
      </div>
    </section>
  );
}

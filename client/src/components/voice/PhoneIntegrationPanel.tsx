/** Voice phone setup stays assisted until each restaurant has verified routing. */
import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../common/ThiingsIcon';
import { usePhoneIntegration } from '../../hooks/usePhoneIntegration';

export default function PhoneIntegrationPanel() {
  const { t } = useTranslation();
  const { status, isLoading, isError } = usePhoneIntegration();
  const needsReview = status?.restaurant?.status === 'needs_review';

  if (isLoading) {
    return <p role="status" className="py-5 text-[15px] text-muted-stone">{t('phoneIntegration.loadingStatus')}</p>;
  }

  return (
    <section className="space-y-6 py-5" aria-labelledby="phone-setup-title">
      <div>
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-stone mb-2">
          {t('phoneIntegration.title')}
        </p>
        <h2 id="phone-setup-title" className="font-serif text-2xl text-deep-charcoal">
          {t('phoneIntegration.assistedTitle')}
        </h2>
        <p className="mt-2 max-w-2xl text-[15px] text-muted-stone">
          {t('phoneIntegration.assistedDescription')}
        </p>
      </div>

      {needsReview && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="status">
          <ThiingsIcon name="alert-triangle" size="sm" className="shrink-0 text-amber-700" />
          <p>{t('phoneIntegration.routingUnverified')}</p>
        </div>
      )}

      {isError && <p role="alert" className="text-sm text-red-700">{t('phoneIntegration.statusUnavailable')}</p>}
      {!status?.restaurant?.has_agent && !isError && (
        <p className="text-sm text-muted-stone">{t('phoneIntegration.noAgentWarning')}</p>
      )}

      <a
        href="mailto:hello@seatable.one?subject=Voice%20phone%20setup"
        className="inline-flex items-center gap-2 text-sm font-medium text-burgundy underline underline-offset-2 hover:text-burgundy-dark"
      >
        {t('phoneIntegration.requestHelp')}
      </a>
    </section>
  );
}

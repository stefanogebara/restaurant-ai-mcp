import { useTranslation } from 'react-i18next';
import { type BillingPlan, withBillingPlan } from '../../lib/billingHandoff';

export default function ResumeCheckout({ plan }: { plan: BillingPlan }) {
  const { t } = useTranslation();

  return (
    <div className="hairline py-4">
      <p className="mb-3 text-sm text-deep-charcoal">
        {t('subscription.selectedPlan', { plan: t(`landing.pricing.${plan}.name`) })}
      </p>
      <a href={withBillingPlan('/subscription/manage', plan)}
        className="inline-flex min-h-11 items-center justify-center rounded-full border border-glass-border-dark px-6 py-2 text-sm font-semibold text-deep-charcoal hover:border-muted-stone">
        {t('subscription.resumeCheckout')}
      </a>
    </div>
  );
}

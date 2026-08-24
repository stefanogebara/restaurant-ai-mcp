import { useTranslation } from 'react-i18next';
import DashboardLayout from '../components/layout/DashboardLayout';
import UpgradePrompt from '../components/common/UpgradePrompt';
import LTVDashboard from '../components/host/LTVDashboard';
import { Skeleton } from '../components/common/Skeleton';
import { useFeatureAccess } from '../hooks/useSubscription';

export default function LTVPage() {
  const { t } = useTranslation();
  const { hasAccess, isLoading } = useFeatureAccess('advanced_analytics');

  if (!isLoading && !hasAccess) {
    return (
      <UpgradePrompt
        requiredPlan="growth"
        feature={t('ltv.pageTitle', 'Customer Lifetime Value')}
        description={t('ltv.pageDescription', 'Track guest lifetime value, VIP tiers, and churn risk from one place.')}
      />
    );
  }

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
          <div className="space-y-3 mb-8">
            <Skeleton className="h-10 w-72" />
            <Skeleton className="h-4 w-96 max-w-full" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-48 w-full rounded-2xl" />
            <Skeleton className="h-72 w-full rounded-2xl" />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 overflow-x-hidden pb-24 sm:pb-6 mt-14 sm:mt-0">
        <div className="mb-8">
          <h1 className="font-serif text-3xl sm:text-4xl text-deep-charcoal tracking-tight">
            {t('ltv.pageTitle', 'Customer Lifetime Value')}
          </h1>
          <p className="mt-1.5 text-[15px] text-muted-stone">
            {t('ltv.pageDescription', 'Track guest lifetime value, VIP tiers, and churn risk from one place.')}
          </p>
        </div>

        <LTVDashboard />
      </div>
    </DashboardLayout>
  );
}

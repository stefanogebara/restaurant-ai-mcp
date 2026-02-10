import DashboardLayout from '../components/layout/DashboardLayout';
import CustomerProfileView from '../components/host/CustomerProfileView';
import Breadcrumb from '../components/common/Breadcrumb';
import { useSubscription } from '../hooks/useSubscription';
import { hasFeatureAccess, type PlanType } from '../config/planFeatures';
import { useParams, Link } from 'react-router-dom';
import { Lock, Crown, Loader2 } from 'lucide-react';

export default function CustomerDNAProfilePage() {
  const { customerId } = useParams<{ customerId: string }>();
  const subscription = useSubscription();
  const currentPlan = (subscription.data?.subscription?.plan?.toLowerCase() as PlanType) || undefined;
  const hasAccess = currentPlan ? hasFeatureAccess(currentPlan, 'customerDNA') : false;

  const breadcrumbItems = [
    { label: 'Dashboard', href: '/host-dashboard/simple' },
    { label: 'Customer DNA', href: '/host-dashboard/dna' },
    { label: customerId ? `Profile: ${customerId}` : 'Profile' }
  ];

  if (subscription.isLoading) {
    return (
      <DashboardLayout>
        <div className="p-8">
          <Breadcrumb items={breadcrumbItems} className="mb-4" />
          <div className="flex items-center justify-center min-h-[50vh]">
            <Loader2 className="w-8 h-8 text-[#9F1239] animate-spin" />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!hasAccess) {
    return (
      <DashboardLayout>
        <div className="p-8">
          <Breadcrumb items={breadcrumbItems} className="mb-4" />
          <div className="flex flex-col items-center justify-center min-h-[50vh]">
            <div className="bg-white rounded-2xl border border-[#E7E5E4] p-12 max-w-lg text-center shadow-lg">
              <div className="w-16 h-16 bg-[#9F1239]/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <Lock className="w-8 h-8 text-[#9F1239]" />
              </div>
              <h2 className="text-2xl font-bold text-[#1C1917] mb-3">Customer DNA Profiling</h2>
              <p className="text-[#57534E] mb-6">
                Unlock deep behavioral insights into your customers' dining patterns. Available on the Professional plan.
              </p>
              <div className="flex items-center justify-center gap-2 text-sm text-[#9F1239] font-medium mb-6">
                <Crown className="w-4 h-4" />
                Professional Plan Feature
              </div>
              <Link
                to="/welcome"
                className="inline-flex items-center gap-2 px-6 py-3 bg-[#9F1239] text-white rounded-xl hover:bg-[#881337] transition-colors font-medium"
              >
                Upgrade Plan
              </Link>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-8">
        <Breadcrumb items={breadcrumbItems} className="mb-4" />
        <div className="max-w-7xl">
          <CustomerProfileView />
        </div>
      </div>
    </DashboardLayout>
  );
}

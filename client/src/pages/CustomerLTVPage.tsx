import DashboardLayout from '../components/layout/DashboardLayout';
import LTVDashboard from '../components/host/LTVDashboard';
import AnalyticsGuide from '../components/common/AnalyticsGuide';
import Breadcrumb, { breadcrumbConfigs } from '../components/common/Breadcrumb';

export default function CustomerLTVPage() {
  return (
    <DashboardLayout>
      <div className="p-8">
        {/* Breadcrumb Navigation */}
        <Breadcrumb items={breadcrumbConfigs.ltv} className="mb-4" />

        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[#1C1917] mb-2">Customer Lifetime Value</h1>
          <p className="text-[#57534E]">
            Understand your most valuable customers and identify churn risks
          </p>
        </div>

        {/* Simple Guide - First! */}
        <div className="max-w-7xl mb-8">
          <AnalyticsGuide page="ltv" />
        </div>

        {/* LTV Dashboard - Full Width */}
        <div className="max-w-7xl">
          <LTVDashboard />
        </div>

        {/* Customer Insights Section */}
        <div className="mt-8 max-w-7xl">
          <div className="bg-white rounded-xl border border-[#E7E5E4] p-6 shadow-lg">
            <h2 className="text-xl font-bold text-[#1C1917] mb-4">Customer Segmentation Strategy</h2>
            <div className="grid md:grid-cols-5 gap-4">
              <div className="bg-[#7c3aed]/10 p-4 rounded-xl border border-[#7c3aed]/20">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 bg-[#7c3aed] rounded-full"></div>
                  <h3 className="font-semibold text-[#7c3aed]">VIP</h3>
                </div>
                <p className="text-xs text-[#57534E]">
                  High-value customers with frequent visits. Offer exclusive perks and priority reservations.
                </p>
              </div>
              <div className="bg-[#9F1239]/10 p-4 rounded-xl border border-[#9F1239]/20">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 bg-[#9F1239] rounded-full"></div>
                  <h3 className="font-semibold text-[#9F1239]">Regular</h3>
                </div>
                <p className="text-xs text-[#57534E]">
                  Loyal customers with consistent visits. Maintain engagement with personalized offers.
                </p>
              </div>
              <div className="bg-[#16a34a]/10 p-4 rounded-xl border border-[#16a34a]/20">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 bg-[#16a34a] rounded-full"></div>
                  <h3 className="font-semibold text-[#16a34a]">Occasional</h3>
                </div>
                <p className="text-xs text-[#57534E]">
                  Moderate visitors. Encourage frequency with targeted promotions and reminders.
                </p>
              </div>
              <div className="bg-[#57534E]/10 p-4 rounded-xl border border-[#57534E]/20">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 bg-[#57534E] rounded-full"></div>
                  <h3 className="font-semibold text-[#57534E]">New</h3>
                </div>
                <p className="text-xs text-[#57534E]">
                  First-time or recent customers. Focus on exceptional experience to drive return visits.
                </p>
              </div>
              <div className="bg-[#d97706]/10 p-4 rounded-xl border border-[#d97706]/20">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 bg-[#d97706] rounded-full"></div>
                  <h3 className="font-semibold text-[#d97706]">At Risk</h3>
                </div>
                <p className="text-xs text-[#57534E]">
                  Customers showing churn signs. Launch retention campaigns immediately.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

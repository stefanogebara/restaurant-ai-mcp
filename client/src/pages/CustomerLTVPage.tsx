import DashboardLayout from '../components/layout/DashboardLayout';
import LTVDashboard from '../components/host/LTVDashboard';
import AnalyticsGuide from '../components/common/AnalyticsGuide';

export default function CustomerLTVPage() {
  return (
    <DashboardLayout>
      <div className="p-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Customer Lifetime Value</h1>
          <p className="text-muted-foreground">
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
          <div className="bg-card rounded-lg border border-border p-6">
            <h2 className="text-xl font-bold text-foreground mb-4">Customer Segmentation Strategy</h2>
            <div className="grid md:grid-cols-5 gap-4">
              <div className="bg-purple-500/10 p-4 rounded-lg border border-purple-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 bg-purple-500 rounded-full"></div>
                  <h3 className="font-semibold text-purple-400">VIP</h3>
                </div>
                <p className="text-xs text-muted-foreground">
                  High-value customers with frequent visits. Offer exclusive perks and priority reservations.
                </p>
              </div>
              <div className="bg-blue-500/10 p-4 rounded-lg border border-blue-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 bg-blue-500 rounded-full"></div>
                  <h3 className="font-semibold text-blue-400">Regular</h3>
                </div>
                <p className="text-xs text-muted-foreground">
                  Loyal customers with consistent visits. Maintain engagement with personalized offers.
                </p>
              </div>
              <div className="bg-green-500/10 p-4 rounded-lg border border-green-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 bg-green-500 rounded-full"></div>
                  <h3 className="font-semibold text-green-400">Occasional</h3>
                </div>
                <p className="text-xs text-muted-foreground">
                  Moderate visitors. Encourage frequency with targeted promotions and reminders.
                </p>
              </div>
              <div className="bg-gray-500/10 p-4 rounded-lg border border-gray-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 bg-gray-500 rounded-full"></div>
                  <h3 className="font-semibold text-gray-400">New</h3>
                </div>
                <p className="text-xs text-muted-foreground">
                  First-time or recent customers. Focus on exceptional experience to drive return visits.
                </p>
              </div>
              <div className="bg-red-500/10 p-4 rounded-lg border border-red-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 bg-red-500 rounded-full"></div>
                  <h3 className="font-semibold text-red-400">At Risk</h3>
                </div>
                <p className="text-xs text-muted-foreground">
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

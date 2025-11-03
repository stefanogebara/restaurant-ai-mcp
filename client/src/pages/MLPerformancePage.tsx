import DashboardLayout from '../components/layout/DashboardLayout';
import MLROIWidget from '../components/host/MLROIWidget';

export default function MLPerformancePage() {
  return (
    <DashboardLayout>
      <div className="p-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">ML Performance Dashboard</h1>
          <p className="text-muted-foreground">
            Track your AI-powered interventions and return on investment
          </p>
        </div>

        {/* ML ROI Widget - Full Width */}
        <div className="max-w-7xl">
          <MLROIWidget />
        </div>

        {/* Additional Context Section */}
        <div className="mt-8 max-w-7xl">
          <div className="bg-card rounded-lg border border-border p-6">
            <h2 className="text-xl font-bold text-foreground mb-4">How ML Interventions Work</h2>
            <div className="grid md:grid-cols-3 gap-6">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 bg-blue-500/20 rounded-full flex items-center justify-center">
                    <span className="text-blue-400 font-bold">1</span>
                  </div>
                  <h3 className="font-semibold">Risk Detection</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Our AI analyzes reservation patterns, customer history, and booking behavior to identify high-risk reservations.
                </p>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 bg-green-500/20 rounded-full flex items-center justify-center">
                    <span className="text-green-400 font-bold">2</span>
                  </div>
                  <h3 className="font-semibold">Smart Intervention</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Recommended actions include confirmation calls, deposit requirements, or premium seating offers based on risk level.
                </p>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 bg-purple-500/20 rounded-full flex items-center justify-center">
                    <span className="text-purple-400 font-bold">3</span>
                  </div>
                  <h3 className="font-semibold">ROI Tracking</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Every intervention's cost and outcome is tracked, calculating your exact return on investment.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

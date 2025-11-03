import DashboardLayout from '../components/layout/DashboardLayout';
import PricingRulesManager from '../components/host/PricingRulesManager';

export default function PricingRulesPage() {
  return (
    <DashboardLayout>
      <div className="p-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Dynamic Pricing Rules</h1>
          <p className="text-muted-foreground">
            Configure and manage your automated pricing strategies
          </p>
        </div>

        {/* Pricing Rules Manager - Full Width */}
        <div className="max-w-7xl">
          <PricingRulesManager />
        </div>

        {/* Rule Types Explanation */}
        <div className="mt-8 max-w-7xl">
          <div className="bg-card rounded-lg border border-border p-6">
            <h2 className="text-xl font-bold text-foreground mb-4">Pricing Rule Types</h2>
            <div className="grid md:grid-cols-4 gap-6">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-10 h-10 bg-emerald-500/20 rounded-lg flex items-center justify-center">
                    <span className="text-2xl">📊</span>
                  </div>
                  <h3 className="font-semibold">Demand-Based</h3>
                </div>
                <p className="text-sm text-muted-foreground mb-2">
                  Adjust prices based on current occupancy levels
                </p>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>• High occupancy surges (+25-30%)</li>
                  <li>• Low occupancy discounts (-15-20%)</li>
                  <li>• Last-minute availability pricing</li>
                </ul>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                    <span className="text-2xl">⏰</span>
                  </div>
                  <h3 className="font-semibold">Time-Based</h3>
                </div>
                <p className="text-sm text-muted-foreground mb-2">
                  Optimize pricing by day and time
                </p>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>• Weekend prime time surges</li>
                  <li>• Weekday lunch specials</li>
                  <li>• Happy hour pricing</li>
                </ul>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
                    <span className="text-2xl">🎉</span>
                  </div>
                  <h3 className="font-semibold">Event-Based</h3>
                </div>
                <p className="text-sm text-muted-foreground mb-2">
                  Special pricing for holidays and events
                </p>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>• Valentine's Day premium (+40%)</li>
                  <li>• New Year's Eve surges (+50%)</li>
                  <li>• Local festival pricing</li>
                </ul>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-10 h-10 bg-orange-500/20 rounded-lg flex items-center justify-center">
                    <span className="text-2xl">⭐</span>
                  </div>
                  <h3 className="font-semibold">Customer-Based</h3>
                </div>
                <p className="text-sm text-muted-foreground mb-2">
                  Personalized pricing by segment
                </p>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>• VIP customer discounts</li>
                  <li>• First-time visitor offers</li>
                  <li>• Loyalty program pricing</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Best Practices */}
        <div className="mt-6 max-w-7xl">
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-5">
            <h3 className="font-semibold text-blue-400 mb-3 flex items-center gap-2">
              <span className="text-lg">💡</span>
              Best Practices for Dynamic Pricing
            </h3>
            <ul className="text-sm text-muted-foreground space-y-2">
              <li>• <strong>Start conservative:</strong> Begin with ±10-15% adjustments and gradually increase based on customer response</li>
              <li>• <strong>Monitor constantly:</strong> Track pricing effectiveness weekly and adjust rules that underperform</li>
              <li>• <strong>Communicate clearly:</strong> Display pricing tiers transparently to build trust with customers</li>
              <li>• <strong>Test & iterate:</strong> Run A/B tests on pricing strategies to find optimal combinations</li>
              <li>• <strong>Respect segments:</strong> Always offer value to loyal customers even during surge periods</li>
            </ul>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

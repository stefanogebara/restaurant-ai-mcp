import DashboardLayout from '../components/layout/DashboardLayout';
import PricingAnalytics from '../components/host/PricingAnalytics';

export default function PricingAnalyticsPage() {
  return (
    <DashboardLayout>
      <div className="p-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Pricing Effectiveness Analytics</h1>
          <p className="text-muted-foreground">
            Measure the impact of your dynamic pricing strategies on revenue
          </p>
        </div>

        {/* Pricing Analytics - Full Width */}
        <div className="max-w-7xl">
          <PricingAnalytics />
        </div>

        {/* Key Metrics Explanation */}
        <div className="mt-8 max-w-7xl grid md:grid-cols-2 gap-6">
          <div className="bg-card rounded-lg border border-border p-6">
            <h2 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
              <span className="text-2xl">📈</span>
              Understanding Revenue Lift
            </h2>
            <div className="space-y-3 text-sm">
              <div>
                <h3 className="font-semibold text-foreground mb-1">What is Revenue Lift?</h3>
                <p className="text-muted-foreground">
                  The additional revenue generated from surge pricing compared to your base prices. For example, charging €60 instead of €50 creates €10 in revenue lift.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-1">Why It Matters</h3>
                <p className="text-muted-foreground">
                  Revenue lift shows how much more money you're making during peak demand periods. A consistent +20% lift means 20% more revenue without needing more tables.
                </p>
              </div>
              <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
                <p className="text-xs text-green-400 font-semibold">
                  💰 Target: Aim for 10-25% average revenue lift to maximize profit without deterring customers
                </p>
              </div>
            </div>
          </div>

          <div className="bg-card rounded-lg border border-border p-6">
            <h2 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
              <span className="text-2xl">⚖️</span>
              Balancing Discounts & Surges
            </h2>
            <div className="space-y-3 text-sm">
              <div>
                <h3 className="font-semibold text-foreground mb-1">Strategic Discounting</h3>
                <p className="text-muted-foreground">
                  Off-peak discounts fill empty tables, but the key is ensuring your net impact (revenue lift - discounts) stays positive overall.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-1">The Golden Ratio</h3>
                <p className="text-muted-foreground">
                  For every €1 given in discounts, aim to generate €3-5 in revenue lift from surges. This 3:1 to 5:1 ratio ensures healthy profitability.
                </p>
              </div>
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                <p className="text-xs text-blue-400 font-semibold">
                  🎯 Current Ratio: Check your "Net Impact" card to see if you're meeting the 3:1 minimum target
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Performance Optimization Tips */}
        <div className="mt-6 max-w-7xl">
          <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-5">
            <h3 className="font-semibold text-purple-400 mb-3 flex items-center gap-2">
              <span className="text-lg">🚀</span>
              How to Improve Pricing Performance
            </h3>
            <div className="grid md:grid-cols-3 gap-4 text-sm text-muted-foreground">
              <div>
                <h4 className="font-semibold text-foreground mb-2">Increase Revenue Lift</h4>
                <ul className="space-y-1 text-xs">
                  <li>• Raise surge pricing during proven peak times</li>
                  <li>• Add premium seating options with higher prices</li>
                  <li>• Implement last-minute availability surcharges</li>
                  <li>• Test higher event-based pricing (holidays)</li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold text-foreground mb-2">Reduce Discount Cost</h4>
                <ul className="space-y-1 text-xs">
                  <li>• Make off-peak discounts smaller but longer duration</li>
                  <li>• Target discounts only to price-sensitive segments</li>
                  <li>• Use "happy hour" style time-limited offers</li>
                  <li>• Phase out underperforming discount rules</li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold text-foreground mb-2">Optimize Rule Mix</h4>
                <ul className="space-y-1 text-xs">
                  <li>• Disable rules with negative net impact</li>
                  <li>• Increase priority of top-performing rules</li>
                  <li>• Test new rules on limited time slots first</li>
                  <li>• Review analytics weekly and adjust quickly</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

import DashboardLayout from '../components/layout/DashboardLayout';
import CustomerDNADashboard from '../components/host/CustomerDNADashboard';

export default function CustomerDNAPage() {
  return (
    <DashboardLayout>
      <div className="p-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Customer DNA Profiling</h1>
          <p className="text-muted-foreground">
            Deep behavioral insights into your customers' dining patterns and preferences
          </p>
        </div>

        {/* Customer DNA Dashboard - Full Width */}
        <div className="max-w-7xl">
          <CustomerDNADashboard />
        </div>

        {/* DNA Profiling Explanation */}
        <div className="mt-8 max-w-7xl">
          <div className="bg-card rounded-lg border border-border p-6">
            <h2 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
              <span className="text-2xl">🧬</span>
              How Customer DNA Profiling Works
            </h2>
            <div className="grid md:grid-cols-3 gap-6">
              <div>
                <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                  <div className="w-8 h-8 bg-blue-500/20 rounded-full flex items-center justify-center">
                    <span className="text-blue-400 text-lg">🔍</span>
                  </div>
                  Data Collection
                </h3>
                <p className="text-sm text-muted-foreground">
                  Our AI analyzes every reservation, tracking patterns like preferred times, party sizes, booking advance windows, special occasion requests, and table preferences.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                  <div className="w-8 h-8 bg-purple-500/20 rounded-full flex items-center justify-center">
                    <span className="text-purple-400 text-lg">🤖</span>
                  </div>
                  Pattern Recognition
                </h3>
                <p className="text-sm text-muted-foreground">
                  Machine learning identifies unique behavioral signatures, clustering customers by dining style, day preferences, spontaneity levels, and occasion types.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                  <div className="w-8 h-8 bg-green-500/20 rounded-full flex items-center justify-center">
                    <span className="text-green-400 text-lg">💡</span>
                  </div>
                  Actionable Insights
                </h3>
                <p className="text-sm text-muted-foreground">
                  Use DNA profiles to personalize marketing, predict future reservations, offer tailored recommendations, and anticipate special occasions before customers even ask.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* DNA Attributes Breakdown */}
        <div className="mt-6 max-w-7xl grid md:grid-cols-2 gap-6">
          <div className="bg-card rounded-lg border border-border p-6">
            <h3 className="font-semibold text-foreground mb-4">Dining Style Profiles</h3>
            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-3">
                <span className="text-2xl">🧘</span>
                <div>
                  <h4 className="font-semibold">Solo Diners</h4>
                  <p className="text-xs text-muted-foreground">Quick service, bar seating preferred, midweek lunches</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-2xl">💑</span>
                <div>
                  <h4 className="font-semibold">Couples</h4>
                  <p className="text-xs text-muted-foreground">Weekend evenings, romantic ambiance, anniversary occasions</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-2xl">💼</span>
                <div>
                  <h4 className="font-semibold">Business</h4>
                  <p className="text-xs text-muted-foreground">Lunch slots, quiet tables, expense account dining</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-2xl">👨‍👩‍👧‍👦</span>
                <div>
                  <h4 className="font-semibold">Family</h4>
                  <p className="text-xs text-muted-foreground">Early dinners, kid-friendly menu requests, weekend brunch</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-2xl">👥</span>
                <div>
                  <h4 className="font-semibold">Groups</h4>
                  <p className="text-xs text-muted-foreground">Celebrations, large tables, advance planning required</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-card rounded-lg border border-border p-6">
            <h3 className="font-semibold text-foreground mb-4">Booking Spontaneity Levels</h3>
            <div className="space-y-4 text-sm">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold">Very Spontaneous</span>
                  <span className="text-xs text-muted-foreground">0-2 hours advance</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div className="bg-red-500 h-2 rounded-full" style={{width: '25%'}}></div>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Last-minute diners, often walk-ins, high cancellation risk</p>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold">Spontaneous</span>
                  <span className="text-xs text-muted-foreground">Same day</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div className="bg-orange-500 h-2 rounded-full" style={{width: '40%'}}></div>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Flexible planners, respond well to availability alerts</p>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold">Moderate</span>
                  <span className="text-xs text-muted-foreground">1-3 days advance</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div className="bg-yellow-500 h-2 rounded-full" style={{width: '60%'}}></div>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Typical booking window, balanced planning approach</p>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold">Planner</span>
                  <span className="text-xs text-muted-foreground">1-2 weeks advance</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div className="bg-green-500 h-2 rounded-full" style={{width: '80%'}}></div>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Organized diners, low no-show rate, appreciate confirmations</p>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold">Advance Planner</span>
                  <span className="text-xs text-muted-foreground">2+ weeks advance</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div className="bg-blue-500 h-2 rounded-full" style={{width: '100%'}}></div>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Special occasions, events, celebrations - highest commitment</p>
              </div>
            </div>
          </div>
        </div>

        {/* Use Cases */}
        <div className="mt-6 max-w-7xl">
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-5">
            <h3 className="font-semibold text-emerald-400 mb-3 flex items-center gap-2">
              <span className="text-lg">💎</span>
              Practical Applications of DNA Data
            </h3>
            <div className="grid md:grid-cols-4 gap-4 text-xs text-muted-foreground">
              <div>
                <h4 className="font-semibold text-foreground mb-2">Personalized Marketing</h4>
                <p>Send birthday offers to customers with celebration patterns, promote lunch specials to business diners, target weekend offers to couples.</p>
              </div>
              <div>
                <h4 className="font-semibold text-foreground mb-2">Inventory Planning</h4>
                <p>Stock premium ingredients when VIP customers are booked, prepare family-friendly items for weekend family groups.</p>
              </div>
              <div>
                <h4 className="font-semibold text-foreground mb-2">Staff Optimization</h4>
                <p>Schedule experienced servers for high-value customers, ensure kid-friendly staff for family dining nights.</p>
              </div>
              <div>
                <h4 className="font-semibold text-foreground mb-2">Revenue Maximization</h4>
                <p>Offer premium seating to customers who value experience, provide early bird discounts to spontaneous diners.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

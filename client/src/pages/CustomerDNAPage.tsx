import DashboardLayout from '../components/layout/DashboardLayout';
import CustomerDNADashboard from '../components/host/CustomerDNADashboard';
import AnalyticsGuide from '../components/common/AnalyticsGuide';
import Breadcrumb, { breadcrumbConfigs } from '../components/common/Breadcrumb';
import { useSubscription } from '../hooks/useSubscription';
import { hasFeatureAccess, type PlanType } from '../config/planFeatures';
import { Link } from 'react-router-dom';
import ThiingsIcon from '../components/common/ThiingsIcon';
import Spinner from '../components/common/Spinner';

export default function CustomerDNAPage() {
  const subscription = useSubscription();
  const currentPlan = (subscription.data?.subscription?.plan?.toLowerCase() as PlanType) || undefined;
  const hasAccess = currentPlan ? hasFeatureAccess(currentPlan, 'customerDNA') : false;

  if (subscription.isLoading) {
    return (
      <DashboardLayout>
        <div className="p-8">
          <Breadcrumb items={breadcrumbConfigs.dna} className="mb-4" />
          <div className="flex items-center justify-center min-h-[50vh]">
            <Spinner size="lg" />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!hasAccess) {
    return (
      <DashboardLayout>
        <div className="p-8">
          <Breadcrumb items={breadcrumbConfigs.dna} className="mb-4" />
          <div className="flex flex-col items-center justify-center min-h-[50vh]">
            <div className="bg-white rounded-2xl border border-[#E7E5E4] p-12 max-w-lg text-center shadow-lg">
              <div className="w-16 h-16 bg-[#9F1239]/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <ThiingsIcon name="lock" pxSize={32} />
              </div>
              <h2 className="text-2xl font-bold text-[#1C1917] mb-3">Customer DNA Profiling</h2>
              <p className="text-[#57534E] mb-6">
                Unlock deep behavioral insights into your customers' dining patterns. Available on the Professional plan.
              </p>
              <div className="flex items-center justify-center gap-2 text-sm text-[#9F1239] font-medium mb-6">
                <ThiingsIcon name="crown" size="xs" />
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
        {/* Breadcrumb Navigation */}
        <Breadcrumb items={breadcrumbConfigs.dna} className="mb-4" />

        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[#1C1917] mb-2">Customer DNA Profiling</h1>
          <p className="text-[#57534E]">
            Deep behavioral insights into your customers' dining patterns and preferences
          </p>
        </div>

        {/* Simple Guide - First! */}
        <div className="max-w-7xl mb-8">
          <AnalyticsGuide page="dna" />
        </div>

        {/* Customer DNA Dashboard - Full Width */}
        <div className="max-w-7xl">
          <CustomerDNADashboard />
        </div>

        {/* DNA Profiling Explanation */}
        <div className="mt-8 max-w-7xl">
          <div className="bg-white rounded-xl border border-[#E7E5E4] p-6 shadow-lg">
            <h2 className="text-xl font-bold text-[#1C1917] mb-4 flex items-center gap-2">
              <span className="text-2xl">🧬</span>
              How Customer DNA Profiling Works
            </h2>
            <div className="grid md:grid-cols-3 gap-6">
              <div>
                <h3 className="font-semibold text-[#1C1917] mb-2 flex items-center gap-2">
                  <div className="w-8 h-8 bg-[#7c3aed]/20 rounded-full flex items-center justify-center">
                    <span className="text-lg">🔍</span>
                  </div>
                  Data Collection
                </h3>
                <p className="text-sm text-[#57534E]">
                  Our AI analyzes every reservation, tracking patterns like preferred times, party sizes, booking advance windows, special occasion requests, and table preferences.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-[#1C1917] mb-2 flex items-center gap-2">
                  <div className="w-8 h-8 bg-[#9F1239]/20 rounded-full flex items-center justify-center">
                    <span className="text-lg">🤖</span>
                  </div>
                  Pattern Recognition
                </h3>
                <p className="text-sm text-[#57534E]">
                  Machine learning identifies unique behavioral signatures, clustering customers by dining style, day preferences, spontaneity levels, and occasion types.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-[#1C1917] mb-2 flex items-center gap-2">
                  <div className="w-8 h-8 bg-[#16a34a]/20 rounded-full flex items-center justify-center">
                    <span className="text-lg">💡</span>
                  </div>
                  Actionable Insights
                </h3>
                <p className="text-sm text-[#57534E]">
                  Use DNA profiles to personalize marketing, predict future reservations, offer tailored recommendations, and anticipate special occasions before customers even ask.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* DNA Attributes Breakdown */}
        <div className="mt-6 max-w-7xl grid md:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-[#E7E5E4] p-6 shadow-lg">
            <h3 className="font-semibold text-[#1C1917] mb-4">Dining Style Profiles</h3>
            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-3">
                <span className="text-2xl">🧘</span>
                <div>
                  <h4 className="font-semibold text-[#1C1917]">Solo Diners</h4>
                  <p className="text-xs text-[#57534E]">Quick service, bar seating preferred, midweek lunches</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-2xl">💑</span>
                <div>
                  <h4 className="font-semibold text-[#1C1917]">Couples</h4>
                  <p className="text-xs text-[#57534E]">Weekend evenings, romantic ambiance, anniversary occasions</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-2xl">💼</span>
                <div>
                  <h4 className="font-semibold text-[#1C1917]">Business</h4>
                  <p className="text-xs text-[#57534E]">Lunch slots, quiet tables, expense account dining</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-2xl">👨‍👩‍👧‍👦</span>
                <div>
                  <h4 className="font-semibold text-[#1C1917]">Family</h4>
                  <p className="text-xs text-[#57534E]">Early dinners, kid-friendly menu requests, weekend brunch</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-2xl">👥</span>
                <div>
                  <h4 className="font-semibold text-[#1C1917]">Groups</h4>
                  <p className="text-xs text-[#57534E]">Celebrations, large tables, advance planning required</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-[#E7E5E4] p-6 shadow-lg">
            <h3 className="font-semibold text-[#1C1917] mb-4">Booking Spontaneity Levels</h3>
            <div className="space-y-4 text-sm">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-[#1C1917]">Very Spontaneous</span>
                  <span className="text-xs text-[#A8A29E]">0-2 hours advance</span>
                </div>
                <div className="w-full bg-[#F5F5F4] rounded-full h-2">
                  <div className="bg-[#9F1239] h-2 rounded-full" style={{width: '25%'}}></div>
                </div>
                <p className="text-xs text-[#57534E] mt-1">Last-minute diners, often walk-ins, high cancellation risk</p>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-[#1C1917]">Spontaneous</span>
                  <span className="text-xs text-[#A8A29E]">Same day</span>
                </div>
                <div className="w-full bg-[#F5F5F4] rounded-full h-2">
                  <div className="bg-[#d97706] h-2 rounded-full" style={{width: '40%'}}></div>
                </div>
                <p className="text-xs text-[#57534E] mt-1">Flexible planners, respond well to availability alerts</p>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-[#1C1917]">Moderate</span>
                  <span className="text-xs text-[#A8A29E]">1-3 days advance</span>
                </div>
                <div className="w-full bg-[#F5F5F4] rounded-full h-2">
                  <div className="bg-[#d97706] h-2 rounded-full" style={{width: '60%'}}></div>
                </div>
                <p className="text-xs text-[#57534E] mt-1">Typical booking window, balanced planning approach</p>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-[#1C1917]">Planner</span>
                  <span className="text-xs text-[#A8A29E]">1-2 weeks advance</span>
                </div>
                <div className="w-full bg-[#F5F5F4] rounded-full h-2">
                  <div className="bg-[#16a34a] h-2 rounded-full" style={{width: '80%'}}></div>
                </div>
                <p className="text-xs text-[#57534E] mt-1">Organized diners, low no-show rate, appreciate confirmations</p>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-[#1C1917]">Advance Planner</span>
                  <span className="text-xs text-[#A8A29E]">2+ weeks advance</span>
                </div>
                <div className="w-full bg-[#F5F5F4] rounded-full h-2">
                  <div className="bg-[#7c3aed] h-2 rounded-full" style={{width: '100%'}}></div>
                </div>
                <p className="text-xs text-[#57534E] mt-1">Special occasions, events, celebrations - highest commitment</p>
              </div>
            </div>
          </div>
        </div>

        {/* Use Cases */}
        <div className="mt-6 max-w-7xl">
          <div className="bg-[#16a34a]/10 border border-[#16a34a]/20 rounded-xl p-5">
            <h3 className="font-semibold text-[#16a34a] mb-3 flex items-center gap-2">
              <span className="text-lg">💎</span>
              Practical Applications of DNA Data
            </h3>
            <div className="grid md:grid-cols-4 gap-4 text-xs text-[#57534E]">
              <div>
                <h4 className="font-semibold text-[#1C1917] mb-2">Personalized Marketing</h4>
                <p>Send birthday offers to customers with celebration patterns, promote lunch specials to business diners, target weekend offers to couples.</p>
              </div>
              <div>
                <h4 className="font-semibold text-[#1C1917] mb-2">Inventory Planning</h4>
                <p>Stock premium ingredients when VIP customers are booked, prepare family-friendly items for weekend family groups.</p>
              </div>
              <div>
                <h4 className="font-semibold text-[#1C1917] mb-2">Staff Optimization</h4>
                <p>Schedule experienced servers for high-value customers, ensure kid-friendly staff for family dining nights.</p>
              </div>
              <div>
                <h4 className="font-semibold text-[#1C1917] mb-2">Revenue Maximization</h4>
                <p>Offer premium seating to customers who value experience, provide early bird discounts to spontaneous diners.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

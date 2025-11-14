import { useQuery } from '@tanstack/react-query';
import { TrendingUp, Target, AlertCircle, DollarSign, CheckCircle2, Sparkles } from 'lucide-react';
import DashboardLayout from '../components/layout/DashboardLayout';
import TrendChart from '../components/common/TrendChart';
import { api } from '../services/api';

interface MLPerformanceData {
  summary: {
    total_interventions: number;
    total_cost: string;
    total_value_saved: string;
    total_roi: number;
    target_roi: string;
    meets_target: boolean;
    outcomes: {
      showed_up: number;
      no_show: number;
      cancelled: number;
    };
    intervention_effectiveness: {
      interventions_with_action: number;
      successful_interventions: number;
      success_rate: string;
    };
  };
  timeline: Array<{
    id: number;
    reservation_id: string;
    risk_level: string;
    risk_score: number;
    type: string;
    action_taken: boolean;
    outcome: string;
    cost: number;
    value_saved: number;
    roi: number | null;
    created_at: string;
    action_timestamp: string;
  }>;
  breakdown: Array<{
    type: string;
    count: number;
    avg_cost: string;
    success_rate: string;
    roi: number | null;
    total_saved: string;
    total_cost: string;
  }>;
  trend: Array<{
    week_start: string;
    interventions: number;
    roi: number;
    value_saved: string;
    cost: string;
  }>;
  recommendations: Array<{
    type: string;
    icon: string;
    message: string;
    priority: string;
    action?: string;
    intervention_type?: string;
  }>;
}

export default function MLPerformancePage() {
  const { data, isLoading, error } = useQuery<{ success: boolean; data: MLPerformanceData }>({
    queryKey: ['ml-performance'],
    queryFn: async () => {
      const response = await api.get('/ml-performance?action=all&period=30');
      return response.data;
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const mlData = data?.data;

  if (error) {
    return (
      <DashboardLayout>
        <div className="p-8">
          <div className="bg-error-50 border-2 border-error-200 rounded-2xl p-8 max-w-md mx-auto animate-fade-in-up">
            <div className="w-16 h-16 bg-error-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-error-700" />
            </div>
            <h3 className="font-display text-lg font-bold text-error-900 text-center mb-2">
              Failed to Load Data
            </h3>
            <p className="font-sans text-sm text-error-700 text-center mb-4">
              {error instanceof Error ? error.message : 'Unable to connect to analytics service'}
            </p>
            <button className="w-full px-6 py-3 bg-error-700 hover:bg-error-800 text-cream-50 font-sans font-semibold rounded-lg transition-all duration-200">
              Retry
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const formatInterventionType = (type: string) => {
    const typeMap: Record<string, string> = {
      confirmation_call: 'Confirmation Call',
      deposit_required: 'Deposit Required',
      premium_seating: 'Premium Seating',
      sms_reminder: 'SMS Reminder',
      email_reminder: 'Email Reminder',
      none: 'No Intervention',
    };
    return typeMap[type] || type;
  };

  const getRiskBadgeColor = (level: string) => {
    const colors: Record<string, string> = {
      low: 'bg-success-100 text-success-700 border-success-300',
      medium: 'bg-warning-100 text-warning-700 border-warning-300',
      high: 'bg-error-100 text-error-700 border-error-300',
      'very-high': 'bg-error-200 text-error-900 border-error-400',
    };
    return colors[level] || colors.medium;
  };

  const getPriorityIcon = (priority: string) => {
    return priority === 'high' ? '🔥' : priority === 'medium' ? '⚠️' : 'ℹ️';
  };

  return (
    <DashboardLayout>
      <div className="p-8">
        {/* Page Header */}
        <div className="mb-8 animate-fade-in-up">
          <h1 className="font-display text-4xl font-bold text-slate-100 mb-2">ML Performance Dashboard</h1>
          <p className="font-sans text-lg text-slate-400">
            Track AI-powered interventions and ROI over the last 30 days
          </p>
        </div>

        {/* Top Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* Total ROI - Primary Metric */}
          <div
            className="bg-slate-800 border-2 border-slate-700 hover:border-violet-500 rounded-xl p-6 shadow-lg hover:shadow-glow-violet transition-all duration-300 ease-out-expo hover:-translate-y-1 animate-fade-in-up"
            style={{ animationDelay: '0ms' }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-violet-500/10 rounded-lg">
                <Target className="w-6 h-6 text-violet-400" />
              </div>
              {mlData?.summary?.meets_target ? (
                <span className="px-3 py-1 bg-violet-500/20 text-violet-300 font-sans font-bold text-xs rounded-full border border-violet-500/50 shadow-glow-violet">
                  ⭐ Target Met
                </span>
              ) : (
                <span className="font-mono text-xs text-slate-400">Target: 300-500%</span>
              )}
            </div>
            <div className="font-mono text-5xl font-bold text-violet-400 mb-2">
              {isLoading ? '-' : mlData?.summary ? `${mlData.summary.total_roi}%` : '-'}
            </div>
            <div className="font-sans text-sm text-slate-300">Total ROI</div>
          </div>

          {/* Total Interventions */}
          <div
            className="bg-slate-800 border-2 border-slate-700 hover:border-ocean-500 rounded-xl p-6 shadow-lg hover:shadow-glow-ocean transition-all duration-300 ease-out-expo hover:-translate-y-1 animate-fade-in-up"
            style={{ animationDelay: '100ms' }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-ocean-500/10 rounded-lg">
                <TrendingUp className="w-6 h-6 text-ocean-400" />
              </div>
              <span className="font-mono text-xs text-slate-400">Last 30 days</span>
            </div>
            <div className="font-mono text-5xl font-bold text-ocean-400 mb-2">
              {isLoading ? '-' : mlData?.summary?.total_interventions || '-'}
            </div>
            <div className="font-sans text-sm text-slate-300">Total Interventions</div>
          </div>

          {/* Success Rate */}
          <div
            className="bg-slate-800 border-2 border-slate-700 hover:border-success-500 rounded-xl p-6 shadow-lg hover:shadow-glow-success transition-all duration-300 ease-out-expo hover:-translate-y-1 animate-fade-in-up"
            style={{ animationDelay: '200ms' }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-success-500/10 rounded-lg">
                <CheckCircle2 className="w-6 h-6 text-success-400" />
              </div>
              {mlData?.summary && (
                <span className="font-mono text-xs text-slate-400">
                  {mlData.summary.outcomes.showed_up}/{mlData.summary.intervention_effectiveness.interventions_with_action}
                </span>
              )}
            </div>
            <div className="font-mono text-5xl font-bold text-success-400 mb-2">
              {isLoading ? '-' : mlData?.summary?.intervention_effectiveness?.success_rate || '-'}
            </div>
            <div className="font-sans text-sm text-slate-300">Success Rate</div>
          </div>

          {/* Value Saved */}
          <div
            className="bg-slate-800 border-2 border-slate-700 hover:border-amber-500 rounded-xl p-6 shadow-lg hover:shadow-glow-amber transition-all duration-300 ease-out-expo hover:-translate-y-1 animate-fade-in-up"
            style={{ animationDelay: '300ms' }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-amber-500/10 rounded-lg">
                <DollarSign className="w-6 h-6 text-amber-400" />
              </div>
              {mlData?.summary && (
                <span className="font-mono text-xs text-slate-400">Cost: €{mlData.summary.total_cost}</span>
              )}
            </div>
            <div className="font-mono text-5xl font-bold text-amber-400 mb-2">
              {isLoading ? '-' : mlData?.summary ? `€${mlData.summary.total_value_saved}` : '-'}
            </div>
            <div className="font-sans text-sm text-slate-300">Value Saved</div>
          </div>
        </div>

        {/* ROI Trend Chart */}
        <div className="mb-8 animate-fade-in-up" style={{ animationDelay: '400ms' }}>
          <h2 className="font-display text-2xl font-bold text-slate-100 mb-4">ROI Trend (Weekly)</h2>
          <div className="bg-slate-800 border-2 border-slate-700 rounded-xl p-6 shadow-lg">
            <TrendChart
              data={
                mlData?.trend?.map((week) => ({
                  week: new Date(week.week_start).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  }),
                  ROI: week.roi,
                  Interventions: week.interventions,
                })) || []
              }
              type="line"
              dataKeys={[
                { key: 'ROI', label: 'ROI %', color: '#9333ea' },
                { key: 'Interventions', label: 'Interventions', color: '#0284c7' },
              ]}
              xAxisKey="week"
              height={300}
              loading={isLoading}
            />
          </div>
        </div>

        {/* Intervention Type Breakdown */}
        <div className="mb-8 animate-fade-in-up" style={{ animationDelay: '500ms' }}>
          <h2 className="font-display text-2xl font-bold text-gray-200 mb-4">Performance by Intervention Type</h2>
          <div className="bg-cream-100 border-2 border-cream-300 rounded-xl p-6 shadow-md">
            <TrendChart
              data={
                mlData?.breakdown?.map((type) => ({
                  type: formatInterventionType(type.type),
                  ROI: type.roi || 0,
                  Count: type.count,
                  'Success Rate': parseFloat(type.success_rate),
                })) || []
              }
              type="bar"
              dataKeys={[
                { key: 'ROI', label: 'ROI %', color: '#7D1128' },
                { key: 'Success Rate', label: 'Success Rate %', color: '#D4AF37' },
              ]}
              xAxisKey="type"
              height={350}
              loading={isLoading}
            />
          </div>
        </div>

        {/* Smart Recommendations */}
        {mlData?.recommendations && mlData.recommendations.length > 0 && (
          <div className="mb-8 animate-fade-in-up" style={{ animationDelay: '600ms' }}>
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-5 h-5 text-gold-600" />
              <h2 className="font-display text-2xl font-bold text-gray-200">Smart Recommendations</h2>
            </div>
            <div className="grid gap-4">
              {mlData.recommendations.map((rec, index) => (
                <div
                  key={index}
                  className={`bg-cream-100 border-2 rounded-xl p-6 transition-all duration-300 ease-out-expo hover:-translate-y-1 ${
                    rec.priority === 'high'
                      ? 'border-error-300 bg-error-50 hover:shadow-xl'
                      : rec.priority === 'medium'
                      ? 'border-warning-300 bg-warning-50 hover:shadow-xl'
                      : 'border-cream-400 hover:border-gold-400 hover:shadow-gold'
                  }`}
                  style={{ animationDelay: `${700 + index * 100}ms` }}
                >
                  <div className="flex items-start gap-4">
                    <div className="text-3xl">{rec.icon}</div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-sans font-semibold text-lg text-charcoal-900">{rec.message}</h3>
                        <span className={`text-xs px-3 py-1 rounded-full font-sans font-semibold ${
                          rec.priority === 'high'
                            ? 'bg-error-200 text-error-800 border border-error-400'
                            : rec.priority === 'medium'
                            ? 'bg-warning-200 text-warning-800 border border-warning-400'
                            : 'bg-cream-300 text-charcoal-700 border border-cream-500'
                        }`}>
                          {getPriorityIcon(rec.priority)} {rec.priority.toUpperCase()}
                        </span>
                      </div>
                      {rec.intervention_type && (
                        <p className="font-sans text-sm text-charcoal-600">
                          <span className="font-semibold">Type:</span> {formatInterventionType(rec.intervention_type)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Interventions Timeline */}
        <div className="mb-8 animate-fade-in-up" style={{ animationDelay: '700ms' }}>
          <h2 className="font-display text-2xl font-bold text-gray-200 mb-4">Recent Interventions</h2>
          <div className="bg-cream-100 border-2 border-cream-300 rounded-xl overflow-hidden shadow-md">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-100 border-b-2 border-gray-300">
                  <tr>
                    <th className="text-left p-4 font-display font-semibold text-sm text-gray-700 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="text-left p-4 font-display font-semibold text-sm text-gray-700 uppercase tracking-wider">
                      Reservation
                    </th>
                    <th className="text-left p-4 font-display font-semibold text-sm text-gray-700 uppercase tracking-wider">
                      Risk
                    </th>
                    <th className="text-left p-4 font-display font-semibold text-sm text-gray-700 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="text-left p-4 font-display font-semibold text-sm text-gray-700 uppercase tracking-wider">
                      Outcome
                    </th>
                    <th className="text-right p-4 font-display font-semibold text-sm text-gray-700 uppercase tracking-wider">
                      ROI
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center">
                        <div className="flex flex-col items-center justify-center">
                          <div className="animate-spin rounded-full h-12 w-12 border-4 border-burgundy-200 border-t-burgundy-700 mb-4"></div>
                          <p className="font-sans text-charcoal-600 font-semibold">Loading interventions...</p>
                        </div>
                      </td>
                    </tr>
                  ) : mlData?.timeline && mlData.timeline.length > 0 ? (
                    mlData.timeline.slice(0, 15).map((intervention) => (
                      <tr key={intervention.id} className="border-b border-cream-300 hover:bg-cream-200 transition-colors duration-200">
                        <td className="p-4 font-sans text-sm text-charcoal-800">
                          {new Date(intervention.created_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </td>
                        <td className="p-4 font-mono text-sm font-medium text-charcoal-800">{intervention.reservation_id}</td>
                        <td className="p-4">
                          <span
                            className={`inline-block px-3 py-1 rounded-full text-xs font-sans font-semibold border ${getRiskBadgeColor(
                              intervention.risk_level
                            )}`}
                          >
                            {intervention.risk_level} ({intervention.risk_score})
                          </span>
                        </td>
                        <td className="p-4 font-sans text-sm text-charcoal-800">
                          {formatInterventionType(intervention.type)}
                        </td>
                        <td className="p-4">
                          <span
                            className={`inline-block px-3 py-1 rounded-full text-xs font-sans font-semibold border ${
                              intervention.outcome === 'showed_up'
                                ? 'bg-success-100 text-success-700 border-success-300'
                                : intervention.outcome === 'no_show'
                                ? 'bg-error-100 text-error-700 border-error-300'
                                : 'bg-warning-100 text-warning-700 border-warning-300'
                            }`}
                          >
                            {intervention.outcome === 'showed_up' ? '✓ ' : intervention.outcome === 'no_show' ? '✕ ' : ''}
                            {intervention.outcome.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          {intervention.roi !== null ? (
                            <span
                              className={`font-mono font-bold text-base ${
                                intervention.roi >= 300
                                  ? 'text-success-700'
                                  : intervention.roi >= 100
                                  ? 'text-warning-700'
                                  : 'text-error-700'
                              }`}
                            >
                              {intervention.roi}%
                            </span>
                          ) : (
                            <span className="font-mono text-charcoal-400">-</span>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="p-8 text-center font-sans text-charcoal-600">
                        No interventions tracked yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

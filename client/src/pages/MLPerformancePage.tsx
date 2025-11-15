import { useQuery } from '@tanstack/react-query';
import { TrendingUp, Target, AlertCircle, DollarSign, CheckCircle2, BarChart3 } from 'lucide-react';
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
    refetchInterval: 30000,
  });

  const mlData = data?.data;

  if (error) {
    return (
      <DashboardLayout>
        <div className="p-8">
          <div className="max-w-md mx-auto mt-12">
            <div className="bg-card border border-border rounded-lg p-8 text-center">
              <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-8 h-8 text-red-500" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-2">
                Connection Error
              </h3>
              <p className="text-sm text-muted-foreground">
                {error instanceof Error ? error.message : 'Unable to connect to analytics service'}
              </p>
            </div>
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
      low: 'bg-green-500/10 text-green-500 border-green-500/20',
      medium: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
      high: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
      'very-high': 'bg-red-500/10 text-red-500 border-red-500/20',
    };
    return colors[level] || colors.medium;
  };

  return (
    <DashboardLayout>
      <div className="p-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">No-Show Prevention & ROI</h1>
          <p className="text-muted-foreground">
            ML-driven intervention tracking · Last 30 days
          </p>
        </div>

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* Total ROI */}
          <div className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Target className="w-5 h-5 text-primary" />
              </div>
              {mlData?.summary?.meets_target && (
                <span className="text-xs font-semibold bg-green-500/10 text-green-500 px-2 py-1 rounded-full">
                  TARGET MET
                </span>
              )}
            </div>
            <div className="text-4xl font-bold text-foreground mb-1">
              {isLoading ? (
                <div className="h-10 w-24 bg-muted rounded animate-pulse" />
              ) : mlData?.summary ? (
                `${mlData.summary.total_roi}%`
              ) : (
                '-'
              )}
            </div>
            <div className="text-sm text-muted-foreground">Total ROI</div>
            {!mlData?.summary?.meets_target && (
              <div className="text-xs text-muted-foreground mt-2">Target: 300-500%</div>
            )}
          </div>

          {/* Total Interventions */}
          <div className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <TrendingUp className="w-5 h-5 text-blue-500" />
              </div>
              <span className="text-xs text-muted-foreground">30 DAYS</span>
            </div>
            <div className="text-4xl font-bold text-foreground mb-1">
              {isLoading ? (
                <div className="h-10 w-20 bg-muted rounded animate-pulse" />
              ) : (
                mlData?.summary?.total_interventions || '-'
              )}
            </div>
            <div className="text-sm text-muted-foreground">Interventions</div>
          </div>

          {/* Success Rate */}
          <div className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-green-500/10 rounded-lg">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              </div>
              {mlData?.summary && (
                <span className="text-xs text-muted-foreground">
                  {mlData.summary.outcomes.showed_up}/{mlData.summary.intervention_effectiveness.interventions_with_action}
                </span>
              )}
            </div>
            <div className="text-4xl font-bold text-green-500 mb-1">
              {isLoading ? (
                <div className="h-10 w-24 bg-muted rounded animate-pulse" />
              ) : (
                mlData?.summary?.intervention_effectiveness?.success_rate || '-'
              )}
            </div>
            <div className="text-sm text-muted-foreground">Success Rate</div>
          </div>

          {/* Value Saved */}
          <div className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-purple-500/10 rounded-lg">
                <DollarSign className="w-5 h-5 text-purple-500" />
              </div>
              {mlData?.summary && (
                <span className="text-xs text-muted-foreground">€{mlData.summary.total_cost} cost</span>
              )}
            </div>
            <div className="text-4xl font-bold text-foreground mb-1">
              {isLoading ? (
                <div className="h-10 w-28 bg-muted rounded animate-pulse" />
              ) : mlData?.summary ? (
                `€${mlData.summary.total_value_saved}`
              ) : (
                '-'
              )}
            </div>
            <div className="text-sm text-muted-foreground">Value Saved</div>
          </div>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* ROI Trend Chart */}
          <div className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-primary/10 rounded-lg">
                <BarChart3 className="w-5 h-5 text-primary" />
              </div>
              <h2 className="text-xl font-bold text-foreground">
                ROI Trend
              </h2>
              <span className="ml-auto text-xs text-muted-foreground">WEEKLY</span>
            </div>
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
                { key: 'ROI', label: 'ROI %', color: '#6366f1' },
                { key: 'Interventions', label: 'Interventions', color: '#8b5cf6' },
              ]}
              xAxisKey="week"
              height={300}
              loading={isLoading}
            />
          </div>

          {/* Intervention Breakdown */}
          <div className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-purple-500/10 rounded-lg">
                <BarChart3 className="w-5 h-5 text-purple-500" />
              </div>
              <h2 className="text-xl font-bold text-foreground">
                Type Breakdown
              </h2>
              <span className="ml-auto text-xs text-muted-foreground">ALL</span>
            </div>
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
                { key: 'ROI', label: 'ROI %', color: '#6366f1' },
                { key: 'Success Rate', label: 'Success %', color: '#10b981' },
              ]}
              xAxisKey="type"
              height={300}
              loading={isLoading}
            />
          </div>
        </div>

        {/* Recent Interventions Timeline */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-foreground">
              Top 5 Most Impactful Interventions
            </h2>
            {mlData?.timeline && mlData.timeline.length > 5 && (
              <span className="text-sm text-muted-foreground">
                Showing 5 of {mlData.timeline.length} total
              </span>
            )}
          </div>
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <th className="text-left p-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Date</th>
                    <th className="text-left p-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Reservation</th>
                    <th className="text-left p-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Risk</th>
                    <th className="text-left p-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Type</th>
                    <th className="text-left p-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Outcome</th>
                    <th className="text-right p-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">ROI</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={6} className="p-12 text-center">
                        <div className="flex flex-col items-center justify-center">
                          <div className="relative w-12 h-12 mb-4">
                            <div className="absolute inset-0 rounded-full border-4 border-muted"></div>
                            <div className="absolute inset-0 rounded-full border-4 border-t-primary animate-spin"></div>
                          </div>
                          <p className="text-muted-foreground font-semibold">Loading interventions...</p>
                        </div>
                      </td>
                    </tr>
                  ) : mlData?.timeline && mlData.timeline.length > 0 ? (
                    mlData.timeline.slice(0, 5).map((intervention) => (
                      <tr
                        key={intervention.id}
                        className="border-b border-border hover:bg-muted/30 transition-colors"
                      >
                        <td className="p-4 text-sm text-foreground">
                          {new Date(intervention.created_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </td>
                        <td className="p-4 text-sm font-mono font-bold text-foreground">{intervention.reservation_id}</td>
                        <td className="p-4">
                          <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold border ${getRiskBadgeColor(intervention.risk_level)}`}>
                            {intervention.risk_level} ({intervention.risk_score})
                          </span>
                        </td>
                        <td className="p-4 text-sm text-foreground">
                          {formatInterventionType(intervention.type)}
                        </td>
                        <td className="p-4">
                          <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold border ${
                            intervention.outcome === 'showed_up'
                              ? 'bg-green-500/10 text-green-500 border-green-500/20'
                              : intervention.outcome === 'no_show'
                              ? 'bg-red-500/10 text-red-500 border-red-500/20'
                              : 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20'
                          }`}>
                            {intervention.outcome === 'showed_up' ? '✓ ' : intervention.outcome === 'no_show' ? '✕ ' : ''}
                            {intervention.outcome.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          {intervention.roi !== null ? (
                            <span className={`font-mono font-bold text-base ${
                              intervention.roi >= 300
                                ? 'text-green-500'
                                : intervention.roi >= 100
                                ? 'text-primary'
                                : 'text-red-500'
                            }`}>
                              {intervention.roi}%
                            </span>
                          ) : (
                            <span className="font-mono text-muted-foreground">-</span>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="p-12 text-center text-muted-foreground">
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

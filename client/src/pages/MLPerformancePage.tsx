import { useQuery } from '@tanstack/react-query';
import { TrendingUp, Target, AlertCircle, DollarSign, CheckCircle2, Sparkles } from 'lucide-react';
import DashboardLayout from '../components/layout/DashboardLayout';
import MetricCard from '../components/common/MetricCard';
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
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-6 h-6 text-red-600" />
              <div>
                <h3 className="font-semibold text-red-600">Failed to load ML performance data</h3>
                <p className="text-sm text-red-600/80 mt-1">
                  {error instanceof Error ? error.message : 'Unknown error occurred'}
                </p>
              </div>
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
      low: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
      medium: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
      high: 'bg-red-500/10 text-red-600 border-red-500/20',
      'very-high': 'bg-red-700/10 text-red-700 border-red-700/20',
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
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">ML Performance Dashboard</h1>
          <p className="text-muted-foreground">
            Track AI-powered interventions and ROI over the last 30 days
          </p>
        </div>

        {/* Top Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <MetricCard
            title="Total ROI"
            value={mlData?.summary ? `${mlData.summary.total_roi}%` : '-'}
            subtitle={mlData?.summary?.meets_target ? 'Exceeding target!' : 'Target: 300-500%'}
            icon={<Target className="w-6 h-6" />}
            color={mlData?.summary?.meets_target ? 'emerald' : 'amber'}
            loading={isLoading}
          />

          <MetricCard
            title="Total Interventions"
            value={mlData?.summary?.total_interventions || '-'}
            subtitle="Last 30 days"
            icon={<TrendingUp className="w-6 h-6" />}
            color="blue"
            loading={isLoading}
          />

          <MetricCard
            title="Success Rate"
            value={mlData?.summary?.intervention_effectiveness?.success_rate || '-'}
            subtitle={
              mlData?.summary
                ? `${mlData.summary.outcomes.showed_up} showed / ${mlData.summary.intervention_effectiveness.interventions_with_action} with action`
                : undefined
            }
            icon={<CheckCircle2 className="w-6 h-6" />}
            color="emerald"
            loading={isLoading}
          />

          <MetricCard
            title="Value Saved"
            value={mlData?.summary ? `€${mlData.summary.total_value_saved}` : '-'}
            subtitle={mlData?.summary ? `Cost: €${mlData.summary.total_cost}` : undefined}
            icon={<DollarSign className="w-6 h-6" />}
            color="emerald"
            loading={isLoading}
          />
        </div>

        {/* ROI Trend Chart */}
        <div className="mb-8">
          <h2 className="text-xl font-bold text-foreground mb-4">ROI Trend (Weekly)</h2>
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
              { key: 'ROI', label: 'ROI %', color: '#10b981' },
              { key: 'Interventions', label: 'Interventions', color: '#3b82f6' },
            ]}
            xAxisKey="week"
            height={300}
            loading={isLoading}
          />
        </div>

        {/* Intervention Type Breakdown */}
        <div className="mb-8">
          <h2 className="text-xl font-bold text-foreground mb-4">Performance by Intervention Type</h2>
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
              { key: 'ROI', label: 'ROI %', color: '#10b981' },
              { key: 'Success Rate', label: 'Success Rate %', color: '#3b82f6' },
            ]}
            xAxisKey="type"
            height={350}
            loading={isLoading}
          />
        </div>

        {/* Smart Recommendations */}
        {mlData?.recommendations && mlData.recommendations.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-5 h-5 text-amber-500" />
              <h2 className="text-xl font-bold text-foreground">Smart Recommendations</h2>
            </div>
            <div className="grid gap-4">
              {mlData.recommendations.map((rec, index) => (
                <div
                  key={index}
                  className={`bg-card border rounded-xl p-4 ${
                    rec.priority === 'high'
                      ? 'border-red-500/20 bg-red-500/5'
                      : rec.priority === 'medium'
                      ? 'border-amber-500/20 bg-amber-500/5'
                      : 'border-border'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="text-2xl">{rec.icon}</div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-foreground">{rec.message}</h3>
                        <span className="text-xs px-2 py-1 rounded-full bg-muted">
                          {getPriorityIcon(rec.priority)} {rec.priority}
                        </span>
                      </div>
                      {rec.intervention_type && (
                        <p className="text-sm text-muted-foreground">
                          Type: {formatInterventionType(rec.intervention_type)}
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
        <div className="mb-8">
          <h2 className="text-xl font-bold text-foreground mb-4">Recent Interventions</h2>
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <th className="text-left p-4 font-semibold text-sm text-muted-foreground">
                      Date
                    </th>
                    <th className="text-left p-4 font-semibold text-sm text-muted-foreground">
                      Reservation
                    </th>
                    <th className="text-left p-4 font-semibold text-sm text-muted-foreground">
                      Risk
                    </th>
                    <th className="text-left p-4 font-semibold text-sm text-muted-foreground">
                      Type
                    </th>
                    <th className="text-left p-4 font-semibold text-sm text-muted-foreground">
                      Outcome
                    </th>
                    <th className="text-right p-4 font-semibold text-sm text-muted-foreground">
                      ROI
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-muted-foreground">
                        Loading interventions...
                      </td>
                    </tr>
                  ) : mlData?.timeline && mlData.timeline.length > 0 ? (
                    mlData.timeline.slice(0, 15).map((intervention) => (
                      <tr key={intervention.id} className="border-b border-border hover:bg-muted/30">
                        <td className="p-4 text-sm">
                          {new Date(intervention.created_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </td>
                        <td className="p-4 text-sm font-mono">{intervention.reservation_id}</td>
                        <td className="p-4">
                          <span
                            className={`inline-block px-2 py-1 rounded text-xs font-semibold border ${getRiskBadgeColor(
                              intervention.risk_level
                            )}`}
                          >
                            {intervention.risk_level} ({intervention.risk_score})
                          </span>
                        </td>
                        <td className="p-4 text-sm">
                          {formatInterventionType(intervention.type)}
                        </td>
                        <td className="p-4">
                          <span
                            className={`inline-block px-2 py-1 rounded text-xs font-semibold ${
                              intervention.outcome === 'showed_up'
                                ? 'bg-emerald-500/10 text-emerald-600'
                                : intervention.outcome === 'no_show'
                                ? 'bg-red-500/10 text-red-600'
                                : 'bg-amber-500/10 text-amber-600'
                            }`}
                          >
                            {intervention.outcome.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          {intervention.roi !== null ? (
                            <span
                              className={`font-semibold ${
                                intervention.roi >= 300
                                  ? 'text-emerald-600'
                                  : intervention.roi >= 100
                                  ? 'text-amber-600'
                                  : 'text-red-600'
                              }`}
                            >
                              {intervention.roi}%
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-muted-foreground">
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

import { useQuery } from '@tanstack/react-query';
import { TrendingUp, Target, AlertCircle, DollarSign, CheckCircle2, Sparkles, BarChart3, Activity } from 'lucide-react';
import { useEffect, useState } from 'react';
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
  const [scrollY, setScrollY] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

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
        <div className="min-h-screen flex items-center justify-center p-8">
          <div className="bg-white border-2 border-error-300 rounded-2xl p-12 max-w-md mx-auto animate-scale-in shadow-2xl">
            <div className="w-20 h-20 bg-error-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="w-10 h-10 text-error-600" />
            </div>
            <h3 className="font-display text-2xl font-bold text-slate-900 text-center mb-3">
              Connection Error
            </h3>
            <p className="font-sans text-sm text-slate-600 text-center mb-6 leading-relaxed">
              {error instanceof Error ? error.message : 'Unable to connect to analytics service'}
            </p>
            <button className="w-full px-8 py-4 bg-slate-900 hover:bg-slate-800 text-white font-sans font-bold rounded-xl transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl">
              Retry Connection
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
      low: 'bg-success-50 text-success-700 border-success-200',
      medium: 'bg-warning-50 text-warning-700 border-warning-200',
      high: 'bg-error-50 text-error-700 border-error-200',
      'very-high': 'bg-error-100 text-error-800 border-error-300',
    };
    return colors[level] || colors.medium;
  };

  const getPriorityIcon = (priority: string) => {
    return priority === 'high' ? '🔥' : priority === 'medium' ? '⚠️' : 'ℹ️';
  };

  return (
    <DashboardLayout>
      {/* Subtle Animated Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden bg-gradient-to-br from-slate-50 via-white to-slate-50">
        <div
          className="absolute inset-0 opacity-40"
          style={{
            background: `
              radial-gradient(circle at ${20 + scrollY * 0.05}% ${20 + scrollY * 0.03}%, rgba(15, 23, 42, 0.03) 0%, transparent 50%),
              radial-gradient(circle at ${80 - scrollY * 0.03}% ${10 + scrollY * 0.02}%, rgba(217, 119, 6, 0.04) 0%, transparent 50%),
              radial-gradient(circle at ${40 + scrollY * 0.02}% ${80 - scrollY * 0.04}%, rgba(5, 150, 105, 0.03) 0%, transparent 50%)
            `
          }}
        />
      </div>

      <div className="relative z-10 p-4 sm:p-6 lg:p-8 max-w-[1800px] mx-auto">
        {/* Professional Header */}
        <div
          className={`mb-12 transform transition-all duration-1000 ${
            isVisible ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'
          }`}
        >
          <div className="inline-flex items-center gap-3 mb-4 px-4 py-2 bg-white border border-slate-200 rounded-full shadow-sm">
            <Activity className="w-4 h-4 text-slate-600" />
            <span className="font-mono text-xs text-slate-600 font-semibold tracking-wider uppercase">Machine Learning Analytics</span>
          </div>
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold text-slate-900 mb-4">
            AI Performance Dashboard
          </h1>
          <p className="font-sans text-base sm:text-lg text-slate-600 max-w-3xl leading-relaxed">
            Real-time insights powered by machine learning · Last 30 days
          </p>
        </div>

        {/* Metrics Grid - Professional Clean Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-12">
          {/* Total ROI - Primary Metric */}
          <div
            className={`group relative bg-white border-2 border-slate-200 hover:border-amber-400 rounded-2xl p-6 sm:p-8 shadow-sm hover:shadow-xl transition-all duration-500 transform hover:-translate-y-1 cursor-pointer ${
              isVisible ? 'animate-fade-in-up' : 'opacity-0'
            }`}
            style={{ animationDelay: '0ms' }}
          >
            <div className="flex items-center justify-between mb-6">
              <div className="p-3 bg-amber-50 rounded-xl group-hover:scale-110 transition-transform duration-300">
                <Target className="w-6 h-6 text-amber-600" />
              </div>
              {mlData?.summary?.meets_target ? (
                <span className="px-3 py-1.5 bg-amber-50 text-amber-700 font-sans font-bold text-xs rounded-full border border-amber-200">
                  ⭐ TARGET MET
                </span>
              ) : (
                <span className="font-mono text-xs text-slate-500 bg-slate-50 px-3 py-1 rounded-full">300-500%</span>
              )}
            </div>
            <div className="font-mono text-5xl sm:text-6xl font-black text-amber-600 mb-3 group-hover:scale-105 transition-transform duration-300">
              {isLoading ? (
                <div className="h-16 w-32 bg-slate-100 rounded-lg animate-pulse" />
              ) : mlData?.summary ? (
                `${mlData.summary.total_roi}%`
              ) : (
                '-'
              )}
            </div>
            <div className="font-sans text-sm text-slate-600 font-semibold tracking-wide">Total ROI</div>
          </div>

          {/* Total Interventions - Navy Theme */}
          <div
            className={`group relative bg-white border-2 border-slate-200 hover:border-slate-400 rounded-2xl p-6 sm:p-8 shadow-sm hover:shadow-xl transition-all duration-500 transform hover:-translate-y-1 cursor-pointer ${
              isVisible ? 'animate-fade-in-up' : 'opacity-0'
            }`}
            style={{ animationDelay: '100ms' }}
          >
            <div className="flex items-center justify-between mb-6">
              <div className="p-3 bg-slate-50 rounded-xl group-hover:scale-110 transition-transform duration-300">
                <TrendingUp className="w-6 h-6 text-slate-700" />
              </div>
              <span className="font-mono text-xs text-slate-500 bg-slate-50 px-3 py-1 rounded-full">30 DAYS</span>
            </div>
            <div className="font-mono text-5xl sm:text-6xl font-black text-slate-900 mb-3 group-hover:scale-105 transition-transform duration-300">
              {isLoading ? (
                <div className="h-16 w-24 bg-slate-100 rounded-lg animate-pulse" />
              ) : (
                mlData?.summary?.total_interventions || '-'
              )}
            </div>
            <div className="font-sans text-sm text-slate-600 font-semibold tracking-wide">Interventions</div>
          </div>

          {/* Success Rate - Emerald Theme */}
          <div
            className={`group relative bg-white border-2 border-slate-200 hover:border-success-400 rounded-2xl p-6 sm:p-8 shadow-sm hover:shadow-xl transition-all duration-500 transform hover:-translate-y-1 cursor-pointer ${
              isVisible ? 'animate-fade-in-up' : 'opacity-0'
            }`}
            style={{ animationDelay: '200ms' }}
          >
            <div className="flex items-center justify-between mb-6">
              <div className="p-3 bg-success-50 rounded-xl group-hover:scale-110 transition-transform duration-300">
                <CheckCircle2 className="w-6 h-6 text-success-600" />
              </div>
              {mlData?.summary && (
                <span className="font-mono text-xs text-slate-500 bg-slate-50 px-3 py-1 rounded-full">
                  {mlData.summary.outcomes.showed_up}/{mlData.summary.intervention_effectiveness.interventions_with_action}
                </span>
              )}
            </div>
            <div className="font-mono text-5xl sm:text-6xl font-black text-success-600 mb-3 group-hover:scale-105 transition-transform duration-300">
              {isLoading ? (
                <div className="h-16 w-28 bg-slate-100 rounded-lg animate-pulse" />
              ) : (
                mlData?.summary?.intervention_effectiveness?.success_rate || '-'
              )}
            </div>
            <div className="font-sans text-sm text-slate-600 font-semibold tracking-wide">Success Rate</div>
          </div>

          {/* Value Saved - Gold Theme */}
          <div
            className={`group relative bg-white border-2 border-slate-200 hover:border-amber-300 rounded-2xl p-6 sm:p-8 shadow-sm hover:shadow-xl transition-all duration-500 transform hover:-translate-y-1 cursor-pointer ${
              isVisible ? 'animate-fade-in-up' : 'opacity-0'
            }`}
            style={{ animationDelay: '300ms' }}
          >
            <div className="flex items-center justify-between mb-6">
              <div className="p-3 bg-amber-50 rounded-xl group-hover:scale-110 transition-transform duration-300">
                <DollarSign className="w-6 h-6 text-amber-600" />
              </div>
              {mlData?.summary && (
                <span className="font-mono text-xs text-slate-500 bg-slate-50 px-3 py-1 rounded-full">€{mlData.summary.total_cost}</span>
              )}
            </div>
            <div className="font-mono text-5xl sm:text-6xl font-black text-amber-600 mb-3 group-hover:scale-105 transition-transform duration-300">
              {isLoading ? (
                <div className="h-16 w-32 bg-slate-100 rounded-lg animate-pulse" />
              ) : mlData?.summary ? (
                `€${mlData.summary.total_value_saved}`
              ) : (
                '-'
              )}
            </div>
            <div className="font-sans text-sm text-slate-600 font-semibold tracking-wide">Value Saved</div>
          </div>
        </div>

        {/* Charts Section - Side by Side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-12">
          {/* ROI Trend Chart */}
          <div
            className={`transform transition-all duration-1000 ${
              isVisible ? 'translate-x-0 opacity-100' : '-translate-x-10 opacity-0'
            }`}
            style={{ transitionDelay: '400ms' }}
          >
            <div className="bg-white border-2 border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm hover:shadow-lg transition-all duration-300">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-slate-50 rounded-lg">
                  <BarChart3 className="w-5 h-5 text-slate-700" />
                </div>
                <h2 className="font-display text-xl sm:text-2xl font-bold text-slate-900">
                  ROI Trend
                </h2>
                <span className="ml-auto font-mono text-xs text-slate-500 bg-slate-50 px-3 py-1 rounded-full">WEEKLY</span>
              </div>
              <div className="bg-slate-50 rounded-xl p-4">
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
                    { key: 'ROI', label: 'ROI %', color: '#d97706' },
                    { key: 'Interventions', label: 'Interventions', color: '#334155' },
                  ]}
                  xAxisKey="week"
                  height={300}
                  loading={isLoading}
                />
              </div>
            </div>
          </div>

          {/* Intervention Breakdown */}
          <div
            className={`transform transition-all duration-1000 ${
              isVisible ? 'translate-x-0 opacity-100' : 'translate-x-10 opacity-0'
            }`}
            style={{ transitionDelay: '500ms' }}
          >
            <div className="bg-white border-2 border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm hover:shadow-lg transition-all duration-300">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-slate-50 rounded-lg">
                  <Activity className="w-5 h-5 text-slate-700" />
                </div>
                <h2 className="font-display text-xl sm:text-2xl font-bold text-slate-900">
                  Type Breakdown
                </h2>
                <span className="ml-auto font-mono text-xs text-slate-500 bg-slate-50 px-3 py-1 rounded-full">ALL</span>
              </div>
              <div className="bg-slate-50 rounded-xl p-4">
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
                    { key: 'ROI', label: 'ROI %', color: '#d97706' },
                    { key: 'Success Rate', label: 'Success %', color: '#059669' },
                  ]}
                  xAxisKey="type"
                  height={300}
                  loading={isLoading}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Smart Recommendations */}
        {mlData?.recommendations && mlData.recommendations.length > 0 && (
          <div
            className={`mb-12 transform transition-all duration-1000 ${
              isVisible ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'
            }`}
            style={{ transitionDelay: '600ms' }}
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-amber-50 rounded-lg">
                <Sparkles className="w-5 h-5 text-amber-600" />
              </div>
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
                AI Recommendations
              </h2>
            </div>
            <div className="grid gap-4">
              {mlData.recommendations.map((rec, index) => (
                <div
                  key={index}
                  className={`bg-white border-2 rounded-2xl p-6 transition-all duration-300 transform hover:-translate-y-1 cursor-pointer ${
                    rec.priority === 'high'
                      ? 'border-error-200 hover:border-error-400 hover:shadow-lg'
                      : rec.priority === 'medium'
                      ? 'border-warning-200 hover:border-warning-400 hover:shadow-lg'
                      : 'border-slate-200 hover:border-slate-400 hover:shadow-lg'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className="text-3xl">{rec.icon}</div>
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-3 mb-2">
                        <h3 className="font-sans font-bold text-base sm:text-lg text-slate-900">{rec.message}</h3>
                        <span className={`text-xs px-3 py-1.5 rounded-full font-sans font-bold ${
                          rec.priority === 'high'
                            ? 'bg-error-50 text-error-700 border-2 border-error-200'
                            : rec.priority === 'medium'
                            ? 'bg-warning-50 text-warning-700 border-2 border-warning-200'
                            : 'bg-slate-50 text-slate-700 border-2 border-slate-200'
                        }`}>
                          {getPriorityIcon(rec.priority)} {rec.priority.toUpperCase()}
                        </span>
                      </div>
                      {rec.intervention_type && (
                        <p className="font-sans text-sm text-slate-600">
                          <span className="font-semibold text-slate-700">Type:</span> {formatInterventionType(rec.intervention_type)}
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
        <div
          className={`transform transition-all duration-1000 ${
            isVisible ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'
          }`}
          style={{ transitionDelay: '800ms' }}
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-slate-50 rounded-lg">
              <TrendingUp className="w-5 h-5 text-slate-700" />
            </div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
              Recent Activity
            </h2>
          </div>
          <div className="bg-white border-2 border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b-2 border-slate-200">
                  <tr>
                    <th className="text-left p-4 font-display font-bold text-xs text-slate-700 uppercase tracking-wider">Date</th>
                    <th className="text-left p-4 font-display font-bold text-xs text-slate-700 uppercase tracking-wider">Reservation</th>
                    <th className="text-left p-4 font-display font-bold text-xs text-slate-700 uppercase tracking-wider">Risk</th>
                    <th className="text-left p-4 font-display font-bold text-xs text-slate-700 uppercase tracking-wider">Type</th>
                    <th className="text-left p-4 font-display font-bold text-xs text-slate-700 uppercase tracking-wider">Outcome</th>
                    <th className="text-right p-4 font-display font-bold text-xs text-slate-700 uppercase tracking-wider">ROI</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={6} className="p-12 text-center">
                        <div className="flex flex-col items-center justify-center">
                          <div className="relative w-12 h-12 mb-4">
                            <div className="absolute inset-0 rounded-full border-4 border-slate-200"></div>
                            <div className="absolute inset-0 rounded-full border-4 border-t-slate-900 animate-spin"></div>
                          </div>
                          <p className="font-sans text-slate-600 font-semibold">Loading interventions...</p>
                        </div>
                      </td>
                    </tr>
                  ) : mlData?.timeline && mlData.timeline.length > 0 ? (
                    mlData.timeline.slice(0, 15).map((intervention) => (
                      <tr
                        key={intervention.id}
                        className="border-b border-slate-100 hover:bg-slate-50 transition-colors duration-200"
                      >
                        <td className="p-4 font-sans text-sm text-slate-700">
                          {new Date(intervention.created_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </td>
                        <td className="p-4 font-mono text-sm font-bold text-slate-900">{intervention.reservation_id}</td>
                        <td className="p-4">
                          <span className={`inline-block px-3 py-1 rounded-full text-xs font-sans font-bold border ${getRiskBadgeColor(intervention.risk_level)}`}>
                            {intervention.risk_level} ({intervention.risk_score})
                          </span>
                        </td>
                        <td className="p-4 font-sans text-sm text-slate-700">
                          {formatInterventionType(intervention.type)}
                        </td>
                        <td className="p-4">
                          <span className={`inline-block px-3 py-1 rounded-full text-xs font-sans font-bold border ${
                            intervention.outcome === 'showed_up'
                              ? 'bg-success-50 text-success-700 border-success-200'
                              : intervention.outcome === 'no_show'
                              ? 'bg-error-50 text-error-700 border-error-200'
                              : 'bg-warning-50 text-warning-700 border-warning-200'
                          }`}>
                            {intervention.outcome === 'showed_up' ? '✓ ' : intervention.outcome === 'no_show' ? '✕ ' : ''}
                            {intervention.outcome.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          {intervention.roi !== null ? (
                            <span className={`font-mono font-black text-base ${
                              intervention.roi >= 300
                                ? 'text-success-600'
                                : intervention.roi >= 100
                                ? 'text-amber-600'
                                : 'text-error-600'
                            }`}>
                              {intervention.roi}%
                            </span>
                          ) : (
                            <span className="font-mono text-slate-400">-</span>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="p-12 text-center font-sans text-slate-500">
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

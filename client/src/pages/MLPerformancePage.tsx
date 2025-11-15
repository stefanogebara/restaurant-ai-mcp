import { useQuery } from '@tanstack/react-query';
import { TrendingUp, Target, AlertCircle, DollarSign, CheckCircle2, BarChart3, Activity } from 'lucide-react';
import { useEffect, useState } from 'react';
import DashboardLayout from '../components/layout/DashboardLayout';
import TrendChart from '../components/common/TrendChart';
import { api } from '../services/api';
import '../landing/styles/glass-morphism.css';

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
        <div className="min-h-screen flex items-center justify-center p-8 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900">
          <div className="glass-card p-12 max-w-md mx-auto">
            <div className="w-20 h-20 glass rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="w-10 h-10 text-red-400" />
            </div>
            <h3 className="text-2xl font-bold text-white text-center mb-3">
              Connection Error
            </h3>
            <p className="text-sm text-slate-300 text-center mb-6 leading-relaxed">
              {error instanceof Error ? error.message : 'Unable to connect to analytics service'}
            </p>
            <button className="glass-button-primary w-full px-8 py-4 text-white font-bold rounded-xl transition-all duration-300">
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
      {/* Glass-morphism Animated Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900">
        <div
          className="absolute inset-0 opacity-30"
          style={{
            background: `
              radial-gradient(circle at ${20 + scrollY * 0.05}% ${20 + scrollY * 0.03}%, rgba(99, 102, 241, 0.15) 0%, transparent 50%),
              radial-gradient(circle at ${80 - scrollY * 0.03}% ${10 + scrollY * 0.02}%, rgba(139, 92, 246, 0.15) 0%, transparent 50%),
              radial-gradient(circle at ${40 + scrollY * 0.02}% ${80 - scrollY * 0.04}%, rgba(16, 185, 129, 0.1) 0%, transparent 50%)
            `
          }}
        />
      </div>

      <div className="relative z-10 p-4 sm:p-6 lg:p-8 max-w-[1800px] mx-auto">
        {/* Modern Glass Header */}
        <div
          className={`mb-12 transform transition-all duration-1000 ${
            isVisible ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'
          }`}
        >
          <div className="glass inline-flex items-center gap-3 mb-4 px-4 py-2 rounded-full">
            <Activity className="w-4 h-4 text-indigo-400" />
            <span className="text-xs text-slate-300 font-semibold tracking-wider uppercase">No-Show Prevention</span>
          </div>
          <h1 className="gradient-text text-4xl sm:text-5xl lg:text-6xl font-bold mb-4">
            Intervention ROI Dashboard
          </h1>
          <p className="text-base sm:text-lg text-slate-300 max-w-3xl leading-relaxed">
            Real-time ML-driven intervention tracking · Last 30 days
          </p>
        </div>

        {/* Metrics Grid - Glass Morphism Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-12">
          {/* Total ROI - Primary Metric */}
          <div
            className={`glass-card group relative p-6 sm:p-8 transform hover:-translate-y-1 cursor-pointer ${
              isVisible ? 'animate-fade-in-up' : 'opacity-0'
            }`}
            style={{ animationDelay: '0ms' }}
          >
            <div className="flex items-center justify-between mb-6">
              <div className="p-3 glass rounded-xl group-hover:scale-110 transition-transform duration-300">
                <Target className="w-6 h-6 text-indigo-400" />
              </div>
              {mlData?.summary?.meets_target ? (
                <span className="glass px-3 py-1.5 text-emerald-400 font-bold text-xs rounded-full">
                  ⭐ TARGET MET
                </span>
              ) : (
                <span className="glass text-xs text-slate-400 px-3 py-1 rounded-full">300-500%</span>
              )}
            </div>
            <div className="gradient-text text-5xl sm:text-6xl font-black mb-3 group-hover:scale-105 transition-transform duration-300">
              {isLoading ? (
                <div className="h-16 w-32 glass rounded-lg animate-pulse" />
              ) : mlData?.summary ? (
                `${mlData.summary.total_roi}%`
              ) : (
                '-'
              )}
            </div>
            <div className="text-sm text-slate-300 font-semibold tracking-wide">Total ROI</div>
          </div>

          {/* Total Interventions - Purple Theme */}
          <div
            className={`glass-card group relative p-6 sm:p-8 transform hover:-translate-y-1 cursor-pointer ${
              isVisible ? 'animate-fade-in-up' : 'opacity-0'
            }`}
            style={{ animationDelay: '100ms' }}
          >
            <div className="flex items-center justify-between mb-6">
              <div className="p-3 glass rounded-xl group-hover:scale-110 transition-transform duration-300">
                <TrendingUp className="w-6 h-6 text-purple-400" />
              </div>
              <span className="glass text-xs text-slate-400 px-3 py-1 rounded-full">30 DAYS</span>
            </div>
            <div className="text-5xl sm:text-6xl font-black text-white mb-3 group-hover:scale-105 transition-transform duration-300">
              {isLoading ? (
                <div className="h-16 w-24 glass rounded-lg animate-pulse" />
              ) : (
                mlData?.summary?.total_interventions || '-'
              )}
            </div>
            <div className="text-sm text-slate-300 font-semibold tracking-wide">Interventions</div>
          </div>

          {/* Success Rate - Emerald Theme */}
          <div
            className={`glass-card group relative p-6 sm:p-8 transform hover:-translate-y-1 cursor-pointer ${
              isVisible ? 'animate-fade-in-up' : 'opacity-0'
            }`}
            style={{ animationDelay: '200ms' }}
          >
            <div className="flex items-center justify-between mb-6">
              <div className="p-3 glass rounded-xl group-hover:scale-110 transition-transform duration-300">
                <CheckCircle2 className="w-6 h-6 text-emerald-400" />
              </div>
              {mlData?.summary && (
                <span className="glass text-xs text-slate-400 px-3 py-1 rounded-full">
                  {mlData.summary.outcomes.showed_up}/{mlData.summary.intervention_effectiveness.interventions_with_action}
                </span>
              )}
            </div>
            <div className="gradient-text-emerald text-5xl sm:text-6xl font-black mb-3 group-hover:scale-105 transition-transform duration-300">
              {isLoading ? (
                <div className="h-16 w-28 glass rounded-lg animate-pulse" />
              ) : (
                mlData?.summary?.intervention_effectiveness?.success_rate || '-'
              )}
            </div>
            <div className="text-sm text-slate-300 font-semibold tracking-wide">Success Rate</div>
          </div>

          {/* Value Saved - Indigo Theme */}
          <div
            className={`glass-card group relative p-6 sm:p-8 transform hover:-translate-y-1 cursor-pointer ${
              isVisible ? 'animate-fade-in-up' : 'opacity-0'
            }`}
            style={{ animationDelay: '300ms' }}
          >
            <div className="flex items-center justify-between mb-6">
              <div className="p-3 glass rounded-xl group-hover:scale-110 transition-transform duration-300">
                <DollarSign className="w-6 h-6 text-indigo-400" />
              </div>
              {mlData?.summary && (
                <span className="glass text-xs text-slate-400 px-3 py-1 rounded-full">€{mlData.summary.total_cost}</span>
              )}
            </div>
            <div className="text-5xl sm:text-6xl font-black text-indigo-400 mb-3 group-hover:scale-105 transition-transform duration-300">
              {isLoading ? (
                <div className="h-16 w-32 glass rounded-lg animate-pulse" />
              ) : mlData?.summary ? (
                `€${mlData.summary.total_value_saved}`
              ) : (
                '-'
              )}
            </div>
            <div className="text-sm text-slate-300 font-semibold tracking-wide">Value Saved</div>
          </div>
        </div>

        {/* Charts Section - Glass Morphism */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-12">
          {/* ROI Trend Chart */}
          <div
            className={`transform transition-all duration-1000 ${
              isVisible ? 'translate-x-0 opacity-100' : '-translate-x-10 opacity-0'
            }`}
            style={{ transitionDelay: '400ms' }}
          >
            <div className="glass-card p-6 sm:p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 glass rounded-lg">
                  <BarChart3 className="w-5 h-5 text-indigo-400" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-white">
                  ROI Trend
                </h2>
                <span className="ml-auto glass text-xs text-slate-400 px-3 py-1 rounded-full">WEEKLY</span>
              </div>
              <div className="glass rounded-xl p-4">
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
            </div>
          </div>

          {/* Intervention Breakdown */}
          <div
            className={`transform transition-all duration-1000 ${
              isVisible ? 'translate-x-0 opacity-100' : 'translate-x-10 opacity-0'
            }`}
            style={{ transitionDelay: '500ms' }}
          >
            <div className="glass-card p-6 sm:p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 glass rounded-lg">
                  <Activity className="w-5 h-5 text-purple-400" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-white">
                  Type Breakdown
                </h2>
                <span className="ml-auto glass text-xs text-slate-400 px-3 py-1 rounded-full">ALL</span>
              </div>
              <div className="glass rounded-xl p-4">
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
          </div>
        </div>

        {/* AI Recommendations Section Removed - Not actionable without real-time context */}

        {/* Recent Interventions Timeline - TOP 5 Most Impactful */}
        <div
          className={`transform transition-all duration-1000 ${
            isVisible ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'
          }`}
          style={{ transitionDelay: '800ms' }}
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 glass rounded-lg">
                <TrendingUp className="w-5 h-5 text-indigo-400" />
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-white">
                Top 5 Most Impactful Interventions
              </h2>
            </div>
            {mlData?.timeline && mlData.timeline.length > 5 && (
              <span className="text-sm text-slate-400">
                Showing 5 of {mlData.timeline.length} total
              </span>
            )}
          </div>
          <div className="glass-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="glass border-b border-white/10">
                  <tr>
                    <th className="text-left p-4 font-bold text-xs text-slate-300 uppercase tracking-wider">Date</th>
                    <th className="text-left p-4 font-bold text-xs text-slate-300 uppercase tracking-wider">Reservation</th>
                    <th className="text-left p-4 font-bold text-xs text-slate-300 uppercase tracking-wider">Risk</th>
                    <th className="text-left p-4 font-bold text-xs text-slate-300 uppercase tracking-wider">Type</th>
                    <th className="text-left p-4 font-bold text-xs text-slate-300 uppercase tracking-wider">Outcome</th>
                    <th className="text-right p-4 font-bold text-xs text-slate-300 uppercase tracking-wider">ROI</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={6} className="p-12 text-center">
                        <div className="flex flex-col items-center justify-center">
                          <div className="relative w-12 h-12 mb-4">
                            <div className="absolute inset-0 rounded-full border-4 border-white/10"></div>
                            <div className="absolute inset-0 rounded-full border-4 border-t-indigo-500 animate-spin"></div>
                          </div>
                          <p className="text-slate-300 font-semibold">Loading interventions...</p>
                        </div>
                      </td>
                    </tr>
                  ) : mlData?.timeline && mlData.timeline.length > 0 ? (
                    mlData.timeline.slice(0, 5).map((intervention) => (
                      <tr
                        key={intervention.id}
                        className="border-b border-white/5 hover:bg-white/5 transition-colors duration-200"
                      >
                        <td className="p-4 text-sm text-slate-300">
                          {new Date(intervention.created_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </td>
                        <td className="p-4 font-mono text-sm font-bold text-white">{intervention.reservation_id}</td>
                        <td className="p-4">
                          <span className={`glass inline-block px-3 py-1 rounded-full text-xs font-bold ${
                            intervention.risk_level === 'low' ? 'text-emerald-400' :
                            intervention.risk_level === 'medium' ? 'text-yellow-400' :
                            intervention.risk_level === 'high' ? 'text-orange-400' :
                            'text-red-400'
                          }`}>
                            {intervention.risk_level} ({intervention.risk_score})
                          </span>
                        </td>
                        <td className="p-4 text-sm text-slate-300">
                          {formatInterventionType(intervention.type)}
                        </td>
                        <td className="p-4">
                          <span className={`glass inline-block px-3 py-1 rounded-full text-xs font-bold ${
                            intervention.outcome === 'showed_up'
                              ? 'text-emerald-400'
                              : intervention.outcome === 'no_show'
                              ? 'text-red-400'
                              : 'text-yellow-400'
                          }`}>
                            {intervention.outcome === 'showed_up' ? '✓ ' : intervention.outcome === 'no_show' ? '✕ ' : ''}
                            {intervention.outcome.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          {intervention.roi !== null ? (
                            <span className={`font-mono font-black text-base ${
                              intervention.roi >= 300
                                ? 'text-emerald-400'
                                : intervention.roi >= 100
                                ? 'text-indigo-400'
                                : 'text-red-400'
                            }`}>
                              {intervention.roi}%
                            </span>
                          ) : (
                            <span className="font-mono text-slate-500">-</span>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="p-12 text-center text-slate-400">
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

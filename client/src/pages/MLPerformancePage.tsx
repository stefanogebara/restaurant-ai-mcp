import { useQuery } from '@tanstack/react-query';
import { TrendingUp, Target, AlertCircle, DollarSign, CheckCircle2, Sparkles, Zap, TrendingDown, BarChart3 } from 'lucide-react';
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
          <div className="bg-gradient-to-br from-error-500/10 via-error-600/5 to-error-700/10 backdrop-blur-xl border-2 border-error-500/30 rounded-3xl p-12 max-w-md mx-auto animate-scale-in shadow-2xl">
            <div className="w-20 h-20 bg-gradient-to-br from-error-500 to-error-700 rounded-full flex items-center justify-center mx-auto mb-6 shadow-glow-violet animate-pulse-glow">
              <AlertCircle className="w-10 h-10 text-white" />
            </div>
            <h3 className="font-display text-2xl font-bold text-white text-center mb-3 drop-shadow-lg">
              Connection Error
            </h3>
            <p className="font-sans text-sm text-slate-300 text-center mb-6 leading-relaxed">
              {error instanceof Error ? error.message : 'Unable to connect to analytics service'}
            </p>
            <button className="w-full px-8 py-4 bg-gradient-to-r from-error-600 to-error-700 hover:from-error-500 hover:to-error-600 text-white font-sans font-bold rounded-xl transition-all duration-300 transform hover:scale-105 hover:shadow-glow-violet">
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
      low: 'bg-gradient-to-r from-success-500/20 to-success-600/20 text-success-300 border-success-500/50',
      medium: 'bg-gradient-to-r from-warning-500/20 to-warning-600/20 text-warning-300 border-warning-500/50',
      high: 'bg-gradient-to-r from-error-500/20 to-error-600/20 text-error-300 border-error-500/50',
      'very-high': 'bg-gradient-to-r from-error-600/30 to-error-700/30 text-error-200 border-error-600/60',
    };
    return colors[level] || colors.medium;
  };

  const getPriorityIcon = (priority: string) => {
    return priority === 'high' ? '🔥' : priority === 'medium' ? '⚠️' : 'ℹ️';
  };

  return (
    <DashboardLayout>
      {/* Animated Background Gradient Mesh */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute inset-0 opacity-30"
          style={{
            background: `
              radial-gradient(circle at ${20 + scrollY * 0.05}% ${20 + scrollY * 0.03}%, rgba(147, 51, 234, 0.15) 0%, transparent 50%),
              radial-gradient(circle at ${80 - scrollY * 0.03}% ${10 + scrollY * 0.02}%, rgba(2, 132, 199, 0.15) 0%, transparent 50%),
              radial-gradient(circle at ${40 + scrollY * 0.02}% ${80 - scrollY * 0.04}%, rgba(217, 119, 6, 0.12) 0%, transparent 50%),
              radial-gradient(circle at ${70 - scrollY * 0.04}% ${60 + scrollY * 0.03}%, rgba(5, 150, 105, 0.1) 0%, transparent 50%)
            `
          }}
        />
      </div>

      <div className="relative z-10 p-4 sm:p-6 lg:p-8 max-w-[1800px] mx-auto">
        {/* Hero Header with Floating Animation */}
        <div
          className={`mb-12 text-center transform transition-all duration-1000 ${
            isVisible ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'
          }`}
        >
          <div className="inline-flex items-center gap-3 mb-4 px-6 py-3 bg-gradient-to-r from-violet-500/10 via-ocean-500/10 to-violet-500/10 backdrop-blur-sm border border-violet-500/30 rounded-full animate-pulse-glow">
            <Sparkles className="w-5 h-5 text-violet-400 animate-bounce-subtle" />
            <span className="font-mono text-sm text-violet-300 font-bold tracking-wider">MACHINE LEARNING ANALYTICS</span>
            <Zap className="w-5 h-5 text-amber-400 animate-bounce-subtle" />
          </div>
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold bg-gradient-to-r from-violet-400 via-ocean-400 to-amber-400 bg-clip-text text-transparent mb-4 drop-shadow-2xl">
            AI Performance Dashboard
          </h1>
          <p className="font-sans text-base sm:text-lg lg:text-xl text-slate-400 max-w-3xl mx-auto leading-relaxed">
            Real-time insights powered by machine learning • Last 30 days
          </p>
        </div>

        {/* Top Metrics - Creative Bento Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-12">
          {/* Total ROI - Hero Metric with 3D Effect */}
          <div
            className={`group relative bg-gradient-to-br from-violet-900/40 via-violet-800/30 to-violet-900/40 backdrop-blur-xl border-2 border-violet-500/30 hover:border-violet-400/60 rounded-2xl p-6 sm:p-8 shadow-2xl hover:shadow-glow-violet transition-all duration-500 transform hover:-translate-y-2 hover:scale-105 cursor-pointer overflow-hidden ${
              isVisible ? 'animate-fade-in-up' : 'opacity-0'
            }`}
            style={{
              animationDelay: '0ms',
              transform: `perspective(1000px) rotateX(${scrollY * 0.01}deg)`
            }}
          >
            {/* Animated Background Orb */}
            <div className="absolute -top-20 -right-20 w-40 h-40 bg-violet-500/20 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-700" />

            <div className="relative z-10">
              <div className="flex items-center justify-between mb-6">
                <div className="p-4 bg-violet-500/20 rounded-2xl group-hover:rotate-12 transition-transform duration-300 shadow-lg">
                  <Target className="w-8 h-8 text-violet-300" />
                </div>
                {mlData?.summary?.meets_target ? (
                  <span className="px-4 py-2 bg-gradient-to-r from-violet-500/30 to-violet-600/30 text-violet-200 font-sans font-bold text-xs rounded-full border-2 border-violet-400/50 shadow-glow-violet animate-pulse-glow backdrop-blur-sm">
                    ⭐ TARGET MET
                  </span>
                ) : (
                  <span className="font-mono text-xs text-slate-500 bg-slate-800/50 px-3 py-1 rounded-full">300-500%</span>
                )}
              </div>
              <div className="font-mono text-5xl sm:text-6xl lg:text-7xl font-black bg-gradient-to-br from-violet-300 via-violet-200 to-violet-400 bg-clip-text text-transparent mb-3 group-hover:scale-110 transition-transform duration-300">
                {isLoading ? (
                  <div className="h-16 w-32 bg-violet-500/20 rounded-lg animate-pulse" />
                ) : mlData?.summary ? (
                  `${mlData.summary.total_roi}%`
                ) : (
                  '-'
                )}
              </div>
              <div className="font-sans text-sm sm:text-base text-violet-300/80 font-semibold tracking-wide uppercase">Total ROI</div>
            </div>
          </div>

          {/* Total Interventions - Ocean Theme */}
          <div
            className={`group relative bg-gradient-to-br from-ocean-900/40 via-ocean-800/30 to-ocean-900/40 backdrop-blur-xl border-2 border-ocean-500/30 hover:border-ocean-400/60 rounded-2xl p-6 sm:p-8 shadow-2xl hover:shadow-glow-ocean transition-all duration-500 transform hover:-translate-y-2 hover:scale-105 cursor-pointer overflow-hidden ${
              isVisible ? 'animate-fade-in-up' : 'opacity-0'
            }`}
            style={{
              animationDelay: '100ms',
              transform: `perspective(1000px) rotateX(${scrollY * 0.01}deg)`
            }}
          >
            <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-ocean-500/20 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-700" />

            <div className="relative z-10">
              <div className="flex items-center justify-between mb-6">
                <div className="p-4 bg-ocean-500/20 rounded-2xl group-hover:-rotate-12 transition-transform duration-300 shadow-lg">
                  <TrendingUp className="w-8 h-8 text-ocean-300" />
                </div>
                <span className="font-mono text-xs text-slate-500 bg-slate-800/50 px-3 py-1 rounded-full">30 DAYS</span>
              </div>
              <div className="font-mono text-5xl sm:text-6xl lg:text-7xl font-black bg-gradient-to-br from-ocean-300 via-ocean-200 to-ocean-400 bg-clip-text text-transparent mb-3 group-hover:scale-110 transition-transform duration-300">
                {isLoading ? (
                  <div className="h-16 w-24 bg-ocean-500/20 rounded-lg animate-pulse" />
                ) : (
                  mlData?.summary?.total_interventions || '-'
                )}
              </div>
              <div className="font-sans text-sm sm:text-base text-ocean-300/80 font-semibold tracking-wide uppercase">Interventions</div>
            </div>
          </div>

          {/* Success Rate - Emerald Theme */}
          <div
            className={`group relative bg-gradient-to-br from-success-900/40 via-success-800/30 to-success-900/40 backdrop-blur-xl border-2 border-success-500/30 hover:border-success-400/60 rounded-2xl p-6 sm:p-8 shadow-2xl hover:shadow-glow-success transition-all duration-500 transform hover:-translate-y-2 hover:scale-105 cursor-pointer overflow-hidden ${
              isVisible ? 'animate-fade-in-up' : 'opacity-0'
            }`}
            style={{
              animationDelay: '200ms',
              transform: `perspective(1000px) rotateX(${scrollY * 0.01}deg)`
            }}
          >
            <div className="absolute -top-20 -right-20 w-40 h-40 bg-success-500/20 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-700" />

            <div className="relative z-10">
              <div className="flex items-center justify-between mb-6">
                <div className="p-4 bg-success-500/20 rounded-2xl group-hover:rotate-12 transition-transform duration-300 shadow-lg">
                  <CheckCircle2 className="w-8 h-8 text-success-300" />
                </div>
                {mlData?.summary && (
                  <span className="font-mono text-xs text-slate-500 bg-slate-800/50 px-3 py-1 rounded-full">
                    {mlData.summary.outcomes.showed_up}/{mlData.summary.intervention_effectiveness.interventions_with_action}
                  </span>
                )}
              </div>
              <div className="font-mono text-5xl sm:text-6xl lg:text-7xl font-black bg-gradient-to-br from-success-300 via-success-200 to-success-400 bg-clip-text text-transparent mb-3 group-hover:scale-110 transition-transform duration-300">
                {isLoading ? (
                  <div className="h-16 w-28 bg-success-500/20 rounded-lg animate-pulse" />
                ) : (
                  mlData?.summary?.intervention_effectiveness?.success_rate || '-'
                )}
              </div>
              <div className="font-sans text-sm sm:text-base text-success-300/80 font-semibold tracking-wide uppercase">Success Rate</div>
            </div>
          </div>

          {/* Value Saved - Amber Theme */}
          <div
            className={`group relative bg-gradient-to-br from-amber-900/40 via-amber-800/30 to-amber-900/40 backdrop-blur-xl border-2 border-amber-500/30 hover:border-amber-400/60 rounded-2xl p-6 sm:p-8 shadow-2xl hover:shadow-glow-amber transition-all duration-500 transform hover:-translate-y-2 hover:scale-105 cursor-pointer overflow-hidden ${
              isVisible ? 'animate-fade-in-up' : 'opacity-0'
            }`}
            style={{
              animationDelay: '300ms',
              transform: `perspective(1000px) rotateX(${scrollY * 0.01}deg)`
            }}
          >
            <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-amber-500/20 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-700" />

            <div className="relative z-10">
              <div className="flex items-center justify-between mb-6">
                <div className="p-4 bg-amber-500/20 rounded-2xl group-hover:-rotate-12 transition-transform duration-300 shadow-lg">
                  <DollarSign className="w-8 h-8 text-amber-300" />
                </div>
                {mlData?.summary && (
                  <span className="font-mono text-xs text-slate-500 bg-slate-800/50 px-3 py-1 rounded-full">€{mlData.summary.total_cost}</span>
                )}
              </div>
              <div className="font-mono text-5xl sm:text-6xl lg:text-7xl font-black bg-gradient-to-br from-amber-300 via-amber-200 to-amber-400 bg-clip-text text-transparent mb-3 group-hover:scale-110 transition-transform duration-300">
                {isLoading ? (
                  <div className="h-16 w-32 bg-amber-500/20 rounded-lg animate-pulse" />
                ) : mlData?.summary ? (
                  `€${mlData.summary.total_value_saved}`
                ) : (
                  '-'
                )}
              </div>
              <div className="font-sans text-sm sm:text-base text-amber-300/80 font-semibold tracking-wide uppercase">Value Saved</div>
            </div>
          </div>
        </div>

        {/* Charts Section - Side by Side on Desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-12">
          {/* ROI Trend Chart */}
          <div
            className={`transform transition-all duration-1000 ${
              isVisible ? 'translate-x-0 opacity-100' : '-translate-x-10 opacity-0'
            }`}
            style={{ transitionDelay: '400ms' }}
          >
            <div className="bg-gradient-to-br from-slate-900/60 via-slate-800/40 to-slate-900/60 backdrop-blur-xl border-2 border-slate-700/50 hover:border-violet-500/40 rounded-2xl p-6 sm:p-8 shadow-2xl hover:shadow-glow-violet transition-all duration-500 group">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-violet-500/20 rounded-xl group-hover:rotate-6 transition-transform duration-300">
                  <BarChart3 className="w-6 h-6 text-violet-400" />
                </div>
                <h2 className="font-display text-xl sm:text-2xl font-bold bg-gradient-to-r from-violet-400 to-ocean-400 bg-clip-text text-transparent">
                  ROI Trend
                </h2>
                <span className="ml-auto font-mono text-xs text-slate-500 bg-slate-800/50 px-3 py-1 rounded-full">WEEKLY</span>
              </div>
              <div className="bg-slate-900/40 rounded-xl p-4 border border-slate-700/30">
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
          </div>

          {/* Intervention Breakdown */}
          <div
            className={`transform transition-all duration-1000 ${
              isVisible ? 'translate-x-0 opacity-100' : 'translate-x-10 opacity-0'
            }`}
            style={{ transitionDelay: '500ms' }}
          >
            <div className="bg-gradient-to-br from-slate-900/60 via-slate-800/40 to-slate-900/60 backdrop-blur-xl border-2 border-slate-700/50 hover:border-ocean-500/40 rounded-2xl p-6 sm:p-8 shadow-2xl hover:shadow-glow-ocean transition-all duration-500 group">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-ocean-500/20 rounded-xl group-hover:-rotate-6 transition-transform duration-300">
                  <TrendingDown className="w-6 h-6 text-ocean-400" />
                </div>
                <h2 className="font-display text-xl sm:text-2xl font-bold bg-gradient-to-r from-ocean-400 to-amber-400 bg-clip-text text-transparent">
                  Type Breakdown
                </h2>
                <span className="ml-auto font-mono text-xs text-slate-500 bg-slate-800/50 px-3 py-1 rounded-full">ALL</span>
              </div>
              <div className="bg-slate-900/40 rounded-xl p-4 border border-slate-700/30">
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
                    { key: 'ROI', label: 'ROI %', color: '#9333ea' },
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
              <div className="p-3 bg-gradient-to-br from-amber-500/20 to-violet-500/20 rounded-xl">
                <Sparkles className="w-6 h-6 text-amber-400 animate-bounce-subtle" />
              </div>
              <h2 className="font-display text-2xl sm:text-3xl font-bold bg-gradient-to-r from-amber-400 via-violet-400 to-ocean-400 bg-clip-text text-transparent">
                AI Recommendations
              </h2>
            </div>
            <div className="grid gap-4">
              {mlData.recommendations.map((rec, index) => (
                <div
                  key={index}
                  className={`group relative bg-gradient-to-br backdrop-blur-xl border-2 rounded-2xl p-6 transition-all duration-500 transform hover:-translate-y-1 hover:scale-[1.02] cursor-pointer overflow-hidden ${
                    rec.priority === 'high'
                      ? 'from-error-900/40 via-error-800/30 to-error-900/40 border-error-500/30 hover:border-error-400/60 hover:shadow-glow-violet'
                      : rec.priority === 'medium'
                      ? 'from-warning-900/40 via-warning-800/30 to-warning-900/40 border-warning-500/30 hover:border-warning-400/60 hover:shadow-glow-amber'
                      : 'from-slate-900/40 via-slate-800/30 to-slate-900/40 border-slate-700/30 hover:border-violet-500/40 hover:shadow-glow-ocean'
                  }`}
                  style={{ animationDelay: `${700 + index * 100}ms` }}
                >
                  <div className="absolute -top-10 -right-10 w-32 h-32 bg-gradient-to-br from-violet-500/10 to-transparent rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700" />

                  <div className="relative z-10 flex items-start gap-4">
                    <div className="text-4xl transform group-hover:scale-110 group-hover:rotate-12 transition-all duration-300">
                      {rec.icon}
                    </div>
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-3 mb-2">
                        <h3 className="font-sans font-bold text-base sm:text-lg text-slate-100">{rec.message}</h3>
                        <span className={`text-xs px-4 py-1.5 rounded-full font-sans font-bold backdrop-blur-sm ${
                          rec.priority === 'high'
                            ? 'bg-gradient-to-r from-error-500/30 to-error-600/30 text-error-200 border-2 border-error-400/50'
                            : rec.priority === 'medium'
                            ? 'bg-gradient-to-r from-warning-500/30 to-warning-600/30 text-warning-200 border-2 border-warning-400/50'
                            : 'bg-gradient-to-r from-slate-700/30 to-slate-800/30 text-slate-300 border-2 border-slate-600/50'
                        }`}>
                          {getPriorityIcon(rec.priority)} {rec.priority.toUpperCase()}
                        </span>
                      </div>
                      {rec.intervention_type && (
                        <p className="font-sans text-sm text-slate-400">
                          <span className="font-semibold text-slate-300">Type:</span> {formatInterventionType(rec.intervention_type)}
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
            <div className="p-3 bg-gradient-to-br from-violet-500/20 to-ocean-500/20 rounded-xl">
              <TrendingUp className="w-6 h-6 text-violet-400" />
            </div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold bg-gradient-to-r from-violet-400 to-ocean-400 bg-clip-text text-transparent">
              Recent Activity
            </h2>
          </div>
          <div className="bg-gradient-to-br from-slate-900/60 via-slate-800/40 to-slate-900/60 backdrop-blur-xl border-2 border-slate-700/50 rounded-2xl overflow-hidden shadow-2xl">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gradient-to-r from-slate-800/80 to-slate-900/80 backdrop-blur-sm border-b-2 border-slate-700/50">
                  <tr>
                    <th className="text-left p-4 font-display font-bold text-sm text-slate-300 uppercase tracking-wider">Date</th>
                    <th className="text-left p-4 font-display font-bold text-sm text-slate-300 uppercase tracking-wider">Reservation</th>
                    <th className="text-left p-4 font-display font-bold text-sm text-slate-300 uppercase tracking-wider">Risk</th>
                    <th className="text-left p-4 font-display font-bold text-sm text-slate-300 uppercase tracking-wider">Type</th>
                    <th className="text-left p-4 font-display font-bold text-sm text-slate-300 uppercase tracking-wider">Outcome</th>
                    <th className="text-right p-4 font-display font-bold text-sm text-slate-300 uppercase tracking-wider">ROI</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={6} className="p-12 text-center">
                        <div className="flex flex-col items-center justify-center">
                          <div className="relative w-16 h-16 mb-4">
                            <div className="absolute inset-0 rounded-full border-4 border-violet-500/20"></div>
                            <div className="absolute inset-0 rounded-full border-4 border-t-violet-500 animate-spin"></div>
                          </div>
                          <p className="font-sans text-slate-400 font-semibold">Loading interventions...</p>
                        </div>
                      </td>
                    </tr>
                  ) : mlData?.timeline && mlData.timeline.length > 0 ? (
                    mlData.timeline.slice(0, 15).map((intervention, idx) => (
                      <tr
                        key={intervention.id}
                        className="border-b border-slate-800/50 hover:bg-gradient-to-r hover:from-violet-900/20 hover:to-ocean-900/20 transition-all duration-300 group"
                        style={{
                          animation: `fade-in-up 0.4s ease-out ${idx * 0.05}s forwards`,
                          opacity: 0
                        }}
                      >
                        <td className="p-4 font-sans text-sm text-slate-300">
                          {new Date(intervention.created_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </td>
                        <td className="p-4 font-mono text-sm font-bold text-violet-400 group-hover:text-violet-300 transition-colors">
                          {intervention.reservation_id}
                        </td>
                        <td className="p-4">
                          <span className={`inline-block px-3 py-1.5 rounded-full text-xs font-sans font-bold border-2 backdrop-blur-sm ${getRiskBadgeColor(intervention.risk_level)}`}>
                            {intervention.risk_level} ({intervention.risk_score})
                          </span>
                        </td>
                        <td className="p-4 font-sans text-sm text-slate-300">
                          {formatInterventionType(intervention.type)}
                        </td>
                        <td className="p-4">
                          <span className={`inline-block px-3 py-1.5 rounded-full text-xs font-sans font-bold border-2 backdrop-blur-sm ${
                            intervention.outcome === 'showed_up'
                              ? 'bg-gradient-to-r from-success-500/20 to-success-600/20 text-success-300 border-success-500/50'
                              : intervention.outcome === 'no_show'
                              ? 'bg-gradient-to-r from-error-500/20 to-error-600/20 text-error-300 border-error-500/50'
                              : 'bg-gradient-to-r from-warning-500/20 to-warning-600/20 text-warning-300 border-warning-500/50'
                          }`}>
                            {intervention.outcome === 'showed_up' ? '✓ ' : intervention.outcome === 'no_show' ? '✕ ' : ''}
                            {intervention.outcome.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          {intervention.roi !== null ? (
                            <span className={`font-mono font-black text-base ${
                              intervention.roi >= 300
                                ? 'text-success-400'
                                : intervention.roi >= 100
                                ? 'text-warning-400'
                                : 'text-error-400'
                            }`}>
                              {intervention.roi}%
                            </span>
                          ) : (
                            <span className="font-mono text-slate-600">-</span>
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

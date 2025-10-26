import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  memory: {
    used: number;
    total: number;
    rss: number;
  };
  metrics: {
    totalCalls: number;
    totalErrors: number;
    recentErrors: number;
  };
}

interface AgentMetrics {
  totalCalls: number;
  successRate: string;
  avgResponseTime: number;
  toolUsageCount: Record<string, number>;
}

interface MetricsSummary {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  successRate: string;
  avgResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
}

interface ObservabilityData {
  summary: MetricsSummary;
  agentStats: Record<string, AgentMetrics>;
  topErrors: Array<{ error: string; count: number }>;
}

interface TrendData {
  totalCalls: { current: number; previous: number; change: number; percentChange: string };
  successRate: { current: number; previous: number; change: string; trend: 'up' | 'down' };
  avgResponseTime: { current: number; previous: number; change: number; percentChange: string; trend: 'up' | 'down' };
  errorRate: { current: number; previous: number; change: number; trend: 'up' | 'down' };
}

export default function ObservabilityDashboard() {
  const [timeWindow, setTimeWindow] = useState(3600000); // 1 hour default

  // Fetch system health
  const { data: health } = useQuery<SystemHealth>({
    queryKey: ['observability', 'health'],
    queryFn: async () => {
      const res = await axios.get(`${API_BASE}/observability/health`);
      return res.data;
    },
    refetchInterval: 5000 // Refresh every 5 seconds
  });

  // Fetch metrics
  const { data: metrics, isLoading } = useQuery<ObservabilityData>({
    queryKey: ['observability', 'metrics', timeWindow],
    queryFn: async () => {
      const res = await axios.get(`${API_BASE}/observability/metrics?timeWindow=${timeWindow}`);
      return res.data;
    },
    refetchInterval: 10000 // Refresh every 10 seconds
  });

  // Fetch trends
  const { data: trends } = useQuery<TrendData>({
    queryKey: ['observability', 'trends', timeWindow],
    queryFn: async () => {
      const res = await axios.get(`${API_BASE}/observability/trends?timeWindow=${timeWindow}`);
      return res.data;
    },
    refetchInterval: 10000 // Refresh every 10 seconds
  });

  // Export metrics as CSV
  const exportAsCSV = () => {
    if (!metrics) return;

    const csvRows = [];

    // Headers
    csvRows.push('Metric,Value');

    // Summary metrics
    csvRows.push(`Total Calls,${metrics.summary.totalCalls}`);
    csvRows.push(`Success Rate,${metrics.summary.successRate}%`);
    csvRows.push(`Average Response Time,${metrics.summary.avgResponseTime}ms`);
    csvRows.push(`P95 Response Time,${metrics.summary.p95ResponseTime}ms`);
    csvRows.push(`P99 Response Time,${metrics.summary.p99ResponseTime}ms`);

    // Agent stats
    csvRows.push('');
    csvRows.push('Agent Name,Total Calls,Success Rate,Avg Response Time');
    Object.entries(metrics.agentStats).forEach(([name, stats]) => {
      csvRows.push(`${name},${stats.totalCalls},${stats.successRate}%,${stats.avgResponseTime}ms`);
    });

    // Top errors
    if (metrics.topErrors.length > 0) {
      csvRows.push('');
      csvRows.push('Error,Count');
      metrics.topErrors.forEach(err => {
        csvRows.push(`"${err.error}",${err.count}`);
      });
    }

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `metrics-${new Date().toISOString()}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Export metrics as JSON
  const exportAsJSON = () => {
    if (!metrics) return;

    const jsonContent = JSON.stringify({
      exportedAt: new Date().toISOString(),
      timeWindow,
      health,
      metrics
    }, null, 2);

    const blob = new Blob([jsonContent], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `metrics-${new Date().toISOString()}.json`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'bg-emerald-500';
      case 'degraded':
        return 'bg-yellow-500';
      case 'unhealthy':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const formatUptime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  // Trend indicator component
  const TrendIndicator = ({ trend, change, isGood }: { trend?: 'up' | 'down'; change?: string | number; isGood?: boolean }) => {
    if (!trend || change === undefined) return null;

    const isPositive = isGood === undefined
      ? trend === 'up'
      : (trend === 'up' && isGood) || (trend === 'down' && !isGood);

    const arrow = trend === 'up' ? '↑' : '↓';
    const color = isPositive ? 'text-emerald-400' : 'text-red-400';

    return (
      <span className={`text-xs ${color} ml-2`}>
        {arrow} {typeof change === 'number' ? Math.abs(change) : change}%
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-40 backdrop-blur-sm bg-opacity-95">
        <div className="max-w-[1400px] mx-auto px-6 py-5">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-foreground mb-1">Observability Dashboard</h1>
              <p className="text-muted-foreground text-sm">Agent monitoring, performance metrics, and error tracking</p>
            </div>
            <div className="flex items-center gap-3">
              <select
                value={timeWindow}
                onChange={(e) => setTimeWindow(parseInt(e.target.value))}
                className="px-4 py-2 border border-border rounded-lg bg-background text-foreground"
              >
                <option value={300000}>Last 5 minutes</option>
                <option value={900000}>Last 15 minutes</option>
                <option value={3600000}>Last hour</option>
                <option value={14400000}>Last 4 hours</option>
                <option value={86400000}>Last 24 hours</option>
              </select>

              {/* Export buttons */}
              {!isLoading && metrics && (
                <div className="flex gap-2">
                  <button
                    onClick={exportAsCSV}
                    className="px-4 py-2 border border-border rounded-lg bg-background text-foreground hover:bg-muted transition-colors"
                    title="Export as CSV"
                  >
                    Export CSV
                  </button>
                  <button
                    onClick={exportAsJSON}
                    className="px-4 py-2 border border-border rounded-lg bg-background text-foreground hover:bg-muted transition-colors"
                    title="Export as JSON"
                  >
                    Export JSON
                  </button>
                </div>
              )}

              <a
                href="/host-dashboard"
                className="px-5 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground font-medium rounded-lg transition-all shadow-md hover:shadow-lg"
              >
                Back to Host Dashboard
              </a>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto px-6 py-8">
        {/* System Health */}
        <div className="mb-8">
          <h2 className="text-xl font-bold text-foreground mb-4">System Health</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-card border border-border rounded-lg p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Status</span>
                <div className={`w-3 h-3 rounded-full ${getStatusColor(health?.status || 'healthy')}`} />
              </div>
              <div className="text-2xl font-bold text-foreground capitalize">{health?.status || 'Loading...'}</div>
            </div>

            <div className="bg-card border border-border rounded-lg p-6">
              <div className="text-sm text-muted-foreground mb-2">Uptime</div>
              <div className="text-2xl font-bold text-foreground">
                {health ? formatUptime(health.uptime) : '-'}
              </div>
            </div>

            <div className="bg-card border border-border rounded-lg p-6">
              <div className="text-sm text-muted-foreground mb-2">Memory Usage</div>
              <div className="text-2xl font-bold text-foreground">
                {health ? `${health.memory.used}MB` : '-'}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                of {health?.memory.total}MB
              </div>
            </div>

            <div className="bg-card border border-border rounded-lg p-6">
              <div className="text-sm text-muted-foreground mb-2">Recent Errors</div>
              <div className={`text-2xl font-bold ${
                (health?.metrics.recentErrors || 0) > 5 ? 'text-red-400' : 'text-emerald-400'
              }`}>
                {health?.metrics.recentErrors || 0}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                last 5 minutes
              </div>
            </div>
          </div>
        </div>

        {/* Performance Metrics */}
        {!isLoading && metrics && (
          <>
            <div className="mb-8">
              <h2 className="text-xl font-bold text-foreground mb-4">Performance Metrics</h2>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-card border border-border rounded-lg p-6">
                  <div className="text-sm text-muted-foreground mb-2">Total Calls</div>
                  <div className="text-3xl font-bold text-foreground">
                    {metrics.summary.totalCalls}
                    {trends && <TrendIndicator trend={trends.totalCalls.change > 0 ? 'up' : 'down'} change={trends.totalCalls.percentChange} />}
                  </div>
                </div>

                <div className="bg-card border border-border rounded-lg p-6">
                  <div className="text-sm text-muted-foreground mb-2">Success Rate</div>
                  <div className={`text-3xl font-bold ${
                    parseFloat(metrics.summary.successRate) >= 95 ? 'text-emerald-400' : 'text-yellow-400'
                  }`}>
                    {metrics.summary.successRate}%
                    {trends && <TrendIndicator trend={trends.successRate.trend} change={trends.successRate.change} isGood={true} />}
                  </div>
                </div>

                <div className="bg-card border border-border rounded-lg p-6">
                  <div className="text-sm text-muted-foreground mb-2">Avg Response Time</div>
                  <div className="text-3xl font-bold text-foreground">
                    {metrics.summary.avgResponseTime}ms
                    {trends && <TrendIndicator trend={trends.avgResponseTime.trend} change={trends.avgResponseTime.percentChange} isGood={false} />}
                  </div>
                </div>

                <div className="bg-card border border-border rounded-lg p-6">
                  <div className="text-sm text-muted-foreground mb-2">P99 Response Time</div>
                  <div className={`text-3xl font-bold ${
                    metrics.summary.p99ResponseTime < 2000 ? 'text-emerald-400' : 'text-yellow-400'
                  }`}>
                    {metrics.summary.p99ResponseTime}ms
                  </div>
                </div>
              </div>
            </div>

            {/* Agent-Specific Metrics */}
            <div className="mb-8">
              <h2 className="text-xl font-bold text-foreground mb-4">Agent Performance</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {Object.entries(metrics.agentStats).map(([agentName, stats]) => (
                  <div key={agentName} className="bg-card border border-border rounded-lg p-6">
                    <h3 className="font-bold text-lg text-foreground mb-4">{agentName}</h3>

                    <div className="space-y-3">
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Calls</div>
                        <div className="text-xl font-bold text-foreground">{stats.totalCalls}</div>
                      </div>

                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Success Rate</div>
                        <div className={`text-xl font-bold ${
                          parseFloat(stats.successRate) >= 95 ? 'text-emerald-400' : 'text-yellow-400'
                        }`}>
                          {stats.successRate}%
                        </div>
                      </div>

                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Avg Response</div>
                        <div className="text-xl font-bold text-foreground">{stats.avgResponseTime}ms</div>
                      </div>

                      {Object.keys(stats.toolUsageCount).length > 0 && (
                        <div>
                          <div className="text-xs text-muted-foreground mb-2">Top Tools</div>
                          <div className="space-y-1">
                            {Object.entries(stats.toolUsageCount)
                              .sort((a, b) => b[1] - a[1])
                              .slice(0, 3)
                              .map(([tool, count]) => (
                                <div key={tool} className="flex justify-between text-xs">
                                  <span className="text-muted-foreground truncate">{tool}</span>
                                  <span className="text-foreground font-semibold">{count}</span>
                                </div>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {Object.keys(metrics.agentStats).length === 0 && (
                  <div className="col-span-3 text-center py-12 text-muted-foreground">
                    No agent activity in the selected time window
                  </div>
                )}
              </div>
            </div>

            {/* Top Errors */}
            {metrics.topErrors.length > 0 && (
              <div className="mb-8">
                <h2 className="text-xl font-bold text-foreground mb-4">Top Errors</h2>
                <div className="bg-card border border-border rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-muted/50 border-b border-border">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-foreground uppercase">Error</th>
                        <th className="px-6 py-3 text-right text-xs font-semibold text-foreground uppercase">Count</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {metrics.topErrors.map((error, index) => (
                        <tr key={index} className="hover:bg-muted/30 transition-colors">
                          <td className="px-6 py-4 text-sm text-foreground">{error.error}</td>
                          <td className="px-6 py-4 text-sm text-red-400 text-right font-semibold">{error.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}
      </div>
    </div>
  );
}

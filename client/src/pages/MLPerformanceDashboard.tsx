import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface ROISummary {
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
}

interface Intervention {
  id: string;
  reservation_id: string;
  risk_level: string;
  risk_score: number;
  type: string;
  action_taken: boolean;
  outcome: string | null;
  cost: number;
  value_saved: number;
  roi: number | null;
  created_at: string;
  action_timestamp: string | null;
}

interface TypeBreakdown {
  type: string;
  count: number;
  avg_cost: string;
  success_rate: string;
  roi: number | null;
  total_saved: string;
}

interface MLPerformanceData {
  summary: ROISummary;
  timeline: Intervention[];
  breakdown: TypeBreakdown[];
  recommendations: Array<{
    priority: string;
    message: string;
    metric: string;
    value: string;
  }>;
}

export default function MLPerformanceDashboard() {
  const [period, setPeriod] = useState<number>(30);
  // Get restaurant_id from localStorage for multi-tenant filtering
  const restaurantId = localStorage.getItem('restaurant_id') || '';

  const { data, isLoading, error } = useQuery({
    queryKey: ['ml-performance', period, restaurantId],
    queryFn: async () => {
      const response = await axios.get(`${API_URL}/api/ml-performance`, {
        params: { action: 'all', days: period, restaurant_id: restaurantId }
      });
      return response.data.data as MLPerformanceData;
    },
    refetchInterval: 30000 // Refresh every 30 seconds
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading ML Performance Data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-600 text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Failed to Load Data</h2>
          <p className="text-gray-600">{(error as Error).message}</p>
        </div>
      </div>
    );
  }

  const summary = data?.summary;
  const timeline = data?.timeline || [];
  const breakdown = data?.breakdown || [];
  const recommendations = data?.recommendations || [];

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">🎯 ML Performance Dashboard</h1>
            <p className="text-gray-600 mt-2">Real-time intervention tracking & ROI monitoring</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPeriod(7)}
              className={`px-4 py-2 rounded-lg font-medium ${
                period === 7
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              7 Days
            </button>
            <button
              onClick={() => setPeriod(30)}
              className={`px-4 py-2 rounded-lg font-medium ${
                period === 30
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              30 Days
            </button>
            <button
              onClick={() => setPeriod(90)}
              className={`px-4 py-2 rounded-lg font-medium ${
                period === 90
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              90 Days
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto space-y-6">
        {/* ROI Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-600">Total ROI</div>
            <div className={`text-3xl font-bold mt-2 ${
              summary && summary.total_roi >= 300 ? 'text-green-600' : 'text-amber-600'
            }`}>
              {summary?.total_roi || 0}%
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Target: {summary?.target_roi || '300-500%'}
            </div>
            {summary && summary.meets_target && (
              <div className="mt-2 text-xs font-medium text-green-600 flex items-center">
                ✅ Meets Target
              </div>
            )}
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-600">Interventions</div>
            <div className="text-3xl font-bold text-gray-900 mt-2">
              {summary?.total_interventions || 0}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {summary?.intervention_effectiveness.interventions_with_action || 0} actions taken
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-600">Success Rate</div>
            <div className="text-3xl font-bold text-blue-600 mt-2">
              {summary?.intervention_effectiveness.success_rate || '0%'}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {summary?.outcomes.showed_up || 0} showed up
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-600">Value Saved</div>
            <div className="text-3xl font-bold text-green-600 mt-2">
              €{summary?.total_value_saved || '0.00'}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Cost: €{summary?.total_cost || '0.00'}
            </div>
          </div>
        </div>

        {/* Recommendations */}
        {recommendations && recommendations.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">💡 Recommendations</h2>
            <div className="space-y-3">
              {recommendations.map((rec, idx) => (
                <div
                  key={idx}
                  className={`p-4 rounded-lg border-l-4 ${
                    rec.priority === 'high'
                      ? 'bg-red-50 border-red-500'
                      : rec.priority === 'medium'
                      ? 'bg-amber-50 border-amber-500'
                      : 'bg-blue-50 border-blue-500'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-gray-900">{rec.message}</div>
                      <div className="text-sm text-gray-600 mt-1">
                        {rec.metric}: {rec.value}
                      </div>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      rec.priority === 'high'
                        ? 'bg-red-100 text-red-800'
                        : rec.priority === 'medium'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}>
                      {rec.priority.toUpperCase()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Intervention Type Breakdown */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">📊 Intervention Type Performance</h2>
          {breakdown && breakdown.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Count
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Avg Cost
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Success Rate
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total Saved
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      ROI
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {breakdown.map((type) => (
                    <tr key={type.type} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {type.type.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {type.count}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        €{type.avg_cost}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {type.success_rate}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-green-600">
                        €{type.total_saved}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`text-sm font-bold ${
                          type.roi && type.roi >= 300 ? 'text-green-600' : 'text-amber-600'
                        }`}>
                          {type.roi ? `${type.roi}%` : 'N/A'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <div className="text-4xl mb-4">📭</div>
              <p>No interventions recorded yet</p>
              <p className="text-sm mt-2">Start creating reservations to see intervention data</p>
            </div>
          )}
        </div>

        {/* Recent Interventions Timeline */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">🕒 Recent Interventions</h2>
          {timeline && timeline.length > 0 ? (
            <div className="space-y-4">
              {timeline.map((intervention) => (
                <div
                  key={intervention.id}
                  className="border-l-4 border-blue-500 pl-4 py-3 hover:bg-gray-50 rounded-r-lg transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm text-gray-600">
                          {intervention.reservation_id}
                        </span>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          intervention.risk_level === 'very-high'
                            ? 'bg-red-100 text-red-800'
                            : intervention.risk_level === 'high'
                            ? 'bg-orange-100 text-orange-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {intervention.risk_level.toUpperCase()}
                        </span>
                        <span className="text-sm text-gray-600">
                          {intervention.risk_score}/100
                        </span>
                      </div>
                      <div className="mt-2 text-sm text-gray-700">
                        <span className="font-medium">Type:</span> {intervention.type.replace('_', ' ')}
                      </div>
                      {intervention.outcome && (
                        <div className="mt-1 text-sm">
                          <span className={`font-medium ${
                            intervention.outcome === 'showed_up'
                              ? 'text-green-600'
                              : intervention.outcome === 'no_show'
                              ? 'text-red-600'
                              : 'text-gray-600'
                          }`}>
                            {intervention.outcome === 'showed_up' ? '✅ Showed Up' :
                             intervention.outcome === 'no_show' ? '❌ No Show' :
                             '⏸️ Cancelled'}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium text-gray-900">
                        €{intervention.cost.toFixed(2)} cost
                      </div>
                      {intervention.value_saved > 0 && (
                        <div className="text-sm text-green-600 font-medium">
                          €{intervention.value_saved.toFixed(2)} saved
                        </div>
                      )}
                      {intervention.roi !== null && (
                        <div className={`text-xs font-bold mt-1 ${
                          intervention.roi >= 300 ? 'text-green-600' : 'text-amber-600'
                        }`}>
                          {intervention.roi}% ROI
                        </div>
                      )}
                      <div className="text-xs text-gray-500 mt-1">
                        {new Date(intervention.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <div className="text-4xl mb-4">📝</div>
              <p>No recent interventions</p>
            </div>
          )}
        </div>

        {/* Outcomes Breakdown */}
        {summary && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">📈 Outcomes</h2>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <div className="text-3xl font-bold text-green-600">
                  {summary.outcomes.showed_up}
                </div>
                <div className="text-sm text-gray-600 mt-2">Showed Up</div>
              </div>
              <div className="text-center p-4 bg-red-50 rounded-lg">
                <div className="text-3xl font-bold text-red-600">
                  {summary.outcomes.no_show}
                </div>
                <div className="text-sm text-gray-600 mt-2">No Show</div>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <div className="text-3xl font-bold text-gray-600">
                  {summary.outcomes.cancelled}
                </div>
                <div className="text-sm text-gray-600 mt-2">Cancelled</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

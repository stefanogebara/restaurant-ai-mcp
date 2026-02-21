import { useState } from 'react';
import ThiingsIcon from '../common/ThiingsIcon';

interface QuickStatsProps {
  analyticsData?: {
    total_reservations: number;
    total_completed_services: number;
    avg_party_size: number;
    avg_service_time_minutes: number;
  };
  isLoading?: boolean;
}

export default function QuickStats({ analyticsData, isLoading }: QuickStatsProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (isLoading) {
    return (
      <div className="bg-white border border-[#E7E5E4] rounded-xl shadow-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-[#1C1917] flex items-center gap-2">
            <ThiingsIcon name="bar-chart" size="sm" />
            Quick Stats
          </h2>
        </div>
        <div className="text-center py-4 text-[#57534E]">Loading...</div>
      </div>
    );
  }

  if (!analyticsData) {
    return null;
  }

  return (
    <div className="bg-white border border-[#E7E5E4] rounded-xl shadow-md">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-6 flex items-center justify-between hover:bg-[#F5F5F4] transition-colors rounded-t-xl"
      >
        <h2 className="text-xl font-bold text-[#1C1917] flex items-center gap-2">
          <ThiingsIcon name="bar-chart" size="sm" />
          Quick Stats
        </h2>
        <div className={`transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
          <ThiingsIcon name="chevron-down" size="sm" />
        </div>
      </button>

      {/* Collapsible Content */}
      {isExpanded && (
        <div className="px-6 pb-6 space-y-3">
          {/* Total Reservations */}
          <div className="flex items-center justify-between p-3 bg-[#F5F5F4] rounded-lg">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#9F1239] rounded-lg flex items-center justify-center">
                <ThiingsIcon name="calendar" size="sm" />
              </div>
              <div>
                <div className="text-sm font-medium text-[#1C1917]">Total Reservations</div>
                <div className="text-xs text-[#A8A29E]">Last 30 days</div>
              </div>
            </div>
            <div className="text-2xl font-bold text-[#1C1917]">{analyticsData.total_reservations}</div>
          </div>

          {/* Completed Services */}
          <div className="flex items-center justify-between p-3 bg-[#F5F5F4] rounded-lg">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#16a34a] rounded-lg flex items-center justify-center">
                <ThiingsIcon name="check" size="sm" />
              </div>
              <div>
                <div className="text-sm font-medium text-[#1C1917]">Completed Services</div>
                <div className="text-xs text-[#A8A29E]">Total served</div>
              </div>
            </div>
            <div className="text-2xl font-bold text-[#1C1917]">{analyticsData.total_completed_services}</div>
          </div>

          {/* Avg Party Size */}
          <div className="flex items-center justify-between p-3 bg-[#F5F5F4] rounded-lg">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#7c3aed] rounded-lg flex items-center justify-center">
                <ThiingsIcon name="users" size="sm" />
              </div>
              <div>
                <div className="text-sm font-medium text-[#1C1917]">Avg Party Size</div>
                <div className="text-xs text-[#A8A29E]">Per reservation</div>
              </div>
            </div>
            <div className="text-2xl font-bold text-[#1C1917]">{analyticsData.avg_party_size.toFixed(1)}</div>
          </div>

          {/* Avg Service Time */}
          <div className="flex items-center justify-between p-3 bg-[#F5F5F4] rounded-lg">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#d97706] rounded-lg flex items-center justify-center">
                <ThiingsIcon name="clock" size="sm" />
              </div>
              <div>
                <div className="text-sm font-medium text-[#1C1917]">Avg Service Time</div>
                <div className="text-xs text-[#A8A29E]">Table turnover</div>
              </div>
            </div>
            <div className="text-2xl font-bold text-[#1C1917]">{Math.round(analyticsData.avg_service_time_minutes)} min</div>
          </div>

          {/* Link to full analytics */}
          <a
            href="/analytics"
            className="block w-full mt-4 px-4 py-2 text-center text-sm bg-[#1C1917] hover:bg-[#9F1239] text-white font-medium rounded-lg transition-colors"
          >
            View Full Analytics
          </a>
        </div>
      )}
    </div>
  );
}

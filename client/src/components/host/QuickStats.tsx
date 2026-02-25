import { useState } from 'react';
import { Link } from 'react-router-dom';
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
      <div className="bg-white border border-border-gray rounded-2xl shadow-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-deep-charcoal flex items-center gap-2">
            <ThiingsIcon name="bar-chart" size="sm" />
            Quick Stats
          </h2>
        </div>
        <div className="flex items-center justify-center py-4 gap-3">
          <div className="w-6 h-6 border-2 border-burgundy border-t-transparent rounded-full animate-spin" />
          <span className="text-stone-gray text-sm">Loading stats...</span>
        </div>
      </div>
    );
  }

  if (!analyticsData) {
    return null;
  }

  return (
    <div className="bg-white border border-border-gray rounded-2xl shadow-md">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        aria-controls="quick-stats-content"
        className="w-full p-6 flex items-center justify-between hover:bg-soft-gray transition-colors rounded-t-2xl"
      >
        <h2 className="text-xl font-bold text-deep-charcoal flex items-center gap-2">
          <ThiingsIcon name="bar-chart" size="sm" />
          Quick Stats
        </h2>
        <div className={`transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
          <ThiingsIcon name="chevron-down" size="sm" />
        </div>
      </button>

      {/* Collapsible Content */}
      {isExpanded && (
        <div id="quick-stats-content" className="px-6 pb-6 space-y-3">
          {/* Total Reservations */}
          <div className="flex items-center justify-between p-3 bg-soft-gray rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-burgundy rounded-lg flex items-center justify-center">
                <ThiingsIcon name="calendar" size="sm" />
              </div>
              <div>
                <div className="text-sm font-medium text-deep-charcoal">Total Reservations</div>
                <div className="text-xs text-muted-stone">Last 30 days</div>
              </div>
            </div>
            <div className="text-2xl font-bold text-deep-charcoal">{analyticsData.total_reservations}</div>
          </div>

          {/* Completed Services */}
          <div className="flex items-center justify-between p-3 bg-soft-gray rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center">
                <ThiingsIcon name="check" size="sm" />
              </div>
              <div>
                <div className="text-sm font-medium text-deep-charcoal">Completed Services</div>
                <div className="text-xs text-muted-stone">Total served</div>
              </div>
            </div>
            <div className="text-2xl font-bold text-deep-charcoal">{analyticsData.total_completed_services}</div>
          </div>

          {/* Avg Party Size */}
          <div className="flex items-center justify-between p-3 bg-soft-gray rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-violet-600 rounded-lg flex items-center justify-center">
                <ThiingsIcon name="users" size="sm" />
              </div>
              <div>
                <div className="text-sm font-medium text-deep-charcoal">Avg Party Size</div>
                <div className="text-xs text-muted-stone">Per reservation</div>
              </div>
            </div>
            <div className="text-2xl font-bold text-deep-charcoal">{analyticsData.avg_party_size.toFixed(1)}</div>
          </div>

          {/* Avg Service Time */}
          <div className="flex items-center justify-between p-3 bg-soft-gray rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-600 rounded-lg flex items-center justify-center">
                <ThiingsIcon name="clock" size="sm" />
              </div>
              <div>
                <div className="text-sm font-medium text-deep-charcoal">Avg Service Time</div>
                <div className="text-xs text-muted-stone">Table turnover</div>
              </div>
            </div>
            <div className="text-2xl font-bold text-deep-charcoal">{Math.round(analyticsData.avg_service_time_minutes)} min</div>
          </div>

          {/* Link to full analytics */}
          <Link
            to="/analytics"
            className="block w-full mt-4 px-4 py-2 text-center text-sm bg-deep-charcoal hover:bg-burgundy text-white font-medium rounded-xl transition-colors"
          >
            View Full Analytics
          </Link>
        </div>
      )}
    </div>
  );
}

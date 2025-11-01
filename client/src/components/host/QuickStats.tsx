import { useState } from 'react';

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
      <div className="bg-card rounded-lg shadow-lg p-6 border border-border">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
            </svg>
            Quick Stats
          </h2>
        </div>
        <div className="text-center py-4 text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!analyticsData) {
    return null;
  }

  return (
    <div className="bg-card rounded-lg shadow-lg border border-border">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-6 flex items-center justify-between hover:bg-muted/20 transition-colors rounded-t-lg"
      >
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
          </svg>
          Quick Stats
        </h2>
        <div className={`transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
          <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Collapsible Content */}
      {isExpanded && (
        <div className="px-6 pb-6 space-y-3">
          {/* Total Reservations */}
          <div className="flex items-center justify-between p-3 bg-primary/10 rounded-lg border border-primary/20">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary/20 rounded-lg flex items-center justify-center">
                <span className="text-xl">📅</span>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Total Reservations</div>
                <div className="text-sm text-muted-foreground">Last 30 days</div>
              </div>
            </div>
            <div className="text-2xl font-bold text-foreground">{analyticsData.total_reservations}</div>
          </div>

          {/* Completed Services */}
          <div className="flex items-center justify-between p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-500/20 rounded-lg flex items-center justify-center">
                <span className="text-xl">✅</span>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Completed Services</div>
                <div className="text-sm text-muted-foreground">Total served</div>
              </div>
            </div>
            <div className="text-2xl font-bold text-foreground">{analyticsData.total_completed_services}</div>
          </div>

          {/* Avg Party Size */}
          <div className="flex items-center justify-between p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                <span className="text-xl">👥</span>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Avg Party Size</div>
                <div className="text-sm text-muted-foreground">Per reservation</div>
              </div>
            </div>
            <div className="text-2xl font-bold text-foreground">{analyticsData.avg_party_size.toFixed(1)}</div>
          </div>

          {/* Avg Service Time */}
          <div className="flex items-center justify-between p-3 bg-amber-500/10 rounded-lg border border-amber-500/20">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-500/20 rounded-lg flex items-center justify-center">
                <span className="text-xl">⏱️</span>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Avg Service Time</div>
                <div className="text-sm text-muted-foreground">Table turnover</div>
              </div>
            </div>
            <div className="text-2xl font-bold text-foreground">{Math.round(analyticsData.avg_service_time_minutes)} min</div>
          </div>

          {/* Link to full analytics */}
          <a
            href="/analytics"
            className="block w-full mt-4 px-4 py-2 text-center text-sm bg-muted hover:bg-muted/80 text-muted-foreground font-medium rounded-lg transition-colors"
          >
            View Full Analytics →
          </a>
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';

// SVG Icon Components
const CalendarIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
  </svg>
);

const CheckIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
  </svg>
);

const UsersIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 20 20">
    <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
  </svg>
);

const ClockIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
  </svg>
);

const ChartIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 20 20" fill="currentColor">
    <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
  </svg>
);

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
            <ChartIcon className="w-5 h-5 text-[#9F1239]" />
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
          <ChartIcon className="w-5 h-5 text-[#9F1239]" />
          Quick Stats
        </h2>
        <div className={`transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
          <svg className="w-5 h-5 text-[#57534E]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Collapsible Content */}
      {isExpanded && (
        <div className="px-6 pb-6 space-y-3">
          {/* Total Reservations */}
          <div className="flex items-center justify-between p-3 bg-[#F5F5F4] rounded-lg">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#9F1239] rounded-lg flex items-center justify-center">
                <CalendarIcon className="w-5 h-5 text-white" />
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
                <CheckIcon className="w-5 h-5 text-white" />
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
                <UsersIcon className="w-5 h-5 text-white" />
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
                <ClockIcon className="w-5 h-5 text-white" />
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

/**
 * Customer DNA Profiling Dashboard
 *
 * Displays deep behavioral insights about customers
 * Goes beyond LTV to understand WHO customers are and WHAT they prefer
 */

import { useState, useEffect } from 'react';
import {
  Users,
  TrendingUp,
  Clock,
  Calendar,
  Coffee,
  Sun,
  Moon,
  Zap,
  Target,
  Activity,
  Brain,
  Search,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

interface DNAStats {
  total_profiles: number;
  avg_confidence: number;
  dining_styles: Record<string, number>;
  day_type_preferences: Record<string, number>;
  time_slot_preferences: Record<string, number>;
  spontaneity_distribution: {
    very_spontaneous: number;
    spontaneous: number;
    moderate: number;
    planner: number;
    advance_planner: number;
  };
  total_occasions_detected: number;
  total_predictions_made: number;
}

interface Occasion {
  id: string;
  customer_id: string;
  occasion_type: string;
  occasion_date: string;
  recurrence: string;
  party_size: number;
  next_predicted_date: string;
  probability_score: number;
}

export default function CustomerDNADashboard() {
  const [stats, setStats] = useState<DNAStats | null>(null);
  const [occasions, setOccasions] = useState<Occasion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(true);
  const [showOccasions, setShowOccasions] = useState(false);

  useEffect(() => {
    fetchDNAData();
    // Refresh every 5 minutes
    const interval = setInterval(fetchDNAData, 300000);
    return () => clearInterval(interval);
  }, []);

  const fetchDNAData = async () => {
    try {
      // Fetch statistics
      const statsResponse = await fetch('/api/customer-dna?action=stats');
      const statsResult = await statsResponse.json();
      if (statsResult.success) {
        setStats(statsResult.data);
      }

      // Fetch upcoming occasions
      const occasionsResponse = await fetch('/api/customer-dna?action=occasions&limit=10');
      const occasionsResult = await occasionsResponse.json();
      if (occasionsResult.success) {
        setOccasions(occasionsResult.data.occasions || []);
      }

    } catch (error) {
      console.error('Error fetching DNA data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const analyzeAllCustomers = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/customer-dna?action=analyze-all');
      const result = await response.json();

      if (result.success) {
        alert(`✅ Analyzed DNA for ${result.data.total_analyzed} customers!`);
        fetchDNAData(); // Refresh data
      } else {
        alert('❌ Failed to analyze customer DNA');
      }
    } catch (error) {
      console.error('Error analyzing customers:', error);
      alert('❌ Failed to analyze customer DNA');
    } finally {
      setIsLoading(false);
    }
  };

  const getDiningStyleIcon = (style: string) => {
    switch (style) {
      case 'solo': return <Users className="w-4 h-4" />;
      case 'couple': return <Users className="w-4 h-4" />;
      case 'family': return <Users className="w-4 h-4" />;
      case 'business': return <Coffee className="w-4 h-4" />;
      case 'group': return <Users className="w-4 h-4" />;
      default: return <Users className="w-4 h-4" />;
    }
  };

  const getDiningStyleColor = (style: string) => {
    switch (style) {
      case 'solo': return 'bg-[#57534E]/10 border-[#57534E]/30 text-[#57534E]';
      case 'couple': return 'bg-[#9F1239]/10 border-[#9F1239]/30 text-[#9F1239]';
      case 'family': return 'bg-[#7c3aed]/10 border-[#7c3aed]/30 text-[#7c3aed]';
      case 'business': return 'bg-[#d97706]/10 border-[#d97706]/30 text-[#d97706]';
      case 'group': return 'bg-[#16a34a]/10 border-[#16a34a]/30 text-[#16a34a]';
      default: return 'bg-[#57534E]/10 border-[#57534E]/30 text-[#57534E]';
    }
  };

  const getSpontaneityColor = (level: string) => {
    switch (level) {
      case 'very_spontaneous': return 'bg-[#9F1239]';
      case 'spontaneous': return 'bg-[#d97706]';
      case 'moderate': return 'bg-[#d97706]';
      case 'planner': return 'bg-[#16a34a]';
      case 'advance_planner': return 'bg-[#7c3aed]';
      default: return 'bg-[#57534E]';
    }
  };

  const getSpontaneityLabel = (level: string) => {
    return level.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-6 border border-[#E7E5E4]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-[#1C1917] flex items-center gap-2">
            <Brain className="w-5 h-5" />
            Customer DNA Profiling
          </h2>
        </div>
        <div className="text-center py-8 text-[#57534E]">Loading...</div>
      </div>
    );
  }

  if (!stats || stats.total_profiles === 0) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-6 border border-[#E7E5E4]">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-full bg-[#F5F5F4] flex items-center justify-center">
            <Brain className="w-6 h-6 text-[#57534E]" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-[#1C1917]">No DNA Profiles Yet</h3>
            <p className="text-sm text-[#57534E]">Analyze customer behavior to unlock insights</p>
          </div>
        </div>
        <button
          onClick={analyzeAllCustomers}
          className="w-full px-4 py-3 bg-[#9F1239] hover:bg-[#881337] text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-[#9F1239]/30 flex items-center justify-center gap-2"
        >
          <Activity className="w-5 h-5" />
          Analyze All Customers
        </button>
      </div>
    );
  }

  const totalDiningStyles = Object.values(stats.dining_styles).reduce((sum, count) => sum + count, 0);
  const totalDayTypes = Object.values(stats.day_type_preferences).reduce((sum, count) => sum + count, 0);
  const totalSpontaneity = Object.values(stats.spontaneity_distribution).reduce((sum, count) => sum + count, 0);

  return (
    <div className="bg-white rounded-xl shadow-lg border border-[#E7E5E4]">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-6 flex items-center justify-between hover:bg-[#F5F5F4]/50 transition-colors rounded-t-xl"
      >
        <h2 className="text-xl font-bold text-[#1C1917] flex items-center gap-2">
          <Brain className="w-5 h-5 text-[#7c3aed]" />
          Customer DNA Profiling
          <span className="px-2 py-1 bg-[#7c3aed]/20 text-[#7c3aed] text-sm rounded-full font-semibold">
            {stats.total_profiles} Profiles
          </span>
        </h2>
        <div className={`transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
          <svg className="w-5 h-5 text-[#57534E]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Collapsible Content */}
      {isExpanded && (
        <div className="px-6 pb-6 space-y-4">
          {/* Key Metrics Row */}
          <div className="grid grid-cols-3 gap-3">
            {/* Total Profiles */}
            <div className="p-4 bg-[#7c3aed]/10 rounded-xl border border-[#7c3aed]/20">
              <div className="flex items-center justify-between mb-2">
                <Brain className="w-5 h-5 text-[#7c3aed]" />
                <span className="text-2xl font-bold text-[#1C1917]">{stats.total_profiles}</span>
              </div>
              <div className="text-xs text-[#57534E]">DNA Profiles</div>
            </div>

            {/* Avg Confidence */}
            <div className="p-4 bg-[#16a34a]/10 rounded-xl border border-[#16a34a]/20">
              <div className="flex items-center justify-between mb-2">
                <Target className="w-5 h-5 text-[#16a34a]" />
                <span className="text-2xl font-bold text-[#1C1917]">{stats.avg_confidence}%</span>
              </div>
              <div className="text-xs text-[#57534E]">Avg Confidence</div>
            </div>

            {/* Occasions Detected */}
            <div className="p-4 bg-[#9F1239]/10 rounded-xl border border-[#9F1239]/20">
              <div className="flex items-center justify-between mb-2">
                <Calendar className="w-5 h-5 text-[#9F1239]" />
                <span className="text-2xl font-bold text-[#1C1917]">{stats.total_occasions_detected}</span>
              </div>
              <div className="text-xs text-[#57534E]">Occasions Found</div>
            </div>
          </div>

          {/* Dining Styles Breakdown */}
          <div className="p-4 bg-[#F5F5F4] rounded-xl">
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-4 h-4 text-[#57534E]" />
              <h3 className="text-sm font-semibold text-[#1C1917]">Dining Styles</h3>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {Object.entries(stats.dining_styles).map(([style, count]) => {
                const percentage = totalDiningStyles > 0 ? (count / totalDiningStyles) * 100 : 0;
                return (
                  <div key={style} className={`p-3 rounded-xl border text-center ${getDiningStyleColor(style)}`}>
                    <div className="flex justify-center mb-1">
                      {getDiningStyleIcon(style)}
                    </div>
                    <div className="text-lg font-bold">{count}</div>
                    <div className="text-xs capitalize">{style}</div>
                    <div className="text-xs opacity-70">{percentage.toFixed(0)}%</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Day Type Preferences */}
          <div className="p-4 bg-[#F5F5F4] rounded-xl">
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="w-4 h-4 text-[#57534E]" />
              <h3 className="text-sm font-semibold text-[#1C1917]">Day Preferences</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(stats.day_type_preferences).map(([dayType, count]) => {
                const percentage = totalDayTypes > 0 ? (count / totalDayTypes) * 100 : 0;
                const isWeekend = dayType === 'weekend';
                return (
                  <div key={dayType} className={`p-3 rounded-xl border ${isWeekend ? 'bg-[#d97706]/10 border-[#d97706]/30' : 'bg-[#7c3aed]/10 border-[#7c3aed]/30'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {isWeekend ? <Sun className="w-4 h-4 text-[#d97706]" /> : <Moon className="w-4 h-4 text-[#7c3aed]" />}
                        <span className="text-sm font-medium text-[#1C1917] capitalize">{dayType}</span>
                      </div>
                      <span className="text-xl font-bold text-[#1C1917]">{count}</span>
                    </div>
                    <div className="w-full bg-white h-2 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${isWeekend ? 'bg-[#d97706]' : 'bg-[#7c3aed]'}`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Time Slot Preferences */}
          <div className="p-4 bg-[#F5F5F4] rounded-xl">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-[#57534E]" />
              <h3 className="text-sm font-semibold text-[#1C1917]">Time Slot Preferences</h3>
            </div>
            <div className="space-y-2">
              {Object.entries(stats.time_slot_preferences)
                .sort(([, a], [, b]) => b - a)
                .map(([timeSlot, count]) => {
                  const totalTimeSlots = Object.values(stats.time_slot_preferences).reduce((sum, c) => sum + c, 0);
                  const percentage = totalTimeSlots > 0 ? (count / totalTimeSlots) * 100 : 0;
                  return (
                    <div key={timeSlot} className="flex items-center gap-3">
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-[#1C1917]">{timeSlot}</span>
                          <span className="text-sm text-[#57534E]">{count} ({percentage.toFixed(0)}%)</span>
                        </div>
                        <div className="w-full bg-white h-2 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#7c3aed]"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Spontaneity Distribution */}
          <div className="p-4 bg-[#F5F5F4] rounded-xl">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-4 h-4 text-[#57534E]" />
              <h3 className="text-sm font-semibold text-[#1C1917]">Booking Spontaneity</h3>
            </div>
            <div className="space-y-2">
              {Object.entries(stats.spontaneity_distribution)
                .sort(([, a], [, b]) => b - a)
                .map(([level, count]) => {
                  const percentage = totalSpontaneity > 0 ? (count / totalSpontaneity) * 100 : 0;
                  return (
                    <div key={level} className="flex items-center gap-3">
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-[#1C1917]">{getSpontaneityLabel(level)}</span>
                          <span className="text-sm text-[#57534E]">{count} ({percentage.toFixed(0)}%)</span>
                        </div>
                        <div className="w-full bg-white h-2 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${getSpontaneityColor(level)}`}
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Upcoming Occasions */}
          {occasions.length > 0 && (
            <div className="p-4 bg-[#9F1239]/10 rounded-xl border border-[#9F1239]/20">
              <button
                onClick={() => setShowOccasions(!showOccasions)}
                className="w-full flex items-center justify-between mb-3"
              >
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[#9F1239]" />
                  <h3 className="text-sm font-semibold text-[#1C1917]">Upcoming Special Occasions</h3>
                  <span className="px-2 py-0.5 bg-[#9F1239]/20 text-[#9F1239] text-xs rounded-full font-semibold">
                    {occasions.length}
                  </span>
                </div>
                {showOccasions ? <ChevronUp className="w-4 h-4 text-[#57534E]" /> : <ChevronDown className="w-4 h-4 text-[#57534E]" />}
              </button>

              {showOccasions && (
                <div className="space-y-2">
                  {occasions.slice(0, 5).map((occasion) => (
                    <div key={occasion.id} className="p-2 bg-white/50 rounded-xl flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-[#1C1917] capitalize">
                          {occasion.occasion_type.replace('_', ' ')}
                        </div>
                        <div className="text-xs text-[#57534E]">
                          {occasion.customer_id} • Party of {occasion.party_size}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-[#9F1239]">
                          {new Date(occasion.next_predicted_date).toLocaleDateString()}
                        </div>
                        <div className="text-xs text-[#57534E]">
                          {Math.round(occasion.probability_score * 100)}% confidence
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Predictions Made */}
          <div className="p-3 bg-[#16a34a]/10 rounded-xl border border-[#16a34a]/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-[#16a34a]" />
                <span className="text-sm font-semibold text-[#1C1917]">Total Predictions Made</span>
              </div>
              <span className="text-xl font-bold text-[#1C1917]">{stats.total_predictions_made}</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={analyzeAllCustomers}
              className="flex-1 px-4 py-3 bg-[#9F1239] hover:bg-[#881337] text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-[#9F1239]/30 flex items-center justify-center gap-2"
            >
              <Activity className="w-5 h-5" />
              Analyze All Customers
            </button>
            <button
              onClick={() => alert('Customer search feature coming soon!')}
              className="px-4 py-3 bg-[#7c3aed] hover:bg-[#6d28d9] text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2"
            >
              <Search className="w-5 h-5" />
              Search
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

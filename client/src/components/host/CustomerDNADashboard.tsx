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
  MapPin,
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
      case 'solo': return 'bg-gray-500/10 border-gray-500/30 text-gray-400';
      case 'couple': return 'bg-pink-500/10 border-pink-500/30 text-pink-400';
      case 'family': return 'bg-blue-500/10 border-blue-500/30 text-blue-400';
      case 'business': return 'bg-purple-500/10 border-purple-500/30 text-purple-400';
      case 'group': return 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400';
      default: return 'bg-gray-500/10 border-gray-500/30 text-gray-400';
    }
  };

  const getSpontaneityColor = (level: string) => {
    switch (level) {
      case 'very_spontaneous': return 'bg-red-500';
      case 'spontaneous': return 'bg-orange-500';
      case 'moderate': return 'bg-yellow-500';
      case 'planner': return 'bg-blue-500';
      case 'advance_planner': return 'bg-purple-500';
      default: return 'bg-gray-500';
    }
  };

  const getSpontaneityLabel = (level: string) => {
    return level.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  if (isLoading) {
    return (
      <div className="bg-card rounded-lg shadow-lg p-6 border border-border">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Brain className="w-5 h-5" />
            Customer DNA Profiling
          </h2>
        </div>
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!stats || stats.total_profiles === 0) {
    return (
      <div className="bg-card rounded-lg shadow-lg p-6 border border-border">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
            <Brain className="w-6 h-6 text-muted-foreground" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">No DNA Profiles Yet</h3>
            <p className="text-sm text-muted-foreground">Analyze customer behavior to unlock insights</p>
          </div>
        </div>
        <button
          onClick={analyzeAllCustomers}
          className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-all shadow-lg hover:shadow-blue-500/30 flex items-center justify-center gap-2"
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
    <div className="bg-card rounded-lg shadow-lg border border-border">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-6 flex items-center justify-between hover:bg-muted/20 transition-colors rounded-t-lg"
      >
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Brain className="w-5 h-5 text-purple-500" />
          Customer DNA Profiling
          <span className="px-2 py-1 bg-purple-500/20 text-purple-400 text-sm rounded-full font-semibold">
            {stats.total_profiles} Profiles
          </span>
        </h2>
        <div className={`transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
          <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
            <div className="p-4 bg-purple-500/10 rounded-lg border border-purple-500/20">
              <div className="flex items-center justify-between mb-2">
                <Brain className="w-5 h-5 text-purple-400" />
                <span className="text-2xl font-bold text-foreground">{stats.total_profiles}</span>
              </div>
              <div className="text-xs text-muted-foreground">DNA Profiles</div>
            </div>

            {/* Avg Confidence */}
            <div className="p-4 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
              <div className="flex items-center justify-between mb-2">
                <Target className="w-5 h-5 text-emerald-400" />
                <span className="text-2xl font-bold text-foreground">{stats.avg_confidence}%</span>
              </div>
              <div className="text-xs text-muted-foreground">Avg Confidence</div>
            </div>

            {/* Occasions Detected */}
            <div className="p-4 bg-blue-500/10 rounded-lg border border-blue-500/20">
              <div className="flex items-center justify-between mb-2">
                <Calendar className="w-5 h-5 text-blue-400" />
                <span className="text-2xl font-bold text-foreground">{stats.total_occasions_detected}</span>
              </div>
              <div className="text-xs text-muted-foreground">Occasions Found</div>
            </div>
          </div>

          {/* Dining Styles Breakdown */}
          <div className="p-4 bg-muted/30 rounded-lg">
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">Dining Styles</h3>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {Object.entries(stats.dining_styles).map(([style, count]) => {
                const percentage = totalDiningStyles > 0 ? (count / totalDiningStyles) * 100 : 0;
                return (
                  <div key={style} className={`p-3 rounded-lg border text-center ${getDiningStyleColor(style)}`}>
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
          <div className="p-4 bg-muted/30 rounded-lg">
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">Day Preferences</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(stats.day_type_preferences).map(([dayType, count]) => {
                const percentage = totalDayTypes > 0 ? (count / totalDayTypes) * 100 : 0;
                const isWeekend = dayType === 'weekend';
                return (
                  <div key={dayType} className={`p-3 rounded-lg border ${isWeekend ? 'bg-orange-500/10 border-orange-500/30' : 'bg-blue-500/10 border-blue-500/30'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {isWeekend ? <Sun className="w-4 h-4 text-orange-400" /> : <Moon className="w-4 h-4 text-blue-400" />}
                        <span className="text-sm font-medium text-foreground capitalize">{dayType}</span>
                      </div>
                      <span className="text-xl font-bold text-foreground">{count}</span>
                    </div>
                    <div className="w-full bg-muted h-2 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${isWeekend ? 'bg-orange-500' : 'bg-blue-500'}`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Time Slot Preferences */}
          <div className="p-4 bg-muted/30 rounded-lg">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">Time Slot Preferences</h3>
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
                          <span className="text-sm font-medium text-foreground">{timeSlot}</span>
                          <span className="text-sm text-muted-foreground">{count} ({percentage.toFixed(0)}%)</span>
                        </div>
                        <div className="w-full bg-muted h-2 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-purple-500"
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
          <div className="p-4 bg-muted/30 rounded-lg">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">Booking Spontaneity</h3>
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
                          <span className="text-sm font-medium text-foreground">{getSpontaneityLabel(level)}</span>
                          <span className="text-sm text-muted-foreground">{count} ({percentage.toFixed(0)}%)</span>
                        </div>
                        <div className="w-full bg-muted h-2 rounded-full overflow-hidden">
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
            <div className="p-4 bg-pink-500/10 rounded-lg border border-pink-500/20">
              <button
                onClick={() => setShowOccasions(!showOccasions)}
                className="w-full flex items-center justify-between mb-3"
              >
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-pink-400" />
                  <h3 className="text-sm font-semibold text-foreground">Upcoming Special Occasions</h3>
                  <span className="px-2 py-0.5 bg-pink-500/20 text-pink-400 text-xs rounded-full font-semibold">
                    {occasions.length}
                  </span>
                </div>
                {showOccasions ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {showOccasions && (
                <div className="space-y-2">
                  {occasions.slice(0, 5).map((occasion) => (
                    <div key={occasion.id} className="p-2 bg-card/50 rounded-lg flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-foreground capitalize">
                          {occasion.occasion_type.replace('_', ' ')}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {occasion.customer_id} • Party of {occasion.party_size}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-pink-400">
                          {new Date(occasion.next_predicted_date).toLocaleDateString()}
                        </div>
                        <div className="text-xs text-muted-foreground">
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
          <div className="p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-semibold text-foreground">Total Predictions Made</span>
              </div>
              <span className="text-xl font-bold text-foreground">{stats.total_predictions_made}</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={analyzeAllCustomers}
              className="flex-1 px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-all shadow-lg hover:shadow-purple-500/30 flex items-center justify-center gap-2"
            >
              <Activity className="w-5 h-5" />
              Analyze All Customers
            </button>
            <button
              onClick={() => alert('Customer search feature coming soon!')}
              className="px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-all flex items-center justify-center gap-2"
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

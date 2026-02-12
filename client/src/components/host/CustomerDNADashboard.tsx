/**
 * Customer DNA Profiling Dashboard
 *
 * Displays deep behavioral insights about customers
 * Goes beyond LTV to understand WHO customers are and WHAT they prefer
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authFetch } from '../../services/api';
import ThiingsIcon from '../common/ThiingsIcon';

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

interface CustomerListItem {
  customer_id: string;
  customer_name: string | null;
  dining_style: string;
  typical_party_size: number;
  profile_confidence: number;
  avg_check_per_person: number | null;
  spontaneity_score: number;
  preferred_time_slot: string;
  analysis_version: string | null;
}

export default function CustomerDNADashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DNAStats | null>(null);
  const [occasions, setOccasions] = useState<Occasion[]>([]);
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(true);
  const [showOccasions, setShowOccasions] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [styleFilter, setStyleFilter] = useState('');
  const [isLoadingList, setIsLoadingList] = useState(false);

  useEffect(() => {
    fetchDNAData();
    fetchCustomerList();
    const interval = setInterval(fetchDNAData, 300000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const debounce = setTimeout(() => {
      fetchCustomerList();
    }, 300);
    return () => clearTimeout(debounce);
  }, [searchQuery, styleFilter]);

  const fetchDNAData = async () => {
    try {
      // Fetch statistics
      const statsResponse = await authFetch('/api/customer-dna?action=stats');
      const statsResult = await statsResponse.json();
      if (statsResult.success) {
        setStats(statsResult.data);
      }

      // Fetch upcoming occasions
      const occasionsResponse = await authFetch('/api/customer-dna?action=occasions&limit=10');
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

  const fetchCustomerList = async () => {
    try {
      setIsLoadingList(true);
      const params = new URLSearchParams({ action: 'list', limit: '50', offset: '0' });
      if (searchQuery) params.set('search', searchQuery);
      if (styleFilter) params.set('dining_style', styleFilter);

      const response = await authFetch(`/api/customer-dna?${params.toString()}`);
      const result = await response.json();
      if (result.success) {
        setCustomers(result.data.profiles || []);
      }
    } catch (error) {
      console.error('Error fetching customer list:', error);
    } finally {
      setIsLoadingList(false);
    }
  };

  const analyzeAllCustomers = async () => {
    try {
      setIsLoading(true);
      const response = await authFetch('/api/customer-dna?action=analyze-all');
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
      case 'solo': return <ThiingsIcon name="users" pxSize={16} />;
      case 'couple': return <ThiingsIcon name="users" pxSize={16} />;
      case 'family': return <ThiingsIcon name="users" pxSize={16} />;
      case 'business': return <ThiingsIcon name="coffee" pxSize={16} />;
      case 'group': return <ThiingsIcon name="users" pxSize={16} />;
      default: return <ThiingsIcon name="users" pxSize={16} />;
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
          <h2 className="text-xl font-bold font-serif text-[#1C1917] flex items-center gap-2">
            <ThiingsIcon name="brain" pxSize={20} />
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
            <ThiingsIcon name="brain" pxSize={24} />
          </div>
          <div>
            <h3 className="text-lg font-semibold font-serif text-[#1C1917]">No DNA Profiles Yet</h3>
            <p className="text-sm text-[#57534E]">Analyze customer behavior to unlock insights</p>
          </div>
        </div>
        <button
          onClick={analyzeAllCustomers}
          className="w-full px-4 py-3 bg-[#9F1239] hover:bg-[#881337] text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-[#9F1239]/30 flex items-center justify-center gap-2"
        >
          <ThiingsIcon name="activity" pxSize={20} />
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
        <h2 className="text-xl font-bold font-serif text-[#1C1917] flex items-center gap-2">
          <ThiingsIcon name="brain" pxSize={20} />
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Total Profiles */}
            <div className="p-4 bg-[#7c3aed]/10 rounded-xl border border-[#7c3aed]/20">
              <div className="flex items-center justify-between mb-2">
                <ThiingsIcon name="brain" pxSize={20} />
                <span className="text-2xl font-bold text-[#1C1917]">{stats.total_profiles}</span>
              </div>
              <div className="text-xs text-[#57534E]">DNA Profiles</div>
            </div>

            {/* Avg Confidence */}
            <div className="p-4 bg-[#16a34a]/10 rounded-xl border border-[#16a34a]/20">
              <div className="flex items-center justify-between mb-2">
                <ThiingsIcon name="target" pxSize={20} />
                <span className="text-2xl font-bold text-[#1C1917]">{stats.avg_confidence}%</span>
              </div>
              <div className="text-xs text-[#57534E]">Avg Confidence</div>
            </div>

            {/* Occasions Detected */}
            <div className="p-4 bg-[#9F1239]/10 rounded-xl border border-[#9F1239]/20">
              <div className="flex items-center justify-between mb-2">
                <ThiingsIcon name="calendar" pxSize={20} />
                <span className="text-2xl font-bold text-[#1C1917]">{stats.total_occasions_detected}</span>
              </div>
              <div className="text-xs text-[#57534E]">Occasions Found</div>
            </div>
          </div>

          {/* Dining Styles Breakdown */}
          <div className="p-4 bg-[#F5F5F4] rounded-xl">
            <div className="flex items-center gap-2 mb-3">
              <ThiingsIcon name="users" pxSize={16} />
              <h3 className="text-sm font-semibold font-serif text-[#1C1917]">Dining Styles</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
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
              <ThiingsIcon name="calendar" pxSize={16} />
              <h3 className="text-sm font-semibold font-serif text-[#1C1917]">Day Preferences</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(stats.day_type_preferences).map(([dayType, count]) => {
                const percentage = totalDayTypes > 0 ? (count / totalDayTypes) * 100 : 0;
                const isWeekend = dayType === 'weekend';
                return (
                  <div key={dayType} className={`p-3 rounded-xl border ${isWeekend ? 'bg-[#d97706]/10 border-[#d97706]/30' : 'bg-[#7c3aed]/10 border-[#7c3aed]/30'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {isWeekend ? <ThiingsIcon name="sun" pxSize={16} /> : <ThiingsIcon name="moon" pxSize={16} />}
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
              <ThiingsIcon name="clock" pxSize={16} />
              <h3 className="text-sm font-semibold font-serif text-[#1C1917]">Time Slot Preferences</h3>
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
              <ThiingsIcon name="zap" pxSize={16} />
              <h3 className="text-sm font-semibold font-serif text-[#1C1917]">Booking Spontaneity</h3>
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
                  <ThiingsIcon name="calendar" pxSize={16} />
                  <h3 className="text-sm font-semibold font-serif text-[#1C1917]">Upcoming Special Occasions</h3>
                  <span className="px-2 py-0.5 bg-[#9F1239]/20 text-[#9F1239] text-xs rounded-full font-semibold">
                    {occasions.length}
                  </span>
                </div>
                {showOccasions ? <ThiingsIcon name="chevron-up" pxSize={16} /> : <ThiingsIcon name="chevron-down" pxSize={16} />}
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
                <ThiingsIcon name="trending-up" pxSize={16} />
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
              <ThiingsIcon name="activity" pxSize={20} />
              Analyze All Customers
            </button>
          </div>

          {/* Customer List Section */}
          <div className="p-4 bg-[#F5F5F4] rounded-xl">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <ThiingsIcon name="users" pxSize={16} />
                <h3 className="text-sm font-semibold font-serif text-[#1C1917]">Customer Profiles</h3>
              </div>
            </div>

            {/* Search & Filter */}
            <div className="flex gap-2 mb-3">
              <div className="flex-1 relative">
                <ThiingsIcon name="search" pxSize={16} className="absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search by name or phone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-[#E7E5E4] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/30 focus:border-[#7c3aed]"
                />
              </div>
              <div className="relative">
                <ThiingsIcon name="filter" pxSize={16} className="absolute left-3 top-1/2 -translate-y-1/2" />
                <select
                  value={styleFilter}
                  onChange={(e) => setStyleFilter(e.target.value)}
                  className="pl-9 pr-8 py-2 text-sm bg-white border border-[#E7E5E4] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/30 focus:border-[#7c3aed] appearance-none cursor-pointer"
                >
                  <option value="">All Styles</option>
                  <option value="solo">Solo</option>
                  <option value="couple">Couple</option>
                  <option value="family">Family</option>
                  <option value="business">Business</option>
                  <option value="group">Group</option>
                </select>
              </div>
            </div>

            {/* Customer Table */}
            {isLoadingList ? (
              <div className="text-center py-4 text-sm text-[#57534E]">Loading customers...</div>
            ) : customers.length > 0 ? (
              <div className="space-y-1">
                {/* Table Header */}
                <div className="hidden md:grid grid-cols-12 gap-2 px-3 py-2 text-xs font-semibold text-[#57534E] uppercase">
                  <div className="col-span-3">Name</div>
                  <div className="col-span-2">Style</div>
                  <div className="col-span-1 text-center">Visits</div>
                  <div className="col-span-2 text-right">Avg Spend</div>
                  <div className="col-span-2 text-center">Confidence</div>
                  <div className="col-span-2 text-right"></div>
                </div>

                {/* Rows */}
                {customers.map((customer) => (
                  <button
                    key={customer.customer_id}
                    onClick={() => navigate(`/host-dashboard/dna/${encodeURIComponent(customer.customer_id)}`)}
                    className="w-full px-3 py-3 bg-white rounded-lg border border-transparent hover:border-[#7c3aed]/30 hover:shadow-sm transition-all text-left"
                  >
                    {/* Mobile layout */}
                    <div className="flex md:hidden items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-[#1C1917] truncate">
                          {customer.customer_name || customer.customer_id}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border capitalize ${getDiningStyleColor(customer.dining_style)}`}>
                            {customer.dining_style}
                          </span>
                          <span className="text-xs text-[#57534E]">
                            {customer.avg_check_per_person != null ? `€${customer.avg_check_per_person.toFixed(0)}` : '--'}
                          </span>
                          <span className="text-xs text-[#57534E]">{customer.profile_confidence}%</span>
                        </div>
                      </div>
                      <ThiingsIcon name="chevron-right" pxSize={16} className="ml-2" />
                    </div>
                    {/* Desktop layout */}
                    <div className="hidden md:grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-3">
                        <div className="text-sm font-medium text-[#1C1917] truncate">
                          {customer.customer_name || customer.customer_id}
                        </div>
                        {customer.customer_name && (
                          <div className="text-xs text-[#A8A29E] truncate">{customer.customer_id}</div>
                        )}
                      </div>
                      <div className="col-span-2">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border capitalize ${getDiningStyleColor(customer.dining_style)}`}>
                          {customer.dining_style}
                        </span>
                      </div>
                      <div className="col-span-1 text-center text-sm text-[#1C1917]">
                        {Math.round(customer.typical_party_size)}
                      </div>
                      <div className="col-span-2 text-right text-sm text-[#1C1917]">
                        {customer.avg_check_per_person != null ? `€${customer.avg_check_per_person.toFixed(0)}` : '--'}
                      </div>
                      <div className="col-span-2 flex items-center justify-center gap-1">
                        <div className="w-16 bg-[#E7E5E4] h-1.5 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#7c3aed] rounded-full"
                            style={{ width: `${customer.profile_confidence}%` }}
                          />
                        </div>
                        <span className="text-xs text-[#57534E]">{customer.profile_confidence}%</span>
                      </div>
                      <div className="col-span-2 flex justify-end">
                        <ThiingsIcon name="chevron-right" pxSize={16} />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 text-sm text-[#57534E]">
                {searchQuery || styleFilter ? 'No customers match your filters' : 'No customer profiles available'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

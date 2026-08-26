/**
 * Customer DNA Profiling Dashboard
 *
 * Displays deep behavioral insights about customers
 * Goes beyond LTV to understand WHO customers are and WHAT they prefer
 */

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '../../contexts/ToastContext';
import ThiingsIcon from '../common/ThiingsIcon';
import DNAStatsBreakdown from './DNAStatsBreakdown';
import DNACustomerList from './DNACustomerList';
import { useCustomerDNAStats, useCustomerDNAList, useAnalyzeAllCustomers } from '../../hooks/useCustomerDNA';

export default function CustomerDNADashboard() {
  const { t } = useTranslation();
  const { success, error } = useToast();
  const [isExpanded, setIsExpanded] = useState(true);
  const [showOccasions, setShowOccasions] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [styleFilter, setStyleFilter] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const statsQuery = useCustomerDNAStats();
  const listQuery = useCustomerDNAList({ search: debouncedSearch, styleFilter });
  const analyze = useAnalyzeAllCustomers();

  const stats = statsQuery.data?.stats ?? null;
  const occasions = statsQuery.data?.occasions ?? [];
  const customers = listQuery.data ?? [];
  const isLoading = statsQuery.isLoading;
  const isLoadingList = listQuery.isFetching;

  const analyzeAllCustomers = () => {
    analyze.mutate(undefined, {
      onSuccess: (result) => success(`Analyzed DNA for ${result.total_analyzed} customers`),
      onError: () => error('Failed to analyze customer DNA'),
    });
  };

  if (isLoading || analyze.isPending) {
    return (
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-serif text-deep-charcoal flex items-center gap-2">
            <ThiingsIcon name="brain" pxSize={20} />
            Customer DNA Profiling
          </h2>
        </div>
        <div role="status" className="flex items-center justify-center py-8 gap-3">
          <div aria-hidden="true" className="w-6 h-6 border-2 border-burgundy border-t-transparent rounded-full animate-spin" />
          <span className="text-stone-gray text-sm">{t('common.loadingProfiles')}</span>
        </div>
      </div>
    );
  }

  if (!stats || stats.total_profiles === 0) {
    return (
      <div className="glass-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-full bg-soft-gray flex items-center justify-center">
            <ThiingsIcon name="brain" pxSize={24} />
          </div>
          <div>
            <h3 className="text-lg font-serif text-deep-charcoal">No DNA Profiles Yet</h3>
            <p className="text-sm text-stone-gray">Analyze customer behavior to unlock insights</p>
          </div>
        </div>
        <button
          onClick={analyzeAllCustomers}
          className="w-full px-4 py-3 bg-burgundy hover:bg-burgundy-dark text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2"
        >
          <ThiingsIcon name="activity" pxSize={20} />
          Analyze All Customers
        </button>
      </div>
    );
  }

  return (
    <div className="glass-panel">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        className="w-full p-6 flex items-center justify-between hover:bg-soft-gray/50 transition-colors rounded-t-2xl"
      >
        <h2 className="text-xl font-serif text-deep-charcoal flex items-center gap-2">
          <ThiingsIcon name="brain" pxSize={20} />
          Customer DNA Profiling
          <span className="px-2 py-1 bg-ocre-600/20 text-ocre-600 text-sm rounded-full font-semibold">
            {stats.total_profiles} Profiles
          </span>
        </h2>
        <div className={`transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
          <ThiingsIcon name="chevron-down" pxSize={20} className="text-stone-gray" />
        </div>
      </button>

      {isExpanded && (
        <div className="px-6 pb-6 space-y-4">
          {/* Key Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-4 bg-ocre-600/10 rounded-xl border border-ocre-600/20">
              <div className="flex items-center justify-between mb-2">
                <ThiingsIcon name="brain" pxSize={20} />
                <span className="text-2xl font-bold text-deep-charcoal">{stats.total_profiles}</span>
              </div>
              <div className="text-xs text-stone-gray">DNA Profiles</div>
            </div>
            <div className="p-4 bg-rose-600/10 rounded-xl border border-rose-600/20">
              <div className="flex items-center justify-between mb-2">
                <ThiingsIcon name="target" pxSize={20} />
                <span className="text-2xl font-bold text-deep-charcoal">{stats.avg_confidence}%</span>
              </div>
              <div className="text-xs text-stone-gray">Avg Confidence</div>
            </div>
            <div className="p-4 bg-burgundy/10 rounded-xl border border-burgundy/20">
              <div className="flex items-center justify-between mb-2">
                <ThiingsIcon name="calendar" pxSize={20} />
                <span className="text-2xl font-bold text-deep-charcoal">{stats.total_occasions_detected}</span>
              </div>
              <div className="text-xs text-stone-gray">Occasions Found</div>
            </div>
          </div>

          <DNAStatsBreakdown stats={stats} />

          {/* Upcoming Occasions */}
          {occasions.length > 0 && (
            <div className="p-4 bg-burgundy/10 rounded-xl border border-burgundy/20">
              <button
                onClick={() => setShowOccasions(!showOccasions)}
                aria-expanded={showOccasions}
                className="w-full flex items-center justify-between mb-3"
              >
                <div className="flex items-center gap-2">
                  <ThiingsIcon name="calendar" pxSize={16} />
                  <h3 className="text-sm font-serif text-deep-charcoal">Upcoming Special Occasions</h3>
                  <span className="px-2 py-0.5 bg-burgundy/20 text-burgundy text-xs rounded-full font-semibold">
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
                        <div className="text-sm font-medium text-deep-charcoal capitalize">
                          {occasion.occasion_type.replace('_', ' ')}
                        </div>
                        <div className="text-xs text-stone-gray">
                          {occasion.customer_id} &bull; Party of {occasion.party_size}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-burgundy">
                          {new Date(occasion.next_predicted_date).toLocaleDateString()}
                        </div>
                        <div className="text-xs text-stone-gray">
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
          <div className="p-3 bg-rose-600/10 rounded-xl border border-rose-600/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ThiingsIcon name="trending-up" pxSize={16} />
                <span className="text-sm font-semibold text-deep-charcoal">Total Predictions Made</span>
              </div>
              <span className="text-xl font-bold text-deep-charcoal">{stats.total_predictions_made}</span>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={analyzeAllCustomers}
              className="flex-1 px-4 py-3 bg-burgundy hover:bg-burgundy-dark text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2"
            >
              <ThiingsIcon name="activity" pxSize={20} />
              Analyze All Customers
            </button>
          </div>

          <DNACustomerList
            customers={customers}
            isLoading={isLoadingList}
            searchQuery={searchQuery}
            styleFilter={styleFilter}
            onSearchChange={setSearchQuery}
            onStyleFilterChange={setStyleFilter}
          />
        </div>
      )}
    </div>
  );
}

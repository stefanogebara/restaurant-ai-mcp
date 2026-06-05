import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '../components/layout/DashboardLayout';
import CustomerTierBadge from '../components/dashboard/CustomerTierBadge';
import CrmCustomerDrawer from '../components/dashboard/CrmCustomerDrawer';
import DuplicateCustomersPanel from '../components/dashboard/DuplicateCustomersPanel';
import { useCustomerList } from '../hooks/useCustomers';
import type { CustomerListFilters } from '../hooks/useCustomers';
import { formatCurrency } from '../utils/currency';

const PAGE_SIZE = 25;

const TIER_OPTIONS = ['', 'vip', 'regular', 'occasional', 'new', 'at_risk'] as const;

const ALLERGY_FILTER_OPTIONS = [
  'Gluten', 'Lactose', 'Nuts', 'Seafood', 'Soy', 'Eggs', 'Shellfish',
];

const DIETARY_FILTER_OPTIONS = [
  'Vegetarian', 'Vegan', 'Pescatarian', 'Kosher', 'Halal', 'Low-carb', 'Keto',
];

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

type TFunction = (key: string, options?: Record<string, unknown> | string, fallback?: string) => string;

function formatRelativeDate(dateStr: string | null, t: TFunction): string {
  if (!dateStr) return '--';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return t('crm.relativeDate.today', 'Today');
  if (diffDays === 1) return t('crm.relativeDate.yesterday', 'Yesterday');
  if (diffDays < 7) return t('crm.relativeDate.days', { count: diffDays, defaultValue: `${diffDays}d` });
  if (diffDays < 30) {
    const count = Math.floor(diffDays / 7);
    return t('crm.relativeDate.weeks', { count, defaultValue: `${count}w` });
  }
  if (diffDays < 365) {
    const count = Math.floor(diffDays / 30);
    return t('crm.relativeDate.months', { count, defaultValue: `${count}mo` });
  }
  const count = Math.floor(diffDays / 365);
  return t('crm.relativeDate.years', { count, defaultValue: `${count}y` });
}

export default function CustomersPage() {
  const { t } = useTranslation();

  const [searchInput, setSearchInput] = useState('');
  const [tierFilter, setTierFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [allergyFilter, setAllergyFilter] = useState('');
  const [dietaryFilter, setDietaryFilter] = useState('');
  const [page, setPage] = useState(0);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [showDuplicates, setShowDuplicates] = useState(false);

  const debouncedSearch = useDebounce(searchInput, 300);

  // Reset page when filters change
  const resetPage = useCallback(() => setPage(0), []);
  useEffect(() => { resetPage(); }, [debouncedSearch, tierFilter, tagFilter, allergyFilter, dietaryFilter, resetPage]);

  const filters: CustomerListFilters = {
    search: debouncedSearch || undefined,
    tier: tierFilter || undefined,
    tag: tagFilter || undefined,
    allergy: allergyFilter || undefined,
    dietary: dietaryFilter || undefined,
    sort: 'last_visit_date',
    order: 'desc',
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  };

  const { data, isLoading, isError } = useCustomerList(filters);

  const customers = data?.customers ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 overflow-x-hidden pb-24 sm:pb-6 mt-14 sm:mt-0">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6 pl-10 sm:pl-0">
          <div>
            <h1 className="text-xl font-bold text-stone-900">
              {t('crm.pageTitle', 'Customers')}
            </h1>
            {total > 0 && (
              <p className="text-sm text-stone-500 mt-0.5">
                {t('crm.totalCustomers', { count: total, defaultValue: '{{count}} customers' })}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowDuplicates(true)}
            className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-stone-700 border border-glass-border-dark rounded-lg bg-white/40 hover:bg-white/70 transition-colors"
          >
            {t('crm.findDuplicates', 'Find Duplicates')}
          </button>
        </div>

        {/* Filters */}
        <div className="space-y-3 mb-6">
          {/* Search */}
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t('crm.searchPlaceholder', 'Search by name, phone or email...')}
              aria-label={t('crm.ariaSearch', 'Search customers')}
              className="w-full pl-10 pr-4 py-2.5 text-sm border border-glass-border-input rounded-lg bg-white/60 backdrop-blur-glass-chip text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-[#9F1239]/30 focus:border-[#9F1239]/30"
            />
          </div>

          {/* Filter row */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <select
              value={tierFilter}
              onChange={(e) => setTierFilter(e.target.value)}
              aria-label={t('crm.ariaTierFilter', 'Filter by tier')}
              className="flex-1 min-w-[120px] sm:flex-none text-sm border border-glass-border-input rounded-lg px-3 py-2 text-stone-700 bg-white/60 focus:outline-none focus:ring-1 focus:ring-[#9F1239]/30 focus:border-[#9F1239]/30"
            >
              <option value="">{t('crm.allTiers', 'All tiers')}</option>
              {TIER_OPTIONS.filter(Boolean).map((tier) => (
                <option key={tier} value={tier}>
                  {t(`crm.tier_${tier}`, tier)}
                </option>
              ))}
            </select>

            <input
              type="text"
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              placeholder={t('crm.filterByTag', 'Filter by tag...')}
              aria-label={t('crm.filterByTag', 'Filter by tag...')}
              className="flex-1 min-w-[120px] sm:flex-none text-sm border border-glass-border-input rounded-lg px-3 py-2 text-stone-700 placeholder:text-stone-400 bg-white focus:outline-none focus:ring-1 focus:ring-[#9F1239]/30 focus:border-[#9F1239]/30"
            />

            <select
              value={allergyFilter}
              onChange={(e) => setAllergyFilter(e.target.value)}
              aria-label={t('crm.ariaAllergyFilter', 'Filter by allergy')}
              className="flex-1 min-w-[120px] sm:flex-none text-sm border border-glass-border-input rounded-lg px-3 py-2 text-stone-700 bg-white/60 focus:outline-none focus:ring-1 focus:ring-[#9F1239]/30 focus:border-[#9F1239]/30"
            >
              <option value="">{t('crm.allAllergies', 'All allergies')}</option>
              {ALLERGY_FILTER_OPTIONS.map((a) => (
                <option key={a} value={a}>
                  {t(`crm.allergy_${a.toLowerCase()}`, a)}
                </option>
              ))}
            </select>

            <select
              value={dietaryFilter}
              onChange={(e) => setDietaryFilter(e.target.value)}
              aria-label={t('crm.ariaDietaryFilter', 'Filter by dietary preference')}
              className="flex-1 min-w-[120px] sm:flex-none text-sm border border-glass-border-input rounded-lg px-3 py-2 text-stone-700 bg-white/60 focus:outline-none focus:ring-1 focus:ring-[#9F1239]/30 focus:border-[#9F1239]/30"
            >
              <option value="">{t('crm.allDietary', 'All dietary')}</option>
              {DIETARY_FILTER_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {t(`crm.dietary_${d.toLowerCase().replace('-', '_')}`, d)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="glass-panel rounded-xl overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-20" role="status" aria-label={t('crm.ariaLoading', 'Loading customers')}>
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-stone-200 border-t-[#9F1239]" aria-hidden="true" />
            </div>
          ) : isError ? (
            <div className="text-center py-20">
              <p className="text-sm text-red-600">{t('crm.loadError', 'Failed to load customers')}</p>
            </div>
          ) : customers.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-sm text-stone-500">{t('crm.noCustomers', 'No customers found')}</p>
              {(debouncedSearch || tierFilter || tagFilter || allergyFilter || dietaryFilter) && (
                <button
                  type="button"
                  onClick={() => { setSearchInput(''); setTierFilter(''); setTagFilter(''); setAllergyFilter(''); setDietaryFilter(''); }}
                  className="mt-2 text-sm text-[#9F1239] hover:underline"
                >
                  {t('crm.clearFilters', 'Clear filters')}
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#E5E7EB] bg-stone-50">
                      <th className="text-left px-4 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-widest">
                        {t('crm.colName', 'Customer')}
                      </th>
                      <th className="text-left px-4 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-widest">
                        {t('crm.colTier', 'Tier')}
                      </th>
                      <th className="text-right px-4 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-widest">
                        {t('crm.colVisits', 'Visits')}
                      </th>
                      <th className="text-right px-4 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-widest">
                        {t('crm.colLastVisit', 'Last Visit')}
                      </th>
                      <th className="text-right px-4 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-widest">
                        {t('crm.colLTV', 'LTV')}
                      </th>
                      <th className="text-left px-4 py-3 text-[10px] font-bold text-stone-500 uppercase tracking-widest">
                        {t('crm.colTags', 'Tags')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {customers.map((c) => (
                      <tr
                        key={c.customer_id}
                        onClick={() => setSelectedCustomerId(c.customer_id)}
                        className="border-b border-[#E5E7EB] last:border-0 hover:bg-stone-50 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-medium text-stone-900">
                              {c.customer_name || c.customer_phone}
                            </p>
                            {c.customer_name && (
                              <p className="text-xs text-stone-400">{c.customer_phone}</p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <CustomerTierBadge
                            tier={c.customer_tier as 'vip' | 'regular' | 'occasional' | 'new' | 'at_risk'}
                            compact
                          />
                        </td>
                        <td className="px-4 py-3 text-right text-stone-700 font-medium">
                          {c.total_visits}
                        </td>
                        <td className="px-4 py-3 text-right text-stone-500">
                          {formatRelativeDate(c.last_visit_date, t)}
                        </td>
                        <td className="px-4 py-3 text-right text-stone-700 font-medium">
                          {c.lifetime_value ? formatCurrency(Math.round(c.lifetime_value)) : '--'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {(c.tags || []).slice(0, 3).map((tag) => (
                              <span
                                key={tag}
                                className="text-[10px] bg-stone-100 text-stone-600 px-1.5 py-0.5 rounded"
                              >
                                {tag}
                              </span>
                            ))}
                            {(c.tags || []).length > 3 && (
                              <span className="text-[10px] text-stone-400">
                                +{c.tags.length - 3}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-[#E5E7EB]">
                  <p className="text-xs text-stone-500">
                    {t('crm.showing', {
                      from: page * PAGE_SIZE + 1,
                      to: Math.min((page + 1) * PAGE_SIZE, total),
                      total,
                      defaultValue: 'Showing {{from}}-{{to}} of {{total}}',
                    })}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                      disabled={page === 0}
                      className="px-3 py-1.5 text-xs font-medium border border-[#E5E7EB] rounded-lg text-stone-600 hover:bg-stone-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      {t('crm.prev', 'Previous')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                      disabled={page >= totalPages - 1}
                      className="px-3 py-1.5 text-xs font-medium border border-[#E5E7EB] rounded-lg text-stone-600 hover:bg-stone-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      {t('crm.next', 'Next')}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Customer Drawer */}
      <CrmCustomerDrawer
        customerId={selectedCustomerId}
        onClose={() => setSelectedCustomerId(null)}
      />

      {/* Duplicates Modal */}
      {showDuplicates && (
        <DuplicateCustomersPanel onClose={() => setShowDuplicates(false)} />
      )}
    </DashboardLayout>
  );
}

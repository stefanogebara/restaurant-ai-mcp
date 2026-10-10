import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '../components/layout/DashboardLayout';
import CustomerDirectory from '../components/dashboard/CustomerDirectory';
import CrmCustomerDrawer from '../components/dashboard/CrmCustomerDrawer';
import DuplicateCustomersPanel from '../components/dashboard/DuplicateCustomersPanel';
import { useCustomerList } from '../hooks/useCustomers';
import type { CustomerListFilters } from '../hooks/useCustomers';

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

export function CustomersWorkspace() {
  const { t } = useTranslation();

  const [searchInput, setSearchInput] = useState('');
  const [tierFilter, setTierFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [allergyFilter, setAllergyFilter] = useState('');
  const [dietaryFilter, setDietaryFilter] = useState('');
  const [reviewOnly, setReviewOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [showDuplicates, setShowDuplicates] = useState(false);

  const debouncedSearch = useDebounce(searchInput, 300);

  // Reset page when filters change
  const resetPage = useCallback(() => setPage(0), []);
  useEffect(() => { resetPage(); }, [debouncedSearch, tierFilter, tagFilter, allergyFilter, dietaryFilter, reviewOnly, resetPage]);

  const filters: CustomerListFilters = {
    search: debouncedSearch || undefined,
    tier: reviewOnly ? undefined : tierFilter || undefined,
    minRiskScore: reviewOnly ? 70 : undefined,
    tag: tagFilter || undefined,
    allergy: allergyFilter || undefined,
    dietary: dietaryFilter || undefined,
    sort: reviewOnly ? 'churn_risk_score' : 'last_visit_date',
    order: 'desc',
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  };

  const { data, isLoading, isError, refetch } = useCustomerList(filters);

  const customers = data?.customers ?? [];
  const total = data?.total ?? 0;
  const activeFilterCount = [!reviewOnly && !!tierFilter, !!tagFilter, !!allergyFilter, !!dietaryFilter].filter(Boolean).length;
  return (
    <>
      <main className={`min-h-screen bg-brand-paper font-brand text-brand-ink transition-[margin] duration-300 ${selectedCustomerId ? 'xl:mr-[520px]' : ''}`}>
      <div className="mx-auto max-w-[900px] overflow-x-hidden px-4 pb-24 pt-6 sm:px-6 sm:pb-8 lg:px-10 mt-14 sm:mt-0">
        <header className="mb-7">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-brand-muted">{t('crm.sectionLabel', 'Guest relationships')}</p>
          <div className="flex flex-wrap items-end gap-x-5 gap-y-1">
            <h1 className={`font-brand text-[38px] font-normal leading-none tracking-[-0.055em] text-brand-ink sm:text-[48px] ${selectedCustomerId ? 'lg:text-[40px]' : ''}`}>
              {t('crm.pageTitle', 'Customers')}
            </h1>
            {total > 0 && <p className="pb-1 text-[13px] tabular-nums text-brand-muted">{t('crm.totalCustomers', { count: total, defaultValue: '{{count}} customers' })}</p>}
          </div>
        </header>

        <nav aria-label={t('crm.directoryViews', 'Customer views')} className="mb-5 flex gap-8 border-b border-brand-line">
          <button type="button" aria-current={!reviewOnly ? 'page' : undefined} onClick={() => { setReviewOnly(false); setSelectedCustomerId(null); }} className={`min-h-11 border-b-2 pb-2 text-sm transition-colors ${!reviewOnly ? 'border-brand-action text-brand-ink' : 'border-transparent text-brand-muted hover:text-brand-ink'}`}>
            {t('crm.allCustomersView', 'All customers')}
          </button>
          <button type="button" aria-current={reviewOnly ? 'page' : undefined} onClick={() => { setReviewOnly(true); setSelectedCustomerId(null); }} className={`min-h-11 border-b-2 pb-2 text-sm transition-colors ${reviewOnly ? 'border-brand-action text-brand-ink' : 'border-transparent text-brand-muted hover:text-brand-ink'}`}>
            {t('crm.reviewView', 'For review')}
          </button>
        </nav>
        {reviewOnly && <p className="mb-4 max-w-2xl text-xs leading-relaxed text-brand-muted">{t('crm.reviewExplanation', 'Guests with a historical return-risk score above 70/100. Check reservations and visit history before deciding what to do.')}</p>}

        {/* Filters */}
        <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-1 md:gap-y-2.5">
          {/* Search */}
          <div className="relative w-full min-w-0 md:w-[22rem] md:flex-none">
            <svg
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-muted"
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
              placeholder={t('crm.searchPlaceholder', 'Search by name or phone...')}
              aria-label={t('crm.ariaSearch', 'Search customers')}
              className="min-h-[46px] w-full rounded-full border border-brand-line bg-white/55 py-2.5 pl-11 pr-4 text-sm text-brand-ink placeholder:text-brand-muted focus-visible:outline-2 focus-visible:outline-brand-action"
            />
          </div>

          <details className="group shrink-0 open:basis-full">
            <summary className="inline-flex min-h-[38px] cursor-pointer list-none items-center gap-2 text-xs font-medium text-brand-action marker:hidden focus-visible:outline-2 focus-visible:outline-brand-action">
              {t('crm.moreFilters', 'More filters')}{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
              <svg className="transition-transform group-open:rotate-180" width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m3 6 5 5 5-5" /></svg>
            </summary>
          <div className="flex flex-wrap items-center gap-2 pb-2 pt-1 sm:gap-3">
            {!reviewOnly && (
            <select
              value={tierFilter}
              onChange={(e) => setTierFilter(e.target.value)}
              aria-label={t('crm.ariaTierFilter', 'Filter by tier')}
              className="min-h-[44px] min-w-[120px] flex-1 rounded-full border border-brand-line bg-transparent px-4 py-2 text-sm text-brand-muted focus-visible:outline-2 focus-visible:outline-brand-action sm:flex-none"
            >
              <option value="">{t('crm.allTiers', 'All tiers')}</option>
              {TIER_OPTIONS.filter(Boolean).map((tier) => (
                <option key={tier} value={tier}>
                  {t(`crm.tier_${tier}`, tier)}
                </option>
              ))}
            </select>
            )}

            <input
              type="text"
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              placeholder={t('crm.filterByTag', 'Filter by tag...')}
              aria-label={t('crm.filterByTag', 'Filter by tag...')}
              className="min-h-[44px] min-w-[120px] flex-1 rounded-full border border-brand-line bg-transparent px-4 py-2 text-sm text-brand-ink placeholder:text-brand-muted focus-visible:outline-2 focus-visible:outline-brand-action sm:flex-none"
            />

            <select
              value={allergyFilter}
              onChange={(e) => setAllergyFilter(e.target.value)}
              aria-label={t('crm.ariaAllergyFilter', 'Filter by allergy')}
              className="min-h-[44px] min-w-[120px] flex-1 rounded-full border border-brand-line bg-transparent px-4 py-2 text-sm text-brand-muted focus-visible:outline-2 focus-visible:outline-brand-action sm:flex-none"
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
              className="min-h-[44px] min-w-[120px] flex-1 rounded-full border border-brand-line bg-transparent px-4 py-2 text-sm text-brand-muted focus-visible:outline-2 focus-visible:outline-brand-action sm:flex-none"
            >
              <option value="">{t('crm.allDietary', 'All dietary')}</option>
              {DIETARY_FILTER_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {t(`crm.dietary_${d.toLowerCase().replace('-', '_')}`, d)}
                </option>
              ))}
            </select>
          </div>
          </details>
          {total > 0 && !isLoading && !isError && (
            <button type="button" onClick={() => setShowDuplicates(true)} className="ml-auto min-h-[38px] text-left text-xs text-brand-muted underline-offset-4 hover:text-brand-ink hover:underline focus-visible:outline-2 focus-visible:outline-brand-action md:ml-0">
              {t('crm.findDuplicates', 'Find duplicates')}
            </button>
          )}
        </div>
        <p id="customer-score-explanation" className="sr-only">{t('crm.scoreExplanation', 'The return-risk signal is a 0–100 heuristic for review, not a probability.')}</p>

        {/* The directory lives on the canvas; the row itself is the interaction. */}
        <div className="border-t border-brand-line">
          {isLoading ? (
            <div className="flex items-center justify-center py-20" role="status" aria-label={t('crm.ariaLoading', 'Loading customers')}>
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-line border-t-brand-action" aria-hidden="true" />
            </div>
          ) : isError ? (
            <div role="alert" className="mx-auto max-w-sm py-16 text-center">
              <p className="text-sm text-red-700">{t('crm.loadError', 'Failed to load customers')}</p>
              <button type="button" onClick={() => void refetch()} className="mt-5 min-h-10 rounded-full border border-brand-line px-5 text-sm text-brand-action hover:bg-brand-ink/[0.04] focus-visible:outline-2 focus-visible:outline-brand-action">{t('common.retry', 'Try again')}</button>
            </div>
          ) : customers.length === 0 ? (
            <div className="mx-auto max-w-md py-16 text-center">
              {reviewOnly ? (
                <>
                  <h2 className="text-xl tracking-[-0.03em] text-brand-ink">{t('crm.noReviewTitle', 'No customers to review here')}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-brand-muted">{t('crm.noReviewHint', 'No customers have a historical return-risk score above 70/100 in this selection.')}</p>
                  <button type="button" onClick={() => setReviewOnly(false)} className="mt-5 rounded-full border border-brand-line px-5 py-2.5 text-sm text-brand-ink hover:bg-brand-ink/[0.04]">
                    {t('crm.allCustomersView', 'All customers')}
                  </button>
                </>
              ) : (debouncedSearch || tierFilter || tagFilter || allergyFilter || dietaryFilter) ? (
                <>
                  <p className="text-sm text-brand-muted">{t('crm.noCustomers', 'No customers found')}</p>
                  <button type="button" onClick={() => { setSearchInput(''); setTierFilter(''); setTagFilter(''); setAllergyFilter(''); setDietaryFilter(''); }} className="mt-3 text-sm text-brand-action underline-offset-4 hover:underline">
                    {t('crm.clearFilters', 'Clear filters')}
                  </button>
                </>
              ) : (
                <>
                  <h2 className="text-[25px] tracking-[-0.04em] text-brand-ink">{t('crm.emptyTitle', 'Your CRM is waiting for its first guests')}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-brand-muted">{t('crm.emptyHint', 'Customers appear here automatically after a reservation through the widget, WhatsApp or phone.')}</p>
                  <a href="/host-dashboard/simple" className="mt-6 inline-flex min-h-[44px] items-center rounded-full bg-brand-action px-6 py-2.5 text-sm text-white hover:bg-brand-ink">
                    {t('crm.emptyAddReservation', 'Add first reservation')}
                  </a>
                </>
              )}
            </div>
          ) : (
            <CustomerDirectory customers={customers} total={total} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} onOpen={setSelectedCustomerId} selectedCustomerId={selectedCustomerId} mode={reviewOnly ? 'relationship' : 'service'} />
          )}
        </div>
      </div>
      </main>

      {/* Customer Drawer */}
      <CrmCustomerDrawer
        customerId={selectedCustomerId}
        initialView={reviewOnly ? 'relationship' : 'service'}
        onClose={() => setSelectedCustomerId(null)}
      />

      {/* Duplicates Modal */}
      {showDuplicates && (
        <DuplicateCustomersPanel onClose={() => setShowDuplicates(false)} />
      )}
    </>
  );
}

export default function CustomersPage() {
  return <DashboardLayout appearance="hero"><CustomersWorkspace /></DashboardLayout>;
}

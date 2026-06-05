import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../common/ThiingsIcon';
import { formatCurrency } from '../../utils/currency';
import { getDiningStyleColor, type CustomerListItem } from './dnaHelpers';

interface DNACustomerListProps {
  customers: CustomerListItem[];
  isLoading: boolean;
  searchQuery: string;
  styleFilter: string;
  onSearchChange: (q: string) => void;
  onStyleFilterChange: (s: string) => void;
}

export default function DNACustomerList({
  customers,
  isLoading,
  searchQuery,
  styleFilter,
  onSearchChange,
  onStyleFilterChange,
}: DNACustomerListProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div className="p-4 bg-soft-gray rounded-xl">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <ThiingsIcon name="users" pxSize={16} />
          <h3 className="text-sm font-semibold font-serif text-deep-charcoal">{t('host.dnaCustomerList.title', 'Customer Profiles')}</h3>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="flex gap-2 mb-3">
        <div className="flex-1 relative">
          <ThiingsIcon name="search" pxSize={16} className="absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            aria-label="Search by name or phone"
            placeholder={t('host.dnaCustomerList.searchPlaceholder', 'Search by name or phone...')}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-white/60 backdrop-blur-glass-chip border border-glass-border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-600/30 focus:border-violet-600"
          />
        </div>
        <div className="relative">
          <ThiingsIcon name="filter" pxSize={16} className="absolute left-3 top-1/2 -translate-y-1/2" />
          <select
            value={styleFilter}
            onChange={(e) => onStyleFilterChange(e.target.value)}
            aria-label="Filter by dining style"
            className="pl-9 pr-8 py-2 text-sm bg-white/60 backdrop-blur-glass-chip border border-glass-border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-600/30 focus:border-violet-600 appearance-none cursor-pointer"
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

      {isLoading ? (
        <div role="status" className="flex items-center justify-center py-4 gap-2">
          <div aria-hidden="true" className="w-4 h-4 border-2 border-burgundy border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-stone-gray">{t('host.dnaCustomerList.loading', 'Loading customers...')}</span>
        </div>
      ) : customers.length > 0 ? (
        <div className="space-y-1">
          <div className="hidden md:grid grid-cols-12 gap-2 px-3 py-2 text-xs font-semibold text-stone-gray uppercase">
            <div className="col-span-3">Name</div>
            <div className="col-span-2">Style</div>
            <div className="col-span-1 text-center">Visits</div>
            <div className="col-span-2 text-right">Avg Spend</div>
            <div className="col-span-2 text-center">Confidence</div>
            <div className="col-span-2 text-right"></div>
          </div>

          {customers.map((customer) => (
            <button
              key={customer.customer_id}
              onClick={() => navigate(`/host-dashboard/dna/${encodeURIComponent(customer.customer_id)}`)}
              className="w-full px-3 py-3 glass-card border-transparent hover:border-violet-600/30 transition-all text-left"
            >
              {/* Mobile */}
              <div className="flex md:hidden items-center justify-between">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-deep-charcoal truncate">
                    {customer.customer_name || customer.customer_id}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border capitalize ${getDiningStyleColor(customer.dining_style)}`}>
                      {customer.dining_style}
                    </span>
                    <span className="text-xs text-stone-gray">
                      {customer.avg_check_per_person != null ? formatCurrency(Math.round(customer.avg_check_per_person)) : '--'}
                    </span>
                    <span className="text-xs text-stone-gray">{customer.profile_confidence}%</span>
                  </div>
                </div>
                <ThiingsIcon name="chevron-right" pxSize={16} className="ml-2" />
              </div>

              {/* Desktop */}
              <div className="hidden md:grid grid-cols-12 gap-2 items-center">
                <div className="col-span-3">
                  <div className="text-sm font-medium text-deep-charcoal truncate">
                    {customer.customer_name || customer.customer_id}
                  </div>
                  {customer.customer_name && (
                    <div className="text-xs text-muted-stone truncate">{customer.customer_id}</div>
                  )}
                </div>
                <div className="col-span-2">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border capitalize ${getDiningStyleColor(customer.dining_style)}`}>
                    {customer.dining_style}
                  </span>
                </div>
                <div className="col-span-1 text-center text-sm text-deep-charcoal">
                  {Math.round(customer.typical_party_size)}
                </div>
                <div className="col-span-2 text-right text-sm text-deep-charcoal">
                  {customer.avg_check_per_person != null ? formatCurrency(Math.round(customer.avg_check_per_person)) : '--'}
                </div>
                <div className="col-span-2 flex items-center justify-center gap-1">
                  <div className="w-16 bg-border-gray h-1.5 rounded-full overflow-hidden">
                    <div className="h-full bg-violet-600 rounded-full" style={{ width: `${customer.profile_confidence}%` }} />
                  </div>
                  <span className="text-xs text-stone-gray">{customer.profile_confidence}%</span>
                </div>
                <div className="col-span-2 flex justify-end">
                  <ThiingsIcon name="chevron-right" pxSize={16} />
                </div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="text-center py-4 text-sm text-stone-gray">
          {searchQuery || styleFilter ? t('host.dnaCustomerList.noMatch', 'No customers match your filters') : t('host.dnaCustomerList.noProfiles', 'No customer profiles available')}
        </div>
      )}
    </div>
  );
}

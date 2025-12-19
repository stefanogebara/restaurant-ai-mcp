/**
 * Breadcrumb Navigation Component
 *
 * Provides contextual navigation for nested pages within the host dashboard.
 * Helps users understand their current location and navigate back easily.
 */

import { Link } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

export default function Breadcrumb({ items, className = '' }: BreadcrumbProps) {
  return (
    <nav
      aria-label="Breadcrumb navigation"
      className={`flex items-center gap-2 text-sm ${className}`}
    >
      {/* Home/Overview link */}
      <Link
        to="/host-dashboard/simple"
        className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded"
        aria-label="Go to Dashboard Overview"
      >
        <Home className="w-4 h-4" />
        <span className="hidden sm:inline">Overview</span>
      </Link>

      {items.map((item, index) => (
        <div key={index} className="flex items-center gap-2">
          <ChevronRight className="w-4 h-4 text-muted-foreground/50" aria-hidden="true" />
          {item.href && index < items.length - 1 ? (
            <Link
              to={item.href}
              className="text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded"
            >
              {item.label}
            </Link>
          ) : (
            <span
              className="text-foreground font-medium"
              aria-current={index === items.length - 1 ? 'page' : undefined}
            >
              {item.label}
            </span>
          )}
        </div>
      ))}
    </nav>
  );
}

// Pre-configured breadcrumbs for common pages
export const breadcrumbConfigs = {
  ml: [{ label: 'No-Show Prevention' }],
  reports: [{ label: 'Weekly Reports' }],
  ltv: [{ label: 'Customer Lifetime Value' }],
  dna: [{ label: 'Customer DNA' }],
  segovia: [{ label: 'Segovia Insights' }],
  calls: [{ label: 'Call Tracking' }],
  advanced: [{ label: 'Advanced Dashboard' }],
  waitlist: [{ label: 'Waitlist' }],
  analytics: [{ label: 'Analytics' }],
};

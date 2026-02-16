/**
 * Breadcrumb Navigation Component
 *
 * Provides contextual navigation for nested pages within the host dashboard.
 * Helps users understand their current location and navigate back easily.
 */

import { Link } from 'react-router-dom';
import ThiingsIcon from './ThiingsIcon';

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
        className="flex items-center gap-1 text-[#78716C] hover:text-[#1C1917] transition-colors focus:outline-none focus:ring-2 focus:ring-[#9F1239] focus:ring-offset-2 rounded"
        aria-label="Go to Dashboard Overview"
      >
        <ThiingsIcon name="home" pxSize={16} />
        <span className="hidden sm:inline">Overview</span>
      </Link>

      {items.map((item, index) => (
        <div key={index} className="flex items-center gap-2">
          <ThiingsIcon name="chevron-right" pxSize={16} />
          {item.href && index < items.length - 1 ? (
            <Link
              to={item.href}
              className="text-[#78716C] hover:text-[#1C1917] transition-colors focus:outline-none focus:ring-2 focus:ring-[#9F1239] focus:ring-offset-2 rounded"
            >
              {item.label}
            </Link>
          ) : (
            <span
              className="text-[#1C1917] font-medium"
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
  calls: [{ label: 'Call Tracking' }],
  advanced: [{ label: 'Advanced Dashboard' }],
  waitlist: [{ label: 'Waitlist' }],
  analytics: [{ label: 'Analytics' }],
  voiceSettings: [{ label: 'Voice & Language Settings' }],
};

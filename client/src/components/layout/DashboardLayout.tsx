import type { ReactNode } from 'react';
import Sidebar from './Sidebar';
import { useSidebar } from '../../contexts/SidebarContext';
import { useRestaurantCurrency } from '../../hooks/useRestaurantCurrency';

interface DashboardLayoutProps {
  children: ReactNode;
  /** Dashboard owns an inline mobile title beside the fixed menu button. */
  mobileHeaderIntegrated?: boolean;
  /** Opt-in landing-hero palette for routes that have completed the migration. */
  appearance?: 'default' | 'hero';
}

export default function DashboardLayout({ children, mobileHeaderIntegrated = false, appearance = 'default' }: DashboardLayoutProps) {
  const { isCollapsed } = useSidebar();
  // Pull restaurant.country into the global currency cache so every dashboard
  // widget — and every formatCurrency() callsite without an explicit currency
  // arg — renders in the restaurant's actual currency, regardless of the
  // manager's UI language. Side effect runs inside the hook.
  useRestaurantCurrency();

  return (
    <div className={`min-h-screen flex ${appearance === 'hero' ? 'bg-brand-paper text-brand-ink font-brand' : ''}`}>
      <Sidebar appearance={appearance} />
      {/* The shell reserves exactly the floating capsule's width plus its
          16px left inset, including the collapsed state. */}
      <main className={`flex-1 min-w-0 overflow-x-hidden transition-all duration-300 pb-16 lg:pb-0 ${mobileHeaderIntegrated ? '' : 'pt-5 lg:pt-0'} ${isCollapsed ? 'lg:ml-[80px]' : 'lg:ml-[244px]'}`}>
        {children}
      </main>
    </div>
  );
}

import type { ReactNode } from 'react';
import Sidebar from './Sidebar';
import { useSidebar } from '../../contexts/SidebarContext';
import { useRestaurantCurrency } from '../../hooks/useRestaurantCurrency';

interface DashboardLayoutProps {
  children: ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const { isCollapsed } = useSidebar();
  // Pull restaurant.country into the global currency cache so every dashboard
  // widget — and every formatCurrency() callsite without an explicit currency
  // arg — renders in the restaurant's actual currency, regardless of the
  // manager's UI language. Side effect runs inside the hook.
  useRestaurantCurrency();

  return (
    <div className="min-h-screen bg-soft-gray flex">
      <Sidebar />
      <main className={`flex-1 min-w-0 overflow-x-hidden transition-all duration-300 pb-16 lg:pb-0 ${isCollapsed ? 'lg:ml-20' : 'lg:ml-[260px]'}`}>
        {children}
      </main>
    </div>
  );
}

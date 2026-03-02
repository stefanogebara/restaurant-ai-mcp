import type { ReactNode } from 'react';
import Sidebar from './Sidebar';
import { useSidebar } from '../../contexts/SidebarContext';

interface DashboardLayoutProps {
  children: ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const { isCollapsed } = useSidebar();

  return (
    <div className="min-h-screen bg-soft-gray flex">
      <Sidebar />
      <main className={`flex-1 min-w-0 transition-all duration-300 ${isCollapsed ? 'lg:ml-20' : 'lg:ml-[260px]'}`}>
        {children}
      </main>
    </div>
  );
}

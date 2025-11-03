import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  TrendingUp,
  Users,
  DollarSign,
  BarChart3,
  Dna,
  ChevronLeft,
  Menu
} from 'lucide-react';
import { useState } from 'react';
import { useSidebar } from '../../contexts/SidebarContext';

interface NavItem {
  path: string;
  label: string;
  icon: React.ReactNode;
  description: string;
}

const navItems: NavItem[] = [
  {
    path: '/host-dashboard',
    label: 'Overview',
    icon: <LayoutDashboard className="w-5 h-5" />,
    description: 'Tables & Active Parties'
  },
  {
    path: '/host-dashboard/ml',
    label: 'ML Performance',
    icon: <TrendingUp className="w-5 h-5" />,
    description: 'ROI & Interventions'
  },
  {
    path: '/host-dashboard/ltv',
    label: 'Customer LTV',
    icon: <Users className="w-5 h-5" />,
    description: 'Lifetime Value'
  },
  {
    path: '/host-dashboard/pricing',
    label: 'Pricing Rules',
    icon: <DollarSign className="w-5 h-5" />,
    description: 'Dynamic Pricing'
  },
  {
    path: '/host-dashboard/analytics',
    label: 'Pricing Analytics',
    icon: <BarChart3 className="w-5 h-5" />,
    description: 'Revenue Insights'
  },
  {
    path: '/host-dashboard/dna',
    label: 'Customer DNA',
    icon: <Dna className="w-5 h-5" />,
    description: 'Behavioral Profiling'
  }
];

export default function Sidebar() {
  const location = useLocation();
  const { isCollapsed, setIsCollapsed } = useSidebar();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const isActive = (path: string) => {
    if (path === '/host-dashboard') {
      return location.pathname === path;
    }
    return location.pathname.startsWith(path);
  };

  return (
    <>
      {/* Mobile Menu Button */}
      <button
        onClick={() => setIsMobileOpen(!isMobileOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-card rounded-lg shadow-lg border border-border"
      >
        <Menu className="w-6 h-6" />
      </button>

      {/* Mobile Overlay */}
      {isMobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 h-full bg-card border-r border-border z-40
          transition-all duration-300 ease-in-out
          ${isCollapsed ? 'w-20' : 'w-64'}
          ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0
        `}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="p-6 border-b border-border flex items-center justify-between">
            {!isCollapsed && (
              <div>
                <h1 className="text-xl font-bold text-foreground">Restaurant AI</h1>
                <p className="text-xs text-muted-foreground mt-1">Management Platform</p>
              </div>
            )}
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="hidden lg:block p-2 hover:bg-muted rounded-lg transition-colors"
            >
              <ChevronLeft className={`w-5 h-5 transition-transform ${isCollapsed ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto p-4 space-y-2">
            {navItems.map((item) => {
              const active = isActive(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setIsMobileOpen(false)}
                  className={`
                    flex items-center gap-3 px-4 py-3 rounded-lg transition-all
                    ${active
                      ? 'bg-primary text-primary-foreground shadow-lg'
                      : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                    }
                    ${isCollapsed ? 'justify-center' : ''}
                  `}
                  title={isCollapsed ? item.label : undefined}
                >
                  <span className={active ? 'scale-110' : ''}>{item.icon}</span>
                  {!isCollapsed && (
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm">{item.label}</div>
                      <div className="text-xs opacity-70 truncate">{item.description}</div>
                    </div>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Footer */}
          {!isCollapsed && (
            <div className="p-4 border-t border-border">
              <div className="text-xs text-muted-foreground text-center">
                <p>v1.0.0</p>
                <p className="mt-1">Powered by Claude AI</p>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

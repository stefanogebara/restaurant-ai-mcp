import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  TrendingUp,
  Users,
  Dna,
  ChevronLeft,
  Menu,
  Lock,
  Phone
} from 'lucide-react';
import { useState } from 'react';
import { useSidebar } from '../../contexts/SidebarContext';
import { useSubscription } from '../../hooks/useSubscription';
import { hasFeatureAccess, type PlanFeatures, type PlanType } from '../../config/planFeatures';

interface NavItem {
  path: string;
  label: string;
  icon: React.ReactNode;
  description: string;
  requiredFeature: keyof PlanFeatures;
}

const navItems: NavItem[] = [
  {
    path: '/host-dashboard',
    label: 'Overview',
    icon: <LayoutDashboard className="w-5 h-5" />,
    description: 'Tables & Active Parties',
    requiredFeature: 'overview'
  },
  {
    path: '/host-dashboard/calls',
    label: 'AI Agent',
    icon: <Phone className="w-5 h-5" />,
    description: 'Call Tracking & Analytics',
    requiredFeature: 'aiAgentTracking'
  },
  {
    path: '/host-dashboard/ml',
    label: 'No-Show Prevention',
    icon: <TrendingUp className="w-5 h-5" />,
    description: 'Intervention ROI',
    requiredFeature: 'mlPerformance'
  },
  {
    path: '/host-dashboard/ltv',
    label: 'Customer LTV',
    icon: <Users className="w-5 h-5" />,
    description: 'Lifetime Value',
    requiredFeature: 'customerLTV'
  },
  {
    path: '/host-dashboard/dna',
    label: 'Customer DNA',
    icon: <Dna className="w-5 h-5" />,
    description: 'Behavioral Profiling',
    requiredFeature: 'customerDNA'
  }
];

export default function Sidebar() {
  const location = useLocation();
  const { isCollapsed, setIsCollapsed } = useSidebar();
  const subscription = useSubscription();
  const planType = subscription.data?.subscription?.plan.toLowerCase() as PlanType | undefined;
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
        className="lg:hidden fixed top-4 left-4 z-50 p-3 bg-card rounded-lg shadow-lg border border-border focus:outline-none focus:ring-2 focus:ring-primary"
        aria-label={isMobileOpen ? "Close navigation menu" : "Open navigation menu"}
        aria-expanded={isMobileOpen}
      >
        <Menu className="w-6 h-6" aria-hidden="true" />
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
                <h1 className="text-xl font-bold text-foreground">Seatable</h1>
                <p className="text-xs text-muted-foreground mt-1">AI Restaurant Management</p>
              </div>
            )}
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="hidden lg:block p-2 hover:bg-muted rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
              aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <ChevronLeft className={`w-5 h-5 transition-transform ${isCollapsed ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto p-4 space-y-2">
            {navItems.map((item) => {
              const active = isActive(item.path);
              const hasAccess = hasFeatureAccess(planType, item.requiredFeature);
              const isLocked = !hasAccess;

              // For locked items, don't navigate - just show as disabled
              const itemContent = (
                <>
                  <span className={active ? 'scale-110' : ''}>{item.icon}</span>
                  {!isCollapsed && (
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm flex items-center gap-2">
                        {item.label}
                        {isLocked && <Lock className="w-3 h-3" />}
                      </div>
                      <div className="text-xs opacity-70 truncate">{item.description}</div>
                    </div>
                  )}
                </>
              );

              if (isLocked) {
                // Locked item - show as disabled button with upgrade info
                const tooltipText = isCollapsed
                  ? `${item.label} - Upgrade to Professional to unlock`
                  : 'Upgrade to Professional plan to unlock this feature';
                return (
                  <button
                    key={item.path}
                    onClick={() => {/* Prevent navigation - could show upgrade modal */}}
                    className={`
                      flex items-center gap-3 px-4 py-3 rounded-lg transition-all w-full text-left
                      opacity-50 cursor-not-allowed text-muted-foreground
                      ${isCollapsed ? 'justify-center' : ''}
                    `}
                    title={tooltipText}
                    aria-label={`${item.label} - Locked feature`}
                    aria-disabled="true"
                  >
                    {itemContent}
                  </button>
                );
              }

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
                  {itemContent}
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

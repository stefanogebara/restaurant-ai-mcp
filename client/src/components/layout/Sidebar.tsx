import { Link, useLocation, useNavigate } from 'react-router-dom';
import ThiingsIcon, { type IconName } from '../common/ThiingsIcon';
import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSidebar } from '../../contexts/SidebarContext';
import { useSubscription } from '../../hooks/useSubscription';
import { useAuth } from '../../contexts/AuthContext';
import { hasFeatureAccess, type PlanFeatures, type PlanType } from '../../config/planFeatures';
import { languageOptions } from '../../i18n/config';

interface NavItem {
  path: string;
  label: string;
  iconName: IconName;
  description: string;
  requiredFeature: keyof PlanFeatures;
}

const navItems: NavItem[] = [
  {
    path: '/host-dashboard/simple',
    label: 'Overview',
    iconName: 'dashboard',
    description: 'Tables & Active Parties',
    requiredFeature: 'overview'
  },
  {
    path: '/host-dashboard/calls',
    label: 'AI Agent',
    iconName: 'phone',
    description: 'Call Tracking & Analytics',
    requiredFeature: 'aiAgentTracking'
  },
  {
    path: '/host-dashboard/voice-settings',
    label: 'Voice & Language',
    iconName: 'volume',
    description: 'AI Voice Settings',
    requiredFeature: 'aiAgentTracking'
  },
  {
    path: '/analytics',
    label: 'Analytics',
    iconName: 'bar-chart',
    description: 'Performance & Trends',
    requiredFeature: 'advancedAnalytics'
  },
  {
    path: '/host-dashboard/reports',
    label: 'Reports',
    iconName: 'file-text',
    description: 'Weekly Reports',
    requiredFeature: 'weeklyReports'
  }
];

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isCollapsed, setIsCollapsed } = useSidebar();
  const subscription = useSubscription();
  const { user, signOut } = useAuth();
  const { i18n } = useTranslation();
  const isSubscriptionLoading = subscription.isLoading;
  const planType = subscription.data?.subscription?.plan?.toLowerCase() as PlanType | undefined;
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLanguageOpen, setIsLanguageOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  // Close settings menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setIsSettingsOpen(false);
        setIsLanguageOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLanguageChange = async (langCode: string) => {
    await i18n.changeLanguage(langCode);
    localStorage.setItem('i18nextLng', langCode);
    setIsLanguageOpen(false);
  };

  const handleLogout = async () => {
    try {
      await signOut();
      navigate('/');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const currentLanguage = languageOptions.find(l => l.code === i18n.language) || languageOptions[0];

  const isActive = (path: string) => {
    if (path === '/host-dashboard/simple') {
      return location.pathname === '/host-dashboard/simple' || location.pathname === '/host-dashboard';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <>
      {/* Mobile Menu Button */}
      <button
        onClick={() => setIsMobileOpen(!isMobileOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-3 bg-white rounded-lg shadow-lg border border-[#E7E5E4] focus:outline-none focus:ring-2 focus:ring-[#9F1239]"
        aria-label={isMobileOpen ? "Close navigation menu" : "Open navigation menu"}
        aria-expanded={isMobileOpen}
      >
        <ThiingsIcon name="menu" pxSize={24} />
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
          fixed top-0 left-0 h-full bg-white border-r border-[#E7E5E4] z-40
          transition-all duration-300 ease-in-out
          ${isCollapsed ? 'w-20' : 'w-64'}
          ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0
        `}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="p-6 border-b border-[#E7E5E4] flex items-center justify-between">
            {!isCollapsed && (
              <div>
                <h1 className="text-xl font-bold text-[#1C1917]">Seatable</h1>
                <p className="text-xs text-[#57534E] mt-1">AI Restaurant Management</p>
              </div>
            )}
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="hidden lg:block p-2 hover:bg-[#F5F5F4] rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-[#9F1239]"
              aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <span className={`inline-flex transition-transform ${isCollapsed ? 'rotate-180' : ''}`}><ThiingsIcon name="chevron-left" pxSize={20} /></span>
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto p-4 space-y-2">
            {navItems.map((item) => {
              const active = isActive(item.path);
              const hasAccess = hasFeatureAccess(planType, item.requiredFeature);
              // While subscription data is loading, default to unlocked to prevent flash of lock icons
              const isLocked = isSubscriptionLoading ? false : !hasAccess;

              // For locked items, don't navigate - just show as disabled
              const itemContent = (
                <>
                  <span className={active ? 'scale-110' : ''}><ThiingsIcon name={item.iconName} pxSize={20} /></span>
                  {!isCollapsed && (
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm flex items-center gap-2">
                        {item.label}
                        {isLocked && <ThiingsIcon name="lock" pxSize={12} />}
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
                      opacity-50 cursor-not-allowed text-[#57534E]
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
                      ? 'bg-[#9F1239] text-white shadow-lg'
                      : 'hover:bg-[#F5F5F4] text-[#57534E] hover:text-[#1C1917]'
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

          {/* User Settings Section */}
          <div className="border-t border-[#E7E5E4]" ref={settingsRef}>
            {/* Settings Menu Button */}
            <button
              onClick={() => setIsSettingsOpen(!isSettingsOpen)}
              className={`
                w-full p-4 flex items-center gap-3 hover:bg-[#F5F5F4] transition-colors
                ${isCollapsed ? 'justify-center' : ''}
              `}
              title={isCollapsed ? 'Settings' : undefined}
            >
              {user?.user_metadata?.avatar_url ? (
                <img
                  src={user.user_metadata.avatar_url}
                  alt="Profile"
                  className="w-8 h-8 rounded-full"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-[#9F1239]/10 flex items-center justify-center">
                  <ThiingsIcon name="user" pxSize={16} />
                </div>
              )}
              {!isCollapsed && (
                <>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-medium text-[#1C1917] truncate">
                      {user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User'}
                    </p>
                    <p className="text-xs text-[#57534E] truncate">
                      {user?.email || 'Not signed in'}
                    </p>
                  </div>
                  <span className={`inline-flex transition-transform ${isSettingsOpen ? '' : 'rotate-180'}`}><ThiingsIcon name="chevron-up" pxSize={16} /></span>
                </>
              )}
            </button>

            {/* Settings Dropdown */}
            {isSettingsOpen && (
              <div className={`
                absolute bottom-20 bg-white border border-[#E7E5E4] rounded-lg shadow-xl overflow-hidden
                ${isCollapsed ? 'left-20 w-56' : 'left-4 right-4'}
              `}>
                {/* Language Selector */}
                <div className="relative">
                  <button
                    onClick={() => setIsLanguageOpen(!isLanguageOpen)}
                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-[#F5F5F4] transition-colors text-left"
                  >
                    <ThiingsIcon name="globe" pxSize={16} />
                    <span className="flex-1 text-sm">Language</span>
                    <span className="text-sm text-[#57534E]">{currentLanguage.flag} {currentLanguage.name}</span>
                  </button>

                  {/* Language Options */}
                  {isLanguageOpen && (
                    <div className="border-t border-[#E7E5E4] bg-[#F5F5F4]/50">
                      {languageOptions.map((lang) => (
                        <button
                          key={lang.code}
                          onClick={() => handleLanguageChange(lang.code)}
                          className={`
                            w-full px-4 py-2 flex items-center gap-3 hover:bg-[#F5F5F4] transition-colors text-left text-sm
                            ${i18n.language === lang.code ? 'bg-[#9F1239]/10 text-[#9F1239] font-medium' : ''}
                          `}
                        >
                          <span className="text-lg">{lang.flag}</span>
                          <span>{lang.name}</span>
                          {i18n.language === lang.code && (
                            <span className="ml-auto text-[#9F1239]">✓</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Divider */}
                <div className="border-t border-[#E7E5E4]" />

                {/* Logout Button */}
                <button
                  onClick={handleLogout}
                  className="w-full px-4 py-3 flex items-center gap-3 hover:bg-red-50 text-red-600 transition-colors"
                >
                  <ThiingsIcon name="logout" pxSize={16} />
                  <span className="text-sm">Sign Out</span>
                </button>
              </div>
            )}
          </div>

          {/* Footer */}
          {!isCollapsed && (
            <div className="px-4 pb-3 pt-2">
              <div className="text-xs text-[#57534E] text-center">
                <p>Powered by AI</p>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

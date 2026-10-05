import { Link, useLocation, useNavigate } from 'react-router-dom';
import ThiingsIcon, { type IconName } from '../common/ThiingsIcon';
import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSidebar } from '../../contexts/SidebarContext';
import { useSubscription } from '../../hooks/useSubscription';
import { useAuth } from '../../contexts/AuthContext';
import { useRestaurantSettings } from '../../hooks/useRestaurantSettings';
import { usePermission } from '../../hooks/usePermission';
import { hasFeatureAccess, type PlanFeatures, type PlanType } from '../../config/planFeatures';
import { languageOptions, preloadAndSwitchLanguage } from '../../i18n/config';
import { LS_LANGUAGE } from '../../config/localStorageKeys';

interface NavItem {
  path: string;
  label: string;
  requiredFeature: keyof PlanFeatures;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    label: 'Main',
    items: [
      { path: '/host-dashboard/simple', label: 'Dashboard', requiredFeature: 'overview' },
      { path: '/host-dashboard/floor-plan', label: 'Tables', requiredFeature: 'overview' },
      { path: '/host-dashboard/service', label: 'Service Score', requiredFeature: 'overview' },
    ]
  },
  {
    label: 'AI',
    items: [
      { path: '/host-dashboard/manager-ai', label: 'Manager AI', requiredFeature: 'overview' },
      { path: '/host-dashboard/voice-settings', label: 'Voice & Calls', requiredFeature: 'voiceAI' },
      { path: '/host-dashboard/whatsapp', label: 'WhatsApp', requiredFeature: 'overview' },
      { path: '/host-dashboard/campaigns', label: 'Marketing', requiredFeature: 'advancedAnalytics' },
    ]
  },
  {
    label: 'Insights',
    items: [
      { path: '/host-dashboard/insights', label: 'Insights', requiredFeature: 'overview' },
      { path: '/host-dashboard/customers', label: 'Customers', requiredFeature: 'customerLTV' },
    ]
  }
];

export default function Sidebar({ appearance = 'default', darkMobileMenu = false }: { appearance?: 'default' | 'hero'; darkMobileMenu?: boolean }) {
  const hero = appearance === 'hero';
  const location = useLocation();
  const navigate = useNavigate();
  const { isCollapsed, setIsCollapsed } = useSidebar();
  const subscription = useSubscription();
  const { user, signOut } = useAuth();
  const { can } = usePermission();
  const { i18n, t } = useTranslation();
  const isSubscriptionLoading = subscription.isLoading;
  const planType = (subscription.data?.subscription?.plan?.toLowerCase() ?? 'free') as PlanType;
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLanguageOpen, setIsLanguageOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

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
    await preloadAndSwitchLanguage(langCode);
    localStorage.setItem(LS_LANGUAGE, langCode);
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

  const NAV_KEYS: Record<string, string> = {
    Dashboard: 'navigation.dashboard',
    Tables: 'navigation.tables',
    'Service Score': 'navigation.serviceScore',
    'Manager AI': 'navigation.managerAI',
    'Voice Agent': 'navigation.voiceAgent',
    'Voice & Calls': 'navigation.voiceAndCalls',
    WhatsApp: 'navigation.whatsapp',
    'Call History': 'navigation.callHistory',
    Insights: 'navigation.insights',
    Campaigns: 'navigation.campaigns',
    Marketing: 'navigation.marketing',
    Coupons: 'navigation.coupons',
    Events: 'navigation.events',
    Customers: 'navigation.customers',
    Main: 'navigation.sectionMain',
    AI: 'navigation.sectionAI',
  };

  const isActive = (path: string) => {
    if (path === '/host-dashboard/simple') {
      return location.pathname === '/host-dashboard/simple' || location.pathname === '/host-dashboard';
    }
    // Voice & Calls highlights for both voice-settings and calls pages
    if (path === '/host-dashboard/voice-settings') {
      return location.pathname.startsWith('/host-dashboard/voice-settings') || location.pathname.startsWith('/host-dashboard/calls');
    }
    // Marketing highlights for campaigns, coupons, and events
    if (path === '/host-dashboard/campaigns') {
      return location.pathname.startsWith('/host-dashboard/campaigns') || location.pathname.startsWith('/host-dashboard/coupons') || location.pathname.startsWith('/host-dashboard/events');
    }
    return location.pathname.startsWith(path);
  };

  // Prefer the restaurant name (brand identity) over the auth email in the
  // sidebar — caught in 2026-05-17 audit: post-onboarding owners saw their
  // signup email instead of "Mocotó" right after the most emotional moment
  // of setup. Falls back to email-prefix while the config query is loading
  // or on routes that don't have an associated restaurant (e.g. /onboarding).
  const { data: restaurantSettings } = useRestaurantSettings();
  const restaurantName = restaurantSettings?.restaurant_name?.trim();
  const userName = restaurantName || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';
  const userEmail = user?.email || 'Not signed in';
  const mobileNavItems: { path: string; label: string; icon: IconName }[] = [
    { path: '/host-dashboard/simple', label: t('navigation.dashboard', 'Dashboard'), icon: 'dashboard' },
    { path: '/host-dashboard/floor-plan', label: t('navigation.tables', 'Tables'), icon: 'map' },
    { path: '/host-dashboard/manager-ai', label: t('navigation.mobileAI', 'AI'), icon: 'chat' },
    hero
      ? { path: '/host-dashboard/insights', label: t('navigation.sectionInsightsHero', 'Data'), icon: 'bar-chart' }
      : { path: '/host-dashboard/settings', label: t('common.settings', 'Settings'), icon: 'settings' },
  ];
  const isMoreActive = !mobileNavItems.some(item => isActive(item.path));

  return (
    <>
      <button
        type="button"
        onClick={() => setIsMobileOpen(!isMobileOpen)}
        className={`lg:hidden fixed top-6 left-4 z-50 p-2 rounded-[100px] focus:outline-none focus-visible:ring-2 ${hero ? 'bg-brand-paper/90 text-brand-ink hover:bg-brand-line/30 focus-visible:ring-brand-action' : darkMobileMenu ? 'bg-stone-800 text-white hover:bg-stone-700 focus-visible:ring-white' : 'text-deep-charcoal hover:bg-deep-charcoal/[0.05] focus-visible:ring-burgundy'}`}
        aria-label={isMobileOpen ? "Close navigation menu" : "Open navigation menu"}
        aria-expanded={isMobileOpen}
      >
        <ThiingsIcon name="menu" pxSize={20} />
      </button>

      {/* Mobile Overlay */}
      {isMobileOpen && (
        <div
          className={`lg:hidden fixed inset-0 backdrop-blur-sm z-40 ${hero ? 'bg-brand-ink/35' : 'bg-black/60'}`}
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 h-full z-40
          lg:top-4 lg:bottom-4 lg:left-4 lg:h-auto
          lg:rounded-[26px] lg:backdrop-blur-xl
          lg:border
          lg:overflow-hidden
          transition-all duration-300 ease-in-out
          ${hero ? 'bg-brand-paper lg:top-0 lg:bottom-0 lg:left-0 lg:rounded-none lg:border-y-0 lg:border-l-0 lg:border-r-brand-line lg:shadow-none lg:backdrop-blur-none font-brand text-brand-ink' : 'bg-charcoal-dark lg:bg-charcoal-dark/90 lg:border-white/10 lg:shadow-[0_8px_28px_rgba(28,25,23,0.16)]'}
          ${isCollapsed ? `w-[260px] ${hero ? 'lg:w-[80px]' : 'lg:w-16'}` : `w-[260px] ${hero ? 'lg:w-[244px]' : 'lg:w-[228px]'}`}
          ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0
        `}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className={`${hero ? 'py-4' : 'py-6'} ${isCollapsed ? 'px-3' : 'px-5'} flex items-center justify-between ${hero ? 'border-b border-brand-line/75' : ''}`}>
            {!isCollapsed ? (
              hero ? (
                <h1 className="font-brand text-[22px] text-brand-ink tracking-[-0.025em] leading-none">
                  <span className="font-serif italic text-[25px]">Seat</span>able
                </h1>
              ) : (
                <h1 className="font-serif text-[22px] text-white tracking-tight">
                  seatable<span className="text-burgundy">.</span>
                </h1>
              )
            ) : (
              <h1 className={`font-serif text-[22px] tracking-tight mx-auto ${hero ? 'italic text-brand-ink' : 'text-white'}`}>
                S{!hero && <span className="text-burgundy">.</span>}
              </h1>
            )}
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              aria-expanded={!isCollapsed}
              aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              className={`hidden lg:block p-1.5 rounded-lg transition-colors focus:outline-none focus:ring-2 ${hero ? 'text-brand-muted hover:text-brand-ink hover:bg-brand-line/30 focus:ring-brand-action/50' : 'hover:bg-white/5 text-stone-gray hover:text-muted-stone focus:ring-white/30'}`}
            >
              <span className={`inline-flex transition-transform ${isCollapsed ? 'rotate-180' : ''}`}>
                <ThiingsIcon name="chevron-left" pxSize={18} />
              </span>
            </button>
          </div>

          {/* Navigation */}
          <nav aria-label="Main navigation" className="flex-1 overflow-y-auto [mask-image:linear-gradient(to_bottom,black_0%,black_94%,transparent_100%)]">
            {navSections.map((section) => (
              <div key={section.label} className={hero ? 'mb-4' : 'mb-5'}>
                {/* Section Label */}
                {!isCollapsed && (
                  <div className={`px-5 mb-2 text-[11px] font-semibold uppercase ${hero ? 'tracking-[0.14em] text-brand-muted' : 'tracking-widest text-stone-400'}`}>
                    {hero && section.label === 'Insights' ? t('navigation.sectionInsightsHero', 'Data') : t(NAV_KEYS[section.label] ?? section.label, section.label)}
                  </div>
                )}
                {isCollapsed && (
                  <div className="w-full flex justify-center mb-2">
                    <div className={`w-6 h-px ${hero ? 'bg-brand-line' : 'bg-charcoal-dark'}`} />
                  </div>
                )}


                {/* Nav Items */}
                <div className="space-y-1">
                {section.items.map((item) => {
                  const active = isActive(item.path);
                  const hasAccess = hasFeatureAccess(planType, item.requiredFeature);
                  const isLocked = isSubscriptionLoading ? false : !hasAccess;

                  if (isLocked) {
                    // Audit BUG #10 — locked items used to be disabled buttons
                    // with no click handler, so the lock icon felt like a
                    // dead end. Route clicks to /subscription/manage so users
                    // have a discoverable path to unlock the feature.
                    return (
                      <Link
                        key={item.path}
                        to="/subscription/manage"
                        onClick={() => setIsMobileOpen(false)}
                        className={`
                          w-full flex items-center gap-3 text-left transition-all duration-150
                          ${hero ? 'text-brand-muted hover:text-brand-ink hover:bg-brand-line/25' : 'opacity-60 hover:opacity-100 hover:bg-white/[0.03] text-stone-400 hover:text-stone-200'}
                          ${isCollapsed ? `justify-center px-5 ${hero ? 'py-2.5 lg:py-2' : 'py-3'}` : `px-5 ${hero ? 'py-2.5 lg:py-2' : 'py-3'}`}
                        `}
                        title={isCollapsed
                          ? `${t(NAV_KEYS[item.label] ?? item.label, item.label)} - ${t('navigation.upgradeToUnlock', 'Upgrade to unlock')}`
                          : t('navigation.upgradePlanToUnlock', 'Upgrade to Professional plan to unlock')}
                        aria-label={`${t(NAV_KEYS[item.label] ?? item.label, item.label)} - ${t('navigation.lockedFeature', 'Locked feature')}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full bg-current opacity-40 flex-shrink-0 ${hero ? 'hidden' : ''}`} />
                        {!isCollapsed && (
                          <span className="text-sm flex items-center gap-2">
                            {hero && item.label === 'Insights' ? t('insights.tabs.analytics', 'Analytics') : t(NAV_KEYS[item.label] ?? item.label, item.label)}
                            <ThiingsIcon name="lock" pxSize={10} />
                          </span>
                        )}
                      </Link>
                    );
                  }

                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setIsMobileOpen(false)}
                      aria-current={active ? 'page' : undefined}
                      aria-label={isCollapsed ? hero && item.label === 'Insights' ? t('insights.tabs.analytics', 'Analytics') : item.label : undefined}
                      className={`
                        flex items-center gap-3 transition-all duration-150
                        ${isCollapsed ? `justify-center px-5 ${hero ? 'py-2.5 lg:py-2' : 'py-3'}` : `px-5 ${hero ? 'py-2.5 lg:py-2' : 'py-3'}`}
                        ${hero
                          ? active
                            ? 'text-brand-ink bg-brand-action/15 border-l-2 border-l-brand-action font-semibold'
                            : 'text-brand-muted hover:text-brand-ink hover:bg-brand-line/25 border-l-2 border-l-transparent'
                          : active
                            ? 'text-white bg-white/[0.04] border-l-2 border-l-burgundy font-medium'
                            : 'text-stone-300 hover:text-white hover:bg-white/[0.03] border-l-2 border-l-transparent'
                        }
                      `}
                      title={isCollapsed ? hero && item.label === 'Insights' ? t('insights.tabs.analytics', 'Analytics') : item.label : undefined}
                    >
                      <span
                        className={`
                          w-1.5 h-1.5 rounded-full flex-shrink-0 transition-colors
                          ${active ? (hero ? 'bg-brand-action' : 'bg-burgundy') : 'bg-current opacity-40'}
                          ${hero ? 'hidden' : ''}
                        `}
                      />
                      {!isCollapsed && (
                        <span className="text-sm">{hero && item.label === 'Insights' ? t('insights.tabs.analytics', 'Analytics') : t(NAV_KEYS[item.label] ?? item.label, item.label)}</span>
                      )}
                    </Link>
                  );
                })}
                </div>
              </div>
            ))}

            {/* Settings */}
            <div className={hero ? 'mb-3' : 'mb-5'}>
              {!isCollapsed && (
                <div className={`px-5 mb-2 text-[11px] font-semibold uppercase ${hero ? 'tracking-[0.14em] text-brand-muted' : 'tracking-widest text-stone-400'}`}>
                  {t('navigation.sectionSettings', 'Settings')}
                </div>
              )}
              {isCollapsed && (
                <div className="w-full flex justify-center mb-2">
                  <div className={`w-6 h-px ${hero ? 'bg-brand-line' : 'bg-charcoal-dark'}`} />
                </div>
              )}
              <Link
                to="/host-dashboard/settings"
                onClick={() => setIsMobileOpen(false)}
                className={`
                  flex items-center gap-3 transition-all duration-150
                  ${isCollapsed ? `justify-center px-5 ${hero ? 'py-2.5 lg:py-2' : 'py-3'}` : `px-5 ${hero ? 'py-2.5 lg:py-2' : 'py-3'}`}
                  ${hero
                    ? isActive('/host-dashboard/settings')
                      ? 'text-brand-ink bg-brand-action/10 border-l-2 border-l-brand-action font-medium'
                      : 'text-brand-muted hover:text-brand-ink hover:bg-brand-line/25 border-l-2 border-l-transparent'
                    : isActive('/host-dashboard/settings')
                      ? 'text-white bg-white/10 border-l-2 border-l-burgundy font-medium'
                      : 'text-stone-400 hover:text-stone-300 hover:bg-white/[0.03] border-l-2 border-l-transparent'
                  }
                `}
                title={isCollapsed ? t('navigation.restaurantSettings', 'Restaurant Settings') : undefined}
              >
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 transition-colors ${isActive('/host-dashboard/settings') ? (hero ? 'bg-brand-action' : 'bg-burgundy') : 'bg-current opacity-40'} ${hero ? 'hidden' : ''}`} />
                {!isCollapsed && <span className="text-sm">{t('navigation.restaurantSettings', 'Restaurant Settings')}</span>}
              </Link>
              <Link
                to="/settings/language"
                onClick={() => setIsMobileOpen(false)}
                className={`
                  flex items-center gap-3 transition-all duration-150
                  ${isCollapsed ? `justify-center px-5 ${hero ? 'py-2.5 lg:py-2' : 'py-3'}` : `px-5 ${hero ? 'py-2.5 lg:py-2' : 'py-3'}`}
                  ${hero
                    ? isActive('/settings/language')
                      ? 'text-brand-ink bg-brand-action/10 border-l-2 border-l-brand-action font-medium'
                      : 'text-brand-muted hover:text-brand-ink hover:bg-brand-line/25 border-l-2 border-l-transparent'
                    : isActive('/settings/language')
                      ? 'text-white bg-white/10 border-l-2 border-l-burgundy font-medium'
                      : 'text-stone-400 hover:text-stone-300 hover:bg-white/[0.03] border-l-2 border-l-transparent'
                  }
                `}
                title={isCollapsed ? t('navigation.languageSettings', 'Language') : undefined}
              >
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 transition-colors ${isActive('/settings/language') ? (hero ? 'bg-brand-action' : 'bg-burgundy') : 'bg-current opacity-40'} ${hero ? 'hidden' : ''}`} />
                {!isCollapsed && <span className="text-sm">{t('navigation.languageSettings', 'Language')}</span>}
              </Link>
              <Link
                to="/host-dashboard/integrations"
                onClick={() => setIsMobileOpen(false)}
                className={`
                  flex items-center gap-3 transition-all duration-150
                  ${isCollapsed ? `justify-center px-5 ${hero ? 'py-2.5 lg:py-2' : 'py-3'}` : `px-5 ${hero ? 'py-2.5 lg:py-2' : 'py-3'}`}
                  ${hero
                    ? isActive('/host-dashboard/integrations')
                      ? 'text-brand-ink bg-brand-action/10 border-l-2 border-l-brand-action font-medium'
                      : 'text-brand-muted hover:text-brand-ink hover:bg-brand-line/25 border-l-2 border-l-transparent'
                    : isActive('/host-dashboard/integrations')
                      ? 'text-white bg-white/10 border-l-2 border-l-burgundy font-medium'
                      : 'text-stone-400 hover:text-stone-300 hover:bg-white/[0.03] border-l-2 border-l-transparent'
                  }
                `}
                title={isCollapsed ? t('navigation.integrations', 'Integrations') : undefined}
              >
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 transition-colors ${isActive('/host-dashboard/integrations') ? (hero ? 'bg-brand-action' : 'bg-burgundy') : 'bg-current opacity-40'} ${hero ? 'hidden' : ''}`} />
                {!isCollapsed && <span className="text-sm">{t('navigation.integrations', 'Integrations')}</span>}
              </Link>
            </div>

            {/* Team section — owner only */}
            {can('manageTeam') && (
              <div className={hero ? 'mb-3' : 'mb-5'}>
                {!isCollapsed && (
                    <div className={`px-5 mb-2 text-[11px] font-semibold uppercase ${hero ? 'tracking-[0.14em] text-brand-muted' : 'tracking-widest text-stone-400'}`}>
                    {t('navigation.sectionManage', 'Manage')}
                  </div>
                )}
                {isCollapsed && (
                  <div className="w-full flex justify-center mb-2">
                    <div className={`w-6 h-px ${hero ? 'bg-brand-line' : 'bg-charcoal-dark'}`} />
                  </div>
                )}
                <Link
                  to="/host-dashboard/team"
                  onClick={() => setIsMobileOpen(false)}
                  className={`
                    flex items-center gap-3 transition-all duration-150
                    ${isCollapsed ? `justify-center px-5 ${hero ? 'py-2.5 lg:py-2' : 'py-3'}` : `px-5 ${hero ? 'py-2.5 lg:py-2' : 'py-3'}`}
                    ${hero
                      ? isActive('/host-dashboard/team')
                        ? 'text-brand-ink bg-brand-action/10 border-l-2 border-l-brand-action font-medium'
                        : 'text-brand-muted hover:text-brand-ink hover:bg-brand-line/25 border-l-2 border-l-transparent'
                      : isActive('/host-dashboard/team')
                        ? 'text-white bg-white/10 border-l-2 border-l-burgundy font-medium'
                        : 'text-stone-400 hover:text-stone-300 hover:bg-white/[0.03] border-l-2 border-l-transparent'
                    }
                  `}
                  title={isCollapsed ? t('navigation.team', 'Team') : undefined}
                >
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 transition-colors ${isActive('/host-dashboard/team') ? (hero ? 'bg-brand-action' : 'bg-burgundy') : 'bg-current opacity-40'} ${hero ? 'hidden' : ''}`} />
                  {!isCollapsed && <span className="text-sm">{t('navigation.team', 'Team')}</span>}
                </Link>
              </div>
            )}
          </nav>

          {/* User Footer */}
          <div className={`border-t ${hero ? 'border-brand-line/75' : 'border-charcoal-dark'}`} ref={settingsRef}>
            <button
              onClick={() => setIsSettingsOpen(!isSettingsOpen)}
              className={`
                w-full ${isCollapsed ? 'p-3' : 'p-5'} flex items-center gap-2.5 transition-all duration-200
                ${hero ? 'hover:bg-brand-line/25' : 'hover:bg-white/[0.03]'}
                ${isCollapsed ? 'justify-center' : ''}
              `}
              title={isCollapsed ? userName : undefined}
            >
              {user?.user_metadata?.avatar_url ? (
                <img
                  src={user.user_metadata.avatar_url}
                  alt="Profile"
                  className="w-8 h-8 rounded-full flex-shrink-0"
                />
              ) : (
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 ${hero ? 'bg-brand-action/10 text-brand-ink' : 'bg-white/15 text-white'}`} aria-hidden="true">
                  {userName.charAt(0).toUpperCase()}
                </div>
              )}
              {!isCollapsed && (
                <>
                  <div className="flex-1 min-w-0 text-left">
                    <p className={`text-[13px] font-medium truncate ${hero ? 'text-brand-ink' : 'text-stone-300'}`}>
                      {userName}
                    </p>
                    <p className={`text-xs truncate ${hero ? 'sr-only' : 'text-warm-stone'}`}>
                      {userEmail}
                    </p>
                  </div>
                  <span className={`inline-flex transition-transform ${hero ? 'text-brand-muted' : 'text-stone-gray'} ${isSettingsOpen ? '' : 'rotate-180'}`}>
                    <ThiingsIcon name="chevron-up" pxSize={14} />
                  </span>
                </>
              )}
            </button>

            {/* Settings Dropdown */}
            {isSettingsOpen && (
              <div className={`
                absolute bottom-20 border rounded-2xl overflow-hidden
                ${hero ? 'bg-brand-paper border-brand-line shadow-[0_18px_40px_rgba(41,50,34,0.14)] text-brand-ink' : 'bg-charcoal-dark border-stone-mid shadow-2xl'}
                ${isCollapsed ? 'left-full ml-1 w-56' : 'left-4 right-4'}
              `}>
                {/* Language Selector */}
                <div className="relative">
                  <button
                    onClick={() => setIsLanguageOpen(!isLanguageOpen)}
                    className={`w-full px-4 py-3 flex items-center gap-3 transition-colors text-left ${hero ? 'text-brand-ink hover:bg-brand-line/25' : 'hover:bg-white/[0.05] text-stone-300'}`}
                  >
                    <ThiingsIcon name="globe" pxSize={16} />
                    <span className="flex-1 text-sm">{t('common.language')}</span>
                    <span className={`text-sm ${hero ? 'text-brand-muted' : 'text-warm-stone'}`}>{currentLanguage.flag} {currentLanguage.name}</span>
                  </button>

                  {isLanguageOpen && (
                    <div className={`border-t ${hero ? 'border-brand-line bg-brand-paper' : 'border-stone-mid bg-deep-charcoal'}`}>
                      {languageOptions.map((lang) => (
                        <button
                          key={lang.code}
                          onClick={() => handleLanguageChange(lang.code)}
                          className={`
                            w-full px-4 py-2 flex items-center gap-3 transition-colors text-left text-sm
                            ${hero ? 'hover:bg-brand-line/25' : 'hover:bg-white/[0.05]'}
                            ${i18n.language === lang.code ? (hero ? 'bg-brand-action/10 text-brand-ink font-medium' : 'bg-burgundy/15 text-rose-600 font-medium') : (hero ? 'text-brand-muted' : 'text-stone-400')}
                          `}
                        >
                          <span className="text-lg">{lang.flag}</span>
                          <span>{lang.name}</span>
                          {i18n.language === lang.code && (
                            <ThiingsIcon name="green-check" pxSize={14} className="ml-auto text-emerald-600" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className={`border-t ${hero ? 'border-brand-line' : 'border-stone-mid'}`} />

                {/* Restaurant Settings */}
                <Link
                  to="/host-dashboard/settings"
                  onClick={() => setIsSettingsOpen(false)}
                  className={`w-full px-4 py-3 flex items-center gap-3 transition-colors ${hero ? 'text-brand-ink hover:bg-brand-line/25' : 'hover:bg-white/[0.05] text-stone-300'}`}
                >
                  <ThiingsIcon name="settings" pxSize={16} />
                  <span className="text-sm">{t('navigation.restaurantSettings', 'Restaurant Settings')}</span>
                </Link>

                {/* Integrations */}
                <Link
                  to="/host-dashboard/integrations"
                  onClick={() => setIsSettingsOpen(false)}
                  className={`w-full px-4 py-3 flex items-center gap-3 transition-colors ${hero ? 'text-brand-ink hover:bg-brand-line/25' : 'hover:bg-white/[0.05] text-stone-300'}`}
                >
                  <ThiingsIcon name="link" pxSize={16} />
                  <span className="text-sm">{t('navigation.integrations', 'Integrations')}</span>
                </Link>

                {/* Subscription & Billing — owner only. Audit found this was
                    only reachable via the Manager-AI upsell link, leaving
                    paying customers with no in-app path to manage their plan,
                    view the trial expiry, or open the Stripe portal. */}
                {can('manageSubscription') && (
                  <Link
                    to="/subscription/manage"
                    onClick={() => setIsSettingsOpen(false)}
                    className={`w-full px-4 py-3 flex items-center gap-3 transition-colors ${hero ? 'text-brand-ink hover:bg-brand-line/25' : 'hover:bg-white/[0.05] text-stone-300'}`}
                  >
                    <ThiingsIcon name="credit-card" pxSize={16} />
                    <span className="text-sm">{t('navigation.subscription', 'Subscription & Billing')}</span>
                  </Link>
                )}

                <div className={`border-t ${hero ? 'border-brand-line' : 'border-stone-mid'}`} />

                {/* Logout */}
                <button
                  onClick={handleLogout}
                  className="w-full px-4 py-3 flex items-center gap-3 hover:bg-red-600/10 text-red-600 transition-colors"
                >
                  <ThiingsIcon name="logout" pxSize={16} />
                  <span className="text-sm">{t('common.signOut')}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Mobile Bottom Navigation Bar */}
      <nav
        className={`lg:hidden fixed bottom-0 left-0 right-0 z-40 border-t safe-area-bottom ${hero ? 'bg-brand-paper border-brand-line font-brand' : 'backdrop-blur-xl bg-warm-white/95 hairline'}`}
        aria-label="Mobile navigation"
      >
        <div className="flex items-center justify-around px-2 py-1 pb-[max(0.25rem,env(safe-area-inset-bottom))]">
          {mobileNavItems.map((item) => {
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                to={hero && item.path === '/host-dashboard/insights' ? '/host-dashboard/insights?tab=overview' : item.path}
                aria-current={active ? 'page' : undefined}
                className={`flex flex-col items-center gap-0.5 px-3 transition-colors min-w-[60px] ${hero ? 'py-1' : 'rounded-lg py-2'} ${
                  hero
                    ? active
                      ? 'text-brand-ink font-semibold'
                      : 'text-brand-muted active:text-brand-ink'
                    : active
                      ? 'text-deep-charcoal bg-deep-charcoal/[0.06]'
                      : 'text-muted-stone active:text-deep-charcoal'
                }`}
              >
                {hero ? (
                  <span className={`flex h-8 w-9 items-center justify-center ${active ? 'text-brand-action' : ''}`}>
                    <ThiingsIcon name={item.icon} pxSize={20} />
                  </span>
                ) : <ThiingsIcon name={item.icon} pxSize={20} />}
                <span className={`${hero ? 'text-[12px]' : 'text-[11px]'} font-medium leading-tight whitespace-nowrap`}>{item.label}</span>
                {active && hero && <span className="mt-0.5 h-[2px] w-6 bg-brand-action" aria-hidden="true" />}
                {active && !hero && <span className="h-1 w-1 rounded-full bg-burgundy" />}
              </Link>
            );
          })}
          {!hero && <button
            type="button"
            onClick={() => setIsMobileOpen(true)}
            aria-label={t('common.more', 'More')}
            aria-expanded={isMobileOpen}
            className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-lg transition-colors min-w-[60px] ${hero ? (isMoreActive || isMobileOpen ? 'text-brand-ink' : 'text-brand-muted active:text-brand-ink') : (isMoreActive || isMobileOpen ? 'text-deep-charcoal bg-deep-charcoal/[0.06]' : 'text-muted-stone active:text-deep-charcoal')}`}
          >
            <ThiingsIcon name="menu" pxSize={20} />
            <span className="text-[11px] font-medium leading-tight">{t('common.more', 'More')}</span>
            {isMoreActive && <span className={`w-1 h-1 rounded-full ${hero ? 'bg-brand-action' : 'bg-burgundy'}`} />}
          </button>}
        </div>
      </nav>
    </>
  );
}

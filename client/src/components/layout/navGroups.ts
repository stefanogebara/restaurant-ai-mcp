import type { PlanFeatures } from '../../config/planFeatures';

/**
 * The owner menu: five groups (audit 2026-11-16, Stefano's go-ahead
 * 2026-11-22). Pages that used to have their own menu item now sit as tabs
 * inside a group, so nothing became unreachable:
 *
 *   Hoje           dashboard
 *   Salão          floor plan · A Partitura
 *   Recepcionista  voice · WhatsApp · call history
 *   Clientes       customers · analytics (Insights)
 *   Ajustes        restaurant · integrations · team · language · plan
 *
 * The Manager AI is an action ("Perguntar à IA"), not a group. Marketing is
 * off the menu while campaigns are an open product decision
 * (docs/intel/INTEL.md); its pages keep their addresses.
 */

export type Permission = 'manageTeam' | 'manageSubscription';

export interface NavTab {
  path: string;
  label: string;
  labelKey: string;
  /** Shown only to users with this permission. */
  permission?: Permission;
}

export interface NavGroup {
  key: 'today' | 'floor' | 'receptionist' | 'customers' | 'settings';
  /** Where the menu item goes. */
  path: string;
  label: string;
  labelKey: string;
  /** Plan feature that unlocks the menu item (locked items go to the plan page). */
  requiredFeature?: keyof PlanFeatures;
  tabs: NavTab[];
  /** Other addresses that belong to the group without being a tab. */
  alsoActive?: string[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    key: 'today', path: '/host-dashboard/simple', label: 'Today', labelKey: 'navigation.today',
    requiredFeature: 'overview', tabs: [],
  },
  {
    key: 'floor', path: '/host-dashboard/floor-plan', label: 'Floor', labelKey: 'navigation.floor',
    requiredFeature: 'overview',
    tabs: [
      { path: '/host-dashboard/floor-plan', label: 'Floor plan', labelKey: 'navigation.floorPlan' },
      { path: '/host-dashboard/service', label: 'Service Score', labelKey: 'navigation.serviceScore' },
    ],
    alsoActive: ['/host-dashboard/tables'],
  },
  {
    // No plan gate: the saved phone overview is read-only; the Voice page
    // enforces paid access itself.
    key: 'receptionist', path: '/host-dashboard/voice-settings', label: 'Receptionist', labelKey: 'navigation.receptionist',
    tabs: [
      { path: '/host-dashboard/voice-settings', label: 'Voice', labelKey: 'navigation.voice' },
      { path: '/host-dashboard/whatsapp', label: 'WhatsApp', labelKey: 'navigation.whatsapp' },
      { path: '/host-dashboard/calls', label: 'Calls', labelKey: 'navigation.calls' },
    ],
  },
  {
    key: 'customers', path: '/host-dashboard/customers', label: 'Customers', labelKey: 'navigation.customers',
    requiredFeature: 'customerLTV',
    tabs: [
      { path: '/host-dashboard/customers', label: 'Customers', labelKey: 'navigation.customers' },
      { path: '/host-dashboard/insights', label: 'Analytics', labelKey: 'navigation.analytics' },
    ],
    alsoActive: ['/host-dashboard/ltv', '/host-dashboard/campaigns', '/host-dashboard/coupons', '/host-dashboard/events'],
  },
  {
    key: 'settings', path: '/host-dashboard/settings', label: 'Settings', labelKey: 'navigation.settingsGroup',
    tabs: [
      { path: '/host-dashboard/settings', label: 'Restaurant', labelKey: 'navigation.restaurant' },
      { path: '/host-dashboard/integrations', label: 'Integrations', labelKey: 'navigation.integrations' },
      { path: '/host-dashboard/team', label: 'Team', labelKey: 'navigation.team', permission: 'manageTeam' },
      { path: '/settings/language', label: 'Language', labelKey: 'navigation.languageSettings' },
      { path: '/subscription/manage', label: 'Plan', labelKey: 'navigation.plan', permission: 'manageSubscription' },
    ],
  },
];

export const ASK_AI_PATH = '/host-dashboard/manager-ai';

function under(pathname: string, path: string) {
  return pathname === path || pathname.startsWith(`${path}/`);
}

/** The group a page belongs to, or null (e.g. the Manager AI). */
export function groupForPath(pathname: string): NavGroup | null {
  if (pathname === '/host-dashboard') return NAV_GROUPS[0];
  return NAV_GROUPS.find((group) => under(pathname, group.path)
    || group.tabs.some((tab) => under(pathname, tab.path))
    || (group.alsoActive ?? []).some((path) => under(pathname, path))) ?? null;
}

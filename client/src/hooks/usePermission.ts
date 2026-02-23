import { useAuth } from '../contexts/AuthContext';

type Role = 'owner' | 'manager' | 'host' | 'staff';

type Action =
  | 'viewDashboard'
  | 'manageReservations'
  | 'manageTables'
  | 'viewAnalytics'
  | 'manageWaitlist'
  | 'manageTeam'
  | 'manageSubscription'
  | 'manageSettings';

const PERMISSIONS: Record<Action, Role[]> = {
  viewDashboard:      ['owner', 'manager', 'host', 'staff'],
  manageReservations: ['owner', 'manager', 'host'],
  manageTables:       ['owner', 'manager', 'host'],
  viewAnalytics:      ['owner', 'manager'],
  manageWaitlist:     ['owner', 'manager', 'host'],
  manageTeam:         ['owner'],
  manageSubscription: ['owner'],
  manageSettings:     ['owner', 'manager'],
};

export function usePermission() {
  const { role } = useAuth();

  const can = (action: Action): boolean => {
    if (!role) return false;
    return PERMISSIONS[action]?.includes(role) ?? false;
  };

  return { can, role };
}

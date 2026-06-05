/**
 * Team Management Page
 * Route: /host-dashboard/team  (owner only to manage; all roles can view)
 */

import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { usePermission } from '../hooks/usePermission';
import DashboardLayout from '../components/layout/DashboardLayout';
import {
  useTeamMembers,
  useInviteTeamMember,
  useUpdateTeamMemberRole,
  useRemoveTeamMember,
  type TeamMember,
} from '../hooks/useTeamMembers';

const LOADING_TIMEOUT_MS = 10_000;
type Role = 'manager' | 'host' | 'staff';

export default function TeamPage() {
  const { t } = useTranslation();
  const { can } = usePermission();

  const ROLE_OPTIONS: { value: Role; label: string }[] = [
    { value: 'manager', label: t('team.roleManager') },
    { value: 'host', label: t('team.roleHost') },
    { value: 'staff', label: t('team.roleStaff') },
  ];
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('host');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: members = [], isLoading, isError } = useTeamMembers();

  // Timeout fallback: if loading takes > 10s, stop showing loading spinner
  useEffect(() => {
    if (isLoading) {
      setLoadingTimedOut(false);
      timeoutRef.current = setTimeout(() => setLoadingTimedOut(true), LOADING_TIMEOUT_MS);
    } else {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setLoadingTimedOut(false);
    }
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, [isLoading]);
  const invite = useInviteTeamMember();
  const updateRole = useUpdateTeamMemberRole();
  const remove = useRemoveTeamMember();

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    invite.mutate({ email: inviteEmail, role: inviteRole }, {
      onSuccess: () => {
        setFeedback({ type: 'success', msg: t('team.invitationSent', { email: inviteEmail }) });
        setInviteEmail('');
      },
      onError: (err) => setFeedback({ type: 'error', msg: err.message }),
    });
  };

  const handleRoleChange = (memberId: string, newRole: Role) => {
    updateRole.mutate({ memberId, role: newRole });
  };

  const handleRemove = (memberId: string) => {
    setConfirmRemoveId(memberId);
  };

  const confirmRemove = () => {
    if (confirmRemoveId) {
      remove.mutate(confirmRemoveId);
      setConfirmRemoveId(null);
    }
  };

  const roleBadge = (role: TeamMember['role']) => {
    const map: Record<string, string> = {
      owner: 'bg-burgundy/10 text-burgundy',
      manager: 'bg-blue-50 text-blue-700',
      host: 'bg-rose-50 text-rose-700',
      staff: 'bg-soft-gray text-stone-gray',
    };
    return map[role] ?? 'bg-soft-gray text-stone-gray';
  };

  return (
    <DashboardLayout>
    <div className="max-w-2xl mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#111827]">{t('team.title')}</h1>
        <p className="text-sm text-[#9CA3AF] mt-1">{t('team.subtitle')}</p>
      </div>

      {can('manageTeam') && (
        <form onSubmit={handleInvite} className="py-5 space-y-4">
          <h2 className="text-[13px] font-semibold uppercase tracking-widest text-[#111827]">{t('team.inviteTitle')}</h2>
          <div className="flex flex-wrap sm:flex-nowrap gap-3">
            <input
              type="email" required
              placeholder={t('team.emailPlaceholder')}
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              className="flex-1 min-w-0 border border-glass-border-input rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-burgundy/30"
            />
            <select
              value={inviteRole}
              onChange={e => setInviteRole(e.target.value as Role)}
              className="border border-glass-border-input rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-burgundy/20 focus:border-burgundy"
            >
              {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <button
              type="submit" disabled={invite.isPending}
              className="px-4 py-2 bg-burgundy hover:bg-burgundy-dark text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors"
            >
              {invite.isPending ? t('team.sending') : t('team.invite')}
            </button>
          </div>
          {feedback && (
            <p className={`text-sm ${feedback.type === 'success' ? 'text-rose-600' : 'text-red-600'}`}>
              {feedback.msg}
            </p>
          )}
        </form>
      )}

      <div className="border-t border-[#E5E7EB] mt-8 divide-y divide-[#F3F4F6]">
        {(isLoading && !loadingTimedOut) ? (
          <div className="p-6 text-center text-sm text-stone-gray">{t('common.loading')}</div>
        ) : (isError || loadingTimedOut) ? (
          <div className="p-6 text-center text-sm text-stone-gray">{t('team.noMembers')}</div>
        ) : members.length === 0 ? (
          <div className="p-6 text-center text-sm text-stone-gray">{t('team.noMembers')}</div>
        ) : members.map(member => (
          <div key={member.id} className="flex items-center justify-between px-6 py-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-deep-charcoal truncate">{member.email}</p>
              {member.status === 'pending' && <p className="text-xs text-muted-stone">{t('team.invitationPending')}</p>}
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${roleBadge(member.role)}`}>
                {t(`team.role${member.role.charAt(0).toUpperCase()}${member.role.slice(1)}`)}
              </span>
              {can('manageTeam') && member.role !== 'owner' && (
                <>
                  <select
                    value={member.role}
                    onChange={e => handleRoleChange(member.id, e.target.value as Role)}
                    className="text-xs border border-glass-border-input rounded-xl px-2 py-1 focus:outline-none focus:ring-2 focus:ring-burgundy/20 focus:border-burgundy"
                  >
                    {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <button
                    onClick={() => handleRemove(member.id)}
                    className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors"
                  >
                    {t('team.remove')}
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Remove confirmation dialog */}
      {confirmRemoveId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass-modal p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold text-deep-charcoal mb-2">{t('team.removeTitle')}</h3>
            <p className="text-sm text-stone-gray mb-6">
              {t('team.removeConfirm')}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmRemoveId(null)}
                className="flex-1 px-4 py-2.5 border border-border-gray text-stone-gray rounded-xl hover:bg-soft-gray transition-colors font-medium"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={confirmRemove}
                className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition-colors"
              >
                {t('team.remove')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </DashboardLayout>
  );
}

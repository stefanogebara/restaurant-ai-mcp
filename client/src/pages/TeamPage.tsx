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
  const [removeError, setRemoveError] = useState(false);
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const { data: members = [], isLoading, isError, refetch } = useTeamMembers();
  const invite = useInviteTeamMember();
  const updateRole = useUpdateTeamMemberRole();
  const remove = useRemoveTeamMember();

  useEffect(() => {
    if (!confirmRemoveId) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelRef.current?.focus();
    return () => { previousFocus?.focus(); };
  }, [confirmRemoveId]);

  useEffect(() => {
    if (!confirmRemoveId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !remove.isPending) setConfirmRemoveId(null);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); };
  }, [confirmRemoveId, remove.isPending]);

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
  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    invite.mutate({ email: inviteEmail, role: inviteRole }, {
      onSuccess: ({ email_accepted: accepted }) => {
        setFeedback({ type: accepted ? 'success' : 'error', msg: t(accepted ? 'team.invitationSent' : 'team.deliveryUnconfirmed', { email: inviteEmail }) });
        setInviteEmail('');
      },
      onError: (err) => setFeedback({ type: 'error', msg: t(err.message === 'already_member' ? 'team.alreadyMember' : 'team.inviteFailed') }),
    });
  };

  const handleRoleChange = (memberId: string, newRole: Role) => {
    updateRole.mutate({ memberId, role: newRole }, {
      onError: () => setFeedback({ type: 'error', msg: t('team.roleUpdateFailed') }),
    });
  };

  const handleRemove = (memberId: string) => {
    setRemoveError(false);
    setConfirmRemoveId(memberId);
  };

  const confirmRemove = () => {
    if (confirmRemoveId) {
      remove.mutate(confirmRemoveId, {
        onSuccess: () => setConfirmRemoveId(null),
        onError: () => setRemoveError(true),
      });
    }
  };

  return (
    <DashboardLayout>
    <div className="max-w-2xl mx-auto px-4 py-8 pb-24">
      <div className="mb-8">
        <h1 className="pl-12 lg:pl-0 font-serif text-3xl text-deep-charcoal sm:text-4xl">{t('team.title')}</h1>
        <p className="mt-3 text-[15px] text-muted-stone">{t('team.subtitle')}</p>
      </div>

      {can('manageTeam') && (
        <form onSubmit={handleInvite} className="py-5 space-y-4">
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-stone">{t('team.inviteTitle')}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
            <label htmlFor="team-invite-email" className="sr-only">{t('team.emailPlaceholder')}</label>
            <input
              id="team-invite-email" type="email" required
              placeholder={t('team.emailPlaceholder')}
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              className="col-span-2 w-full min-w-0 rounded-xl border border-glass-border-input px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-burgundy/30 sm:col-span-1"
            />
            <label htmlFor="team-invite-role" className="sr-only">{t('team.roleLabel')}</label>
            <select
              id="team-invite-role"
              value={inviteRole}
              onChange={e => setInviteRole(e.target.value as Role)}
              className="w-full rounded-xl border border-glass-border-input px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-burgundy/20 focus:border-burgundy"
            >
              {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <button
              type="submit" disabled={invite.isPending}
              className="w-full rounded-xl bg-burgundy px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-burgundy-dark disabled:opacity-50"
            >
              {invite.isPending ? t('team.sending') : t('team.invite')}
            </button>
          </div>
          {feedback && (
            <p role="status" className={`text-sm ${feedback.type === 'success' ? 'text-emerald-700' : 'text-red-700'}`}>
              {feedback.msg}
            </p>
          )}
          {/* Role permissions key — audit found owners had no way to know
              what each role could actually do before sending the invite.
              Compact one-line legend right under the form so the choice is
              informed without opening a separate help page. */}
          <details className="-mt-2 text-xs text-muted-stone">
            <summary className="w-fit cursor-pointer underline underline-offset-2 hover:text-deep-charcoal">
              {t('team.rolePermissionsLabel', 'O que cada papel pode fazer?')}
            </summary>
            <ul className="mt-2 space-y-1 pl-1">
              <li><strong>{t('team.roleHost', 'Anfitrião')}:</strong> {t('team.permHost', 'Reservas, walk-ins, lista de espera. Sem acesso a configurações ou faturamento.')}</li>
              <li><strong>{t('team.roleManager', 'Gerente')}:</strong> {t('team.permManager', 'Tudo do anfitrião + relatórios, equipe, configurações do restaurante.')}</li>
              <li><strong>{t('team.roleStaff', 'Garçom')}:</strong> {t('team.permStaff', 'Apenas visualizar reservas e mesas ativas. Sem permissão para alterar.')}</li>
            </ul>
          </details>
        </form>
      )}

      <div className="hairline mt-8 divide-y divide-glass-border-dark">
        {(isLoading && !loadingTimedOut) ? (
          <div className="p-6 text-center text-sm text-stone-gray">{t('common.loading')}</div>
        ) : (isError || loadingTimedOut) ? (
          <div role="alert" className="py-8 text-center text-sm text-muted-stone">
            <p>{t('team.loadError')}</p>
            <button type="button" onClick={() => { setLoadingTimedOut(false); void refetch(); }} className="mt-3 text-burgundy underline underline-offset-2">{t('team.retry')}</button>
          </div>
        ) : members.length === 0 ? (
          <div className="max-w-md mx-auto p-8 text-center">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-deep-charcoal/[0.06]">
              <svg className="h-5 w-5 text-deep-charcoal" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <p className="text-sm leading-relaxed text-muted-stone">
              {t('team.emptyHint', 'Convide seus anfitriões, gerentes e garçons para gerenciar reservas em equipe. Cada membro recebe acesso ao painel com permissões do papel escolhido.')}
            </p>
          </div>
        ) : members.map(member => (
          <div key={member.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="min-w-0">
              <p className="break-all text-sm font-medium text-deep-charcoal">{member.email}</p>
              {member.status === 'pending' && <p className="text-xs text-amber-700">{t('team.invitationPending')}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {(!can('manageTeam') || member.role === 'owner') && <span className="rounded-full bg-deep-charcoal/[0.06] px-2 py-0.5 text-xs font-semibold text-deep-charcoal">
                {t(`team.role${member.role.charAt(0).toUpperCase()}${member.role.slice(1)}`)}
              </span>}
              {can('manageTeam') && member.role !== 'owner' && (
                <>
                  <select
                    aria-label={t('team.roleFor', { email: member.email })}
                    value={member.role}
                    onChange={e => handleRoleChange(member.id, e.target.value as Role)}
                    className="text-xs border border-glass-border-input rounded-xl px-2 py-1 focus:outline-none focus:ring-2 focus:ring-burgundy/20 focus:border-burgundy"
                  >
                    {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <button
                    type="button"
                    onClick={() => handleRemove(member.id)}
                    className="text-xs font-medium text-red-700 transition-colors hover:text-red-900"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-labelledby="team-remove-title" className="glass-modal w-full max-w-sm p-6">
            <h3 id="team-remove-title" className="mb-2 font-serif text-2xl text-deep-charcoal">{t('team.removeTitle')}</h3>
            <p className="mb-6 text-sm text-muted-stone">
              {t('team.removeConfirm')}
            </p>
            {removeError && <p role="alert" className="mb-4 text-sm text-red-700">{t('team.removeFailed')}</p>}
            <div className="flex gap-3">
              <button
                ref={cancelRef}
                type="button"
                onClick={() => setConfirmRemoveId(null)}
                disabled={remove.isPending}
                className="flex-1 rounded-xl border border-glass-border-input px-4 py-2.5 font-medium text-deep-charcoal transition-colors hover:bg-deep-charcoal/[0.04]"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={confirmRemove}
                disabled={remove.isPending}
                className="flex-1 rounded-xl bg-red-700 px-4 py-2.5 font-semibold text-white transition-colors hover:bg-red-800 disabled:opacity-50"
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

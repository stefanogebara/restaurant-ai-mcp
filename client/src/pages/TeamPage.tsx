/**
 * Team Management Page
 * Route: /host-dashboard/team  (owner only to manage; all roles can view)
 */

import { useState, useEffect } from 'react';
import { usePermission } from '../hooks/usePermission';
import { supabase } from '../lib/supabase';

type Role = 'manager' | 'host' | 'staff';

interface TeamMember {
  id: string;
  email: string;
  role: 'owner' | Role;
  status: 'active' | 'pending' | 'inactive';
}

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'manager', label: 'Manager' },
  { value: 'host', label: 'Host' },
  { value: 'staff', label: 'Staff' },
];

async function apiCall(path: string, method: string, body?: object) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

export default function TeamPage() {
  const { can } = usePermission();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('host');
  const [inviting, setInviting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const load = async () => {
    setLoading(true);
    const data = await apiCall('/api/team-members', 'GET');
    if (data.success) setMembers(data.members);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setInviting(true);
    const data = await apiCall('/api/team-members', 'POST', { email: inviteEmail, role: inviteRole });
    setInviting(false);
    if (data.success) {
      setFeedback({ type: 'success', msg: `Invitation sent to ${inviteEmail}` });
      setInviteEmail('');
      load();
    } else {
      setFeedback({ type: 'error', msg: data.error || 'Failed to send invitation' });
    }
  };

  const handleRoleChange = async (memberId: string, newRole: Role) => {
    await apiCall('/api/team-members', 'PATCH', { memberId, role: newRole });
    load();
  };

  const handleRemove = async (memberId: string) => {
    if (!window.confirm('Remove this team member?')) return;
    await apiCall('/api/team-members', 'DELETE', { memberId });
    load();
  };

  const roleBadge = (role: string) => {
    const map: Record<string, string> = {
      owner: 'bg-burgundy/10 text-burgundy',
      manager: 'bg-blue-50 text-blue-700',
      host: 'bg-green-50 text-green-700',
      staff: 'bg-soft-gray text-stone-gray',
    };
    return map[role] ?? 'bg-soft-gray text-stone-gray';
  };

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-deep-charcoal">Team</h1>
        <p className="text-sm text-stone-gray mt-1">Manage who has access to your restaurant dashboard.</p>
      </div>

      {can('manageTeam') && (
        <form onSubmit={handleInvite} className="bg-white border border-border-gray rounded-2xl p-6 space-y-4">
          <h2 className="text-sm font-semibold text-deep-charcoal">Invite team member</h2>
          <div className="flex gap-3">
            <input
              type="email" required
              placeholder="Email address"
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              className="flex-1 border border-border-gray rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-burgundy/30"
            />
            <select
              value={inviteRole}
              onChange={e => setInviteRole(e.target.value as Role)}
              className="border border-border-gray rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-burgundy/20 focus:border-burgundy"
            >
              {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <button
              type="submit" disabled={inviting}
              className="px-4 py-2 bg-burgundy hover:bg-burgundy-dark text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors"
            >
              {inviting ? 'Sending…' : 'Invite'}
            </button>
          </div>
          {feedback && (
            <p className={`text-sm ${feedback.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
              {feedback.msg}
            </p>
          )}
        </form>
      )}

      <div className="bg-white border border-border-gray rounded-2xl divide-y divide-border-gray">
        {loading ? (
          <div className="p-6 text-center text-sm text-stone-gray">Loading…</div>
        ) : members.length === 0 ? (
          <div className="p-6 text-center text-sm text-stone-gray">No team members yet.</div>
        ) : members.map(member => (
          <div key={member.id} className="flex items-center justify-between px-6 py-4">
            <div>
              <p className="text-sm font-medium text-deep-charcoal">{member.email}</p>
              {member.status === 'pending' && <p className="text-xs text-muted-stone">Invitation pending</p>}
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${roleBadge(member.role)}`}>
                {member.role}
              </span>
              {can('manageTeam') && member.role !== 'owner' && (
                <>
                  <select
                    value={member.role}
                    onChange={e => handleRoleChange(member.id, e.target.value as Role)}
                    className="text-xs border border-border-gray rounded-xl px-2 py-1 focus:outline-none focus:ring-2 focus:ring-burgundy/20 focus:border-burgundy"
                  >
                    {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <button
                    onClick={() => handleRemove(member.id)}
                    className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors"
                  >
                    Remove
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authFetch } from '../services/api';
import { SETTINGS_STALE_TIME } from '../config/constants';

export interface TeamMember {
  id: string;
  email: string;
  role: 'owner' | 'manager' | 'host' | 'staff';
  status: 'active' | 'pending' | 'inactive';
}

export function useTeamMembers() {
  return useQuery<TeamMember[]>({
    queryKey: ['team-members'],
    queryFn: async () => {
      const res = await authFetch('/api/team-members');
      if (!res.ok) throw new Error('Failed to fetch team members');
      const data = await res.json();
      return data.success ? data.members : [];
    },
    staleTime: SETTINGS_STALE_TIME,
  });
}

export function useInviteTeamMember() {
  const queryClient = useQueryClient();
  return useMutation<{ message?: string }, Error, { email: string; role: string }>({
    mutationFn: async ({ email, role }) => {
      const res = await authFetch('/api/team-members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role }),
      });
      if (!res.ok) throw new Error('Failed to send invitation');
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to send invitation');
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['team-members'] }),
  });
}

export function useUpdateTeamMemberRole() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { memberId: string; role: string }>({
    mutationFn: async ({ memberId, role }) => {
      const res = await authFetch('/api/team-members', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId, role }),
      });
      if (!res.ok) throw new Error('Failed to update role');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['team-members'] }),
  });
}

export function useRemoveTeamMember() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (memberId) => {
      const res = await authFetch('/api/team-members', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId }),
      });
      if (!res.ok) throw new Error('Failed to remove team member');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['team-members'] }),
  });
}

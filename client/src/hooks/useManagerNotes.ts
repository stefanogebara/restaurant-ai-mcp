import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authFetch } from '../services/api';
import { SETTINGS_STALE_TIME } from '../config/constants';

export interface ManagerNote {
  id: string;
  content: string;
  guest_phone: string | null;
  importance: number;
  is_policy: boolean;
  created_at: string;
}

interface NewNoteInput {
  content: string;
  guest_phone?: string;
  note_type: 'vip_instruction' | 'general_policy' | 'guest_preference';
}

export function useManagerNotes() {
  return useQuery<ManagerNote[]>({
    queryKey: ['manager-notes'],
    queryFn: async () => {
      const response = await authFetch('/api/manager-notes');
      if (!response.ok) throw new Error('Failed to fetch notes');
      const data = await response.json();
      return data.success ? data.notes : [];
    },
    staleTime: SETTINGS_STALE_TIME,
  });
}

export function useAddManagerNote() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, NewNoteInput>({
    mutationFn: async (note) => {
      const response = await authFetch('/api/manager-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(note),
      });
      if (!response.ok) throw new Error('Failed to save note');
      const data = await response.json();
      if (!data.success) throw new Error('Failed to save note');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['manager-notes'] }),
  });
}

export function useDeleteManagerNote() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (noteId) => {
      const response = await authFetch('/api/manager-notes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: noteId }),
      });
      if (!response.ok) throw new Error('Failed to delete note');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['manager-notes'] }),
  });
}

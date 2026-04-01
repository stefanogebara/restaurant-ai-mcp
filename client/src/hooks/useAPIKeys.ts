import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authFetch } from '../services/api';

export interface APIKey {
  id: string;
  key_prefix: string;
  name: string;
  permissions: string[];
  is_active: boolean;
  last_used_at: string | null;
  created_at: string;
  expires_at: string | null;
}

export interface CreateKeyParams {
  name: string;
  permissions?: string[];
  expires_in_days?: number;
}

export interface CreateKeyResult {
  api_key: string;
  key_info: APIKey;
}

async function fetchAPIKeys(): Promise<APIKey[]> {
  const res = await authFetch('/api/api-keys?action=list');
  if (!res.ok) throw new Error('Failed to load API keys');
  const json = await res.json();
  return json.api_keys || [];
}

async function createAPIKey(params: CreateKeyParams): Promise<CreateKeyResult> {
  const res = await authFetch('/api/api-keys?action=create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to create API key' }));
    throw new Error(err.error || 'Failed to create API key');
  }
  return res.json();
}

async function revokeAPIKey(keyId: string): Promise<void> {
  const res = await authFetch('/api/api-keys?action=revoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key_id: keyId }),
  });
  if (!res.ok) throw new Error('Failed to revoke API key');
}

export function useAPIKeys() {
  return useQuery({
    queryKey: ['api-keys'],
    queryFn: fetchAPIKeys,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateAPIKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createAPIKey,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });
}

export function useRevokeAPIKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: revokeAPIKey,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });
}
